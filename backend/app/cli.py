"""Command line tools.

python -m app.cli sweep --seeds 5     # same report every time: baseline vs candidate over seeds
python -m app.cli demo                # simulate, train, promote and add live runs in the local DB
"""

from __future__ import annotations

import argparse

import numpy as np

from .config import Settings
from .db import Database
from .ml.pipeline import CANDIDATE_KINDS, run_experiment
from .services_data import add_live_runs, pick_scenarios, simulate_into_db
from .services_models import predict_for_run, promote, train
from .simulator.generate import simulate


def _fmt(values: list[float]) -> str:
    return f"{np.mean(values):.3f} ± {np.std(values):.3f}"


def sweep(args: argparse.Namespace) -> None:
    settings = Settings.from_env()
    scenarios = pick_scenarios(settings, None)
    rows: dict[str, dict[str, list[float]]] = {
        k: {"pr_auc": [], "brier": [], "recall": []} for k in ("majority", "logreg", "candidate")
    }
    passed = 0
    for seed in range(args.seeds):
        frame = simulate(scenarios, args.runs, seed)
        exp = run_experiment(
            frame,
            seed=seed,
            candidate_kind=args.candidate,
            precision_target=settings.precision_target,
            gate_margin=settings.gate_margin,
            brier_tolerance=settings.brier_tolerance,
            rolling_window=settings.rolling_window,
        )
        passed += exp.gate.passed
        for name, m in exp.metrics.items():
            rows[name]["pr_auc"].append(m["pr_auc"])
            rows[name]["brier"].append(m["brier"])
            if m["recall_at_precision"] is not None:
                rows[name]["recall"].append(m["recall_at_precision"])
    print(f"Synthetic data. {args.seeds} seeds, {args.runs} runs per scenario, candidate={args.candidate}")
    print("Test-set scores on a time-ordered split (mean ± spread over seeds)\n")
    print(f"{'model':<12}{'PR-AUC':>16}{'Brier':>16}{f'recall@precision {settings.precision_target}':>30}")
    for name, r in rows.items():
        rec = _fmt(r["recall"]) if r["recall"] else "not reached"
        print(f"{name:<12}{_fmt(r['pr_auc']):>16}{_fmt(r['brier']):>16}{rec:>30}")
    print(f"\nPromotion gate passed on {passed} of {args.seeds} seeds (margin {settings.gate_margin}).")


def demo(args: argparse.Namespace) -> None:
    settings = Settings.from_env()
    db = Database(settings.database_url)
    with db.session() as session:
        simulate_into_db(session, settings, None, args.runs, args.seed, pending=8)
        record = train(session, settings, "hist_gb", args.seed)
        print(f"Trained {record.version}: {record.status}. {record.gate['reason']}")
        if record.status == "candidate":
            promote(session, record)
            for run in add_live_runs(session, settings, 5, args.seed):
                predict_for_run(session, settings, run)
            print("Promoted it and added 5 scored live runs.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("sweep", help="baseline vs candidate over several seeds, in memory")
    p.add_argument("--seeds", type=int, default=5)
    p.add_argument("--runs", type=int, default=1000, help="runs per scenario")
    p.add_argument("--candidate", choices=CANDIDATE_KINDS, default="hist_gb")
    p.set_defaults(func=sweep)
    p = sub.add_parser("demo", help="fill the local database with a ready-to-use demo")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--runs", type=int, default=1000, help="runs per scenario")
    p.set_defaults(func=demo)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
