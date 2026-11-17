"""FastAPI application factory."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import models, runs, sim
from .config import Settings
from .contract import ContractViolation
from .db import Database
from .schemas import HealthOut, RunCounts
from .services_data import DomainError, NotFound, counts, scenario_catalog
from .services_models import active_model


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="CI/CD Intelligence Platform",
        version="0.1.0",
        description="Failure-risk prediction for CI runs. All data is synthetic.",
    )
    app.state.settings = settings
    app.state.db = Database(settings.database_url)
    settings.models_dir.mkdir(parents=True, exist_ok=True)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(NotFound)
    async def _not_found(_: Request, exc: NotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ContractViolation)
    async def _contract(_: Request, exc: ContractViolation) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.get("/api/health", response_model=HealthOut, tags=["meta"])
    def health() -> HealthOut:
        with app.state.db.session() as db:
            model = active_model(db)
            return HealthOut(
                status="ok",
                active_model=model.version if model else None,
                runs=RunCounts(**counts(db)),
                scenarios=list(scenario_catalog(settings)),
            )

    for router in (runs.router, sim.router, models.router):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
