from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any


def _stable_uuid(seed: str) -> str:
    return str(uuid.UUID(hashlib.md5(seed.encode("utf-8")).hexdigest()))


class _BaseMockClient:
    model_version = "mock"
    cost_per_call = 0.01
    calls = 0

    def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        template_id: str,
        context: dict[str, Any],
        max_tokens: int,
        temperature: float,
        attempt: int,
    ) -> dict[str, Any]:
        self.calls += 1
        if self.calls % 50 == 0 and attempt == 1:
            return {
                "content": "{not valid json",
                "token_usage": {"input_tokens": 420, "output_tokens": 110},
                "cost_usd": self.cost_per_call,
                "model_version": self.model_version,
            }

        inject_untraced = self.calls % 100 == 0
        signal_hooks = context.get("top_high_intent_signals") or [""]
        account_hook = context.get("account_intel_top_priority") or signal_hooks[0]
        pain = (context.get("contact_approved_pain_points") or [""])[0]
        body = (
            f"Hi {context.get('contact_full_name', 'there')}, noticed {context.get('account_company_name')} "
            f"is focused on {account_hook or 'a priority worth validating'}. Given your role as "
            f"{context.get('contact_title', 'leader')}, {pain or 'the current workflow'} may be worth a look. "
            f"{context.get('master_context_value_prop', 'We can help')}. Open to compare notes?"
        )
        channel = template_id.split("_")[0]
        subject = None
        if template_id.startswith("email_"):
            subject = f"Idea for {context.get('account_company_name', 'your team')}"
        if template_id.startswith("reddit_"):
            body = (
                "## Reddit strategy brief\n\n"
                "- Subreddits: r/SaaS, r/sales, r/RevOps\n"
                "- Thread topics: lessons from scaling reporting, practical buying committee questions\n"
                "- Content angle: be useful first; reference no private intel\n"
                "- Avoid: DMs, pitch-first comments, unverifiable claims\n"
            )

        content = {
            "subject": subject,
            "body": body,
            "personalization_layers": {
                "account_hook": {
                    "text": account_hook,
                    "source_claim_id": context.get("account_intel_top_priority_claim_id"),
                    "source_type": "INTEL_REPORT_PRIORITY" if context.get("account_intel_top_priority_claim_id") else "SIGNAL_TIMELINE",
                    "untraced": inject_untraced and attempt >= 3,
                },
                "buyer_hook": {
                    "text": f"{context.get('contact_title', '')} role alignment",
                    "source_claim_id": None,
                    "source_type": "JOB_CHANGE_SIGNAL",
                    "untraced": False,
                },
                "pain": {
                    "text": pain,
                    "source_claim_id": (context.get("contact_approved_pain_point_ids") or [None])[0],
                    "source_type": "BUYER_PAIN_POINT",
                    "untraced": inject_untraced,
                },
                "value": {
                    "text": context.get("master_context_value_prop", ""),
                    "source_claim_id": None,
                    "source_type": "MASTER_CONTEXT_VALUE_PROP",
                    "untraced": False,
                },
            },
        }
        return {
            "content": json.dumps(content),
            "token_usage": {"input_tokens": 420, "output_tokens": min(max_tokens, 140)},
            "cost_usd": self.cost_per_call,
            "model_version": self.model_version,
            "request_id": _stable_uuid(template_id + json.dumps(context, sort_keys=True)),
        }


class MockAnthropicClient(_BaseMockClient):
    model_version = "claude-sonnet-4-mock"
    cost_per_call = 0.106


class MockOpenAIClient(_BaseMockClient):
    model_version = "gpt-4o-mini-mock"
    cost_per_call = 0.014
