import Link from "next/link";
import RouteMap from "../../components/RouteMap";

export default function RouteRiskPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-6 py-16 px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Compare routes by flood risk
          </h1>
          <Link href="/" className="text-sm underline">
            Back to point lookup
          </Link>
        </div>
        <RouteMap />
      </main>
    </div>
  );
}
