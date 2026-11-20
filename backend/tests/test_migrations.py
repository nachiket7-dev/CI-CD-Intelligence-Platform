"""Tests for Alembic migrations and ORM schema agreement."""

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect
from sqlalchemy.pool import StaticPool

from alembic import command
from app.db import Database, get_alembic_config, run_migrations
from app.orm import Base


def test_migrations_upgrade_empty_db_and_match_orm():
    """An empty database upgraded to head must match Base.metadata with zero diff."""
    engine = create_engine(
        "sqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    # Database was empty; run migrations to head
    run_migrations(engine)

    # Check all expected tables exist
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    for expected_table in Base.metadata.tables.keys():
        assert expected_table in table_names, f"Table {expected_table} missing from migrated DB"

    # Compare ORM metadata against live schema
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        diff = compare_metadata(ctx, Base.metadata)
        assert diff == [], f"Schema diff detected between ORM models and migrations: {diff}"


def test_migrations_downgrade_and_reupgrade():
    """Downgrading to base removes tables, re-upgrading to head cleanly restores them."""
    engine = create_engine(
        "sqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    cfg = get_alembic_config()

    run_migrations(engine)

    # Downgrade to base
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "base")

    inspector = inspect(engine)
    tables_after_downgrade = set(inspector.get_table_names())
    assert "runs" not in tables_after_downgrade
    assert "models" not in tables_after_downgrade
    assert "sweeps" not in tables_after_downgrade
    assert "ablations" not in tables_after_downgrade
    assert "realdata_reports" not in tables_after_downgrade

    # Re-upgrade to head
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")

    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        diff = compare_metadata(ctx, Base.metadata)
        assert diff == [], f"Schema diff after re-upgrade: {diff}"


def test_database_init_runs_migrations_on_empty_sqlite():
    """Database initialization on SQLite automatically runs migrations to head."""
    db = Database("sqlite://")
    inspector = inspect(db.engine)
    assert "runs" in inspector.get_table_names()
    assert "alembic_version" in inspector.get_table_names()

    with db.engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        current_rev = ctx.get_current_revision()
        assert current_rev is not None
