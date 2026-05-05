from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from backend.agents.campaign import webhook_processors
from backend.db.session import SessionLocal, get_db
from backend.schemas.models import EngagementChannel, EngagementEventType, WebhookProvider


router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


# ---------------------------------------------------------------------------
# Signature verification (constant-time, secret loaded from env per request)
# ---------------------------------------------------------------------------

def _instantly_secret() -> str:
    return os.environ.get("INSTANTLY_WEBHOOK_SECRET", "")


def _phantombuster_secret() -> str:
    return os.environ.get("PHANTOMBUSTER_WEBHOOK_SECRET", "")


def _twilio_token() -> str:
    return os.environ.get("TWILIO_AUTH_TOKEN", "")


def verify_instantly(raw_body: bytes, signature_header: str | None) -> bool:
    """HMAC SHA-256 of the raw request body, hex-encoded."""
    secret = _instantly_secret()
    if not secret or not signature_header:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    candidate = signature_header.removeprefix("sha256=")
    return hmac.compare_digest(expected, candidate)


def verify_phantombuster(signature_header: str | None) -> bool:
    """PhantomBuster does not sign payloads on the free tier — it sends a shared
    header secret. Constant-time compare against the configured secret."""
    secret = _phantombuster_secret()
    if not secret or not signature_header:
        return False
    return hmac.compare_digest(secret, signature_header)


def verify_twilio(url: str, params: dict[str, str], signature_header: str | None) -> bool:
    """
    Twilio's request validator: HMAC-SHA1(auth_token, url + sorted_param_concat),
    base64-encoded. Refs: https://www.twilio.com/docs/usage/webhooks/webhooks-security
    """
    token = _twilio_token()
    if not token or not signature_header:
        return False
    payload = url
    for key in sorted(params.keys()):
        payload += key + params[key]
    digest = hmac.new(token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, signature_header)


# ---------------------------------------------------------------------------
# Background-task wrapper. Each background invocation owns its own DB session
# so the request handler can return 200 without holding open the request-scoped
# session. Per master prompt §7: heavy work goes off the request thread.
# ---------------------------------------------------------------------------

# Tests override this with their in-memory session factory.
_session_factory = SessionLocal


def set_session_factory(factory) -> None:
    """Test hook: swap the background-task session factory."""
    global _session_factory
    _session_factory = factory


def reset_session_factory() -> None:
    global _session_factory
    _session_factory = SessionLocal


def _process_in_background(**kwargs) -> None:
    db = _session_factory()
    try:
        webhook_processors.process_event(db, **kwargs)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Instantly — EMAIL channel
# ---------------------------------------------------------------------------

_INSTANTLY_EVENT_MAP: dict[str, EngagementEventType] = {
    "email_opened": EngagementEventType.EMAIL_OPEN,
    "email_replied": EngagementEventType.EMAIL_REPLY,
    "email_bounced": EngagementEventType.EMAIL_BOUNCE,
    "email_unsubscribed": EngagementEventType.EMAIL_UNSUBSCRIBE,
}


@router.post("/instantly", status_code=200)
async def instantly_webhook(
    request: Request,
    background: BackgroundTasks,
    x_instantly_signature: Optional[str] = Header(None, alias="X-Instantly-Signature"),
    db: Session = Depends(get_db),
):
    raw = await request.body()
    if not verify_instantly(raw, x_instantly_signature):
        raise HTTPException(status_code=401, detail="invalid Instantly signature")
    payload = await request.json()

    provider_event_id = str(payload.get("event_id") or "")
    if not provider_event_id:
        raise HTTPException(status_code=400, detail="missing event_id")

    if not webhook_processors.record_receipt(db, provider=WebhookProvider.INSTANTLY, provider_event_id=provider_event_id, raw_payload=payload):
        return {"status": "duplicate", "provider_event_id": provider_event_id}

    event_type = _INSTANTLY_EVENT_MAP.get(payload.get("event_type", ""))
    if event_type is None:
        return {"status": "ignored", "reason": "unknown event_type"}

    background.add_task(
        _process_in_background,
        provider=WebhookProvider.INSTANTLY,
        provider_event_id=provider_event_id,
        transport="INSTANTLY",
        correlate_provider_message_id=payload.get("message_id"),
        event_type=event_type,
        channel=EngagementChannel.EMAIL,
        occurred_at=_parse_ts(payload.get("occurred_at")),
        raw_payload=payload,
        reply_text=payload.get("reply_text"),
    )
    return {"status": "accepted"}


# ---------------------------------------------------------------------------
# PhantomBuster — LINKEDIN_DM / LINKEDIN_CONNECTION
# ---------------------------------------------------------------------------

_PB_EVENT_MAP: dict[str, EngagementEventType] = {
    "dm_reply": EngagementEventType.LINKEDIN_DM_REPLY,
    "connection_accepted": EngagementEventType.LINKEDIN_CONNECTION_ACCEPTED,
}

_PB_CHANNEL_MAP: dict[str, EngagementChannel] = {
    "dm_reply": EngagementChannel.LINKEDIN_DM,
    "connection_accepted": EngagementChannel.LINKEDIN_CONNECTION,
}


@router.post("/phantombuster", status_code=200)
async def phantombuster_webhook(
    request: Request,
    background: BackgroundTasks,
    x_pb_signature: Optional[str] = Header(None, alias="X-PB-Signature"),
    db: Session = Depends(get_db),
):
    if not verify_phantombuster(x_pb_signature):
        raise HTTPException(status_code=401, detail="invalid PhantomBuster signature")
    payload = await request.json()

    provider_event_id = str(payload.get("event_id") or "")
    if not provider_event_id:
        raise HTTPException(status_code=400, detail="missing event_id")

    if not webhook_processors.record_receipt(db, provider=WebhookProvider.PHANTOMBUSTER, provider_event_id=provider_event_id, raw_payload=payload):
        return {"status": "duplicate"}

    raw_kind = payload.get("event_type", "")
    event_type = _PB_EVENT_MAP.get(raw_kind)
    channel = _PB_CHANNEL_MAP.get(raw_kind)
    if event_type is None or channel is None:
        return {"status": "ignored", "reason": "unknown event_type"}

    background.add_task(
        _process_in_background,
        provider=WebhookProvider.PHANTOMBUSTER,
        provider_event_id=provider_event_id,
        transport="PHANTOMBUSTER",
        correlate_provider_message_id=payload.get("message_id"),
        event_type=event_type,
        channel=channel,
        occurred_at=_parse_ts(payload.get("occurred_at")),
        raw_payload=payload,
        reply_text=payload.get("reply_text"),
    )
    return {"status": "accepted"}


# ---------------------------------------------------------------------------
# Twilio — WHATSAPP
# ---------------------------------------------------------------------------

@router.post("/twilio", status_code=200)
async def twilio_webhook(
    request: Request,
    background: BackgroundTasks,
    x_twilio_signature: Optional[str] = Header(None, alias="X-Twilio-Signature"),
    db: Session = Depends(get_db),
):
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}
    # Twilio signs the *full* URL Twilio called (including scheme + host) — use
    # the Forwarded/Host headers in production behind a proxy.
    url = str(request.url)
    if not verify_twilio(url, params, x_twilio_signature):
        raise HTTPException(status_code=401, detail="invalid Twilio signature")

    provider_event_id = params.get("MessageSid") or ""
    if not provider_event_id:
        raise HTTPException(status_code=400, detail="missing MessageSid")

    if not webhook_processors.record_receipt(db, provider=WebhookProvider.TWILIO, provider_event_id=provider_event_id, raw_payload=params):
        return {"status": "duplicate"}

    body = params.get("Body", "")
    if not body:
        return {"status": "ignored", "reason": "empty body"}

    background.add_task(
        _process_in_background,
        provider=WebhookProvider.TWILIO,
        provider_event_id=provider_event_id,
        transport="TWILIO",
        correlate_provider_message_id=params.get("OriginalMessageSid"),
        event_type=EngagementEventType.WHATSAPP_REPLY,
        channel=EngagementChannel.WHATSAPP,
        occurred_at=_now(),
        raw_payload=params,
        reply_text=body,
    )
    return {"status": "accepted"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _parse_ts(value) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return _now()
    return _now()
