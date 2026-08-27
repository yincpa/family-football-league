import { createClient } from "@/lib/supabase/server";
import { getTeamLineup } from "@/lib/queries";
import { ROSTER_SLOTS } from "@/lib/types";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; season?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const teamId = sp.team ?? "";
  const seasonDefaulted = sp.season === undefined;
  const weekDefaulted = sp.week === undefined;
  const season = Number(sp.season ?? new Date().getFullYear());
  const week = Number(sp.week ?? 1);

  const supabase = await createClient();
  const lineup = teamId ? await getTeamLineup(supabase, teamId, season, week) : [];

  type StatsRow = {
    player_id: string;
    fantasy_points: number;
    kickoff: string | null;
    nfl_players: { full_name: string } | { full_name: string }[] | null;
  };

  const playerIds = lineup.map((l) => l.player_id).filter(Boolean) as string[];
  let playerDetails: Record<string, { full_name: string; fantasy_points: number; kickoff: string | null }> = {};

  if (playerIds.length > 0) {
    const { data } = await supabase
      .from("player_week_stats")
      .select("player_id, fantasy_points, kickoff, nfl_players(full_name)")
      .in("player_id", playerIds)
      .eq("season", season)
      .eq("week", week);

    playerDetails = Object.fromEntries(
      ((data as StatsRow[] | null) ?? []).map((row) => {
        const joined = Array.isArray(row.nfl_players) ? row.nfl_players[0] : row.nfl_players;
        return [
          row.player_id,
          { full_name: joined?.full_name ?? row.player_id, fantasy_points: row.fantasy_points, kickoff: row.kickoff },
        ];
      })
    );
  }

  // This is a Server Component: it renders fresh per request, so reading
  // the current time here (to compute each slot's lock status as of this
  // request) is correct — not the kind of render-time impurity the "no
  // impure calls during render" rule targets in client components.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const bySlot = Object.fromEntries(lineup.map((l) => [l.slot, l]));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-1">
        Week {week} Lineup
      </h1>
      <p className="text-xs font-mono text-neutral-400 mb-2">
        Season {season} · Week {week}
        {(seasonDefaulted || weekDefaulted) && (
          <span className="text-amber-600"> (defaulted — add &amp;season=…&amp;week=… to the URL to pin this)</span>
        )}
      </p>
      <p className="text-sm text-neutral-500 mb-6">
        Editing/swapping isn&apos;t wired up yet — this is a read-only view of the auto-filled lineup.
      </p>

      {!teamId && (
        <p className="text-sm text-amber-600 border border-amber-300 rounded-md p-3 mb-4">
          Add a team to the URL to preview this page, e.g. <code>?team=&lt;team-id&gt;&amp;week=1</code>.
        </p>
      )}

      {teamId && (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 text-sm text-neutral-500">
              <th className="py-2 pr-4">Slot</th>
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-4 text-right">Pts</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {ROSTER_SLOTS.map((slot) => {
              const entry = bySlot[slot];
              const details = entry?.player_id ? playerDetails[entry.player_id] : undefined;
              const locked = details?.kickoff ? new Date(details.kickoff).getTime() <= now : false;
              return (
                <tr key={slot} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-mono text-xs text-neutral-500">{slot}</td>
                  <td className="py-2 pr-4 font-medium">{details?.full_name ?? "— empty —"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {details ? details.fantasy_points.toFixed(2) : "-"}
                  </td>
                  <td className="py-2">
                    {!details ? (
                      ""
                    ) : locked ? (
                      <span className="text-xs text-neutral-400">locked</span>
                    ) : (
                      <span className="text-xs text-emerald-600">editable</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
