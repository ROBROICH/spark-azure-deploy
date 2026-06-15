# Prompt-Injection-Defense-Library (Prompt Injection Defense Library)

This is a shared Python module providing functionality to prevent prompt injection attempts. It is used to wrap the system prompts with anti-injection preambles and sanitizes untrusted input before it reaches the LLM.

## Core Features

- **System Prompt Wrapping:** Surrounds a prompt with a DE/EN/VLM preamble (`wrap_system_prompt`), added before and after so the instruction frame survives long contexts.
- **Input Sanitization:** Recursively strips injection markers and invisible Unicode from any input via `sanitize_external_data`. Covers tokenizer/control tokens, role-spoofing headers, and their URL/Base64/Hex variants.
- **External Data Tagging:** Wraps untrusted text in `EXTERNAL_DATA` tags marked with a reserved char `¤` that is stripped from all input, so the tags cannot be forged or closed early to break out.
- **HTML Pre-Filter:** `sanitize_html` reduces HTML to structure-preserving text and masks URLs and e-mails.


## Architecture

### Overview

Prompt injection is the attempt to smuggle attacker-controlled instructions into a model through untrusted data such as documents, web pages, or user text. This module is a stateless pre-filter that strips known attack markers and isolates external data before it reaches the model.

| Function | Description |
|----------|-------------|
| `wrap_system_prompt(prompt, lang="de")` | Prepend and append preamble. `lang` in `{"de", "en", "vlm_de"}`. |
| `sanitize_external_data(value)` | Recursively sanitize str, dict, list, tuple, set, or Pydantic models. |
| `sanitize_and_wrap_external_data(value)` | Sanitize a string and wrap it in `EXTERNAL_DATA` tags. |
| `render_prompt(template, **kwargs)` | Render a first-party Jinja2 template with sanitized context. |
| `render_prompt_format(template, **kwargs)` | Same, via `str.format`. |
| `sanitize_html(html)` | HTML to text, URLs and e-mails masked. |

Note: `template` must never come from an external source, otherwise resource-exhaustion attacks become possible.

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager

### Installation

```bash
uv pip install prompt-injection
```

### Environment Variables

No environment variables required. The module is configured entirely through function arguments.

### Running the Module / Service

#### In Development

```python
from prompt_injection.prompt_defense import wrap_system_prompt, sanitize_external_data

system_prompt = wrap_system_prompt("Analysiere das Dokument.", lang="de")
clean = sanitize_external_data({"text": user_text})
```

#### In Production

Import and use the module in your service code. No separate deployment required.