from src.models.schemas.approval_schema import FileDiffResponse
from src.utils.exceptions import WorkflowValidateDiffError


async def validate_user_diff(current_diff: FileDiffResponse, user_diff: FileDiffResponse):
    """Validates user diff."""

    def build_state_map(result: FileDiffResponse) -> dict[str, str]:
        state: dict[str, str] = {}

        def add(identifier: str, category: str):
            if identifier in state:
                raise WorkflowValidateDiffError(f"File {identifier} appears multiple times in diff")
            state[identifier] = category

        for f in result.new:
            add(f.filename, "new")

        for f in result.deleted:
            add(str(f.file_id), "deleted")

        for f in result.changed:
            add(str(f.file_id), "changed")

        for f in result.renamed:
            add(str(f.file_id), "renamed")

        for f in result.unchanged:
            add(str(f.file_id), "unchanged")

        return state

    current_map = build_state_map(current_diff)
    user_map = build_state_map(user_diff)
    renamed_key_by_new_name = {f.new_name: str(f.file_id) for f in current_diff.renamed}

    # Rule 1: ensure no files were added or removed
    decisions: dict[str, str] = {}
    for key, new_state in user_map.items():
        decision_key = key
        if key not in current_map and new_state == "new":
            decision_key = renamed_key_by_new_name.get(key, key)
        if decision_key not in current_map:
            raise WorkflowValidateDiffError("Files cannot be added to the diff")
        if decision_key in decisions:
            states = {decisions[decision_key], new_state}
            if current_map[decision_key] == "renamed" and states == {"new", "unchanged"}:
                decisions[decision_key] = "new"
                continue
            raise WorkflowValidateDiffError(f"File {decision_key} appears multiple times in diff")
        decisions[decision_key] = new_state

    # Rule 2: enforce allowed transitions
    allowed_moves = {
        ("changed", "unchanged"),
        ("deleted", "unchanged"),
        ("renamed", "unchanged"),
        ("renamed", "new"),
    }

    for file_id, new_state in decisions.items():
        old_state = current_map[file_id]

        if old_state == new_state:
            continue

        if (old_state, new_state) not in allowed_moves:
            raise WorkflowValidateDiffError(
                f"Illegal diff modification: {file_id} moved from {old_state} to {new_state}"
            )
