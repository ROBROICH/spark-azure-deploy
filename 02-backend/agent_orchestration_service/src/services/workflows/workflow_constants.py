from datetime import timedelta

from temporalio.common import RetryPolicy

from src.services.project_version_errors import PROJECT_VERSION_NON_RETRYABLE_ERROR_TYPES

DEFAULT_START_TO_CLOSE_TIMEOUT = timedelta(minutes=1)

DEFAULT_RETRY_POLICY = RetryPolicy(
    maximum_attempts=3,
    maximum_interval=timedelta(minutes=1),
    non_retryable_error_types=PROJECT_VERSION_NON_RETRYABLE_ERROR_TYPES,
)

CONTENT_EXTRACTION = "inhaltsextraktion"
FORMAL_COMPLETENESS = "formalpruefung"
PLAUSIBILITY_CHECK = "plausibilitaetspruefung"
TABLE_OF_CONTENTS_MATCHING = "inhaltsverzeichnismatching"
