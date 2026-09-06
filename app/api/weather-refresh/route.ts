import { runRefreshJob, runOverviewRefreshJob } from "@/lib/weather/refresh-job";
import { GRID_DIMENSIONS } from "@/lib/weather/grid";

// Manual trigger for local development — the background scheduler
// (instrumentation.ts) only starts when the dev server boots, so use this
// to warm the cache without restarting the server.
export async function GET() {
  await Promise.all([runRefreshJob(), runOverviewRefreshJob()]);
  return Response.json({ refreshed: true, cells: GRID_DIMENSIONS.count });
}
