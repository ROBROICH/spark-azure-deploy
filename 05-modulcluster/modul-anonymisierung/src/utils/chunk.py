"""Shared utility functions."""

from typing import TypeVar

T = TypeVar("T")


def chunk_list(lst: list[T], batch_size: int) -> list[list[T]]:
    """Split a list into batches of at most batch_size items."""
    return [lst[i : i + batch_size] for i in range(0, len(lst), batch_size)]
