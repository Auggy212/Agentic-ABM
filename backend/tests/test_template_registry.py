from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.agents.storyteller.templates.registry import TemplateRegistry
from backend.agents.storyteller.templates.seed_templates import seed_phase4_templates
from backend.db.models import Base, PromptTemplateRecord
from backend.schemas.models import (
    AccountTier,
    MessageChannel,
    MessageEngine,
    MessageEngineTarget,
    PromptTemplate,
    TierTarget,
)


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _template(template_id: str, *, active: bool = False, version: str = "1.0.0") -> PromptTemplate:
    return PromptTemplate(
        template_id=template_id,
        channel=MessageChannel.EMAIL,
        tier_target=TierTarget.ALL,
        sequence_position=0,
        engine_target=MessageEngineTarget.ANY,
        system_prompt="You are an expert ABM copywriter. Return strict JSON.",
        user_prompt_template="Account {{account_company_name}}",
        max_tokens=100,
        temperature=0.5,
        active=active,
        version=version,
        created_at=datetime.now(tz=timezone.utc),
        deprecated_at=None,
    )


def test_get_active_falls_back_to_all_tier_and_any_engine(db_session) -> None:
    registry = TemplateRegistry(db_session)
    template = registry.register(_template("email_all_any_v1"))
    registry.activate(template.template_id)

    resolved = registry.get_active(
        MessageChannel.EMAIL,
        AccountTier.TIER_3,
        0,
        MessageEngine.OPENAI_GPT_4O_MINI,
    )

    assert resolved.template_id == "email_all_any_v1"


def test_activate_deactivates_previous_sibling(db_session) -> None:
    registry = TemplateRegistry(db_session)
    first = registry.register(_template("email_all_any_v1", version="1.0.0"))
    second = registry.register(_template("email_all_any_v2", version="1.1.0"))
    registry.activate(first.template_id)
    registry.activate(second.template_id)

    rows = db_session.query(PromptTemplateRecord).all()
    active = [row.template_id for row in rows if row.active]
    assert active == ["email_all_any_v2"]


def test_partial_unique_index_prevents_two_active_templates(db_session) -> None:
    db_session.add(PromptTemplateRecord(
        template_id="a",
        channel=MessageChannel.EMAIL.value,
        tier_target=TierTarget.ALL.value,
        sequence_position=0,
        engine_target=MessageEngineTarget.ANY.value,
        system_prompt="x",
        user_prompt_template="x",
        max_tokens=1,
        temperature=0.1,
        active=True,
        version="1.0.0",
        created_at=datetime.now(tz=timezone.utc),
    ))
    db_session.commit()
    db_session.add(PromptTemplateRecord(
        template_id="b",
        channel=MessageChannel.EMAIL.value,
        tier_target=TierTarget.ALL.value,
        sequence_position=0,
        engine_target=MessageEngineTarget.ANY.value,
        system_prompt="x",
        user_prompt_template="x",
        max_tokens=1,
        temperature=0.1,
        active=True,
        version="1.0.0",
        created_at=datetime.now(tz=timezone.utc),
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_seed_templates_is_idempotent(db_session) -> None:
    seed_phase4_templates(db_session)
    first_count = db_session.query(PromptTemplateRecord).count()
    seed_phase4_templates(db_session)
    second_count = db_session.query(PromptTemplateRecord).count()
    assert first_count == second_count == 21


def test_history_returns_newest_first(db_session) -> None:
    registry = TemplateRegistry(db_session)
    old = registry.register(_template("email_all_any_v1", version="1.0.0"))
    new = registry.register(_template("email_all_any_v2", version="1.1.0"))

    history = registry.history(MessageChannel.EMAIL, TierTarget.ALL, 0)

    assert [item.template_id for item in history] == [new.template_id, old.template_id]
