from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from backend.schemas.models import (
    MessageChannel,
    MessageEngineTarget,
    PromptTemplate,
    TierTarget,
)

from .registry import TemplateRegistry


PLACEHOLDERS = """
Context placeholders:
- master_context_value_prop={{master_context_value_prop}}
- master_context_win_themes={{master_context_win_themes}}
- account_company_name={{account_company_name}}
- account_intel_top_priority={{account_intel_top_priority}}
- account_intel_competitive_angle={{account_intel_competitive_angle}}
- contact_full_name={{contact_full_name}}
- contact_title={{contact_title}}
- contact_committee_role={{contact_committee_role}}
- contact_job_change={{contact_job_change}}
- contact_approved_pain_points={{contact_approved_pain_points}}
- buying_stage={{buying_stage}}
- recommended_angle={{recommended_angle}}
"""


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _system(*, tier: str, channel_note: str) -> str:
    return (
        "You are an expert ABM copywriter writing precise, human outreach for a B2B team. "
        "Use the four personalization layers: account_hook, buyer_hook, pain, value. "
        f"Tone guidance: {tier}. {channel_note} "
        "Do NOT invent facts. If a layer's input is empty, say so explicitly in the output "
        "and tag that layer's source_claim_id as null with untraced=true. "
        "Return STRICT JSON only matching the message schema fields: subject when email, body, "
        "and personalization_layers with text, source_claim_id, source_type, untraced for each layer."
    )


def _user(instruction: str) -> str:
    return f"{instruction}\n{PLACEHOLDERS}\nReturn JSON only."


def _tpl(
    template_id: str,
    channel: MessageChannel,
    tier: TierTarget,
    pos: int,
    engine: MessageEngineTarget,
    system_prompt: str,
    user_prompt_template: str,
    *,
    max_tokens: int = 650,
    temperature: float = 0.55,
) -> PromptTemplate:
    return PromptTemplate(
        template_id=template_id,
        channel=channel,
        tier_target=tier,
        sequence_position=pos,
        engine_target=engine,
        system_prompt=system_prompt,
        user_prompt_template=user_prompt_template,
        max_tokens=max_tokens,
        temperature=temperature,
        active=False,
        version="1.0.0",
        created_at=_now(),
        deprecated_at=None,
    )


def canonical_phase4_templates() -> list[PromptTemplate]:
    templates: list[PromptTemplate] = []

    templates.append(
        _tpl(
            "linkedin_connection_t1_claude_v1",
            MessageChannel.LINKEDIN_CONNECTION,
            TierTarget.TIER_1,
            0,
            MessageEngineTarget.ANTHROPIC_CLAUDE,
            _system(
                tier="Tier 1 must feel highly bespoke and cite one specific approved intel claim.",
                channel_note="LinkedIn connection note must be <=300 characters and use account_hook OR buyer_hook, not both; omit value.",
            ),
            _user("Write a LinkedIn connection note under 300 characters. Pick the strongest single hook."),
            max_tokens=220,
            temperature=0.45,
        )
    )
    templates.append(
        _tpl(
            "linkedin_connection_t23_gpt_v1",
            MessageChannel.LINKEDIN_CONNECTION,
            TierTarget.ALL,
            0,
            MessageEngineTarget.OPENAI_GPT_4O_MINI,
            _system(
                tier="Tier 2/3 is personalized but lighter touch; concise and practical.",
                channel_note="LinkedIn connection note must be <=300 characters and use account_hook OR buyer_hook, not both; omit value.",
            ),
            _user("Write a light-touch LinkedIn connection note under 300 characters. Pick one hook only."),
            max_tokens=220,
            temperature=0.55,
        )
    )

    dm_angles = {
        0: "Initial DM after connection accepted. Open with account and buyer context, then one relevant pain and value line.",
        1: "Follow-up #1. Add a useful observation, keep it low-pressure, and avoid repeating the first touch.",
        2: "Follow-up #2. Use a crisp pivot and one clear question.",
    }
    for pos, instruction in dm_angles.items():
        templates.append(
            _tpl(
                f"linkedin_dm_t1_pos{pos}_claude_v1",
                MessageChannel.LINKEDIN_DM,
                TierTarget.TIER_1,
                pos,
                MessageEngineTarget.ANTHROPIC_CLAUDE,
                _system(
                    tier="Tier 1 must be highly bespoke and include all four traced layers.",
                    channel_note="LinkedIn DM must be <=500 characters.",
                ),
                _user(f"{instruction} Include all four layers."),
                max_tokens=360,
                temperature=0.5,
            )
        )
        templates.append(
            _tpl(
                f"linkedin_dm_t23_pos{pos}_gpt_v1",
                MessageChannel.LINKEDIN_DM,
                TierTarget.ALL,
                pos,
                MessageEngineTarget.OPENAI_GPT_4O_MINI,
                _system(
                    tier="Tier 2/3 is still personalized but lighter touch; require account, buyer, and pain.",
                    channel_note="LinkedIn DM must be <=500 characters.",
                ),
                _user(f"{instruction} Include account_hook, buyer_hook, and pain; use value when available."),
                max_tokens=360,
                temperature=0.6,
            )
        )

    email_angles = {
        0: "Initial cold email. Make the subject specific and the body structured: hook, pain, value, soft CTA.",
        1: "3-day bump. Acknowledge the first note, add one fresh angle, and ask a simple question.",
        2: "7-day value-add. Share a practical idea tied to their approved pain and the value prop.",
        3: "14-day pivot angle. Reframe around the competitive or strategic priority signal.",
        4: "21-day breakup. Be respectful, summarize relevance, and offer to close the loop.",
    }
    for pos, instruction in email_angles.items():
        templates.append(
            _tpl(
                f"email_t1_pos{pos}_claude_v1",
                MessageChannel.EMAIL,
                TierTarget.TIER_1,
                pos,
                MessageEngineTarget.ANTHROPIC_CLAUDE,
                _system(
                    tier="Tier 1 must be highly bespoke and every layer must be traced to approved data.",
                    channel_note="Email output must include subject and body; all four layers are required.",
                ),
                _user(f"{instruction} Return a concise email with subject and body."),
                max_tokens=700,
                temperature=0.52,
            )
        )
        templates.append(
            _tpl(
                f"email_t23_pos{pos}_gpt_v1",
                MessageChannel.EMAIL,
                TierTarget.ALL,
                pos,
                MessageEngineTarget.OPENAI_GPT_4O_MINI,
                _system(
                    tier="Tier 2/3 should be efficient, relevant, and still grounded in the supplied data.",
                    channel_note="Email output must include subject and body; all four layers are required.",
                ),
                _user(f"{instruction} Return a concise email with subject and body."),
                max_tokens=650,
                temperature=0.62,
            )
        )

    templates.append(
        _tpl(
            "whatsapp_champion_t1_claude_v1",
            MessageChannel.WHATSAPP,
            TierTarget.TIER_1,
            0,
            MessageEngineTarget.ANTHROPIC_CLAUDE,
            _system(
                tier="Tier 1 champion WhatsApp must feel warm, bespoke, and useful.",
                channel_note="Only use when contact_committee_role=CHAMPION; otherwise return an error JSON. <=300 characters, no formal sign-off.",
            ),
            _user("Write a conversational WhatsApp note for a champion. If role is not CHAMPION, return an explicit template_role_error."),
            max_tokens=240,
            temperature=0.5,
        )
    )
    templates.append(
        _tpl(
            "whatsapp_champion_t23_gpt_v1",
            MessageChannel.WHATSAPP,
            TierTarget.ALL,
            0,
            MessageEngineTarget.OPENAI_GPT_4O_MINI,
            _system(
                tier="Tier 2/3 champion WhatsApp is light, friendly, and grounded.",
                channel_note="Only use when contact_committee_role=CHAMPION; otherwise return an error JSON. <=300 characters, no formal sign-off.",
            ),
            _user("Write a conversational WhatsApp note for a champion. If role is not CHAMPION, return an explicit template_role_error."),
            max_tokens=240,
            temperature=0.58,
        )
    )
    templates.append(
        _tpl(
            "reddit_strategy_t1_claude_v1",
            MessageChannel.REDDIT_STRATEGY_NOTE,
            TierTarget.TIER_1,
            0,
            MessageEngineTarget.ANTHROPIC_CLAUDE,
            _system(
                tier="Tier 1 strategy note should be highly specific and conservative with facts.",
                channel_note="This is not a DM. Produce a markdown brief for organic subreddit engagement only when buying_stage=UNAWARE.",
            ),
            _user(
                "Write a markdown Reddit strategy brief with subreddits, suggested thread topics, "
                "content angle, and what not to do. If buying_stage is not UNAWARE, return an explicit stage_error."
            ),
            max_tokens=700,
            temperature=0.45,
        )
    )
    return templates


def seed_phase4_templates(db: Session, *, activate: bool = True) -> list[PromptTemplate]:
    registry = TemplateRegistry(db)
    seeded = [registry.upsert_seed(template) for template in canonical_phase4_templates()]
    if activate:
        for template in seeded:
            registry.activate(template.template_id)
    return seeded


def template_ids(templates: Iterable[PromptTemplate]) -> list[str]:
    return [template.template_id for template in templates]
