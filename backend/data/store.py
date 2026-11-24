"""The demo database and the demo clock.

The demo database is rebuilt from seed 42 the first time the API is used in a process (and on
POST /api/demo/reset), so every run of the demo starts from the same state. The clock says what
"today" is: nothing after it is ever returned.

Database file: $ROOTTRACE_DB, or backend/data/roottrace.db (git-ignored by *.db).
"""

import os
import threading
from contextlib import contextmanager
from datetime import date
from pathlib import Path

from backend.analysis.series import days
from backend.analysis.state import refresh_state
from backend.data import generate_demo
from backend.data.db import connect

DEFAULT_DB = Path(__file__).with_name("roottrace.db")


class DemoStore:
    def __init__(self):
        self._lock = threading.RLock()
        self._ready = False
        self.clock: date = generate_demo.CLOCK_START

    @property
    def path(self) -> Path:
        return Path(os.environ.get("ROOTTRACE_DB", DEFAULT_DB))

    @property
    def range_start(self) -> date:
        return generate_demo.DEMO_START

    def reset(self) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            for suffix in ("", "-journal", "-wal", "-shm"):
                Path(f"{self.path}{suffix}").unlink(missing_ok=True)
            conn = connect(self.path)
            try:
                generate_demo.build(conn)
                conn.commit()
            finally:
                conn.close()
            self.clock = generate_demo.CLOCK_START
            self._ready = True

    @contextmanager
    def connection(self):
        with self._lock:
            if not self._ready:
                self.reset()
            conn = connect(self.path)
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()

    def advance(self, n_days: int) -> date:
        """Move the clock forward (never past the last generated day) and update derived data."""
        with self.connection() as conn:
            self.clock = min(self.clock + days(n_days), generate_demo.DEMO_END)
            refresh_state(conn, self.clock)
        return self.clock


store = DemoStore()
