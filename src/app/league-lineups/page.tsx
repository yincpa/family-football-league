import { createClient } from "@/lib/supabase/server";
import { getCurrentWeek, getLeagueTeams, getTeamLineup, getTeamWeeklyAwards } from "@/lib/queries";
import { ROSTER_SLOTS } from "@/lib/types";
import RosterTable, { type RosterRow } from "@/components/RosterTable";
import { TeamLogo } from "@/components/TeamLogoEditor";
import TeamPicker from "@/components/TeamPicker";
import WeekPicker from "@/components/WeekPicker";

// TEMP: same single-league assumption as the Standings page, until real
// league selection is built.
const LEAGUE_ID = process.env.NEXT_PUBLIC_DEMO_LEAGUE_ID ?? "";

/**
 * View-only lineups for every team in the league, not just your own -- lets
 * everyone see who a teammate started and how they scored, so the league
 * feels like a shared competition rather than nine people each playing
 * their own private game. Same layout as the My Lineup page (roster/
 * page.tsx), including the weekly bonus table, but with RosterTable's
 * `readOnly` flag set so no Swap button ever appears -- /api/swap already
 * rejects edits to a team you don't own, but showing a button that would
 * just fail is worse than not showing one at all.
 */
export default async function LeagueLineupsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; season?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const seasonDefaulted = sp.season === undefined;
  const season = Number(sp.season ?? new Date().getFullYear());

  const supabase = await createClient();
  const teams = LEAGUE_ID ? await getLeagueTeams(supabase, LEAGUE_ID) : [];
  const maxWeek = LEAGUE_ID ? await getCurrentWeek(supabase, season) : 1;

  // Default to the current week (the most recent one whose games have
  // started) when no ?week= is given; clamp anything out of range (a
  // stale link, hand-edited URL, etc.) back to the current week instead
  // of showing a future week that doesn't exist yet.
  const requestedWeek = Number(sp.week ?? maxWeek);
  const week = requestedWeek >= 1 && requestedWeek <= maxWeek ? requestedWeek : maxWeek;
  
  // Default to the alphabetically-first team when no ?team= is given (or it
  // doesn't match a real team in this league) -- always lands on someone's
  // real lineup rather than a blank page.
  const teamId = (sp.team && teams.some((t) => t.id === sp.team) ? sp.team : teams[0]?.id) ?? "";
  const viewedTeam = teams.find((t) => t.id === teamId) ?? null;

  const lineup = teamId ? await getTeamLineup(supabase, teamId, season, week) : [];
  const awards = teamId ? await getTeamWeeklyAwards(supabase, teamId, season, week) : [];

  type StatsRow = {
    player_id: string;
    fantasy_points: number;
    kickoff: string | null;
    opponent: string | null;
    opponent_is_home: boolean | null;
    nfl_players: { full_name: string; headshot_url: string | null } | { full_name: string; headshot_url: string | null }[] | null;
  };

  const playerIds = lineup.map((l) => l.player_id).filter(Boolean) as string[];
  let playerDetails: Record<
    string,
    {
      full_name: string;
      fantasy_points: number;
      kickoff: string | null;
      opponent: string | null;
      opponent_is_home: boolean | null;
      headshot_url: string | null;
    }
  > = {};

  if (playerIds.length > 0) {
    const { data } = await supabase
      .from("player_week_stats")
      .select("player_id, fantasy_points, kickoff, opponent, opponent_is_home, nfl_players(full_name, headshot_url)")
      .in("player_id", playerIds)
      .eq("season", season)
      .eq("week", week);

    playerDetails = Object.fromEntries(
      ((data as StatsRow[] | null) ?? []).map((row) => {
        const joined = Array.isArray(row.nfl_players) ? row.nfl_players[0] : row.nfl_players;
        return [
          row.player_id,
          {
            full_name: joined?.full_name ?? row.player_id,
            fantasy_points: row.fantasy_points,
            kickoff: row.kickoff,
            opponent: row.opponent,
            opponent_is_home: row.opponent_is_home,
            headshot_url: joined?.headshot_url ?? null,
          },
        ];
      })
    );
  }

  // Server Component rendering fresh per request -- see the same note in
  // roster/page.tsx for why reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const bySlot = Object.fromEntries(lineup.map((l) => [l.slot, l]));

  const initialRows: RosterRow[] = ROSTER_SLOTS.map((slot) => {
    const entry = bySlot[slot];
    const details = entry?.player_id ? playerDetails[entry.player_id] : undefined;
    const locked = details?.kickoff ? new Date(details.kickoff).getTime() <= now : false;
    return {
      slot,
      playerId: entry?.player_id ?? null,
      fullName: details?.full_name ?? null,
      points: details?.fantasy_points ?? null,
      kickoff: details?.kickoff ?? null,
      headshotUrl: details?.headshot_url ?? null,
      opponent: details?.opponent ?? null,
      opponentIsHome: details?.opponent_is_home ?? null,
      locked,
    };
  });

  const lineupTotal = initialRows.reduce((sum, row) => sum + (row.points ?? 0), 0);
  const mvpAward = awards.find((a) => a.award_type === "mvp") ?? null;
  const gmAward = awards.find((a) => a.award_type === "gm") ?? null;
  const bonusTotal = (mvpAward?.bonus_points ?? 0) + (gmAward?.bonus_points ?? 0);
  const weekTotal = lineupTotal + bonusTotal;
  const mvpPlayerName =
    mvpAward && mvpAward.mvp_player_id
      ? (initialRows.find((row) => row.playerId === mvpAward.mvp_player_id)?.fullName ?? null)
      : null;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-1">League Lineups</h1>
      <p className="text-xs font-mono text-neutral-400 mb-2">
        Season {season} · Week {week}
        {(seasonDefaulted || weekDefaulted) && (
          <span className="text-amber-600"> (defaulted — add &amp;season=…&amp;week=… to the URL to pin this)</span>
        )}
      </p>
      <p className="text-sm text-neutral-500 mb-4">
        Everyone&apos;s lineups, view-only — pick a team below to see who they started and how they
        scored.
      </p>

      {!LEAGUE_ID || teams.length === 0 ? (
        <p className="text-sm text-amber-600 border border-amber-300 rounded-md p-3 mb-4">
          No league connected yet — this page will populate once the Supabase project and teams
          exist.
        </p>
      ) : (
        <>
          <div className="mb-4">
            <TeamPicker teams={teams} selectedTeamId={teamId} season={season} week={week} />
          </div>

          {viewedTeam && (
            <div className="flex items-center gap-2 mb-4">
              <TeamLogo
                emoji={viewedTeam.logo_emoji}
                imageUrl={viewedTeam.logo_image_url}
                teamName={viewedTeam.team_name}
                size={28}
              />
              <span className="text-sm font-medium text-neutral-600">{viewedTeam.team_name}</span>
            </div>
          )}

          <RosterTable teamId={teamId} season={season} week={week} initialRows={initialRows} readOnly />

          {/* Same weekly bonus table as the My Lineup page -- see
              refresh_scores.py's compute_weekly_awards(). */}
          <table className="w-full text-sm mt-4 border-t border-neutral-200 pt-2">
            <tbody>
              <tr className="text-neutral-500">
                <td className="py-1">Lineup total</td>
                <td className="py-1 text-right tabular-nums">{lineupTotal.toFixed(2)}</td>
              </tr>
              {mvpAward && (
                <tr className="text-amber-600">
                  <td className="py-1">
                    🏆 MVP of the Week{mvpPlayerName ? ` (${mvpPlayerName})` : ""}
                  </td>
                  <td className="py-1 text-right tabular-nums">+{mvpAward.bonus_points.toFixed(2)}</td>
                </tr>
              )}
              {gmAward && (
                <tr className="text-amber-600">
                  <td className="py-1">🏆 GM of the Week</td>
                  <td className="py-1 text-right tabular-nums">+{gmAward.bonus_points.toFixed(2)}</td>
                </tr>
              )}
              <tr className="font-semibold border-t border-neutral-200">
                <td className="py-1">Week total</td>
                <td className="py-1 text-right tabular-nums">{weekTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
