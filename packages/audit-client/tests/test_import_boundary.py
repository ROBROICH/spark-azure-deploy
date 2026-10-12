from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def test_public_context_import_does_not_import_postgres_or_sqlalchemy() -> None:
    package_root = Path(__file__).parents[1]
    auth_root = package_root.parent / "authentification"
    script = f"""
import importlib.abc
import sys

sys.path.insert(0, {str(package_root / "src")!r})
sys.path.insert(0, {str(auth_root / "src")!r})

class BlockDatabaseImports(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == 'sqlalchemy' or fullname.startswith('sqlalchemy.'):
            raise AssertionError(f'database import attempted: {{fullname}}')
        return None

sys.meta_path.insert(0, BlockDatabaseImports())
import audit_client
from audit_client import AuditContext, build_audit_changes, current_audit_context

assert AuditContext()
assert build_audit_changes([]) == ()
assert current_audit_context() == AuditContext()
assert not any(name == 'sqlalchemy' or name.startswith('sqlalchemy.') for name in sys.modules)
"""

    result = subprocess.run(
        [sys.executable, "-I", "-c", script],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
