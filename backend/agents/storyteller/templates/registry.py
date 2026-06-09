from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import PromptTemplateRecord
from backend.schemas.models import (
    AccountTier,
    MessageChannel,
    MessageEngine,
    MessageEngineTarget,
    PromptTemplate,
    TierTarget,
)


class TemplateNotFoundError(Exception):
    """Raised when no active prompt template can be resolved for a slot."""


class TemplateRegistryError(Exception):
    """Raised when a registry mutation cannot be completed safely."""


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _to_model(record: PromptTemplateRecord) -> PromptTemplate:
    return PromptTemplate(
        template_id=record.template_id,
        channel=MessageChannel(record.channel),
        tier_target=TierTarget(record.tier_target),
        sequence_position=record.sequence_position,
        engine_target=MessageEngineTarget(record.engine_target),
        system_prompt=record.system_prompt,
        user_prompt_template=record.user_prompt_template,
        max_tokens=record.max_tokens,
        temperature=record.temperature,
        active=record.active,
        version=record.version,
        created_at=record.created_at,
        deprecated_at=record.deprecated_at,
    )


def _target_from_tier(tier: AccountTier | TierTarget | str) -> TierTarget:
    value = tier.value if hasattr(tier, "value") else str(tier)
    if value == TierTarget.ALL.value:
        return TierTarget.ALL
    return TierTarget(value)


def _engine_target(engine: MessageEngine | MessageEngineTarget | str) -> MessageEngineTarget:
    value = engine.value if hasattr(engine, "value") else str(engine)
    if value == MessageEngineTarget.ANY.value:
        return MessageEngineTarget.ANY
    return MessageEngineTarget(value)


class TemplateRegistry:
    def __init__(self, db: Session):
        self.db = db

    def get_active(
        self,
        channel: MessageChannel | str,
        tier: AccountTier | TierTarget | str,
        sequence_position: int,
        engine: MessageEngine | MessageEngineTarget | str,
    ) -> PromptTemplate:
        channel_value = channel.value if hasattr(channel, "value") else str(channel)
        tier_value = _target_from_tier(tier).value
        engine_value = _engine_target(engine).value

        candidates = [
            (tier_value, engine_value),
            (TierTarget.ALL.value, engine_value),
            (TierTarget.ALL.value, MessageEngineTarget.ANY.value),
        ]
        for tier_candidate, engine_candidate in candidates:
            record = (
                self.db.query(PromptTemplateRecord)
                .filter(
                    PromptTemplateRecord.channel == channel_value,
                    PromptTemplateRecord.tier_target == tier_candidate,
                    PromptTemplateRecord.sequence_position == sequence_position,
                    PromptTemplateRecord.engine_target == engine_candidate,
                    PromptTemplateRecord.active.is_(True),
                )
                .order_by(PromptTemplateRecord.created_at.desc())
                .first()
            )
            if record is not None:
                return _to_model(record)
        raise TemplateNotFoundError(
            f"No active template for channel={channel_value}, tier={tier_value}, "
            f"position={sequence_position}, engine={engine_value}"
        )

    def register(self, template: PromptTemplate) -> PromptTemplate:
        record = PromptTemplateRecord(
            template_id=template.template_id,
            channel=template.channel.value,
            tier_target=template.tier_target.value,
            sequence_position=template.sequence_position,
            engine_target=template.engine_target.value,
            system_prompt=template.system_prompt,
            user_prompt_template=template.user_prompt_template,
            max_tokens=template.max_tokens,
            temperature=template.temperature,
            active=False,
            version=template.version,
            created_at=template.created_at,
            deprecated_at=template.deprecated_at,
        )
        self.db.add(record)
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise TemplateRegistryError(f"Template id already exists: {template.template_id}") from exc
        return _to_model(record)

    def upsert_seed(self, template: PromptTemplate) -> PromptTemplate:
        record = (
            self.db.query(PromptTemplateRecord)
            .filter(PromptTemplateRecord.template_id == template.template_id)
            .first()
        )
        if record is None:
            return self.register(template)
        record.channel = template.channel.value
        record.tier_target = template.tier_target.value
        record.sequence_position = template.sequence_position
        record.engine_target = template.engine_target.value
        record.system_prompt = template.system_prompt
        record.user_prompt_template = template.user_prompt_template
        record.max_tokens = template.max_tokens
        record.temperature = template.temperature
        record.version = template.version
        self.db.add(record)
        self.db.commit()
        return _to_model(record)

    def activate(self, template_id: str) -> None:
        record = (
            self.db.query(PromptTemplateRecord)
            .filter(PromptTemplateRecord.template_id == template_id)
            .first()
        )
        if record is None:
            raise TemplateNotFoundError(template_id)

        siblings = (
            self.db.query(PromptTemplateRecord)
            .filter(
                PromptTemplateRecord.channel == record.channel,
                PromptTemplateRecord.tier_target == record.tier_target,
                PromptTemplateRecord.sequence_position == record.sequence_position,
                PromptTemplateRecord.template_id != record.template_id,
                PromptTemplateRecord.active.is_(True),
            )
            .all()
        )
        for sibling in siblings:
            sibling.active = False
            self.db.add(sibling)
        self.db.flush()
        record.active = True
        self.db.add(record)
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise TemplateRegistryError("Only one active template is allowed per slot") from exc

    def deprecate(self, template_id: str, reason: str) -> None:
        record = (
            self.db.query(PromptTemplateRecord)
            .filter(PromptTemplateRecord.template_id == template_id)
            .first()
        )
        if record is None:
            raise TemplateNotFoundError(template_id)
        record.active = False
        record.deprecated_at = _now()
        record.deprecation_reason = reason
        self.db.add(record)
        self.db.commit()

    def history(
        self,
        channel: MessageChannel | str,
        tier: AccountTier | TierTarget | str,
        sequence_position: int,
    ) -> list[PromptTemplate]:
        channel_value = channel.value if hasattr(channel, "value") else str(channel)
        tier_value = _target_from_tier(tier).value
        rows: Iterable[PromptTemplateRecord] = (
            self.db.query(PromptTemplateRecord)
            .filter(
                PromptTemplateRecord.channel == channel_value,
                PromptTemplateRecord.tier_target == tier_value,
                PromptTemplateRecord.sequence_position == sequence_position,
            )
            .order_by(PromptTemplateRecord.created_at.desc())
            .all()
        )
        return [_to_model(row) for row in rows]

    def get(self, template_id: str) -> Optional[PromptTemplate]:
        record = (
            self.db.query(PromptTemplateRecord)
            .filter(PromptTemplateRecord.template_id == template_id)
            .first()
        )
        return _to_model(record) if record is not None else None

    def list_active(
        self,
        *,
        channel: MessageChannel | str | None = None,
        tier: TierTarget | str | None = None,
    ) -> list[PromptTemplate]:
        query = self.db.query(PromptTemplateRecord).filter(PromptTemplateRecord.active.is_(True))
        if channel is not None:
            query = query.filter(PromptTemplateRecord.channel == (channel.value if hasattr(channel, "value") else str(channel)))
        if tier is not None:
            query = query.filter(PromptTemplateRecord.tier_target == (tier.value if hasattr(tier, "value") else str(tier)))
        rows = query.order_by(
            PromptTemplateRecord.channel.asc(),
            PromptTemplateRecord.tier_target.asc(),
            PromptTemplateRecord.sequence_position.asc(),
        ).all()
        return [_to_model(row) for row in rows]
