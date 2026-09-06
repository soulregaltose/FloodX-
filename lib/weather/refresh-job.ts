import { listGridCells, GRID_DIMENSIONS } from "./grid";
import { setCellWeather, setCellOverview } from "./cache";
import { scoreRainfall } from "@/lib/risk/scoring";
import {
  WEATHER_REFRESH_MINUTES,
  WEATHER_OVERVIEW_REFRESH_MINUTES,
  OPENWEATHER_DAILY_QUOTA,
  estimateDailyCalls,
} from "./config";

type OneCallResponse = {
  current?: { rain?: { "1h"?: number } };
  hourly?: { rain?: { "1h"?: number } }[];
};

type OneCallOverviewResponse = {
  weather_overview?: string;
};

function getApiKey(): string {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENWEATHER_API_KEY env var");
  }
  return apiKey;
}

async function fetchCellRainfall(lat: number, lng: number): Promise<number> {
  const url = new URL("https://api.openweathermap.org/data/3.0/onecall");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("exclude", "minutely,alerts");
  url.searchParams.set("units", "metric");
  url.searchParams.set("appid", getApiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`OpenWeather request failed: ${res.status} ${await res.text()}`);
  }
  const data: OneCallResponse = await res.json();

  return data.current?.rain?.["1h"] ?? data.hourly?.[0]?.rain?.["1h"] ?? 0;
}

async function fetchCellOverview(lat: number, lng: number): Promise<string | null> {
  const url = new URL("https://api.openweathermap.org/data/3.0/onecall/overview");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("units", "metric");
  url.searchParams.set("appid", getApiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`OpenWeather overview request failed: ${res.status}`);
  }
  const data: OneCallOverviewResponse = await res.json();

  return data.weather_overview ?? null;
}

/** Refreshes rainfall for every grid cell once. One OpenWeather call per cell. */
export async function runRefreshJob(): Promise<void> {
  const cells = listGridCells();

  const projected =
    estimateDailyCalls(GRID_DIMENSIONS.count, WEATHER_REFRESH_MINUTES) +
    estimateDailyCalls(GRID_DIMENSIONS.count, WEATHER_OVERVIEW_REFRESH_MINUTES);
  if (projected > OPENWEATHER_DAILY_QUOTA) {
    console.warn(
      `[weather-refresh] Projected ${projected} calls/day (rain + overview) exceeds quota of ${OPENWEATHER_DAILY_QUOTA}. ` +
        `Increase WEATHER_GRID_CELL_KM or the refresh intervals.`
    );
  }

  for (const cell of cells) {
    try {
      const rainMm = await fetchCellRainfall(cell.center.lat, cell.center.lng);
      setCellWeather(cell.id, {
        rainMm,
        risk: scoreRainfall(rainMm),
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error(`[weather-refresh] Failed for cell ${cell.id}:`, err);
    }
  }
}

/** Refreshes the AI weather-overview summary for every grid cell once. */
export async function runOverviewRefreshJob(): Promise<void> {
  const cells = listGridCells();

  for (const cell of cells) {
    try {
      const overview = await fetchCellOverview(cell.center.lat, cell.center.lng);
      if (overview) setCellOverview(cell.id, overview);
    } catch (err) {
      console.error(`[weather-overview-refresh] Failed for cell ${cell.id}:`, err);
    }
  }
}

const globalForScheduler = globalThis as unknown as {
  weatherRefreshInterval?: ReturnType<typeof setInterval>;
  weatherOverviewInterval?: ReturnType<typeof setInterval>;
};

/** Starts both background refresh loops once per server instance. */
export function startWeatherRefreshScheduler(): void {
  if (!globalForScheduler.weatherRefreshInterval) {
    void runRefreshJob();
    globalForScheduler.weatherRefreshInterval = setInterval(
      () => void runRefreshJob(),
      WEATHER_REFRESH_MINUTES * 60 * 1000
    );
  }

  if (!globalForScheduler.weatherOverviewInterval) {
    void runOverviewRefreshJob();
    globalForScheduler.weatherOverviewInterval = setInterval(
      () => void runOverviewRefreshJob(),
      WEATHER_OVERVIEW_REFRESH_MINUTES * 60 * 1000
    );
  }
}
