import { createClient } from "@/lib/supabase/server";
import { getStandings, getWeeklyTeamPoints } from "@/lib/queries";

// TEMP: until sign-in + league selection is built, the league id comes
// from an env var. Replace with real league lookup once auth is wired up.
const LEAGUE_ID = process.env.NEXT_PUBLIC_DEMO_LEAGUE_ID ?? "";

export default async function StandingsPage() {
  const supabase = await createClient();
  const [standings, weeklyPoints] = LEAGUE_ID
    ? await Promise.all([getStandings(supabase, LEAGUE_ID), getWeeklyTeamPoints(supabase, LEAGUE_ID)])
    : [[], []];

  // Newest week first -- Total sits right next to Team, and the most
  // recent week's score is the next thing your eye hits, since that's
  // what actually matters day to day. Older weeks trail off to the right.
  const weeks = [...new Set(weeklyPoints.map((row) => row.week))].sort((a, b) => b - a);

  // team_id -> week -> points, for O(1) lookup per cell while rendering.
  const pointsByTeam = new Map<string, Map<number, number>>();
  for (const row of weeklyPoints) {
    if (!pointsByTeam.has(row.team_id)) pointsByTeam.set(row.team_id, new Map());
    pointsByTeam.get(row.team_id)!.set(row.week, row.points);
  }

  // Rank, Team, and Total all stay pinned on the left (via `sticky` +
  // matching `left` offsets that line up with each column's fixed width
  // below), with a border marking where the pinned columns end and the
  // scrollable week columns begin. The page runs full-width rather than a
  // fixed max-w container, to give the best shot at fitting all 18 week
  // columns with no scrolling at all on a normal laptop/desktop screen.
  return (
    <main className="w-full px-6 py-6">
      <h1 className="text-2xl font-semibold mb-1">Season Standings</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Cumulative points, no head-to-head. Each column is that week&apos;s score, so you can follow a
        team&apos;s week-to-week trend, not just the running total.
      </p>

      {!LEAGUE_ID && (
        <p className="text-sm text-amber-600 border border-amber-300 rounded-md p-3 mb-4">
          No league connected yet — this page will populate once the Supabase project and a
          league row exist (set NEXT_PUBLIC_DEMO_LEAGUE_ID).
        </p>
      )}

      <div className="overflow-x-auto border border-neutral-200 rounded-md">
        <table className="table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="sticky left-0 z-20 bg-white w-10 py-2 pl-3 pr-2 text-left">#</th>
              <th className="sticky left-10 z-20 bg-white w-40 py-2 px-3 text-left">Team</th>
              <th className="sticky left-[12.5rem] z-20 bg-white border-r border-neutral-200 w-24 py-2 pl-3 pr-4 text-right font-semibold">
                Total
              </th>
              {weeks.map((w) => (
                <th key={w} className="w-14 py-2 px-2 text-right whitespace-nowrap">
                  Wk {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((row, i) => {
              const teamWeeks = pointsByTeam.get(row.team_id);
              return (
                <tr key={row.team_id} className="border-b border-neutral-100">
                  <td className="sticky left-0 z-10 bg-white py-2 pl-3 pr-2 text-neutral-500">{i + 1}</td>
                  <td className="sticky left-10 z-10 bg-white py-2 px-3 font-medium whitespace-nowrap">
                    {row.team_name}
                  </td>
                  <td className="sticky left-[12.5rem] z-10 bg-white border-r border-neutral-200 py-2 pl-3 pr-4 text-right tabular-nums font-semibold">
                    {row.total_points.toFixed(2)}
                  </td>
                  {weeks.map((w) => {
                    const pts = teamWeeks?.get(w);
                    return (
                      <td key={w} className="py-2 px-2 text-right tabular-nums text-neutral-600">
                        {pts !== undefined ? pts.toFixed(2) : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {standings.length === 0 && LEAGUE_ID && (
              <tr>
                <td colSpan={weeks.length + 3} className="py-6 text-center text-neutral-400">
                  No teams yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
