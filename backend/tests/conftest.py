import os
import uuid
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from psycopg import connect
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.postgres import PostgresContainer

TEST_DB_NAME = f"wheelbase_test_{uuid.uuid4().hex}"
BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _as_sync_postgres_url(url: str) -> str:
    return (
        url.replace("postgresql+psycopg2://", "postgresql://")
        .replace("postgresql+psycopg://", "postgresql://")
        .replace("postgresql+asyncpg://", "postgresql://")
    )


@pytest.fixture(scope="session")
def test_database_url() -> Generator[str, None, None]:
    with PostgresContainer("postgres:16") as postgres:
        admin_url = _as_sync_postgres_url(postgres.get_connection_url())
        base_url = admin_url.rsplit("/", 1)[0]
        test_db_sync_url = f"{base_url}/{TEST_DB_NAME}"
        test_db_async_url = test_db_sync_url.replace("postgresql://", "postgresql+asyncpg://")

        with connect(admin_url, autocommit=True) as conn:
            conn.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')

        os.environ["DATABASE_URL"] = test_db_async_url

        alembic_cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(BACKEND_ROOT / "app/db/migrations"))
        alembic_cfg.set_main_option("sqlalchemy.url", test_db_async_url)
        command.upgrade(alembic_cfg, "head")

        yield test_db_async_url

        with connect(test_db_sync_url, autocommit=True) as conn:
            table_names = conn.execute(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public' AND tablename != 'alembic_version'
                """
            ).fetchall()
            if table_names:
                quoted_tables = ", ".join(f'"{name}"' for (name,) in table_names)
                conn.execute(f"TRUNCATE TABLE {quoted_tables} RESTART IDENTITY CASCADE")


@pytest_asyncio.fixture
async def db_engine(test_database_url: str) -> AsyncGenerator[AsyncEngine, None]:
    engine = create_async_engine(test_database_url)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def truncate_tables(test_database_url: str) -> AsyncGenerator[None, None]:
    """Truncate all data tables before each test so tests are isolated."""
    engine = create_async_engine(test_database_url)
    async with engine.begin() as conn:
        await conn.execute(
            __import__("sqlalchemy", fromlist=["text"]).text(
                "TRUNCATE TABLE legs, cost_basis_snapshots, positions RESTART IDENTITY CASCADE"
            )
        )
    await engine.dispose()
    yield


@pytest.fixture
def app_with_db(
    db_engine: AsyncEngine,
) -> Generator[FastAPI, None, None]:
    from app.db import get_session
    from app.main import app

    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    yield app
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def db_session(db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(app_with_db: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac
