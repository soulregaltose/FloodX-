import Link from "next/link";
import RouteMap from "../../components/RouteMap";

export default function RouteRiskPage() {
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-6">
        <div className="flex shrink-0 items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Compare routes by flood risk
          </h1>
          <div className="flex gap-4 text-sm underline">
            <Link href="/">Home</Link>
            <Link href="/point-lookup">Point lookup</Link>
          </div>
        </div>
        <RouteMap />
      </main>
    </div>
  );
}
