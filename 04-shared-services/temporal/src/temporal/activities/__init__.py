"""Workflow-facing helpers for LLM/VLM/Embedding Temporal activities.

Import from here instead of ``llm_client`` directly to avoid side effects
from the activity implementations (OpenAI client init, ``@activity.defn``
registration, etc.).
"""
