from dataclasses import dataclass, field


@dataclass
class WeeklyArchivalInput:
    batch_size: int = 100
    failed_so_far: int = 0
    archived_so_far: int = 0
    failed_keys: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class WeeklyArchivalOutput:
    archived: int
    failed: int = 0
