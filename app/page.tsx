import Map from "../components/Map";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-6 py-16 px-6">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Click on the map to get lat/lng and road/area name
        </h1>
        <Map />
      </main>
    </div>
  );
}
