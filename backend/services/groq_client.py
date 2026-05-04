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
        model: str = "mixtral-8x7b-32768",
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        """
        Send a message to Groq and get a response.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Groq model name
            temperature: Sampling temperature (0-2)
            max_tokens: Maximum response length
        
        Returns:
            Response text from Groq
        """
        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content
        except Exception as e:
            raise RuntimeError(f"Groq API error: {str(e)}")


def get_groq_client() -> GroqClient:
    """Get or create Groq client (dependency injection)."""
    return GroqClient()
