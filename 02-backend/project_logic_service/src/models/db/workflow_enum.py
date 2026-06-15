from enum import StrEnum


class WorkflowStatusEnum(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
    TERMINATED = "TERMINATED"
    CONTINUED_AS_NEW = "CONTINUED_AS_NEW"
    TIMED_OUT = "TIMED_OUT"


class ProjectVersionLockStatus(StrEnum):
    ACTIVE = "ACTIVE"
    RELEASED = "RELEASED"
