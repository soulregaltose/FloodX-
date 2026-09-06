export type RiskLevel = "low" | "medium" | "high";

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high"];

export function scoreRainfall(rainMm: number): RiskLevel {
  if (rainMm > 30) return "high";
  if (rainMm >= 10) return "medium";
  return "low";
}

function bump(risk: RiskLevel, delta: number): RiskLevel {
  const index = RISK_ORDER.indexOf(risk);
  const next = Math.min(
    RISK_ORDER.length - 1,
    Math.max(0, index + delta)
  );
  return RISK_ORDER[next];
}

/**
 * Sharpens the rainfall-only risk using elevation, which (unlike rainfall)
 * is cheap to fetch per-point via Google's Elevation API. Points well below
 * the area's median elevation drain worse in heavy rain, so we bump their
 * risk up a level; points well above it are dampened down a level.
 */
export function adjustForElevation(
  risk: RiskLevel,
  elevationM: number,
  medianElevationM: number
): RiskLevel {
  const diff = elevationM - medianElevationM;
  if (diff < -5) return bump(risk, 1);
  if (diff > 5) return bump(risk, -1);
  return risk;
}
