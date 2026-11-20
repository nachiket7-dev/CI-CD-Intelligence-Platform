"""Command line tools.

python -m app.cli sweep --seeds 5     # same report every time: baseline vs candidate over seeds
python -m app.cli demo                # simulate, train, promote and add live runs in the local DB
"""

from __future__ import annotations

import argparse

from .config import Settings
from .db import Database
from .ml.pipeline import CANDIDATE_KINDS
from .realdata import run_and_save_realdata
from .services_data import add_live_runs, simulate_into_db
from .services_models import predict_for_run, promote, train
from .services_results import generate_results_report
from .services_sweep import execute_sweep


def sweep(args: argparse.Namespace) -> None:
    settings = Settings.from_env()
    data = execute_sweep(
        settings,
        seeds=args.seeds,
        runs_per_scenario=args.runs,
        candidate=args.candidate,
    )
    print(f"Synthetic data. {args.seeds} seeds, {args.runs} runs per scenario, candidate={args.candidate}")
    print("Test-set scores on a time-ordered split (mean ± spread over seeds)\n")
    print(f"{'model':<12}{'PR-AUC':>16}{'Brier':>16}{f'recall@precision {settings.precision_target}':>30}")
    for name, r in data["metrics"].items():
        pr_str = f"{r['pr_auc']['mean']:.3f} ± {r['pr_auc']['spread']:.3f}"
        brier_str = f"{r['brier']['mean']:.3f} ± {r['brier']['spread']:.3f}"
        if r["recall"]["mean"] is not None:
            rec_str = f"{r['recall']['mean']:.3f} ± {r['recall']['spread']:.3f}"
        else:
            rec_str = "not reached"
        print(f"{name:<12}{pr_str:>16}{brier_str:>16}{rec_str:>30}")
    passed_s = data["passed_seeds"]
    print(f"\nPromotion gate passed on {passed_s} of {args.seeds} seeds (margin {settings.gate_margin}).")
    if "leave_one_out" in data and data["leave_one_out"]:
        print("\nLeave-one-scenario-out PR-AUC (mean ± spread over seeds):")
        print(f"{'held-out scenario':<20}{'majority':>16}{'logreg':>16}{'candidate':>16}")
        for row in data["leave_one_out"]:
            m_pr = f"{row['majority_pr_auc']['mean']:.3f} ± {row['majority_pr_auc']['spread']:.3f}"
            l_pr = f"{row['logreg_pr_auc']['mean']:.3f} ± {row['logreg_pr_auc']['spread']:.3f}"
            c_pr = f"{row['candidate_pr_auc']['mean']:.3f} ± {row['candidate_pr_auc']['spread']:.3f}"
            print(f"{row['scenario']:<20}{m_pr:>16}{l_pr:>16}{c_pr:>16}")


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


def realdata_cli(args: argparse.Namespace) -> None:
    settings = Settings.from_env()
    db = Database(settings.database_url)
    with db.session() as session:
        record = run_and_save_realdata(
            session,
            settings,
            csv_path=args.path,
            candidate=args.candidate,
            max_rows=args.max_rows,
            seed=args.seed,
        )
        print(f"Loaded {record.total_rows:,} real-world runs from {args.path}")
        print(f"Dataset: {record.dataset_name} (DOI: {record.doi}, Licence: {record.licence})")
        print("\nAvailable contract features:")
        for feat in record.available_features:
            print(f"  - {feat}")
        print("\nUnbuildable contract features (NOT imputed):")
        for item in record.missing_contract_features:
            print(f"  - {item['feature']}: {item['reason']}")
        print(f"\nTime-ordered evaluation on real test split (candidate: {record.candidate}):")
        target_hdr = f"recall@prec {settings.precision_target}"
        print(f"{'model':<12}{'PR-AUC':>12}{'Brier':>12}{target_hdr:>26}")
        for name, m in record.metrics.items():
            pr_val = f"{m['pr_auc']:.3f}"
            brier_val = f"{m['brier']:.4f}"
            rec = m.get("recall_at_precision")
            rec_val = f"{rec:.3f}" if rec is not None else "not reached"
            print(f"{name:<12}{pr_val:>12}{brier_val:>12}{rec_val:>26}")
        gate = record.gate
        print(f"\nPromotion gate: {'PASSED' if gate['passed'] else 'REJECTED'}")
        print(f"Reason: {gate['reason']}")


def results_cli(args: argparse.Namespace) -> None:
    from pathlib import Path

    settings = Settings.from_env()
    db = Database(settings.database_url)
    with db.session() as session:
        output_path = Path(args.output) if args.output else None
        target_str = str(output_path or "docs/RESULTS.md")
        print(
            f"Regenerating {target_str} with {args.seeds} seeds, "
            f"{args.runs} runs/scenario, candidate={args.candidate}..."
        )
        generate_results_report(
            settings,
            seeds=args.seeds,
            runs_per_scenario=args.runs,
            candidate=args.candidate,
            realdata_path=args.realdata,
            db=session,
            output_path=output_path,
        )
        print(f"Successfully generated {target_str}.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("results", help="regenerate docs/RESULTS.md from real benchmark runs")
    p.add_argument("--seeds", type=int, default=5, help="number of seeds to evaluate")
    p.add_argument("--runs", type=int, default=1000, help="runs per scenario")
    p.add_argument("--candidate", choices=CANDIDATE_KINDS, default="hist_gb")
    p.add_argument("--realdata", type=str, default=None, help="path to real-world dataset CSV")
    p.add_argument("--output", type=str, default=None, help="custom output path for RESULTS.md")
    p.set_defaults(func=results_cli)
    p = sub.add_parser("sweep", help="baseline vs candidate over several seeds, in memory")
    p.add_argument("--seeds", type=int, default=5)
    p.add_argument("--runs", type=int, default=1000, help="runs per scenario")
    p.add_argument("--candidate", choices=CANDIDATE_KINDS, default="hist_gb")
    p.set_defaults(func=sweep)
    p = sub.add_parser("demo", help="fill the local database with a ready-to-use demo")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--runs", type=int, default=1000, help="runs per scenario")
    p.set_defaults(func=demo)
    p = sub.add_parser("realdata", help="evaluate on public real-world CI/CD dataset")
    p.add_argument("path", help="path to real data CSV file")
    p.add_argument("--candidate", choices=CANDIDATE_KINDS, default="hist_gb")
    p.add_argument("--max-rows", type=int, default=None, help="maximum rows to load")
    p.add_argument("--seed", type=int, default=42)
    p.set_defaults(func=realdata_cli)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
