import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailablePlayer, Lineup, Position, StandingsRow } from "./types";

export async function getStandings(
  supabase: SupabaseClient,
  leagueId: string
): Promise<StandingsRow[]> {
  const { data, error } = await supabase
    .from("standings")
    .select("*")
    .eq("league_id", leagueId)
    .order("total_points", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * The team id owned by the currently logged-in user, or null if they're
 * not logged in or don't have a team assigned yet. Replaces the old
 * "?team=<uuid> in the URL" workaround now that real sign-in exists.
 */
export async function getMyTeamId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("teams")
    .select("id")
    .eq("owner_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export async function getTeamLineup(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
  week: number
): Promise<Lineup[]> {
  const { data, error } = await supabase
    .from("lineups")
    .select("*")
    .eq("team_id", teamId)
    .eq("season", season)
    .eq("week", week);

  if (error) throw error;
  return data ?? [];
}

/**
 * Player ids this team cannot field in `week`: either already used in a
 * strictly earlier week this season, or already placed somewhere in this
 * week's own lineup (no double-rostering the same player in two slots).
 *
 * Deliberately NOT the same thing as the `team_used_players` view, which
 * counts every week a team has ever rostered a player regardless of week —
 * that's fine for a ledger, but wrong for "what can I use in week N," since
 * our test data has the whole season auto-filled in advance. A player
 * slotted for week 9 shouldn't block a week 1 pick just because next week's
 * lineup already happens to exist in the table.
 */
export async function getUnavailablePlayerIds(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
  week: number
): Promise<Set<string>> {
  const [priorRes, thisWeekRes] = await Promise.all([
    supabase
      .from("lineups")
      .select("player_id")
      .eq("team_id", teamId)
      .eq("season", season)
      .lt("week", week)
      .not("player_id", "is", null),
    supabase
      .from("lineups")
      .select("player_id")
      .eq("team_id", teamId)
      .eq("season", season)
      .eq("week", week)
      .not("player_id", "is", null),
  ]);

  if (priorRes.error) throw priorRes.error;
  if (thisWeekRes.error) throw thisWeekRes.error;

  const ids = new Set<string>();
  for (const row of priorRes.data ?? []) if (row.player_id) ids.add(row.player_id);
  for (const row of thisWeekRes.data ?? []) if (row.player_id) ids.add(row.player_id);
  return ids;
}

/**
 * Players eligible for this team this week: active, not on a bye, and not
 * already unavailable per getUnavailablePlayerIds above. Two queries + a
 * client-side filter, rather than one complex SQL join — simple, and fine
 * at this league's scale (a few hundred players/week).
 */
export async function getAvailablePlayers(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
  week: number
): Promise<AvailablePlayer[]> {
  const [unavailable, statsRes] = await Promise.all([
    getUnavailablePlayerIds(supabase, teamId, season, week),
    supabase
      .from("player_week_stats")
      .select("*, nfl_players(*)")
      .eq("season", season)
      .eq("week", week)
      .eq("active", true)
      .not("kickoff", "is", null),
  ]);

  if (statsRes.error) throw statsRes.error;

  const now = Date.now();

  return (statsRes.data ?? [])
    .filter((row) => !unavailable.has(row.player_id) && row.nfl_players)
    .map((row) => ({
      ...row.nfl_players,
      fantasy_points: row.fantasy_points,
      kickoff: row.kickoff,
      active: row.active,
      locked: row.kickoff ? new Date(row.kickoff).getTime() <= now : false,
    }));
}

/**
 * Candidates actually selectable for a swap into a given slot: eligible
 * players (see getAvailablePlayers) narrowed to the slot's allowed
 * positions and to games that haven't started yet (a locked player can be
 * viewed on the Players tab, but can never be swapped in).
 */
export async function getEligibleCandidates(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
  week: number,
  positions: Position[]
): Promise<AvailablePlayer[]> {
  const players = await getAvailablePlayers(supabase, teamId, season, week);
  return players
    .filter((p) => positions.includes(p.position) && !p.locked)
    .sort((a, b) => b.fantasy_points - a.fantasy_points);
}
