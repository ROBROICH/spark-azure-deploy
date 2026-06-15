class NodeNotFoundError(Exception):
    def __init__(self, message: str = "Node not found") -> None:
        super().__init__(message)
        self.message = message


class UnknownNodeTypeError(Exception):
    def __init__(self, node_type: str) -> None:
        self.node_type = node_type
        super().__init__(f"Unknown node type: '{node_type}'")


class InvalidParentTypeError(Exception):
    def __init__(self, child_type: str, parent_type: str, allowed_parents: set[str]) -> None:
        self.child_type = child_type
        self.parent_type = parent_type
        self.allowed_parents = allowed_parents
        super().__init__(
            f"Node type '{child_type}' cannot have parent of type '{parent_type}'. "
            f"Allowed parent types: {sorted(allowed_parents)}"
        )


class InvalidPayloadError(Exception):
    def __init__(self, node_type: str, details: str) -> None:
        self.node_type = node_type
        self.details = details
        super().__init__(f"Invalid payload for node type '{node_type}': {details}")


class ProjectVersionLockedError(Exception):
    def __init__(self, project_id: str, message: str | None = None) -> None:
        self.project_id = project_id
        super().__init__(message or f"Project {project_id} has an active version creation lock")


class VersionNotLatestError(Exception):
    def __init__(self, provided_version: int, latest_version: int) -> None:
        self.provided_version = provided_version
        self.latest_version = latest_version
        super().__init__(f"Provided project version {provided_version} is not the latest version {latest_version}")
