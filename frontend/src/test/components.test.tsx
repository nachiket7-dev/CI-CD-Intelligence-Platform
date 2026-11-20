import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { RiskCell } from "@/components/domain/RiskCell";
import { SweepPanel, SweepTable } from "@/components/domain/SweepPanel";
import { AblationPanel, AblationTable } from "@/components/domain/AblationPanel";
import { RealDataPanel, RealDataTable } from "@/components/domain/RealDataPanel";
import { DriftPanel, DriftTable } from "@/components/domain/DriftPanel";
import { findTargetThreshold, interpolateMetrics, ThresholdChooser } from "@/components/domain/ThresholdChooser";
import { SyntheticBanner } from "@/components/domain/SyntheticBanner";
import { DataState } from "@/components/ui/DataState";
import { formatEffect, formatFeatureValue, formatPercent, formatSpread, parseServerDate } from "@/lib/format";
import { SAMPLE_ABLATION, SAMPLE_DRIFT_REPORT, SAMPLE_REALDATA_REPORT, SAMPLE_REPORT, SAMPLE_SWEEP } from "@/lib/mocks";
import { riskBand } from "@/lib/risk";

function Harness({ fn, isEmpty }: { fn: () => Promise<string[]>; isEmpty?: (d: string[]) => boolean }) {
  const query = useQuery({ queryKey: ["t"], queryFn: fn });
  return (
    <DataState query={query} isEmpty={isEmpty} empty={<p>Nothing here yet</p>}>
      {(items) => <p>{items.join(",")}</p>}
    </DataState>
  );
}

const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
);

describe("synthetic data label", () => {
  it("is always on screen", () => {
    render(<SyntheticBanner />);
    expect(screen.getByRole("note")).toHaveTextContent(/synthetic data/i);
  });
});

describe("DataState draws all four states", () => {
  it("loading", () => {
    render(wrap(<Harness fn={() => new Promise(() => undefined)} />));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it("full", async () => {
    render(wrap(<Harness fn={async () => ["a", "b"]} />));
    expect(await screen.findByText("a,b")).toBeInTheDocument();
  });
  it("empty", async () => {
    render(wrap(<Harness fn={async () => []} isEmpty={(d) => d.length === 0} />));
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });
  it("error, with the reason and a way to retry", async () => {
    render(wrap(<Harness fn={async () => { throw new Error("Cannot reach the backend."); }} />));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the backend.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("RiskCell", () => {
  it("shows not scored when there is no prediction", () => {
    render(<RiskCell risk={null} />);
    expect(screen.getByText("Not scored")).toBeInTheDocument();
  });
  it("shows the percentage and a band for screen readers", () => {
    render(<RiskCell risk={0.64} />);
    expect(screen.getByText("64%")).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
  });
});

describe("formatting", () => {
  it("treats naive server datetimes as UTC", () => {
    expect(parseServerDate("2026-01-05T08:00:00").toISOString()).toBe("2026-01-05T08:00:00.000Z");
  });
  it("formats effects in points with a sign", () => {
    expect(formatEffect(0.123)).toBe("+12.3 pts");
    expect(formatEffect(-0.02)).toBe("-2.0 pts");
  });
  it("formats percentages and feature values for people", () => {
    expect(formatPercent(0.256)).toBe("26%");
    expect(formatFeatureValue("touches_dependencies", 1)).toBe("Yes");
    expect(formatFeatureValue("day_of_week", 2)).toBe("Wednesday");
    expect(formatFeatureValue("hours_since_last_failure", 168)).toBe("over a week");
  });
  it("bands match the backend tracker", () => {
    expect(riskBand(0.19).band).toBe("low");
    expect(riskBand(0.2).band).toBe("medium");
    expect(riskBand(0.5).band).toBe("high");
  });
  it("formats mean and spread with fallback for null", () => {
    expect(formatSpread({ mean: 0.354, spread: 0.012 })).toBe("0.354 ± 0.012");
    expect(formatSpread({ mean: null, spread: null })).toBe("not reached");
    expect(formatSpread(undefined)).toBe("not reached");
  });
});

describe("SweepPanel", () => {
  it("renders sweep table with mean and spread numbers", () => {
    render(<SweepTable sweep={SAMPLE_SWEEP} />);
    expect(screen.getByText("Majority-class baseline")).toBeInTheDocument();
    expect(screen.getByText("Logistic regression baseline")).toBeInTheDocument();
    expect(screen.getByText("Candidate (hist_gb)")).toBeInTheDocument();
    expect(screen.getAllByText("0.354 ± 0.012").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Promotion gate passed on/i)).toBeInTheDocument();
    expect(screen.getByText("Generalisation: leave one scenario out")).toBeInTheDocument();
    expect(screen.getByText("Normal test (all scenarios)")).toBeInTheDocument();
    expect(screen.getByText("Held out: busy-queue")).toBeInTheDocument();
    expect(screen.getByText(/measures robustness to a different CI environment/i)).toBeInTheDocument();
  });

  it("renders empty state and responds to run sweep", () => {
    let clicked = false;
    render(<SweepPanel sweep={null} onRunSweep={() => { clicked = true; }} />);
    expect(screen.getByText("No seed sweep yet")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Run sweep" });
    btn.click();
    expect(clicked).toBe(true);
  });
});

describe("AblationPanel", () => {
  it("renders ablation table with baseline and group rows", () => {
    render(<AblationTable ablation={SAMPLE_ABLATION} />);
    expect(screen.getByText("Full candidate model")).toBeInTheDocument();
    expect(screen.getByText("Removed: Rolling history features")).toBeInTheDocument();
    expect(screen.getByText("Removed: Queue and timing")).toBeInTheDocument();
    expect(screen.getByText("Removed: Change size")).toBeInTheDocument();
    expect(screen.getByText("Removed: Dependency and CI-config flags")).toBeInTheDocument();
    expect(screen.getByText("Deliberate leak verification")).toBeInTheDocument();
    expect(screen.getByText("Feature contract check")).toBeInTheDocument();
    expect(screen.getByText("Promotion gate")).toBeInTheDocument();
    expect(screen.getByText("Caught loudly")).toBeInTheDocument();
    expect(screen.getByText("Candidate rejected")).toBeInTheDocument();
  });

  it("renders empty state and responds to run ablation", () => {
    let clicked = false;
    render(<AblationPanel ablation={null} onRunAblation={() => { clicked = true; }} />);
    expect(screen.getByText("No ablation study yet")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Run ablation" });
    btn.click();
    expect(clicked).toBe(true);
  });
});

describe("ThresholdChooser", () => {
  it("interpolates metrics accurately between threshold grid points", () => {
    const thresholds = [
      { threshold: 0.1, precision: 0.2, recall: 0.8, flagged_share: 0.7 },
      { threshold: 0.3, precision: 0.4, recall: 0.6, flagged_share: 0.5 },
    ];
    const mid = interpolateMetrics(thresholds, 0.2);
    expect(mid.precision).toBeCloseTo(0.3);
    expect(mid.recall).toBeCloseTo(0.7);
    expect(mid.flagged_share).toBeCloseTo(0.6);
  });

  it("finds the lowest threshold reaching target precision", () => {
    const target = findTargetThreshold(SAMPLE_REPORT.thresholds, 0.5);
    expect(target).toBeDefined();
    expect(target!.threshold).toBe(0.5);
    expect(target!.precision).toBeGreaterThanOrEqual(0.5);
  });

  it("renders slider, number input, target callout and updates on change", () => {
    let chosen = 0.3;
    render(
      <ThresholdChooser
        thresholds={SAMPLE_REPORT.thresholds}
        precisionTarget={SAMPLE_REPORT.precision_target}
        value={chosen}
        onChange={(val) => {
          chosen = val;
        }}
      />,
    );

    expect(screen.getByLabelText("Failure probability threshold")).toBeInTheDocument();
    expect(screen.getByLabelText("Threshold")).toHaveValue(0.3);
    expect(screen.getByText(/Configured precision target: 50%/i)).toBeInTheDocument();
    expect(screen.getByText(/Lowest threshold reaching target precision is/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Use target/i })).toBeInTheDocument();

    const targetBtn = screen.getByRole("button", { name: /Use target/i });
    targetBtn.click();
    expect(chosen).toBe(0.5);
  });
});

describe("RealDataPanel", () => {
  it("renders dataset name, evaluated rows and licence", () => {
    render(<RealDataTable report={SAMPLE_REALDATA_REPORT} />);
    expect(
      screen.getByText("Mendeley Data: GitHub Actions CI/CD failure dataset (GADFPD)"),
    ).toBeInTheDocument();
    expect(screen.getByText(/303,079/)).toBeInTheDocument();
    expect(screen.getByText(/CC BY 4.0/)).toBeInTheDocument();
    expect(screen.getByText("Gate passed")).toBeInTheDocument();
  });

  it("lists missing contract features with explicit note that they are not imputed", () => {
    render(<RealDataTable report={SAMPLE_REALDATA_REPORT} />);
    expect(screen.getByText(/Dataset limits and unbuildable features/i)).toBeInTheDocument();
    expect(screen.getByText(/They are not imputed or filled with zeros/i)).toBeInTheDocument();
    expect(screen.getByText("touches_dependencies")).toBeInTheDocument();
    expect(screen.getByText("touches_ci_config")).toBeInTheDocument();
    expect(screen.getByText("queue_depth_at_start")).toBeInTheDocument();
  });

  it("renders scores table and gate checks", () => {
    render(<RealDataTable report={SAMPLE_REALDATA_REPORT} />);
    expect(screen.getByText("Majority-class baseline")).toBeInTheDocument();
    expect(screen.getByText("Logistic regression baseline")).toBeInTheDocument();
    expect(screen.getByText("Candidate (hist_gb)")).toBeInTheDocument();
    expect(screen.getByText("beats_baseline_pr_auc")).toBeInTheDocument();
  });

  it("draws empty state when no report is available", () => {
    render(<RealDataPanel report={null} />);
    expect(screen.getByText("No real data check report yet")).toBeInTheDocument();
    expect(screen.getByText(/python -m app.cli realdata <path>/i)).toBeInTheDocument();
  });
});

describe("DriftPanel", () => {
  it("renders numeric drift table sorted by PSI with status and recommendations", () => {
    render(<DriftTable report={SAMPLE_DRIFT_REPORT} />);
    expect(screen.getByText("Queue depth at start")).toBeInTheDocument();
    expect(screen.getByText("0.428")).toBeInTheDocument();
    expect(screen.getByText("0.612")).toBeInTheDocument();
    expect(
      screen.getByText(/Significant shift. Retrain the model on recent data/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Shifted").length).toBeGreaterThan(0);
  });

  it("renders categorical feature share breakdown", () => {
    render(<DriftTable report={SAMPLE_DRIFT_REPORT} />);
    expect(screen.getByText("Categorical feature share breakdown")).toBeInTheDocument();
    expect(screen.getByText("Trigger")).toBeInTheDocument();
    expect(screen.getByText("pull_request")).toBeInTheDocument();
    expect(screen.getByText("60.0%")).toBeInTheDocument();
    expect(screen.getByText("32.0%")).toBeInTheDocument();
  });

  it("draws empty state with action buttons when no live runs exist", () => {
    render(<DriftPanel report={null} />);
    expect(screen.getByText("No live runs to compare")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add live runs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate drift" })).toBeInTheDocument();
  });
});
