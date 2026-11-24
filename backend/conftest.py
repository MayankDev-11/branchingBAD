# Lets `python -m pytest` run from inside backend/ as well as from the repo root.
# Because backend/ is a package, pytest puts its parent (the repo root) on
# sys.path when it loads this file, so `from backend.main import app` resolves.

import os
import tempfile

import pytest

# Tests never touch the real demo database file.
_TMP = tempfile.mkdtemp(prefix="roottrace-test-")
os.environ["ROOTTRACE_DB"] = os.path.join(_TMP, "test.db")
os.environ["ROOTTRACE_AUTH_DB_PATH"] = os.path.join(_TMP, "auth.db")
os.environ["ROOTTRACE_IMPORT_DB"] = os.path.join(_TMP, "apple_health.db")


@pytest.fixture
def fresh_store():
    """For tests that move the demo clock or write to the database: start and end from a clean demo."""
    from backend.data.store import store

    store.reset()
    yield store
    store.reset()


@pytest.fixture(scope="module")
def demo_conn():
    """A freshly generated demo database in memory, as of the demo clock start."""
    from backend.data import generate_demo
    from backend.data.db import connect

    conn = connect(":memory:")
    generate_demo.build(conn)
    yield conn
    conn.close()
