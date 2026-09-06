import { getRouteCandidates } from "@/lib/maps/directions";
import { sampleAlongPath, type LatLng } from "@/lib/maps/polyline";
import { getElevations, median, ELEVATION_ENABLED } from "@/lib/maps/elevation";
import { latLngToCellId } from "@/lib/weather/grid";
import { getCellWeather } from "@/lib/weather/cache";
import { scoreRainfall, adjustForElevation, type RiskLevel } from "@/lib/risk/scoring";
import { aggregateRouteRisk, rankRoutesByRisk } from "@/lib/risk/route-aggregate";

const SAMPLE_INTERVAL_METERS = 300;

type RiskPoint = LatLng & { rainMm: number; risk: RiskLevel };

type RankedRoute = {
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  risk: RiskLevel;
  points: RiskPoint[];
};

export async function POST(request: Request) {
  const body = await request.json();
  const origin: LatLng | undefined = body?.origin;
  const destination: LatLng | undefined = body?.destination;

  if (!origin || !destination) {
    return Response.json(
      { error: "origin and destination ({lat, lng}) are required" },
      { status: 400 }
    );
  }

  const candidates = await getRouteCandidates(origin, destination);

  const rankedInput = await Promise.all(
    candidates.map(async (route) => {
      const sampled = sampleAlongPath(route.path, SAMPLE_INTERVAL_METERS);
      const elevations = ELEVATION_ENABLED
        ? await getElevations(sampled)
        : null;
      const medianElevation = elevations ? median(elevations) : null;

      const points: RiskPoint[] = sampled.map((point, i) => {
        const cellId = latLngToCellId(point.lat, point.lng);
        const weather = getCellWeather(cellId);
        const rainMm = weather?.rainMm ?? 0;
        const baseRisk = weather?.risk ?? scoreRainfall(rainMm);
        const risk =
          elevations && medianElevation !== null
            ? adjustForElevation(baseRisk, elevations[i], medianElevation)
            : baseRisk;
        return { ...point, rainMm, risk };
      });

      const route_: RankedRoute = {
        summary: route.summary,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        risk: aggregateRouteRisk(points.map((p) => p.risk)),
        points,
      };
      return route_;
    })
  );

  const ranked = rankRoutesByRisk(rankedInput);

  return Response.json({
    routes: ranked,
    recommendedIndex: 0,
  });
}
