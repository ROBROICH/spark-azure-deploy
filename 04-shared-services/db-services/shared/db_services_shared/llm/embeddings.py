"""LLM provider configuration and embedding client."""

import logging

from db_services_shared.config.llm import ChunkingConfig, LLMProvider

try:
    from langchain_core.embeddings import FakeEmbeddings
    from langchain_core.embeddings import Embeddings
    from langchain_openai import OpenAIEmbeddings
except ImportError as e:
    raise ImportError(
        "please install the `llm` extra to use this feature."
    ) from e

logger = logging.getLogger(__name__)


class EmbeddingClient:
    """Provider-agnostic embedding client supporting Vertex AI, LiteLLM, and test fakes."""

    model: Embeddings

    def __init__(
        self,
        config: ChunkingConfig,
        dimensions: int = None,
        timeout: float = 30.0,
    ) -> None:
        if config is None:
            raise RuntimeError("no config provided")
        self.profile: ChunkingConfig = config
        self.timeout: float = timeout

        match config.provider:
            case LLMProvider.LITELLM:
                if not (config.apikey or config.url):
                    raise RuntimeError("api key and url are required for openai endpoint")
                else:
                    headers = {
                        "Authorization": f"Bearer {self.profile.apikey}",
                    }
                    if dimensions is not None:
                        logger.warning("dimensions set, but ignoring for litelllm provider")
                    self.model = OpenAIEmbeddings(
                        openai_api_key=config.apikey,
                        openai_api_base=config.url.encoded_string(),
                        model=config.model,
                        default_headers=headers.copy(),
                        check_embedding_ctx_length=False,
                        timeout=config.timeout,
                    )
            case LLMProvider.TEST:
                self.model = FakeEmbeddings(size=self.profile.dimensions)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Fetch multiple embeddings in one call."""
        if not texts:
            return []
        return self.model.embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        """Convenience method for single text."""
        return self.model.embed_query(text)
