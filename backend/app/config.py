"""Runtime settings. Everything has a local-first default; override with environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    database_url: str = f"sqlite:///{BACKEND_ROOT / 'data' / 'ci_intel.db'}"
    models_dir: Path = BACKEND_ROOT / "models"
    scenarios_dir: Path = BACKEND_ROOT / "scenarios"
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")

    # Evaluation and gate defaults (see the project document: promotion gate).
    precision_target: float = 0.5  # "recall at fixed precision" is read at this precision
    gate_margin: float = 0.01  # candidate PR-AUC must beat the best baseline by at least this
    brier_tolerance: float = 0.002  # candidate Brier may be at most this much worse
    rolling_window: int = 20  # how many earlier finished runs feed the rolling features

    @classmethod
    def from_env(cls) -> Settings:
        d = cls()
        return cls(
            database_url=os.getenv("CI_INTEL_DATABASE_URL", d.database_url),
            models_dir=Path(os.getenv("CI_INTEL_MODELS_DIR", str(d.models_dir))),
            scenarios_dir=d.scenarios_dir,
            cors_origins=tuple(os.getenv("CI_INTEL_CORS_ORIGINS", ",".join(d.cors_origins)).split(",")),
            precision_target=float(os.getenv("CI_INTEL_PRECISION_TARGET", d.precision_target)),
            gate_margin=float(os.getenv("CI_INTEL_GATE_MARGIN", d.gate_margin)),
            brier_tolerance=float(os.getenv("CI_INTEL_BRIER_TOLERANCE", d.brier_tolerance)),
            rolling_window=int(os.getenv("CI_INTEL_ROLLING_WINDOW", d.rolling_window)),
        )
