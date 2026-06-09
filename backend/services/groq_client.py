"""
Groq LLM client for Copilot interactions.
"""

import os
from typing import Optional

try:
    from groq import Groq
except ImportError:
    Groq = None


class GroqClient:
    """Wrapper for Groq API client."""
    
    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        if not self.api_key:
            raise ValueError("GROQ_API_KEY environment variable not set")
        
        if Groq is None:
            raise ImportError("groq package not installed. Run: pip install groq")
        
        self.client = Groq(api_key=self.api_key)
    
    def chat(
        self,
        messages: list[dict],
        model: str = "llama-3.3-70b-versatile",
        temperature: float = 0.7,
        max_tokens: int = 1024,
        tools: list[dict] | None = None,
        tool_choice: str | None = None,
    ) -> str:
        """Single-turn convenience that returns the assistant text content."""
        msg = self.chat_message(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            tool_choice=tool_choice,
        )
        return msg.content or ""

    def chat_message(
        self,
        messages: list[dict],
        model: str = "llama-3.3-70b-versatile",
        temperature: float = 0.7,
        max_tokens: int = 1024,
        tools: list[dict] | None = None,
        tool_choice: str | None = None,
    ):
        """Returns the raw assistant message (so callers can read tool_calls)."""
        try:
            kwargs: dict = dict(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = tool_choice or "auto"
            response = self.client.chat.completions.create(**kwargs)
            return response.choices[0].message
        except Exception as e:
            raise RuntimeError(f"Groq API error: {str(e)}")

    def chat_stream(
        self,
        messages: list[dict],
        model: str = "llama-3.3-70b-versatile",
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ):
        """Yield text deltas from a streaming chat completion. No tool-use in
        streaming mode for now — we keep streaming single-turn."""
        try:
            stream = self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield delta
        except Exception as e:
            raise RuntimeError(f"Groq API streaming error: {str(e)}")


def get_groq_client() -> GroqClient:
    """Get or create Groq client (dependency injection)."""
    return GroqClient()
