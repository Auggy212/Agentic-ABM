from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any

from backend.schemas.models import MessageEngine, PromptTemplate

from .engines.anthropic_client import AnthropicClient
from .engines.mock import MockAnthropicClient, MockOpenAIClient
from .engines.openai_client import OpenAIClient


@dataclass(frozen=True)
class RawGeneration:
    content_json: dict[str, Any]
    token_usage: dict[str, int]
    cost_usd: float
    attempt: int
    model_version: str


class EngineGenerationError(Exception):
    pass


def _render(template: str, context: dict[str, Any]) -> str:
    rendered = template
    for key, value in context.items():
        rendered = rendered.replace("{{" + key + "}}", json.dumps(value) if isinstance(value, (list, dict)) else str(value))
    return rendered


class EngineRouter:
    def __init__(self, *, anthropic_client: Any = None, openai_client: Any = None, use_mock: bool | None = None):
        mock = use_mock if use_mock is not None else os.environ.get("ENV") == "test"
        has_openai_key = bool(os.environ.get("OPENAI_API_KEY"))
        has_anthropic_key = bool(os.environ.get("ANTHROPIC_API_KEY"))

        if anthropic_client:
            self.anthropic_client = anthropic_client
        elif mock or not has_anthropic_key:
            self.anthropic_client = MockAnthropicClient()
        else:
            self.anthropic_client = AnthropicClient()

        if openai_client:
            self.openai_client = openai_client
        elif mock or not has_openai_key:
            self.openai_client = MockOpenAIClient()
        else:
            self.openai_client = OpenAIClient()

    def generate(
        self,
        template: PromptTemplate,
        context: dict[str, Any],
        engine: MessageEngine,
        attempt: int = 1,
    ) -> RawGeneration:
        prompt = _render(template.user_prompt_template, context)
        client = self.anthropic_client if engine == MessageEngine.ANTHROPIC_CLAUDE else self.openai_client
        if client is None:
            raise EngineGenerationError(f"No configured client for {engine.value}")

        last_error: Exception | None = None
        max_tokens = template.max_tokens
        for retry in range(3):
            try:
                raw = client.generate(
                    system_prompt=template.system_prompt,
                    user_prompt=prompt,
                    template_id=template.template_id,
                    context=context,
                    max_tokens=max_tokens,
                    temperature=template.temperature,
                    attempt=attempt,
                )
                content = raw["content"]
                if isinstance(content, str):
                    content_json = json.loads(content)
                else:
                    content_json = content
                return RawGeneration(
                    content_json=content_json,
                    token_usage=raw.get("token_usage", {"input_tokens": 0, "output_tokens": 0}),
                    cost_usd=float(raw.get("cost_usd", 0.0)),
                    attempt=attempt,
                    model_version=raw.get("model_version", "mock"),
                )
            except json.JSONDecodeError as exc:
                last_error = exc
                # Truncated JSON — double the budget and retry immediately
                max_tokens = min(max_tokens * 2, 4096)
                time.sleep(0.05 * (retry + 1))
            except RuntimeError as exc:
                last_error = exc
                if "finish_reason=length" in str(exc):
                    max_tokens = min(max_tokens * 2, 4096)
                time.sleep(0.05 * (retry + 1))
        raise EngineGenerationError(f"Generation failed after retries: {last_error}")

