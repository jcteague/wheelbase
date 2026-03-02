# pytest fixtures — shared test infrastructure
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.db import get_session
from app.main import app


@pytest.fixture
async def client():
    mock_session = AsyncMock()
    mock_session.begin = MagicMock(
        return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=mock_session),
            __aexit__=AsyncMock(),
        )
    )
    mock_session.flush = AsyncMock()
    mock_session.add_all = MagicMock()
    mock_session.refresh = AsyncMock()

    async def override_get_session():
        yield mock_session

    app.dependency_overrides[get_session] = override_get_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
