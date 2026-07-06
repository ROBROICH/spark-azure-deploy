from collections.abc import Callable

from src.services.workflows.activities.delete_project import delete_project
from src.services.workflows.activities.diff_apply import (
    batch_get_service_nodes,
    commit_dms_zip_diff,
    copy_service_version_nodes,
    get_dms_zip_diff,
    list_service_nodes,
    undo_service_version,
    update_dms_zip_approval_status,
)
from src.services.workflows.activities.handle_versions import (
    get_latest_pls_version,
    get_project_internal_status,
    get_project_versioning_service_endpoints,
)
from src.services.workflows.activities.initialize_templates import (
    assign_vae_template,
    initialize_fcs_required_document_types,
)
from src.services.workflows.activities.project_root_version import (
    copy_project_root_version,
    undo_project_root_version,
)
from src.services.workflows.activities.project_version_copy_plan import build_project_version_copy_plan
from src.services.workflows.activities.update_project_status import update_project_status
from src.services.workflows.activities.version_locks import (
    acquire_project_version_lock,
    release_project_version_lock,
)
from src.services.workflows.activities.workflow_cancellation import cancel_project_version_workflows

activities: list[Callable] = [
    assign_vae_template,
    initialize_fcs_required_document_types,
    update_project_status,
    delete_project,
    get_project_versioning_service_endpoints,
    get_latest_pls_version,
    get_project_internal_status,
    list_service_nodes,
    batch_get_service_nodes,
    build_project_version_copy_plan,
    cancel_project_version_workflows,
    copy_service_version_nodes,
    undo_service_version,
    get_dms_zip_diff,
    update_dms_zip_approval_status,
    commit_dms_zip_diff,
    acquire_project_version_lock,
    copy_project_root_version,
    undo_project_root_version,
    release_project_version_lock,
]
