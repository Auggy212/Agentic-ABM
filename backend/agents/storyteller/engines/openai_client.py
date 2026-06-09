"""
Live OpenAI client for the Storyteller engine router.
Uses gpt-4.1-mini (latest cost-efficient frontier model).
"""
from __future__ import annotations

import json
import os
from typing import Any

import openai


MODEL = "gpt-5.4-mini"
# Input: $0.50/1M tokens  Output: $1.50/1M tokens  (approximate — update when pricing is published)
COST_PER_INPUT_TOKEN = 0.50 / 1_000_000
COST_PER_OUTPUT_TOKEN = 1.50 / 1_000_000


class OpenAIClient:
    def __init__(self, api_key: str | None = None) -> None:
        self._client = openai.OpenAI(api_key=api_key or os.environ["OPENAI_API_KEY"])
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
        response = self._client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        choice = response.choices[0]
        content_str = choice.message.content or "{}"

        usage = response.usage
        input_tokens  = usage.prompt_tokens     if usage else 0
        output_tokens = usage.completion_tokens if usage else 0
        cost = input_tokens * COST_PER_INPUT_TOKEN + output_tokens * COST_PER_OUTPUT_TOKEN

        return {
            "content": content_str,
            "token_usage": {
                "input_tokens":  input_tokens,
                "output_tokens": output_tokens,
                "estimated_cost_usd": round(cost, 6),
            },
            "cost_usd": round(cost, 6),
            "model_version": MODEL,
        }
