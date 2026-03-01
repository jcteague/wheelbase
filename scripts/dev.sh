#!/usr/bin/env bash
set -e
trap 'kill 0' SIGINT SIGTERM EXIT

echo "Starting backend..."
(cd backend && uv run uvicorn app.main:app --reload --port 8000) &

echo "Starting frontend..."
(cd frontend && pnpm dev) &

wait
