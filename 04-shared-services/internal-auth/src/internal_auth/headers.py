from internal_auth.config import InternalAuthSettings, internal_auth_settings

INTERNAL_API_KEY_HEADER = "X-Internal-Api-Key"


def internal_api_key_headers(settings: InternalAuthSettings | None = None) -> dict[str, str]:
    current_settings = settings or internal_auth_settings()
    if not current_settings.internal_api_key:
        return {}
    return {INTERNAL_API_KEY_HEADER: current_settings.internal_api_key}


def merge_internal_api_key_header(headers: dict[str, str] | None = None) -> dict[str, str]:
    merged = dict(headers or {})
    merged.update(internal_api_key_headers())
    return merged
