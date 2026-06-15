from collections.abc import Callable

from src.services.workflows.activities.archival import (
    archive_one,
    list_unarchived_batch,
    mark_archived,
)

activities: list[Callable] = [
    list_unarchived_batch,
    archive_one,
    mark_archived,
]
