VERSION_NOT_LATEST_ERROR_TYPE = "VersionNotLatestError"
PROJECT_VERSION_LOCKED_ERROR_TYPE = "ProjectVersionLockedError"

PROJECT_VERSION_NON_RETRYABLE_ERROR_TYPES = (
    VERSION_NOT_LATEST_ERROR_TYPE,
    PROJECT_VERSION_LOCKED_ERROR_TYPE,
)

_LOCK_CONFLICT_MARKERS = (
    "active version creation lock",
    "project version is locked",
)


def project_version_error_type(detail: str) -> str | None:
    normalized = detail.lower()
    if "provided project version" in normalized and "not the latest version" in normalized:
        return VERSION_NOT_LATEST_ERROR_TYPE
    if any(marker in normalized for marker in _LOCK_CONFLICT_MARKERS):
        return PROJECT_VERSION_LOCKED_ERROR_TYPE
    return None
