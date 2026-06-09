"""
Tests for Phase 4 Storyteller / CP3 schemas.

Run: pytest backend/tests/test_phase4_schemas.py -v
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from backend.schemas.models import (
    AccountTier,
    BuyerApprovalCP3,
    BuyerDecision,
    CP3AggregateProgress,
    CP3ReviewState,
    CP3Status,
    ClientFeedback,
    DiversityState,
    FeedbackSentiment,
    FreshnessState,
    GenerationCosts,
    GenerationMetadata,
    Message,
    MessageChannel,
    MessageEngine,
    MessageEngineTarget,
    MessageReview,
    MessageReviewDecision,
    MessageReviewState,
    MessageSourceType,
    MessagesByChannel,
    MessagesByTier,
    MessagingAggregate,
    MessagingPackage,
    PersonalizationLayer,
    PersonalizationLayers,
    PromptTemplate,
    TierTarget,
    TokenUsage,
    TraceabilityState,
    ValidationStateBlock,
)


SCHEMA_DIR = Path(__file__).parent.parent / "schemas"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# JSON Schema files load + are valid Draft 2020-12
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "filename",
    [
        "message.schema.json",
        "messaging_package.schema.json",
        "cp3_review_state.schema.json",
        "prompt_template.schema.json",
    ],
)
def test_schema_is_valid_draft_2020_12(filename: str) -> None:
    schema = json.loads((SCHEMA_DIR / filename).read_text())
    Draft202012Validator.check_schema(schema)


# ---------------------------------------------------------------------------
# Message factories
# ---------------------------------------------------------------------------

def _layer(*, untraced: bool = False, source_type: MessageSourceType | None = None) -> PersonalizationLayer:
    if untraced:
        return PersonalizationLayer(
            text="",
            source_claim_id=None,
            source_type=MessageSourceType.UNTRACED,
            untraced=True,
        )
    return PersonalizationLayer(
        text="A specific personalised hook",
        source_claim_id=uuid.uuid4(),
        source_type=source_type or MessageSourceType.INTEL_REPORT_PRIORITY,
        untraced=False,
    )


def _all_traced_layers() -> PersonalizationLayers:
    return PersonalizationLayers(
        account_hook=_layer(source_type=MessageSourceType.INTEL_REPORT_PRIORITY),
        buyer_hook=_layer(source_type=MessageSourceType.JOB_CHANGE_SIGNAL),
        pain=_layer(source_type=MessageSourceType.BUYER_PAIN_POINT),
        value=_layer(source_type=MessageSourceType.MASTER_CONTEXT_VALUE_PROP),
    )


def _generation_metadata(engine: MessageEngine = MessageEngine.ANTHROPIC_CLAUDE) -> GenerationMetadata:
    return GenerationMetadata(
        engine=engine,
        model_version="claude-sonnet-4",
        prompt_template_id="linkedin_dm_t1_pos0_claude_v1",
        generated_at=_now(),
        token_usage=TokenUsage(input_tokens=400, output_tokens=120, estimated_cost_usd=0.012),
        generation_attempt=1,
        diversity_signature="hash:abc123",
    )


def _passing_validation_state() -> ValidationStateBlock:
    return ValidationStateBlock(
        traceability=TraceabilityState.PASSED,
        traceability_failures=[],
        diversity=DiversityState.PASSED,
        diversity_collision_with=[],
        freshness=FreshnessState.PASSED,
        freshness_failures=[],
    )


def _build_message(
    *,
    tier: AccountTier = AccountTier.TIER_1,
    channel: MessageChannel = MessageChannel.LINKEDIN_DM,
    layers: PersonalizationLayers | None = None,
    validation: ValidationStateBlock | None = None,
    subject: str | None = None,
    contact_id: uuid.UUID | None = None,
) -> Message:
    if contact_id is None and channel != MessageChannel.REDDIT_STRATEGY_NOTE:
        contact_id = uuid.uuid4()
    return Message(
        message_id=uuid.uuid4(),
        client_id=uuid.uuid4(),
        account_domain="acme.com",
        contact_id=contact_id,
        tier=tier,
        channel=channel,
        sequence_position=0,
        subject=subject,
        body="Hi {name}, saw your team is investing in payments infra...",
        personalization_layers=layers or _all_traced_layers(),
        generation_metadata=_generation_metadata(),
        validation_state=validation or _passing_validation_state(),
        review_state=MessageReviewState.DRAFT_VALIDATED,
        operator_edit_history=[],
        last_updated_at=_now(),
    )


# ---------------------------------------------------------------------------
# Message: traceability invariant
# ---------------------------------------------------------------------------

def test_valid_message_with_all_layers_traced_passes() -> None:
    msg = _build_message()
    assert msg.validation_state.traceability == TraceabilityState.PASSED


def test_tier_1_with_untraced_layer_must_be_hard_fail() -> None:
    layers = _all_traced_layers()
    layers.pain = _layer(untraced=True)
    failing = ValidationStateBlock(
        traceability=TraceabilityState.HARD_FAIL,
        traceability_failures=[{"layer": "pain", "reason": "no source claim"}],
        diversity=DiversityState.PASSED,
        diversity_collision_with=[],
        freshness=FreshnessState.PASSED,
        freshness_failures=[],
    )
    msg = _build_message(tier=AccountTier.TIER_1, layers=layers, validation=failing)
    assert msg.validation_state.traceability == TraceabilityState.HARD_FAIL


def test_tier_1_with_untraced_layer_rejected_when_marked_passed() -> None:
    layers = _all_traced_layers()
    layers.pain = _layer(untraced=True)
    with pytest.raises(ValidationError, match="Tier 1 message with any untraced layer"):
        _build_message(tier=AccountTier.TIER_1, layers=layers)


def test_tier_1_with_untraced_layer_rejected_when_marked_soft_fail() -> None:
    layers = _all_traced_layers()
    layers.pain = _layer(untraced=True)
    soft = ValidationStateBlock(
        traceability=TraceabilityState.SOFT_FAIL,
        traceability_failures=[{"layer": "pain", "reason": "no source claim"}],
        diversity=DiversityState.PASSED,
        diversity_collision_with=[],
        freshness=FreshnessState.PASSED,
        freshness_failures=[],
    )
    with pytest.raises(ValidationError, match="Tier 1 message with any untraced layer"):
        _build_message(tier=AccountTier.TIER_1, layers=layers, validation=soft)


def test_tier_2_with_untraced_layer_is_soft_fail_and_valid() -> None:
    layers = _all_traced_layers()
    layers.value = _layer(untraced=True)
    soft = ValidationStateBlock(
        traceability=TraceabilityState.SOFT_FAIL,
        traceability_failures=[{"layer": "value", "reason": "no source claim"}],
        diversity=DiversityState.PASSED,
        diversity_collision_with=[],
        freshness=FreshnessState.PASSED,
        freshness_failures=[],
    )
    msg = _build_message(tier=AccountTier.TIER_2, layers=layers, validation=soft)
    assert msg.validation_state.traceability == TraceabilityState.SOFT_FAIL


def test_tier_3_with_untraced_layer_rejected_when_marked_hard_fail() -> None:
    layers = _all_traced_layers()
    layers.value = _layer(untraced=True)
    hard = ValidationStateBlock(
        traceability=TraceabilityState.HARD_FAIL,
        traceability_failures=[{"layer": "value", "reason": "no source claim"}],
        diversity=DiversityState.PASSED,
        diversity_collision_with=[],
        freshness=FreshnessState.PASSED,
        freshness_failures=[],
    )
    with pytest.raises(ValidationError, match="Tier 2/3 message"):
        _build_message(tier=AccountTier.TIER_3, layers=layers, validation=hard)


def test_all_traced_must_be_passed() -> None:
    failing = ValidationStateBlock(
        traceability=TraceabilityState.SOFT_FAIL,
        traceability_failures=[{"layer": "pain", "reason": "spurious"}],
        diversity=DiversityState.PASSED,
        diversity_collision_with=[],
        freshness=FreshnessState.PASSED,
        freshness_failures=[],
    )
    with pytest.raises(ValidationError, match="all layers traced must have traceability=PASSED"):
        _build_message(validation=failing)


# ---------------------------------------------------------------------------
# Message: channel invariants
# ---------------------------------------------------------------------------

def test_email_requires_subject() -> None:
    with pytest.raises(ValidationError, match="EMAIL channel requires a non-empty subject"):
        _build_message(channel=MessageChannel.EMAIL, subject=None)


def test_non_email_forbids_subject() -> None:
    with pytest.raises(ValidationError, match="subject must be null"):
        _build_message(channel=MessageChannel.LINKEDIN_DM, subject="hi")


def test_email_with_subject_ok() -> None:
    msg = _build_message(channel=MessageChannel.EMAIL, subject="Quick question on payments")
    assert msg.subject == "Quick question on payments"


def test_reddit_strategy_note_forbids_contact_id() -> None:
    with pytest.raises(ValidationError, match="REDDIT_STRATEGY_NOTE is account-level"):
        _build_message(channel=MessageChannel.REDDIT_STRATEGY_NOTE, contact_id=uuid.uuid4())


def test_non_reddit_requires_contact_id() -> None:
    # Use sentinel that isn't None but resolves to None -> we set explicitly
    with pytest.raises(ValidationError, match="requires contact_id"):
        Message(
            message_id=uuid.uuid4(),
            client_id=uuid.uuid4(),
            account_domain="acme.com",
            contact_id=None,
            tier=AccountTier.TIER_1,
            channel=MessageChannel.LINKEDIN_DM,
            sequence_position=0,
            subject=None,
            body="Hi",
            personalization_layers=_all_traced_layers(),
            generation_metadata=_generation_metadata(),
            validation_state=_passing_validation_state(),
            review_state=MessageReviewState.PENDING,
            operator_edit_history=[],
            last_updated_at=_now(),
        )


# ---------------------------------------------------------------------------
# ValidationStateBlock invariants
# ---------------------------------------------------------------------------

def test_diversity_failed_requires_collision_list() -> None:
    with pytest.raises(ValidationError, match="diversity=FAILED requires non-empty"):
        ValidationStateBlock(
            traceability=TraceabilityState.PASSED,
            traceability_failures=[],
            diversity=DiversityState.FAILED,
            diversity_collision_with=[],
            freshness=FreshnessState.PASSED,
            freshness_failures=[],
        )


def test_diversity_signature_required_non_empty() -> None:
    with pytest.raises(ValidationError):
        GenerationMetadata(
            engine=MessageEngine.ANTHROPIC_CLAUDE,
            model_version="x",
            prompt_template_id="x",
            generated_at=_now(),
            token_usage=TokenUsage(input_tokens=1, output_tokens=1, estimated_cost_usd=0.0),
            generation_attempt=1,
            diversity_signature="",
        )


# ---------------------------------------------------------------------------
# CP3ReviewState invariants
# ---------------------------------------------------------------------------

def _agg(**overrides) -> CP3AggregateProgress:
    base = dict(
        total_messages=0,
        reviewed_messages=0,
        approved_messages=0,
        edited_messages=0,
        regenerated_messages=0,
        total_buyers=0,
        approved_buyers=0,
        client_feedback_total=0,
        client_feedback_unresolved=0,
    )
    base.update(overrides)
    return CP3AggregateProgress(**base)


def _empty_cp3(status: CP3Status = CP3Status.NOT_STARTED, **overrides) -> dict:
    base = dict(
        client_id=uuid.uuid4(),
        status=status,
        opened_at=None,
        operator_completed_at=None,
        client_share_sent_at=None,
        client_completed_at=None,
        approved_at=None,
        reviewer="ops@example.com",
        client_share_token=None,
        client_share_email=None,
        client_review_sample_ids=[],
        message_reviews=[],
        buyer_approvals=[],
        client_feedback=[],
        aggregate_progress=_agg(),
        blockers=[],
    )
    base.update(overrides)
    return base


def test_cp3_not_started_minimal_state_is_valid() -> None:
    state = CP3ReviewState(**_empty_cp3())
    assert state.status == CP3Status.NOT_STARTED


def test_cp3_approved_requires_all_messages_reviewed() -> None:
    msg_id = uuid.uuid4()
    review = MessageReview(
        message_id=msg_id,
        review_decision=MessageReviewDecision.PENDING,
        operator_edits=[],
        review_notes=None,
        reviewed_at=None,
        opened_count=1,
    )
    with pytest.raises(ValidationError, match="reviewed_messages == total_messages"):
        CP3ReviewState(
            **_empty_cp3(
                status=CP3Status.APPROVED,
                opened_at=_now(),
                approved_at=_now(),
                message_reviews=[review],
                aggregate_progress=_agg(total_messages=1, reviewed_messages=0),
            )
        )


def test_cp3_approved_blocked_by_unresolved_client_feedback() -> None:
    fb = ClientFeedback(
        feedback_id=uuid.uuid4(),
        message_id=None,
        feedback_text="please tone down the third email",
        sentiment=FeedbackSentiment.CHANGE_REQUEST,
        resolved=False,
        resolved_by=None,
        resolution_notes=None,
        submitted_at=_now(),
        resolved_at=None,
    )
    with pytest.raises(ValidationError, match="client feedback is unresolved"):
        CP3ReviewState(
            **_empty_cp3(
                status=CP3Status.APPROVED,
                opened_at=_now(),
                approved_at=_now(),
                client_feedback=[fb],
                aggregate_progress=_agg(client_feedback_total=1, client_feedback_unresolved=1),
            )
        )


def test_cp3_approved_clean_path() -> None:
    msg_id = uuid.uuid4()
    contact_id = uuid.uuid4()
    review = MessageReview(
        message_id=msg_id,
        review_decision=MessageReviewDecision.APPROVED,
        operator_edits=[],
        review_notes=None,
        reviewed_at=_now(),
        opened_count=1,
    )
    buyer = BuyerApprovalCP3(
        contact_id=contact_id,
        account_domain="acme.com",
        all_messages_reviewed=True,
        buyer_decision=BuyerDecision.APPROVED,
        buyer_notes=None,
    )
    state = CP3ReviewState(
        **_empty_cp3(
            status=CP3Status.APPROVED,
            opened_at=_now(),
            operator_completed_at=_now(),
            client_share_sent_at=_now(),
            client_completed_at=_now(),
            approved_at=_now(),
            client_share_token=uuid.uuid4(),
            client_share_email="client@example.com",
            client_review_sample_ids=[msg_id],
            message_reviews=[review],
            buyer_approvals=[buyer],
            aggregate_progress=_agg(
                total_messages=1,
                reviewed_messages=1,
                approved_messages=1,
                total_buyers=1,
                approved_buyers=1,
            ),
        )
    )
    assert state.status == CP3Status.APPROVED


def test_cp3_unresolved_count_must_match_actual() -> None:
    fb = ClientFeedback(
        feedback_id=uuid.uuid4(),
        message_id=None,
        feedback_text="looks fine",
        sentiment=FeedbackSentiment.POSITIVE,
        resolved=False,
        resolved_by=None,
        resolution_notes=None,
        submitted_at=_now(),
        resolved_at=None,
    )
    with pytest.raises(ValidationError, match="client_feedback_unresolved must match"):
        CP3ReviewState(
            **_empty_cp3(
                client_feedback=[fb],
                aggregate_progress=_agg(client_feedback_total=1, client_feedback_unresolved=0),
            )
        )


# ---------------------------------------------------------------------------
# BuyerApproval, ClientFeedback invariants
# ---------------------------------------------------------------------------

def test_buyer_approval_requires_all_messages_reviewed() -> None:
    with pytest.raises(ValidationError, match="all_messages_reviewed=true"):
        BuyerApprovalCP3(
            contact_id=uuid.uuid4(),
            account_domain="acme.com",
            all_messages_reviewed=False,
            buyer_decision=BuyerDecision.APPROVED,
            buyer_notes=None,
        )


def test_buyer_approval_pending_does_not_require_review() -> None:
    BuyerApprovalCP3(
        contact_id=uuid.uuid4(),
        account_domain="acme.com",
        all_messages_reviewed=False,
        buyer_decision=BuyerDecision.PENDING,
        buyer_notes=None,
    )


def test_client_feedback_resolved_requires_resolved_by() -> None:
    with pytest.raises(ValidationError, match="resolved=true requires resolved_by"):
        ClientFeedback(
            feedback_id=uuid.uuid4(),
            message_id=None,
            feedback_text="x",
            sentiment=FeedbackSentiment.POSITIVE,
            resolved=True,
            resolved_by=None,
            resolution_notes=None,
            submitted_at=_now(),
            resolved_at=_now(),
        )


def test_client_feedback_resolved_requires_resolved_at() -> None:
    with pytest.raises(ValidationError, match="resolved=true requires resolved_at"):
        ClientFeedback(
            feedback_id=uuid.uuid4(),
            message_id=None,
            feedback_text="x",
            sentiment=FeedbackSentiment.POSITIVE,
            resolved=True,
            resolved_by="ops@example.com",
            resolution_notes="addressed",
            submitted_at=_now(),
            resolved_at=None,
        )


def test_client_feedback_unresolved_must_have_null_resolution_fields() -> None:
    with pytest.raises(ValidationError, match="resolved_by must be null"):
        ClientFeedback(
            feedback_id=uuid.uuid4(),
            message_id=None,
            feedback_text="x",
            sentiment=FeedbackSentiment.POSITIVE,
            resolved=False,
            resolved_by="ops@example.com",
            resolution_notes=None,
            submitted_at=_now(),
            resolved_at=None,
        )


# ---------------------------------------------------------------------------
# PromptTemplate
# ---------------------------------------------------------------------------

def test_prompt_template_minimum_valid() -> None:
    tpl = PromptTemplate(
        template_id="linkedin_dm_t1_pos0_claude_v1",
        channel=MessageChannel.LINKEDIN_DM,
        tier_target=TierTarget.TIER_1,
        sequence_position=0,
        engine_target=MessageEngineTarget.ANTHROPIC_CLAUDE,
        system_prompt="You are an expert ABM copywriter...",
        user_prompt_template="Account: {{account_company_name}}. Contact: {{contact_full_name}}.",
        max_tokens=400,
        temperature=0.7,
        active=True,
        version="1.0.0",
        created_at=_now(),
        deprecated_at=None,
    )
    assert tpl.active


def test_prompt_template_negative_sequence_rejected() -> None:
    with pytest.raises(ValidationError):
        PromptTemplate(
            template_id="x",
            channel=MessageChannel.LINKEDIN_DM,
            tier_target=TierTarget.TIER_1,
            sequence_position=-1,
            engine_target=MessageEngineTarget.ANTHROPIC_CLAUDE,
            system_prompt="x",
            user_prompt_template="x",
            max_tokens=100,
            temperature=0.5,
            active=True,
            version="1.0.0",
            created_at=_now(),
            deprecated_at=None,
        )


def test_prompt_template_version_must_be_semver() -> None:
    with pytest.raises(ValidationError):
        PromptTemplate(
            template_id="x",
            channel=MessageChannel.LINKEDIN_DM,
            tier_target=TierTarget.TIER_1,
            sequence_position=0,
            engine_target=MessageEngineTarget.ANTHROPIC_CLAUDE,
            system_prompt="x",
            user_prompt_template="x",
            max_tokens=100,
            temperature=0.5,
            active=True,
            version="v1",
            created_at=_now(),
            deprecated_at=None,
        )


# ---------------------------------------------------------------------------
# MessagingPackage
# ---------------------------------------------------------------------------

def test_messaging_package_round_trip() -> None:
    msg = _build_message()
    pkg = MessagingPackage(
        client_id=msg.client_id,
        generated_at=_now(),
        messages=[msg],
        by_account={
            "acme.com": {
                "contact_count": 1,
                "message_count": 1,
                "all_validated": True,
                "all_approved": False,
            }
        },
        aggregate=MessagingAggregate(
            total_messages=1,
            by_channel=MessagesByChannel(
                linkedin_connection=0,
                linkedin_dm=1,
                email=0,
                whatsapp=0,
                reddit_strategy_note=0,
            ),
            by_tier=MessagesByTier(tier_1=1, tier_2=0, tier_3=0),
            traceability_pass_rate=1.0,
            diversity_pass_rate=1.0,
            hard_failures=0,
            soft_failures=0,
        ),
        generation_costs=GenerationCosts(
            claude_total_usd=0.012,
            gpt_total_usd=0.0,
            total_usd=0.012,
            avg_per_message_usd=0.012,
        ),
    )
    assert len(pkg.messages) == 1
    assert pkg.aggregate.by_channel.linkedin_dm == 1


# ---------------------------------------------------------------------------
# JSON Schema validates a Pydantic-built Message dump
# ---------------------------------------------------------------------------

def test_pydantic_message_dump_validates_against_json_schema() -> None:
    schema = json.loads((SCHEMA_DIR / "message.schema.json").read_text())
    msg = _build_message()
    Draft202012Validator(schema).validate(json.loads(msg.model_dump_json()))


def test_pydantic_cp3_dump_validates_against_json_schema() -> None:
    schema = json.loads((SCHEMA_DIR / "cp3_review_state.schema.json").read_text())
    state = CP3ReviewState(**_empty_cp3())
    Draft202012Validator(schema).validate(json.loads(state.model_dump_json()))


def test_pydantic_template_dump_validates_against_json_schema() -> None:
    schema = json.loads((SCHEMA_DIR / "prompt_template.schema.json").read_text())
    tpl = PromptTemplate(
        template_id="email_t1_pos0_claude_v1",
        channel=MessageChannel.EMAIL,
        tier_target=TierTarget.TIER_1,
        sequence_position=0,
        engine_target=MessageEngineTarget.ANTHROPIC_CLAUDE,
        system_prompt="You are an expert ABM copywriter...",
        user_prompt_template="Account {{account_company_name}}",
        max_tokens=600,
        temperature=0.7,
        active=True,
        version="1.0.0",
        created_at=_now(),
        deprecated_at=None,
    )
    Draft202012Validator(schema).validate(json.loads(tpl.model_dump_json()))
