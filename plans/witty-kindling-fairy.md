# Structured Logging — Backend

## Context

The backend has zero logging infrastructure. Unhandled exceptions are silently swallowed by the global exception handler (returns 500 with no trace). There is no visibility into request traffic, validation failures, or what the app is doing in production. This plan adds structured (JSON) logging so every log record is machine-parseable and correlatable by request.

---

## Library: `structlog`

Chosen over stdlib+JSON-formatter and loguru because:

- Processor pipeline is functional (plain functions transforming a dict) — fits the project style
- `structlog.contextvars` is async-safe: per-request fields bound once in middleware appear on all downstream log records automatically, with no argument threading
- `structlog.stdlib.ProcessorFormatter` bridges uvicorn and SQLAlchemy's stdlib log records into the same JSON pipeline with no custom handler code
- Ships typed stubs; compatible with mypy strict

---

## Files Changed

| Action | File                                  |
| ------ | ------------------------------------- |
| MODIFY | `backend/pyproject.toml`              |
| MODIFY | `backend/app/config.py`               |
| NEW    | `backend/app/logging_config.py`       |
| NEW    | `backend/app/middleware.py`           |
| MODIFY | `backend/app/main.py`                 |
| MODIFY | `backend/app/api/routes/positions.py` |
| NEW    | `backend/tests/test_logging.py`       |

**Do NOT add logging to `app/core/` engines** — they are pure functions with no I/O imports.

---

## Implementation Steps

### Step 1 — Add dependency (`pyproject.toml`)

```toml
"structlog>=24.4",
```

Run `cd backend && uv sync` after editing.

---

### Step 2 — Add `log_level` to Settings (`app/config.py`)

```python
log_level: str = "INFO"   # overridable via LOG_LEVEL env var
```

---

### Step 3 — Create `app/logging_config.py`

Single `configure_logging()` function called once at startup. Responsibilities:

- Build the shared structlog processor chain:
  1. `merge_contextvars` — injects per-request bound fields (request_id, method, path)
  2. `add_logger_name` — adds `"logger": "app.api.routes.positions"`
  3. `add_log_level` — adds `"level": "info"`
  4. `PositionalArgumentsFormatter`
  5. `TimeStamper(fmt="iso", utc=True)` — adds `"timestamp": "2026-...Z"`
  6. `StackInfoRenderer`
  7. Custom `_drop_color_message_key` processor (removes uvicorn's ANSI duplicate)
- Configure structlog with `ProcessorFormatter.wrap_for_formatter` + `JSONRenderer` as final processor
- Set root `logging.StreamHandler(sys.stdout)` with the structlog formatter
- Set log level from `settings.log_level`
- **Silence** `uvicorn.access` (middleware replaces it; `propagate=False`, no handlers)
- Set `uvicorn.error` to WARNING
- Set `sqlalchemy.engine` to DEBUG if `settings.debug` else WARNING
- Set `apscheduler` to WARNING

---

### Step 4 — Create `app/middleware.py`

`LoggingMiddleware(BaseHTTPMiddleware)`:

```python
async def dispatch(self, request, call_next):
    request_id = str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        http_method=request.method,
        http_path=request.url.path,
    )
    logger.info("http_request_received", query_string=str(request.url.query) or None)

    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        logger.error("http_request_unhandled_exception", duration_ms=duration_ms, exc_info=True)
        structlog.contextvars.clear_contextvars()
        raise

    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    status = response.status_code
    log_fn = logger.error if status >= 500 else logger.warning if status >= 400 else logger.info
    log_fn("http_response", http_status=status, duration_ms=duration_ms)

    response.headers["X-Request-Id"] = request_id
    structlog.contextvars.clear_contextvars()
    return response
```

`clear_contextvars()` at start and end prevents context leaking across async tasks.

---

### Step 5 — Modify `app/main.py`

```python
from app.logging_config import configure_logging
configure_logging()   # ← must be FIRST, before any other app imports that emit logs
```

Then:

```python
app.add_middleware(LoggingMiddleware)
```

Fix `global_exception_handler` to actually log:

```python
async def global_exception_handler(request, exc):
    logger.error("unhandled_exception", exc_type=type(exc).__name__, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

Note: pass `exc_info=exc` explicitly (not `exc_info=True`) — inside a FastAPI exception handler `sys.exc_info()` may not be populated.

---

### Step 6 — Modify `app/api/routes/positions.py`

Add module-level logger:

```python
logger = logging.getLogger(__name__)
```

Log validation failure (after catching `ValidationError`, before returning 400):

```python
logger.info("position_validation_failed", field=exc.field, code=exc.code, ticker=body.ticker)
```

Log position created (after `session.begin()` block exits — after commit, not before):

```python
logger.info(
    "position_created",
    position_id=str(position_id),
    ticker=body.ticker,
    phase=lifecycle_result.phase.value,
    contracts=body.contracts,
    strike=str(body.strike),
    basis_per_share=str(basis_result.basis_per_share),
    total_premium_collected=str(basis_result.total_premium_collected),
)
```

---

### Step 7 — Create `backend/tests/test_logging.py`

Use `structlog.testing.capture_logs()` (no extra deps — ships with structlog). Tests are async, following the existing `pytest-asyncio` pattern.

Five tests:

1. `test_position_created_log_emitted` — 201 response produces `position_created` record with ticker, position_id, basis_per_share
2. `test_validation_failure_log_emitted` — 400 response produces `position_validation_failed` at `log_level="info"` (not error)
3. `test_http_request_and_response_logged` — both `http_request_received` and `http_response` present, response has `http_status` and `duration_ms`
4. `test_request_id_consistent_within_request` — all records for one request share the same `request_id`
5. `test_unhandled_exception_logged_as_error` — monkeypatch `calculate_initial_csp_basis` to raise, assert 500 response and an error-level record with `unhandled_exception`

---

## Log Record Shape

Every record includes (from shared processors):

```json
{
  "timestamp": "2026-03-01T14:32:01.123Z",
  "level": "info",
  "logger": "app.api.routes.positions",
  "event": "position_created",
  "request_id": "a3f2c1d4-...",
  "http_method": "POST",
  "http_path": "/api/positions",
  ...event-specific fields...
}
```

`request_id`, `http_method`, `http_path` are present on all records within a request context (bound by middleware via `bind_contextvars`).

---

## Verification

```bash
# 1. All tests pass (includes new logging tests)
cd backend && uv run pytest

# 2. Lint clean
uv run ruff check .

# 3. Type-check clean
uv run mypy app/

# 4. Manual smoke test — start the server, make a request, observe JSON logs
make dev
curl -s -X POST http://localhost:8000/api/positions \
  -H "Content-Type: application/json" \
  -d '{"ticker":"AAPL","strike":"150","expiration":"2026-06-20","contracts":1,"premium_per_contract":"3.50"}'
# stdout should show 3 JSON lines: http_request_received, position_created, http_response
# Each line should contain request_id, timestamp, level, logger, event
```
