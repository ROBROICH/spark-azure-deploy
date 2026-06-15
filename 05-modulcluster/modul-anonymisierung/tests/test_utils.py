"""Tests for the chunk_list utility."""

from src.utils import chunk_list


class TestChunkList:
    """Test the chunk_list utility."""

    def test_even_split(self) -> None:
        """List divisible by batch size should split evenly."""
        result = chunk_list([1, 2, 3, 4], 2)
        assert result == [[1, 2], [3, 4]]

    def test_uneven_split(self) -> None:
        """Remainder should be in the last chunk."""
        result = chunk_list([1, 2, 3, 4, 5], 2)
        assert result == [[1, 2], [3, 4], [5]]

    def test_empty_list(self) -> None:
        """Empty list should produce empty result."""
        result = chunk_list([], 5)
        assert result == []
