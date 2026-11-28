#!/bin/sh
set -eu

python -m alembic -c alembic.ini upgrade head
exec uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port "${PORT:-10000}"
