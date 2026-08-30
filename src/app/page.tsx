import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-10">
      <h1 className="text-3xl font-semibold mb-2">Yin Family Football League</h1>
      <p className="text-neutral-500 mb-8">
        No draft. Use every player once. Season-long standings.
      </p>
      <nav className="flex flex-col gap-3">
        {/* TEMP: hardcoded to the 2025 test-data season/week until the real
            2026 season kicks off in September. */}
        <Link className="text-lg underline underline-offset-4" href="/roster?season=2025&week=1">
          My Lineup
        </Link>
        <Link className="text-lg underline underline-offset-4" href="/players?season=2025&week=1">
          Available Players
        </Link>
        <Link className="text-lg underline underline-offset-4" href="/standings">
          Standings
        </Link>
      </nav>
    </main>
  );
}
