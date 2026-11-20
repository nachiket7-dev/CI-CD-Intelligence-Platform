"""SQLite engine and session handling."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from alembic.config import Config
from alembic.migration import MigrationContext
from fastapi import Request
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from alembic import command


def get_alembic_config() -> Config:
    backend_dir = Path(__file__).resolve().parent.parent
    alembic_ini = backend_dir / "alembic.ini"
    cfg = Config(str(alembic_ini))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    return cfg


def run_migrations(engine: Engine) -> None:
    """Run Alembic migrations up to head on the provided engine."""
    cfg = get_alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        context = MigrationContext.configure(conn)
        current_rev = context.get_current_revision()
        if current_rev is None:
            tables = set(inspect(conn).get_table_names())
            if "runs" in tables or "models" in tables:
                command.stamp(cfg, "head")
                return
        command.upgrade(cfg, "head")


class Database:
    def __init__(self, url: str):
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool  # one shared connection for in-memory tests
        elif url.startswith("sqlite:///"):
            Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        self.engine: Engine = create_engine(url, **kwargs)
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        if self.engine.dialect.name == "sqlite":
            run_migrations(self.engine)

    def session(self) -> Session:
        return self.sessions()


def get_session(request: Request) -> Iterator[Session]:
    db: Database = request.app.state.db
    with db.session() as session:
        yield session
