export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWeatherRefreshScheduler } = await import(
      "./lib/weather/refresh-job"
    );
    startWeatherRefreshScheduler();
  }
}
