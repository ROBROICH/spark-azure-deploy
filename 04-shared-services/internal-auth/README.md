# Internal Auth Library

Shared Python utilities for adding internal service authentication headers to outgoing service-to-service requests.

## Core Features

- **Internal API key header generation:** Reads the configured internal API key and returns the `X-Internal-Api-Key` header when a key is available.
- **Header merging:** Adds the internal API key header to an existing header dictionary without removing unrelated headers.
- **Centralized settings:** Uses Pydantic settings so services can configure the key consistently through environment variables or local `.env` files.

## Architecture

### Overview

`internal-auth` is a small workspace package used by services that need to call another internal service protected by an internal API key. It does not validate incoming requests. It only prepares outgoing request headers for clients.

### Components

- **`config.py`:** Defines `InternalAuthSettings` and the cached `internal_auth_settings()` settings loader.
- **`headers.py`:** Defines the public header name and helper functions for creating or merging headers.

### Dependencies

| Package | Purpose |
| ------- | ------- |
| `pydantic` | Settings model validation |
| `pydantic-settings` | Environment-based and `.env`-based settings loading |

## Project Structure

```
├── pyproject.toml
├── src/
│   └── internal_auth/
│       ├── __init__.py          # Public API exports
│       ├── config.py            # Pydantic settings
│       └── headers.py           # Header constants and helpers
└── tests/
    └── test_headers.py          # Unit tests for header behavior
```

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager

### Installation

This is a workspace package. Add it to a service's `pyproject.toml`:

```toml
[tool.uv.sources]
internal-auth = { workspace = true }
```

Then add `internal-auth` to the service's dependencies:

```toml
[project]
dependencies = [
    "internal-auth",
]
```

### Environment Variables

| Variable | Description | Default | Required |
| -------- | ----------- | ------- | -------- |
| `AUTH_INTERNAL_API_KEY` | Internal API key value added to outgoing requests as `X-Internal-Api-Key`. | empty string | no |
| `SKIP_DOTENV` | When set, disables loading `.env.local` and `.env` files. | unset | no |

Settings are loaded from the environment first. If `SKIP_DOTENV` is not set, `.env.local` and `.env` are also considered.

### Running the Module / Service

#### In Development

Run tests from the repository root:

```bash
uv run --package internal-auth pytest 04-shared-services/internal-auth/tests
```

#### In Production

Add `internal-auth` as a workspace dependency to consuming services that need to attach internal API key headers to outgoing requests.

## Usage

### Build Internal Auth Headers

```python
from internal_auth import internal_api_key_headers

headers = internal_api_key_headers()
```

If `AUTH_INTERNAL_API_KEY` is set to `secret`, the result is:

```python
{"X-Internal-Api-Key": "secret"}
```

If no key is configured, the result is an empty dictionary.

### Merge With Existing Headers

```python
from internal_auth import merge_internal_api_key_header

headers = merge_internal_api_key_header({"Accept": "application/json"})
```

The helper preserves other headers and overwrites any existing `X-Internal-Api-Key` value with the configured internal API key.

### Use Explicit Settings

```python
from internal_auth import InternalAuthSettings, internal_api_key_headers

settings = InternalAuthSettings(internal_api_key="secret")
headers = internal_api_key_headers(settings)
```

Passing settings explicitly is useful for tests and for callers that already manage configuration.

## Public API

| Export | Description |
| ------ | ----------- |
| `INTERNAL_API_KEY_HEADER` | Header name constant: `X-Internal-Api-Key` |
| `InternalAuthSettings` | Pydantic settings model for internal auth configuration |
| `internal_auth_settings()` | Cached settings loader |
| `internal_api_key_headers()` | Returns the internal API key header dictionary, or `{}` when no key is configured |
| `merge_internal_api_key_header()` | Adds the configured internal API key header to an existing header dictionary |

## Testing

From the repository root:

```bash
uv run --package internal-auth pytest 04-shared-services/internal-auth/tests
```

## Troubleshooting

- If `internal_api_key_headers()` returns `{}`, check that `AUTH_INTERNAL_API_KEY` is set in the process environment or in a loaded `.env.local` or `.env` file.
- `internal_auth_settings()` is cached. In tests that modify environment variables, call `internal_auth_settings.cache_clear()` before reading settings again.
