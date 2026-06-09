from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.db.models import (
    ICPAccountRecord,
    MasterContextRecord,
    MessageRecord,
    VisualAssetRecord,
)
from backend.schemas.models import MessageChannel, MessageReviewDecision

# Channel → Canva design_type mapping
CHANNEL_DESIGN_TYPE: dict[str, str] = {
    MessageChannel.EMAIL.value: "email",
    MessageChannel.LINKEDIN_DM.value: "instagram_post",
    MessageChannel.LINKEDIN_CONNECTION.value: "instagram_post",
    MessageChannel.WHATSAPP.value: "instagram_post",
    MessageChannel.REDDIT_STRATEGY_NOTE.value: "twitter_post",
}

DISPATCHABLE_DECISIONS = {
    MessageReviewDecision.APPROVED.value,
    MessageReviewDecision.EDITED.value,
    MessageReviewDecision.REGENERATED.value,
}


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


class VisualAgent:
    """
    Generates Canva visual asset stubs for CP3-approved messages.

    This agent builds Canva design prompts from message content and account
    context, creates VisualAssetRecord rows in PENDING state, then returns
    a list of (record_id, prompt, design_type) tuples. The API layer calls
    Canva MCP with each prompt and updates the record to READY with the
    returned design ID and URLs.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def prepare_assets(self, client_id: str) -> list[dict[str, Any]]:
        """
        For each CP3-approved message that doesn't yet have a visual asset,
        create a VisualAssetRecord (status=PENDING) and return the data needed
        to call Canva MCP.

        Returns list of dicts with keys:
            asset_id, message_id, account_domain, channel,
            design_type, prompt
        """
        master_ctx = (
            self.db.query(MasterContextRecord)
            .filter(MasterContextRecord.client_id == client_id)
            .order_by(MasterContextRecord.created_at.desc())
            .first()
        )
        company_name = "our company"
        if master_ctx:
            ctx_data = master_ctx.data or {}
            company_name = ctx_data.get("company_name") or ctx_data.get("companyName") or company_name

        messages = (
            self.db.query(MessageRecord)
            .filter(
                MessageRecord.client_id == client_id,
                MessageRecord.review_state.in_(DISPATCHABLE_DECISIONS),
            )
            .all()
        )

        existing_message_ids = {
            row.message_id
            for row in self.db.query(VisualAssetRecord.message_id)
            .filter(
                VisualAssetRecord.client_id == client_id,
                VisualAssetRecord.message_id.isnot(None),
            )
            .all()
        }

        results = []
        for msg in messages:
            if msg.id in existing_message_ids:
                continue

            design_type = CHANNEL_DESIGN_TYPE.get(msg.channel, "email")
            prompt = _build_prompt(msg, company_name)

            asset = VisualAssetRecord(
                id=str(uuid.uuid4()),
                client_id=client_id,
                message_id=msg.id,
                account_domain=msg.account_domain,
                contact_id=msg.contact_id,
                channel=msg.channel,
                design_type=design_type,
                prompt_used=prompt,
                status="PENDING",
            )
            self.db.add(asset)
            results.append(
                {
                    "asset_id": asset.id,
                    "message_id": msg.id,
                    "account_domain": msg.account_domain,
                    "channel": msg.channel,
                    "design_type": design_type,
                    "prompt": prompt,
                }
            )

        self.db.commit()
        return results

    def mark_ready(
        self,
        asset_id: str,
        *,
        canva_design_id: str,
        canva_edit_url: str | None = None,
        canva_view_url: str | None = None,
        thumbnail_url: str | None = None,
    ) -> VisualAssetRecord:
        asset = self.db.get(VisualAssetRecord, asset_id)
        if asset is None:
            raise ValueError(f"VisualAssetRecord {asset_id!r} not found")
        asset.status = "READY"
        asset.canva_design_id = canva_design_id
        asset.canva_edit_url = canva_edit_url
        asset.canva_view_url = canva_view_url
        asset.thumbnail_url = thumbnail_url
        asset.updated_at = _now()
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def mark_failed(self, asset_id: str, error_detail: str) -> VisualAssetRecord:
        asset = self.db.get(VisualAssetRecord, asset_id)
        if asset is None:
            raise ValueError(f"VisualAssetRecord {asset_id!r} not found")
        asset.status = "FAILED"
        asset.error_detail = error_detail
        asset.updated_at = _now()
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def list_assets(self, client_id: str) -> list[VisualAssetRecord]:
        return (
            self.db.query(VisualAssetRecord)
            .filter(VisualAssetRecord.client_id == client_id)
            .order_by(VisualAssetRecord.created_at.desc())
            .all()
        )


def _build_prompt(msg: MessageRecord, company_name: str) -> str:
    data = msg.data or {}
    subject = data.get("subject") or data.get("headline") or ""
    body = data.get("body") or data.get("content") or ""
    # Truncate body to key phrase for prompt brevity
    body_snippet = body[:200].strip() if body else ""

    channel_label = {
        "EMAIL": "email marketing banner",
        "LINKEDIN_DM": "LinkedIn direct message visual",
        "LINKEDIN_CONNECTION": "LinkedIn connection request visual",
        "WHATSAPP": "WhatsApp campaign image",
        "REDDIT_STRATEGY_NOTE": "Reddit strategy visual",
    }.get(msg.channel, "marketing visual")

    parts = [
        f"Professional B2B {channel_label} for {company_name}",
        f"targeting {msg.account_domain}",
        f"tier {msg.tier} account",
    ]
    if subject:
        parts.append(f'message theme: "{subject}"')
    if body_snippet:
        parts.append(f'key message: "{body_snippet}"')
    parts.append("clean modern design, corporate color palette, no stock photos")

    return ", ".join(parts)
