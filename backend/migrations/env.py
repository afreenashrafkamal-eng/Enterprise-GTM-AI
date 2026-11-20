import sys
from pathlib import Path

from alembic import context
from sqlalchemy import pool

# Add the backend directory to Python's import path
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.db.base import Base
from app.db.session import engine
import app.models

config = context.config

if config.config_file_name is not None:
    from logging.config import fileConfig

    fileConfig(config.config_file_name)

# SQLAlchemy model metadata
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=engine.url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()