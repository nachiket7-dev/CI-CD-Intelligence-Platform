"""System time as a naive UTC datetime (SQLite stores naive values)."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)
