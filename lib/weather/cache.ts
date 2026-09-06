import type { RiskLevel } from "@/lib/risk/scoring";

export type CellWeather = {
  rainMm: number;
  risk: RiskLevel;
  updatedAt: number;
  overview?: string;
  overviewUpdatedAt?: number;
};

// Survives Next.js dev's module reloads (same pattern as a Prisma client
// singleton) so we don't lose the cache — and the background refresh
// interval — on every HMR pass.
const globalForCache = globalThis as unknown as {
  weatherCache?: Map<string, CellWeather>;
};

export const weatherCache: Map<string, CellWeather> =
  globalForCache.weatherCache ?? new Map();
globalForCache.weatherCache = weatherCache;

export function getCellWeather(cellId: string): CellWeather | undefined {
  return weatherCache.get(cellId);
}

export function setCellWeather(cellId: string, data: CellWeather): void {
  const existing = weatherCache.get(cellId);
  weatherCache.set(cellId, { ...existing, ...data });
}

export function setCellOverview(cellId: string, overview: string): void {
  const existing = weatherCache.get(cellId);
  weatherCache.set(cellId, {
    rainMm: 0,
    risk: "low",
    updatedAt: 0,
    ...existing,
    overview,
    overviewUpdatedAt: Date.now(),
  });
}

export function isStale(cellId: string, maxAgeMinutes: number): boolean {
  const entry = weatherCache.get(cellId);
  if (!entry) return true;
  return Date.now() - entry.updatedAt > maxAgeMinutes * 60 * 1000;
}
