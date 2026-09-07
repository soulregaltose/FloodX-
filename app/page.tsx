import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-lg flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Flood-risk advisor
        </h1>
        <p className="text-muted-foreground text-sm">
          Choose a tool. Maps live on their own pages, not here.
        </p>
        <div className="flex flex-col gap-3 text-sm underline">
          <Link href="/point-lookup">Look up flood risk at a point</Link>
          <Link href="/route-risk">Compare routes by flood risk</Link>
        </div>
      </main>
    </div>
  );
}
