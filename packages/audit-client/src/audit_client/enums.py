from enum import Enum


class ChangeType(str, Enum):
    """Discriminator for what kind of event an audit log entry represents."""

    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    ACTION = "action"
