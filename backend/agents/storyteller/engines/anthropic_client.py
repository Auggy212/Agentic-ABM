from __future__ import annotations

import json
import os
import re
from typing import Any

import anthropic

MODEL = os.environ.get("ANTHROPIC_STORYTELLER_MODEL", "claude-haiku-4-5-20251001")
COST_PER_INPUT_TOKEN = float(os.environ.get("ANTHROPIC_COST_PER_INPUT_TOKEN", str(0.80 / 1_000_000)))
COST_PER_OUTPUT_TOKEN = float(os.environ.get("ANTHROPIC_COST_PER_OUTPUT_TOKEN", str(4.00 / 1_000_000)))


class AnthropicClient:
    def __init__(self, api_key: str | None = None) -> None:
        self._client = anthropic.Anthropic(api_key=api_key or os.environ["ANTHROPIC_API_KEY"])
        self.model_version = MODEL

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
        response = self._client.messages.create(
            model=self.model_version,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": "{"},  # prefill forces JSON output, no code fence
            ],
        )
        raw_text = response.content[0].text if response.content else "}"
        # Prepend the prefilled "{" then strip any accidental code fences
        joined = "{" + raw_text
        content_str = re.sub(r"^```(?:json)?\s*|\s*```$", "", joined.strip())

        input_tokens = response.usage.input_tokens if response.usage else 0
        output_tokens = response.usage.output_tokens if response.usage else 0
        cost = input_tokens * COST_PER_INPUT_TOKEN + output_tokens * COST_PER_OUTPUT_TOKEN

        return {
            "content": content_str,
            "token_usage": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "estimated_cost_usd": round(cost, 6),
            },
            "cost_usd": round(cost, 6),
            "model_version": MODEL,
        }
