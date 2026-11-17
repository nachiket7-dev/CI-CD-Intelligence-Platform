export type RiskBand = "low" | "medium" | "high";

/** Bands match the backend tracker: low under 20%, medium 20% to 50%, high from 50%. */
export function riskBand(p: number): { band: RiskBand; label: string } {
  if (p >= 0.5) return { band: "high", label: "High risk" };
  if (p >= 0.2) return { band: "medium", label: "Medium risk" };
  return { band: "low", label: "Low risk" };
}
