"""Model artifacts on local disk. The database table is the registry; this is the file store."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib


def save_bundle(models_dir: Path, version: str, bundle: dict[str, Any]) -> Path:
    models_dir.mkdir(parents=True, exist_ok=True)
    path = models_dir / f"{version}.joblib"
    joblib.dump(bundle, path)
    return path


def load_bundle(path: Path | str) -> dict[str, Any]:
    return joblib.load(path)
