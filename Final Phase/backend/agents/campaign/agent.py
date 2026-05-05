from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.agents.campaign import circuit_breaker
from backend.agents.campaign.quota_manager import QuotaManager
from backend.agents.campaign.transport_router import TransportRouter
from backend.agents.campaign.transports.base import (
    QuotaExhaustedError,
    SendResult,
    TransportAuthError,
)
from backend.agents.cp3.gate import assert_cp3_approved
from backend.db.models import (
    CampaignAuditLogRecord,
    CampaignRunRecord,
    CP3MessageReviewRecord,
    CP3ReviewStateRecord,
    MessageRecord,
    OutboundSendRecord,
)
from backend.schemas.models import (
    CampaignRun,
    CampaignRunStatus,
    HaltReason,
    Message,
    MessageChannel,
    MessageReviewDecision,
    SendStatus,
)


# CP3 review_decision values that mark a message as cleared for outbound dispatch.
DISPATCHABLE_DECISIONS = {
    MessageReviewDecision.APPROVED.value,
    MessageReviewDecision.EDITED.value,
    MessageReviewDecision.REGENERATED.value,
}


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


class CampaignAgent:
    """
    Phase 5 outbound execution. Reads CP3-approved messages, dispatches via the
    channel-specific transport, and records OutboundSend rows. Halts on bounce
    threshold breach (per-client) or transport auth failure (global).
    """

    def __init__(
        self,
        db: Session,
        *,
        router: TransportRouter | None = None,
        quotas: QuotaManager | None = None,
    ) -> None:
        self.db = db
        self.router = router or TransportRouter()
        self.quotas = quotas or QuotaManager(db)

    def run(self, client_id: str) -> CampaignRun:
        # Hard gate. Master prompt §2: Storyteller without CP2 = factual error;
        # Campaign without CP3 = client-facing message that wasn't reviewed.
        assert_cp3_approved(client_id, self.db)
        circuit_breaker.assert_not_halted(client_id, self.db)

        run_record = CampaignRunRecord(client_id=client_id, status=CampaignRunStatus.RUNNING.value)
        self.db.add(run_record)
        self.db.commit()
        run_id = run_record.id

        messages = self._dispatchable_messages(client_id)
        run_record.total_messages = len(messages)
        self.db.add(run_record)
        self.db.commit()

        sent = failed = pending = 0
        quota_warnings: list[dict] = []
        halt_reason: str | None = None

        try:
            for message in messages:
                # Bail mid-run if any halt fires (bounce breaker tripped, or
                # an earlier transport_auth failure went global).
                halt = circuit_breaker.is_halted(client_id, self.db)
                if halt is not None:
                    halt_reason = f"{halt.reason}: {halt.detail}"
                    break

                transport = self.router.for_channel(message.channel)
                source = transport.name.value

                try:
                    self.quotas.check(source)
                except QuotaExhaustedError as exc:
                    quota_warnings.append({"source": source, "detail": str(exc)})
                    self._persist_send(run_id, message, transport.name, SendStatus.PENDING_QUOTA_RESET, error_code="QUOTA_EXHAUSTED", error_message=str(exc))
                    pending += 1
                    continue

                try:
                    result = transport.send(message)
                except TransportAuthError as exc:
                    self._persist_send(run_id, message, transport.name, SendStatus.HALTED, error_code="AUTH_FAILURE", error_message=str(exc))
                    circuit_breaker.halt_global(
                        reason=HaltReason.TRANSPORT_AUTH_FAILURE,
                        detail=str(exc),
                        triggered_by=f"transport:{exc.source}",
                        db=self.db,
                    )
                    failed += 1
                    halt_reason = f"TRANSPORT_AUTH_FAILURE: {exc}"
                    break
                except QuotaExhaustedError as exc:
                    quota_warnings.append({"source": exc.source, "detail": str(exc)})
                    self._persist_send(run_id, message, transport.name, SendStatus.PENDING_QUOTA_RESET, error_code="QUOTA_EXHAUSTED", error_message=str(exc))
                    pending += 1
                    continue

                self._persist_send(run_id, message, transport.name, result.status, provider_message_id=result.provider_message_id, error_code=result.error_code, error_message=result.error_message)

                if result.status == SendStatus.SENT:
                    self.quotas.consume(source)
                    sent += 1
                elif result.status == SendStatus.FAILED:
                    failed += 1
                else:
                    pending += 1

                # Bounce circuit breaker re-evaluates only on email channel
                # (the only channel where bounce-rate is meaningful).
                if message.channel == MessageChannel.EMAIL:
                    halt = circuit_breaker.evaluate_bounce(client_id, self.db)
                    if halt is not None:
                        halt_reason = f"BOUNCE_CIRCUIT_BREAKER: {halt.detail}"
                        break

            status = CampaignRunStatus.HALTED if halt_reason else CampaignRunStatus.COMPLETED
            return self._finalize(run_record, status=status, sent=sent, failed=failed, pending=pending, halt_reason=halt_reason, quota_warnings=quota_warnings)
        except Exception as exc:
            self._finalize(run_record, status=CampaignRunStatus.FAILED, sent=sent, failed=failed, pending=pending, halt_reason=f"unhandled: {exc}", quota_warnings=quota_warnings)
            raise

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _dispatchable_messages(self, client_id: str) -> list[Message]:
        cp3_state = (
            self.db.query(CP3ReviewStateRecord)
            .filter(CP3ReviewStateRecord.client_id == client_id)
            .first()
        )
        if cp3_state is None:
            return []
        decisions = (
            self.db.query(CP3MessageReviewRecord)
            .filter(
                CP3MessageReviewRecord.cp3_state_id == cp3_state.id,
                CP3MessageReviewRecord.review_decision.in_(DISPATCHABLE_DECISIONS),
            )
            .all()
        )
        if not decisions:
            return []
        message_ids = [d.message_id for d in decisions]
        rows = (
            self.db.query(MessageRecord)
            .filter(MessageRecord.id.in_(message_ids))
            .order_by(MessageRecord.account_domain, MessageRecord.contact_id, MessageRecord.channel, MessageRecord.sequence_position)
            .all()
        )
        return [Message.model_validate(row.data) for row in rows]

    def _persist_send(
        self,
        run_id: str,
        message: Message,
        transport_name,
        status: SendStatus,
        *,
        provider_message_id: str | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> OutboundSendRecord:
        record = OutboundSendRecord(
            id=str(uuid.uuid4()),
            run_id=run_id,
            client_id=str(message.client_id),
            message_id=str(message.message_id),
            account_domain=message.account_domain,
            contact_id=str(message.contact_id) if message.contact_id else None,
            channel=message.channel.value,
            transport=transport_name.value,
            status=status.value,
            provider_message_id=provider_message_id,
            error_code=error_code,
            error_message=error_message,
            attempted_at=_now(),
            completed_at=_now() if status != SendStatus.QUEUED else None,
        )
        self.db.add(record)
        self.db.commit()
        return record

    def _finalize(
        self,
        run_record: CampaignRunRecord,
        *,
        status: CampaignRunStatus,
        sent: int,
        failed: int,
        pending: int,
        halt_reason: str | None,
        quota_warnings: list[dict],
    ) -> CampaignRun:
        run_record.status = status.value
        run_record.finished_at = _now()
        run_record.total_sent = sent
        run_record.total_failed = failed
        run_record.total_pending = pending
        run_record.halted = status == CampaignRunStatus.HALTED
        run_record.halt_reason = halt_reason
        run_record.quota_warnings = quota_warnings
        self.db.add(run_record)
        self.db.add(CampaignAuditLogRecord(
            client_id=run_record.client_id,
            run_id=run_record.id,
            action="RUN_FINALIZED",
            actor="campaign_agent",
            after_state={"status": status.value, "sent": sent, "failed": failed, "pending": pending, "halt_reason": halt_reason},
        ))
        self.db.commit()
        return CampaignRun(
            run_id=uuid.UUID(run_record.id),
            client_id=uuid.UUID(run_record.client_id),
            started_at=run_record.started_at,
            finished_at=run_record.finished_at,
            status=status,
            total_messages=run_record.total_messages,
            total_sent=sent,
            total_failed=failed,
            total_pending=pending,
            halted=run_record.halted,
            halt_reason=halt_reason,
            quota_warnings=quota_warnings,
        )
