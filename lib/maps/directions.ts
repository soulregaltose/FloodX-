import { decodePolyline, type LatLng } from "./polyline";

const GOOGLE_MAPS_SERVER_KEY =
  process.env.GOOGLE_MAPS_SERVER_API_KEY ??
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export type RouteCandidate = {
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  path: LatLng[];
};

type DirectionsApiLeg = {
  distance: { value: number };
  duration: { value: number };
};

type DirectionsApiRoute = {
  summary: string;
  overview_polyline: { points: string };
  legs: DirectionsApiLeg[];
};

type DirectionsApiResponse = {
  status: string;
  error_message?: string;
  routes: DirectionsApiRoute[];
};

export async function getRouteCandidates(
  origin: LatLng,
  destination: LatLng
): Promise<RouteCandidate[]> {
  if (!GOOGLE_MAPS_SERVER_KEY) {
    throw new Error(
      "Missing GOOGLE_MAPS_SERVER_API_KEY (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) env var"
    );
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("alternatives", "true");
  url.searchParams.set("key", GOOGLE_MAPS_SERVER_KEY);

  const res = await fetch(url.toString());
  const data: DirectionsApiResponse = await res.json();

  if (data.status !== "OK") {
    throw new Error(
      `Directions API error: ${data.status} ${data.error_message ?? ""}`
    );
  }

  return data.routes.map((route) => ({
    summary: route.summary,
    distanceMeters: route.legs.reduce((sum, leg) => sum + leg.distance.value, 0),
    durationSeconds: route.legs.reduce((sum, leg) => sum + leg.duration.value, 0),
    path: decodePolyline(route.overview_polyline.points),
  }));
}
