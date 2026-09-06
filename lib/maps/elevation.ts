import type { LatLng } from "./polyline";

const GOOGLE_MAPS_SERVER_KEY =
  process.env.GOOGLE_MAPS_SERVER_API_KEY ??
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Off by default — requires the Elevation API to be enabled for the Maps
// key's Google Cloud project, which isn't set up yet. Flip
// ELEVATION_ENABLED=true once it is. Nothing else needs to change: callers
// check this flag and skip elevation lookups entirely while it's off.
export const ELEVATION_ENABLED = process.env.ELEVATION_ENABLED === "true";

const MAX_LOCATIONS_PER_REQUEST = 512;

type ElevationApiResponse = {
  status: string;
  error_message?: string;
  results: { elevation: number }[];
};

async function fetchElevationBatch(points: LatLng[]): Promise<number[]> {
  if (!GOOGLE_MAPS_SERVER_KEY) {
    throw new Error(
      "Missing GOOGLE_MAPS_SERVER_API_KEY (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) env var"
    );
  }

  const locations = points.map((p) => `${p.lat},${p.lng}`).join("|");
  const url = new URL("https://maps.googleapis.com/maps/api/elevation/json");
  url.searchParams.set("locations", locations);
  url.searchParams.set("key", GOOGLE_MAPS_SERVER_KEY);

  const res = await fetch(url.toString());
  const data: ElevationApiResponse = await res.json();

  if (data.status !== "OK") {
    throw new Error(
      `Elevation API error: ${data.status} ${data.error_message ?? ""}`
    );
  }

  return data.results.map((r) => r.elevation);
}

/** One batched call per <=512 points — cheap, so call it per route, not per point. */
export async function getElevations(points: LatLng[]): Promise<number[]> {
  const elevations: number[] = [];
  for (let i = 0; i < points.length; i += MAX_LOCATIONS_PER_REQUEST) {
    const chunk = points.slice(i, i + MAX_LOCATIONS_PER_REQUEST);
    elevations.push(...(await fetchElevationBatch(chunk)));
  }
  return elevations;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
