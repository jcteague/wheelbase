"""HTTP logging middleware — emits structured request/response log records."""

import time
import uuid
from typing import Any, Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            http_method=request.method,
            http_path=request.url.path,
        )
        query: str | None = str(request.url.query) or None
        logger.info("http_request_received", query_string=query)

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.error(
                "http_request_unhandled_exception",
                duration_ms=duration_ms,
                exc_info=True,
            )
            structlog.contextvars.clear_contextvars()
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        status = response.status_code
        log_fn: Any
        if status >= 500:
            log_fn = logger.error
        elif status >= 400:
            log_fn = logger.warning
        else:
            log_fn = logger.info
        log_fn("http_response", http_status=status, duration_ms=duration_ms)

        response.headers["X-Request-Id"] = request_id
        structlog.contextvars.clear_contextvars()
        return response
