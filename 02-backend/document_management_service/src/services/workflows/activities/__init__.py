from collections.abc import Callable

from src.services.workflows.activities.compute_diff import create_diff
from src.services.workflows.activities.extract_zip import extract_zip
from src.services.workflows.activities.ingest_file import ingest_file
from src.services.workflows.activities.persist_zip_diff import (
    persist_zip_diff,
    update_zip_approval_status,
)
from src.services.workflows.activities.rename_file import rename_file
from src.services.workflows.activities.scan_and_upload import (
    scan_and_upload,
    update_file_workflow_status,
)
from src.services.workflows.activities.update_workflow_status import update_file_status
from src.services.workflows.activities.validate_zip import validate_zip

activities: list[Callable[..., object]] = [
    create_diff,
    extract_zip,
    ingest_file,
    persist_zip_diff,
    rename_file,
    scan_and_upload,
    update_file_status,
    update_file_workflow_status,
    update_zip_approval_status,
    validate_zip,
]
