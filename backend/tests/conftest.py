from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import BACKEND_ROOT, Settings
from app.main import create_app
from app.simulator.generate import simulate
from app.simulator.scenarios import load_scenarios


@pytest.fixture(scope="session")
def scenarios():
    return list(load_scenarios(BACKEND_ROOT / "scenarios").values())


@pytest.fixture(scope="session")
def frame(scenarios):
    """A small simulated dataset shared by the ML tests (about 1,200 runs)."""
    return simulate(scenarios, 300, seed=7)


@pytest.fixture()
def client(tmp_path: Path):
    settings = Settings(database_url="sqlite://", models_dir=tmp_path / "models")
    with TestClient(create_app(settings)) as c:
        yield c
