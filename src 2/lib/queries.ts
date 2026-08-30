import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailablePlayer, Lineup, StandingsRow } from "./types";

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
 * Players eligible for this team this week: active, not on a bye, and not
 * already used by this team in a previous week (the "used players" rule).
 * Two queries + a client-side filter, rather than one complex SQL join —
 * simple, and fine at this league's scale (a few hundred players/week).
 */
export async function getAvailablePlayers(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
  week: number
): Promise<AvailablePlayer[]> {
  const [usedRes, statsRes] = await Promise.all([
    supabase.from("team_used_players").select("player_id").eq("team_id", teamId),
    supabase
      .from("player_week_stats")
      .select("*, nfl_players(*)")
      .eq("season", season)
      .eq("week", week)
      .eq("active", true)
      .not("kickoff", "is", null),
  ]);

  if (usedRes.error) throw usedRes.error;
  if (statsRes.error) throw statsRes.error;

  const usedIds = new Set((usedRes.data ?? []).map((r) => r.player_id));
  const now = Date.now();

  return (statsRes.data ?? [])
    .filter((row) => !usedIds.has(row.player_id) && row.nfl_players)
    .map((row) => ({
      ...row.nfl_players,
      fantasy_points: row.fantasy_points,
      kickoff: row.kickoff,
      active: row.active,
      locked: row.kickoff ? new Date(row.kickoff).getTime() <= now : false,
    }));
}
