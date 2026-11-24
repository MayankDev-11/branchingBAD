import time
from collections import defaultdict, deque
from threading import Lock
from typing import Deque, Dict, Tuple


class LoginRateLimiter:
    """In-memory sliding-window rate limiter for failed login attempts."""

    def __init__(self, max_failures: int = 5, window_seconds: int = 60) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._attempts: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _prune(self, bucket: Deque[float], now: float) -> None:
        cutoff = now - self.window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

    def is_blocked(self, ip: str, email: str) -> Tuple[bool, int]:
        key = (ip or "unknown", email.strip().lower())
        now = time.monotonic()
        with self._lock:
            bucket = self._attempts[key]
            self._prune(bucket, now)
            if len(bucket) >= self.max_failures:
                retry_after = max(1, int(self.window_seconds - (now - bucket[0])))
                return True, retry_after
            return False, 0

    def record_failure(self, ip: str, email: str) -> None:
        key = (ip or "unknown", email.strip().lower())
        now = time.monotonic()
        with self._lock:
            bucket = self._attempts[key]
            self._prune(bucket, now)
            bucket.append(now)

    def clear(self, ip: str, email: str) -> None:
        key = (ip or "unknown", email.strip().lower())
        with self._lock:
            self._attempts.pop(key, None)

    def reset_all(self) -> None:
        with self._lock:
            self._attempts.clear()


login_rate_limiter = LoginRateLimiter(max_failures=5, window_seconds=60)
