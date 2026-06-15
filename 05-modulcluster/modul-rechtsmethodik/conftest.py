"""Pytest configuration and shared fixtures."""

import sys
from pathlib import Path

_root = Path(__file__).parent
# Make `src` importable when pytest is run from outside this module's root
# (e.g. from the monorepo root via VS Code).
sys.path.insert(0, str(_root))
# Make `tests/fixtures` importable as `fixtures.*` from any test file.
sys.path.insert(0, str(_root / "tests"))

