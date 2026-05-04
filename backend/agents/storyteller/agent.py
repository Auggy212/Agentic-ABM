from __future__ import annotations

import os
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.agents.cp2.gate import assert_cp2_approved
from backend.agents.cp2.state_manager import get_state as get_cp2_state
from backend.agents.storyteller.context_builder import build_context
from backend.agents.storyteller.engine_router import EngineRouter
from backend.agents.storyteller.templates.registry import TemplateRegistry
from backend.agents.storyteller.templates.seed_templates import seed_phase4_templates
from backend.agents.storyteller.validators.diversity import validate_diversity
from backend.agents.storyteller.validators.freshness import validate_freshness
from backend.agents.storyteller.validators.traceability import validate_traceability
from backend.db.models import (
    BuyerProfileRecord,
    ICPAccountRecord,
    MasterContextRecord,
    MessageRecord,
    MessagingRunRecord,
    SignalReportRecord,
)
from backend.schemas.models import (
    AccountTier,
    BuyerProfile,
    BuyingStage,
    CommitteeRole,
    CP2ReviewState,
    DiversityState,
    FreshnessState,
    GenerationCosts,
    GenerationMetadata,
    MasterContext,
    Message,
    MessageChannel,
    MessageEngine,
    MessageReviewState,
    MessageSourceType,
    MessagingAggregate,
    MessagingPackage,
    MessagesByChannel,
    MessagesByTier,
    PersonalizationLayer,
    PersonalizationLayers,
    SignalReport,
    TokenUsage,
    TraceabilityState,
    ValidationStateBlock,
)


class StorytellerBudgetError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _engine_for_tier(tier: AccountTier) -> MessageEngine:
    return MessageEngine.ANTHROPIC_CLAUDE if tier == AccountTier.TIER_1 else MessageEngine.OPENAI_GPT_4O_MINI


class StorytellerAgent:
    def __init__(self, db: Session, *, engine_router: EngineRouter | None = None):
        self.db = db
        self.registry = TemplateRegistry(db)
        self.engine_router = engine_router or EngineRouter(use_mock=os.environ.get("STORYTELLER_USE_MOCK", "1") == "1")
        self.anthropic_budget = float(os.environ.get("ANTHROPIC_RUN_BUDGET_USD", "50"))
        self.openai_budget = float(os.environ.get("OPENAI_RUN_BUDGET_USD", "20"))

    def run(self, client_id: str, scope: dict[str, Any] | str = "all") -> MessagingPackage:
        assert_cp2_approved(client_id, self.db)
        cp2_state = get_cp2_state(client_id, self.db)
        if not self.registry.list_active():
            seed_phase4_templates(self.db)

        run_record = MessagingRunRecord(client_id=client_id, status="RUNNING")
        self.db.add(run_record)
        self.db.commit()

        accounts = self._accounts(client_id)
        signals = self._signals(client_id)
        master_context = self._master_context(client_id)
        profiles = self._approved_profiles(client_id, cp2_state)
        generated: list[Message] = []
        costs = {"claude": 0.0, "gpt": 0.0}

        try:
            for profile in sorted(profiles, key=lambda p: (p.account_domain, p.full_name)):
                account = accounts.get(profile.account_domain, {"domain": profile.account_domain})
                signal = signals.get(profile.account_domain)
                tier_value = account.get("tier") or (signal.tier.value if signal else AccountTier.TIER_3.value)
                tier = AccountTier(tier_value)
                engine = _engine_for_tier(tier)
                context = build_context(account, profile, signal, signal, master_context, cp2_state)
                for channel, position in self._channel_plan(profile, signal):
                    if not self._has_channel_data(profile, channel):
                        continue
                    if costs["claude"] >= self.anthropic_budget or costs["gpt"] >= self.openai_budget:
                        run_record.status = "PENDING_BUDGET"
                        self.db.add(run_record)
                        self.db.commit()
                        return self._package(client_id, generated, costs)
                    message = self._generate_one(
                        client_id=client_id,
                        account_domain=profile.account_domain,
                        contact_id=profile.contact_id,
                        tier=tier,
                        channel=channel,
                        position=position,
                        engine=engine,
                        context=context,
                        cp2_state=cp2_state,
                        generated_so_far=generated,
                    )
                    generated.append(message)
                    if engine == MessageEngine.ANTHROPIC_CLAUDE:
                        costs["claude"] += message.generation_metadata.token_usage.estimated_cost_usd
                    else:
                        costs["gpt"] += message.generation_metadata.token_usage.estimated_cost_usd
                    self._persist_message(message)

                if signal and signal.buying_stage == BuyingStage.UNAWARE:
                    if not any(m.account_domain == profile.account_domain and m.channel == MessageChannel.REDDIT_STRATEGY_NOTE for m in generated):
                        reddit = self._generate_one(
                            client_id=client_id,
                            account_domain=profile.account_domain,
                            contact_id=None,
                            tier=tier,
                            channel=MessageChannel.REDDIT_STRATEGY_NOTE,
                            position=0,
                            engine=engine,
                            context=context,
                            cp2_state=cp2_state,
                            generated_so_far=generated,
                        )
                        generated.append(reddit)
                        self._persist_message(reddit)

            package = self._package(client_id, generated, costs)
            run_record.status = "COMPLETED"
            run_record.finished_at = _now()
            run_record.total_messages = len(generated)
            run_record.hard_failures = package.aggregate.hard_failures
            run_record.soft_failures = package.aggregate.soft_failures
            run_record.claude_cost_usd = costs["claude"]
            run_record.gpt_cost_usd = costs["gpt"]
            run_record.total_cost_usd = costs["claude"] + costs["gpt"]
            run_record.data = package.model_dump(mode="json")
            self.db.add(run_record)
            self.db.commit()
            return package
        except Exception:
            run_record.status = "FAILED"
            run_record.finished_at = _now()
            self.db.add(run_record)
            self.db.commit()
            raise

    def _generate_one(
        self,
        *,
        client_id: str,
        account_domain: str,
        contact_id: uuid.UUID | None,
        tier: AccountTier,
        channel: MessageChannel,
        position: int,
        engine: MessageEngine,
        context: dict[str, Any],
        cp2_state: CP2ReviewState,
        generated_so_far: list[Message],
    ) -> Message:
        template = self.registry.get_active(channel, tier, position, engine)
        final_message: Message | None = None
        for attempt in (1, 2, 3):
            raw = self.engine_router.generate(template, context, engine, attempt=attempt)
            message = self._message_from_raw(
                raw=raw,
                client_id=client_id,
                account_domain=account_domain,
                contact_id=contact_id,
                tier=tier,
                channel=channel,
                position=position,
                engine=engine,
                template_id=template.template_id,
            )
            message = self._validate(message, cp2_state, generated_so_far)
            final_message = message
            if message.validation_state.traceability != TraceabilityState.HARD_FAIL:
                break
        if final_message is None:
            raise RuntimeError("generation produced no message")
        if final_message.validation_state.traceability == TraceabilityState.HARD_FAIL:
            final_message = final_message.model_copy(update={"review_state": MessageReviewState.REQUIRES_REGENERATION})
        return final_message

    def _message_from_raw(self, *, raw, client_id: str, account_domain: str, contact_id, tier, channel, position, engine, template_id) -> Message:
        raw_layers = raw.content_json.get("personalization_layers", {})
        layers: dict[str, PersonalizationLayer] = {}
        failures = []
        for name in ("account_hook", "buyer_hook", "pain", "value"):
            data = raw_layers.get(name, {})
            text = data.get("text") or ""
            source_type = MessageSourceType(data.get("source_type") or "UNTRACED")
            untraced = bool(data.get("untraced")) or source_type == MessageSourceType.UNTRACED or not text.strip()
            layers[name] = PersonalizationLayer(
                text=text,
                source_claim_id=data.get("source_claim_id"),
                source_type=MessageSourceType.UNTRACED if untraced and source_type == MessageSourceType.UNTRACED else source_type,
                untraced=untraced,
            )
            if untraced:
                failures.append({"layer": name, "reason": "untraced or empty generation layer"})
        trace = TraceabilityState.PASSED
        if failures:
            trace = TraceabilityState.HARD_FAIL if tier == AccountTier.TIER_1 else TraceabilityState.SOFT_FAIL
        return Message(
            message_id=uuid.uuid4(),
            client_id=uuid.UUID(client_id),
            account_domain=account_domain,
            contact_id=contact_id,
            tier=tier,
            channel=channel,
            sequence_position=position,
            subject=raw.content_json.get("subject"),
            body=raw.content_json.get("body") or "",
            personalization_layers=PersonalizationLayers(**layers),
            generation_metadata=GenerationMetadata(
                engine=engine,
                model_version=raw.model_version,
                prompt_template_id=template_id,
                generated_at=_now(),
                token_usage=TokenUsage(
                    input_tokens=raw.token_usage.get("input_tokens", 0),
                    output_tokens=raw.token_usage.get("output_tokens", 0),
                    estimated_cost_usd=raw.cost_usd,
                ),
                generation_attempt=raw.attempt,
                diversity_signature="hash:pending",
            ),
            validation_state=ValidationStateBlock(
                traceability=trace,
                traceability_failures=failures,
                diversity=DiversityState.PASSED,
                diversity_collision_with=[],
                freshness=FreshnessState.PASSED,
                freshness_failures=[],
            ),
            review_state=MessageReviewState.DRAFT_VALIDATED,
            operator_edit_history=[],
            last_updated_at=_now(),
        )

    def _validate(self, message: Message, cp2_state: CP2ReviewState, generated_so_far: list[Message]) -> Message:
        trace = validate_traceability(message, message.tier, cp2_state)
        diversity = validate_diversity(message, generated_so_far)
        freshness = validate_freshness(message)
        failures = [{"layer": f.layer, "reason": f.reason} for f in trace.failures]
        freshness_failures = [{"layer": f.layer, "reason": f.reason} for f in freshness.failures]
        state = ValidationStateBlock(
            traceability=TraceabilityState(trace.state),
            traceability_failures=failures,
            diversity=DiversityState(diversity.state),
            diversity_collision_with=diversity.collisions,
            freshness=FreshnessState(freshness.state),
            freshness_failures=freshness_failures,
        )
        metadata = message.generation_metadata.model_copy(update={"diversity_signature": diversity.signature or "hash:pending"})
        return message.model_copy(update={"validation_state": state, "generation_metadata": metadata})

    def _persist_message(self, message: Message) -> None:
        record = MessageRecord(
            id=str(message.message_id),
            client_id=str(message.client_id),
            account_domain=message.account_domain,
            contact_id=str(message.contact_id) if message.contact_id else None,
            channel=message.channel.value,
            sequence_position=message.sequence_position,
            tier=message.tier.value,
            data=message.model_dump(mode="json"),
            validation_state=message.validation_state.traceability.value,
            review_state=message.review_state.value,
            last_updated_at=message.last_updated_at,
        )
        self.db.merge(record)
        self.db.commit()

    def _accounts(self, client_id: str) -> dict[str, dict[str, Any]]:
        rows = self.db.query(ICPAccountRecord).filter(ICPAccountRecord.client_id == client_id, ICPAccountRecord.is_removed.is_(False)).all()
        return {row.domain: {**row.data, "tier": row.tier, "company_name": row.company_name} for row in rows}

    def _signals(self, client_id: str) -> dict[str, SignalReport]:
        rows = self.db.query(SignalReportRecord).filter(SignalReportRecord.client_id == client_id).all()
        return {row.account_domain: SignalReport.model_validate(row.data) for row in rows}

    def _master_context(self, client_id: str) -> MasterContext | None:
        row = (
            self.db.query(MasterContextRecord)
            .filter(MasterContextRecord.client_id == client_id)
            .order_by(MasterContextRecord.created_at.desc())
            .first()
        )
        return MasterContext.model_validate(row.data) if row else None

    def _approved_profiles(self, client_id: str, cp2_state: CP2ReviewState) -> list[BuyerProfile]:
        approved_domains = {
            account.account_domain
            for account in cp2_state.account_approvals
            if account.account_decision.value == "APPROVED"
        }
        rows = self.db.query(BuyerProfileRecord).filter(BuyerProfileRecord.client_id == client_id).all()
        profiles = [BuyerProfile.model_validate(row.data) for row in rows]
        return [profile for profile in profiles if profile.account_domain in approved_domains]

    def _channel_plan(self, profile: BuyerProfile, signal: SignalReport | None) -> list[tuple[MessageChannel, int]]:
        plan = [(MessageChannel.LINKEDIN_CONNECTION, 0)]
        plan.extend((MessageChannel.LINKEDIN_DM, pos) for pos in range(3))
        plan.extend((MessageChannel.EMAIL, pos) for pos in range(5))
        if profile.committee_role == CommitteeRole.CHAMPION:
            plan.append((MessageChannel.WHATSAPP, 0))
        return plan

    def _has_channel_data(self, profile: BuyerProfile, channel: MessageChannel) -> bool:
        if channel in {MessageChannel.LINKEDIN_CONNECTION, MessageChannel.LINKEDIN_DM}:
            return profile.linkedin_url is not None
        if channel == MessageChannel.EMAIL:
            return bool(profile.email and profile.email_status.value in {"VALID", "CATCH_ALL", "UNVERIFIED"})
        return True

    def _package(self, client_id: str, messages: list[Message], costs: dict[str, float]) -> MessagingPackage:
        by_channel = Counter(m.channel for m in messages)
        by_tier = Counter(m.tier for m in messages)
        by_account: dict[str, Any] = {}
        contacts_by_account: dict[str, set[str]] = defaultdict(set)
        for message in messages:
            if message.contact_id:
                contacts_by_account[message.account_domain].add(str(message.contact_id))
        for domain in {m.account_domain for m in messages}:
            domain_messages = [m for m in messages if m.account_domain == domain]
            by_account[domain] = {
                "contact_count": len(contacts_by_account[domain]),
                "message_count": len(domain_messages),
                "all_validated": all(m.validation_state.traceability != TraceabilityState.HARD_FAIL for m in domain_messages),
                "all_approved": all(m.review_state == MessageReviewState.APPROVED for m in domain_messages),
            }
        total = len(messages) or 1
        passed_trace = sum(1 for m in messages if m.validation_state.traceability == TraceabilityState.PASSED)
        passed_div = sum(1 for m in messages if m.validation_state.diversity == DiversityState.PASSED)
        total_cost = costs["claude"] + costs["gpt"]
        return MessagingPackage(
            client_id=uuid.UUID(client_id),
            generated_at=_now(),
            messages=messages,
            by_account=by_account,
            aggregate=MessagingAggregate(
                total_messages=len(messages),
                by_channel=MessagesByChannel(
                    linkedin_connection=by_channel[MessageChannel.LINKEDIN_CONNECTION],
                    linkedin_dm=by_channel[MessageChannel.LINKEDIN_DM],
                    email=by_channel[MessageChannel.EMAIL],
                    whatsapp=by_channel[MessageChannel.WHATSAPP],
                    reddit_strategy_note=by_channel[MessageChannel.REDDIT_STRATEGY_NOTE],
                ),
                by_tier=MessagesByTier(
                    tier_1=by_tier[AccountTier.TIER_1],
                    tier_2=by_tier[AccountTier.TIER_2],
                    tier_3=by_tier[AccountTier.TIER_3],
                ),
                traceability_pass_rate=passed_trace / total,
                diversity_pass_rate=passed_div / total,
                hard_failures=sum(1 for m in messages if m.validation_state.traceability == TraceabilityState.HARD_FAIL),
                soft_failures=sum(1 for m in messages if m.validation_state.traceability == TraceabilityState.SOFT_FAIL),
            ),
            generation_costs=GenerationCosts(
                claude_total_usd=costs["claude"],
                gpt_total_usd=costs["gpt"],
                total_usd=total_cost,
                avg_per_message_usd=total_cost / total,
            ),
        )
