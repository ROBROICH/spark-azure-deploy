"""llm configuration schemas"""
from enum import Enum

from pydantic import BaseModel, HttpUrl


class LLMProvider(str, Enum):
    """available llm providers"""
    LITELLM = "litellm"
    TEST = "test"


class LLMConfig(BaseModel):
    """single llm configuration"""

    provider: LLMProvider = LLMProvider.LITELLM
    model: str = "self-hosted/bge-m3"
    apikey: str | None = None
    url: HttpUrl | None = None
    timeout: float = 5.0


class ChatConfig(LLMConfig):
    """chat specific config"""

    kwargs: dict[str, str] = {}


class ChunkingConfig(LLMConfig):
    """Chunking and vectorisation config"""

    size: int = 2048
    overlap: int = 256
    dimensions: int = 1024

