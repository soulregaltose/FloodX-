import Link from "next/link";
import Map from "../../components/Map";

export default function PointLookupPage() {
  return (
    <div className="flex flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Click on the map to get lat/lng and road/area name
          </h1>
          <div className="flex gap-4 text-sm underline">
            <Link href="/">Home</Link>
            <Link href="/route-risk">Compare routes by risk</Link>
          </div>
        </div>
        <Map />
      </main>
    </div>
  );
}
