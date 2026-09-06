import type { RiskLevel } from "./scoring";

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high"];

/**
 * Worst-point wins: one flooded stretch makes the whole route risky.
 * Safer to over-warn than under-warn for a flood tool.
 */
export function aggregateRouteRisk(risks: RiskLevel[]): RiskLevel {
  return risks.reduce<RiskLevel>((worst, risk) => {
    return RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(worst) ? risk : worst;
  }, "low");
}

export function rankRoutesByRisk<T extends { risk: RiskLevel }>(
  routes: T[]
): T[] {
  return [...routes].sort(
    (a, b) => RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk)
  );
}
