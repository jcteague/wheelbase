.PHONY: dev db-up db-down backend frontend install test lint typecheck format migrate

dev: db-up
	@bash scripts/dev.sh

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

install:
	cd backend && uv sync
	cd frontend && pnpm install

backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && pnpm dev

test:
	cd backend && uv run pytest
	cd frontend && pnpm test

lint:
	cd backend && uv run ruff check .
	cd frontend && pnpm lint

typecheck:
	cd backend && uv run mypy app
	cd frontend && pnpm typecheck

format:
	cd backend && uv run ruff format .
	cd frontend && pnpm format

migrate:
	cd backend && uv run alembic upgrade head
