import { NextRequest } from "next/server";
import { latLngToCellId } from "@/lib/weather/grid";
import { getCellWeather } from "@/lib/weather/cache";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return Response.json(
      { error: "lat and lng query params are required" },
      { status: 400 }
    );
  }

  const cellId = latLngToCellId(lat, lng);
  const weather = getCellWeather(cellId);

  if (!weather) {
    return Response.json(
      {
        cellId,
        ready: false,
        message:
          "No cached rainfall yet for this cell — the background refresh job hasn't run for it.",
      },
      { status: 202 }
    );
  }

  return Response.json({ cellId, ready: true, ...weather });
}
