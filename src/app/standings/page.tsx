import { createClient } from "@/lib/supabase/server";
import { getStandings } from "@/lib/queries";

// TEMP: until sign-in + league selection is built, the league id comes
// from an env var. Replace with real league lookup once auth is wired up.
const LEAGUE_ID = process.env.NEXT_PUBLIC_DEMO_LEAGUE_ID ?? "";

export default async function StandingsPage() {
  const supabase = await createClient();
  const standings = LEAGUE_ID ? await getStandings(supabase, LEAGUE_ID) : [];

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-1">Season Standings</h1>
      <p className="text-sm text-neutral-500 mb-6">Cumulative points, no head-to-head.</p>

      {!LEAGUE_ID && (
        <p className="text-sm text-amber-600 border border-amber-300 rounded-md p-3 mb-4">
          No league connected yet — this page will populate once the Supabase project and a
          league row exist (set NEXT_PUBLIC_DEMO_LEAGUE_ID).
        </p>
      )}

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-neutral-200 text-sm text-neutral-500">
            <th className="py-2 pr-4">Rank</th>
            <th className="py-2 pr-4">Team</th>
            <th className="py-2 text-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => (
            <tr key={row.team_id} className="border-b border-neutral-100">
              <td className="py-2 pr-4 text-neutral-500">{i + 1}</td>
              <td className="py-2 pr-4 font-medium">{row.team_name}</td>
              <td className="py-2 text-right tabular-nums">{row.total_points.toFixed(2)}</td>
            </tr>
          ))}
          {standings.length === 0 && LEAGUE_ID && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-neutral-400">
                No teams yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
