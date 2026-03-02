from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog

from app.logging_config import configure_logging

configure_logging()  # must be first, before any other app imports that emit logs

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from app.api.routes import router  # noqa: E402
from app.config import settings  # noqa: E402
from app.middleware import LoggingMiddleware  # noqa: E402

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("app_startup", debug=settings.debug, log_level=settings.log_level)
    yield
    logger.info("app_shutdown")


app = FastAPI(title="Wheelbase API", debug=settings.debug, lifespan=lifespan)

app.add_middleware(LoggingMiddleware)
app.include_router(router, prefix="/api")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "unhandled_exception",
        exc_type=type(exc).__name__,
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
