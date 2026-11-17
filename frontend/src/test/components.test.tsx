import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { RiskCell } from "@/components/domain/RiskCell";
import { SyntheticBanner } from "@/components/domain/SyntheticBanner";
import { DataState } from "@/components/ui/DataState";
import { formatEffect, formatFeatureValue, formatPercent, parseServerDate } from "@/lib/format";
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
});
