import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, status

from app.core.audit import audit_event


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def enforce(self, key: str, limit: int, window_seconds: int, event: str) -> None:
        now = time.time()
        with self._lock:
            q = self._hits[key]
            while q and (now - q[0]) > window_seconds:
                q.popleft()
            if len(q) >= limit:
                audit_event("rate_limit_exceeded", key=key, limited_event=event)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Limite de requisições excedido",
                )
            q.append(now)


rate_limiter = RateLimiter()
