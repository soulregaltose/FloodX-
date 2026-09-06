// Two dials that control OpenWeather usage. Raising the daily quota later
// only ever means changing these numbers — see docs/architecture.md.
export const WEATHER_GRID_CELL_KM = Number(
  process.env.WEATHER_GRID_CELL_KM ?? 5
);
export const WEATHER_REFRESH_MINUTES = Number(
  process.env.WEATHER_REFRESH_MINUTES ?? 15
);
// The AI weather-overview summary changes far less often than rainfall —
// refresh it on its own, much slower cadence so it doesn't eat the same
// budget as the rain grid.
export const WEATHER_OVERVIEW_REFRESH_MINUTES = Number(
  process.env.WEATHER_OVERVIEW_REFRESH_MINUTES ?? 180
);
export const OPENWEATHER_DAILY_QUOTA = Number(
  process.env.OPENWEATHER_DAILY_QUOTA ?? 1000
);

// Area of interest: Rajasthan Technical University, Kota, +/- ~7.5km
// (a ~15km x 15km box).
export const AREA_CENTER = { lat: 25.1636, lng: 75.8378 };
export const AREA_HALF_WIDTH_KM = 7.5;

export function estimateDailyCalls(
  cellCount: number,
  intervalMinutes: number = WEATHER_REFRESH_MINUTES
): number {
  return (cellCount * (24 * 60)) / intervalMinutes;
}
