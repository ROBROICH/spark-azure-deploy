from collections.abc import Iterable


def chunked[T](items: list[T], size: int) -> Iterable[list[T]]:
    """Creates a generator that yields chunks of size."""
    for i in range(0, len(items), size):
        yield items[i : i + size]
