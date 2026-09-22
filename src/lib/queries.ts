import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AvailablePlayer,
  CommissionedLeague,
  CommissionerTeamRow,
  LeagueMessage,
  LeagueTeamOption,
  Lineup,
  Position,
  Profile,
  SeasonToDateStats,
  StandingsRow,
  TeamLogo,
  WeeklyAward,
  WeeklyTeamPoints,
} from "./types";

export async function getStandings(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<StandingsRow[]> {
  const { data, error } = await supabase
    .from("standings")
    .select("*")
    .eq("league_id", leagueId)
    .order("total_points", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getWeeklyTeamPoints(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<WeeklyTeamPoints[]> {
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id")
    .eq("league_id", leagueId);

  if (teamsError) throw teamsError;
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) return [];

  const { data, error } = await supabase
    .from("team_week_points")
    .select("team_id, week, points")
    .in("team_id", teamIds);

  if (error) throw error;
  return data ?? [];
}

export async function getTeamLogos(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<TeamLogo[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, logo_emoji, logo_image_url")
    .eq("league_id", leagueId);

  if (error) throw error;
  return data ?? [];
}

export async function getLeagueWeeklyAwards(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<WeeklyAward[]> {
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id")
    .eq("league_id", leagueId);

  if (teamsError) throw teamsError;
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) return [];

  const { data, error } = await supabase
    .from("weekly_awards")
    .select("team_id, week, award_type, bonus_points, mvp_player_id")
    .in("team_id", teamIds);

  if (error) throw error;
  return data ?? [];
}

export async function getTeamWeeklyAwards(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
  week: number,
): Promise<WeeklyAward[]> {
  const { data, error } = await supabase
    .from("weekly_awards")
    .select("team_id, week, award_type, bonus_points, mvp_player_id")
    .eq("team_id", teamId)
    .eq("season", season)
    .eq("week", week);

  if (error) throw error;
  return data ?? [];
}

export async function getMyTeamId(
  supabase: SupabaseClient,
): Promise<string | null> {
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

export async function getMyTeam(supabase: SupabaseClient): Promise<{
  id: string;
  team_name: string;
  logo_emoji: string | null;
  logo_image_url: string | null;
} | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("teams")
    .select("id, team_name, logo_emoji, logo_image_url")
    .eq("owner_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function setMyTeamLogo(
  supabase: SupabaseClient,
  teamId: string,
  logoEmoji: string | null,
  logoImageUrl: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("set_my_team_logo", {
    p_team_id: teamId,
    p_emoji: logoEmoji,
    p_image_url: logoImageUrl,
  });
  if (error) throw error;
}

export async function uploadTeamLogo(
  supabase: SupabaseClient,
  teamId: string,
  file: File,
): Promise<string> {
  const path = `${teamId}/logo`;
  const { error: uploadError } = await supabase.storage
    .from("team-logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("team-logos").getPublicUrl(path);
  return `${publicUrl}?v=${Date.now()}`;
}

export async function getTeamLineup(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
  week: number,
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
  week: number,
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
  for (const row of priorRes.data ?? [])
    if (row.player_id) ids.add(row.player_id);
  for (const row of thisWeekRes.data ?? [])
    if (row.player_id) ids.add(row.player_id);
  return ids;
}

/**
 * Season-to-date CUMULATIVE stats per player, over weeks strictly before
 * `week` (so it never includes the week currently being viewed) and only
 * counting games nflverse has actually marked final. Powers both the
 * Players tab's Season view (total rush yards, total TDs, etc. -- not
 * just this week's line) and avg_points (still just total_points / games,
 * kept on AvailablePlayer directly since that one's useful in both views).
 * Returns an empty map for week 1, or before the season has any finished
 * games yet.
 */
async function getSeasonToDateStats(
  supabase: SupabaseClient,
  season: number,
  week: number,
): Promise<Map<string, SeasonToDateStats>> {
  if (week <= 1) return new Map();

  const { data, error } = await supabase
    .from("player_week_stats")
    .select(
      "player_id, fantasy_points, game_final, pass_yards, pass_tds, pass_ints, rush_yards, rush_tds, receptions, rec_yards, rec_tds, fumbles_lost, fg_made, fg_att, pat_made, pat_att, def_sacks, def_ints, def_fumble_rec, def_tds, points_allowed",
    )
    .eq("season", season)
    .lt("week", week)
    .eq("game_final", true);

  if (error) throw error;

  const totals = new Map<string, SeasonToDateStats>();
  for (const row of data ?? []) {
    const t: SeasonToDateStats = totals.get(row.player_id) ?? {
      games: 0,
      total_points: 0,
      avg_points: 0,
      pass_yards: 0,
      pass_tds: 0,
      pass_ints: 0,
      rush_yards: 0,
      rush_tds: 0,
      receptions: 0,
      rec_yards: 0,
      rec_tds: 0,
      fumbles_lost: 0,
      fg_made: 0,
      fg_att: 0,
      pat_made: 0,
      pat_att: 0,
      def_sacks: 0,
      def_ints: 0,
      def_fumble_rec: 0,
      def_tds: 0,
      points_allowed: 0,
    };
    t.games += 1;
    t.total_points += row.fantasy_points ?? 0;
    t.pass_yards += row.pass_yards ?? 0;
    t.pass_tds += row.pass_tds ?? 0;
    t.pass_ints += row.pass_ints ?? 0;
    t.rush_yards += row.rush_yards ?? 0;
    t.rush_tds += row.rush_tds ?? 0;
    t.receptions += row.receptions ?? 0;
    t.rec_yards += row.rec_yards ?? 0;
    t.rec_tds += row.rec_tds ?? 0;
    t.fumbles_lost += row.fumbles_lost ?? 0;
    t.fg_made += row.fg_made ?? 0;
    t.fg_att += row.fg_att ?? 0;
    t.pat_made += row.pat_made ?? 0;
    t.pat_att += row.pat_att ?? 0;
    t.def_sacks += row.def_sacks ?? 0;
    t.def_ints += row.def_ints ?? 0;
    t.def_fumble_rec += row.def_fumble_rec ?? 0;
    t.def_tds += row.def_tds ?? 0;
    t.points_allowed += row.points_allowed ?? 0;
    totals.set(row.player_id, t);
  }

  for (const t of totals.values()) {
    t.avg_points = t.games > 0 ? t.total_points / t.games : 0;
  }
  return totals;
}

/**
 * Every active player with a game this week, joined with this week's stats
 * and this team's season-to-date stats -- the Players tab's full pool.
 *
 * Deliberately does NOT drop players this team has already used (a prior
 * week, or this week's own lineup elsewhere) -- it flags them instead via
 * `alreadyUsedByYou`, so the Players tab can show them (in red, marked
 * "Used") for stat comparison rather than hiding them outright. Anything
 * that must never offer an already-used player as a pick -- the Swap
 * dropdown on My Lineup -- filters `alreadyUsedByYou` back out itself; see
 * getEligibleCandidates below.
 */
export async function getAvailablePlayers(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
  week: number,
): Promise<AvailablePlayer[]> {
  const [unavailable, statsRes, seasonStats] = await Promise.all([
    getUnavailablePlayerIds(supabase, teamId, season, week),
    supabase
      .from("player_week_stats")
      .select("*, nfl_players(*)")
      .eq("season", season)
      .eq("week", week)
      .eq("active", true)
      .not("kickoff", "is", null),
    getSeasonToDateStats(supabase, season, week),
  ]);

  if (statsRes.error) throw statsRes.error;

  const now = Date.now();

  return (statsRes.data ?? [])
    .filter((row) => row.nfl_players)
    .map((row) => ({
      ...row.nfl_players,
      fantasy_points: row.fantasy_points,
      kickoff: row.kickoff,
      opponent: row.opponent,
      opponent_is_home: row.opponent_is_home,
      active: row.active,
      locked: row.kickoff ? new Date(row.kickoff).getTime() <= now : false,
      avg_points: seasonStats.get(row.player_id)?.avg_points ?? null,
      alreadyUsedByYou: unavailable.has(row.player_id),
      season: seasonStats.get(row.player_id) ?? null,
      pass_yards: row.pass_yards,
      pass_tds: row.pass_tds,
      pass_ints: row.pass_ints,
      rush_yards: row.rush_yards,
      rush_tds: row.rush_tds,
      receptions: row.receptions,
      rec_yards: row.rec_yards,
      rec_tds: row.rec_tds,
      fumbles_lost: row.fumbles_lost,
      fg_made: row.fg_made,
      fg_att: row.fg_att,
      pat_made: row.pat_made,
      pat_att: row.pat_att,
      def_sacks: row.def_sacks,
      def_ints: row.def_ints,
      def_fumble_rec: row.def_fumble_rec,
      def_tds: row.def_tds,
      points_allowed: row.points_allowed,
    }));
}

// Every candidate in getEligibleCandidates has, by definition, a kickoff
// that hasn't happened yet (see below) -- so this week's live fantasy_points
// is always 0 for all of them and can never break a tie. Season-to-date
// average (avg_points) is the only signal that actually distinguishes
// candidates before kickoff, so that's the sort key -- with last name as a
// human-friendly tiebreaker for the (common, e.g. Week 1 or an unproven
// rookie) case where nobody has a season history yet either.
//
// "Last name" is derived from full_name rather than stored separately --
// nflverse (and this app's schema) only ever carries one combined name
// field. This strips a trailing suffix (Jr., Sr., II, III, IV, V) and takes
// the final remaining word, e.g. "Joe Milton III" -> "Milton". It's a
// heuristic, not a real name-parsing library, so a multi-word last name
// (e.g. "Amon-Ra St. Brown") will sort on "Brown" rather than "St. Brown" --
// good enough for scanning a swap list, not meant to be exact.
const SUFFIX_RE = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const DST_RE = /^(.*)\s+D\/ST$/i;
function lastNameKey(fullName: string): string {
  const trimmed = fullName.trim();
  // Defenses are named "SF D/ST", "KC D/ST", etc. (see refresh_scores.py) --
  // there's no real "last name" there, so key on the team code instead of
  // landing every defense on the same "d/st" key.
  const dst = trimmed.match(DST_RE);
  if (dst) return dst[1].toLowerCase();
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1 && SUFFIX_RE.test(parts[parts.length - 1])) parts.pop();
  return (parts[parts.length - 1] ?? trimmed).toLowerCase();
}

/**
 * Candidates actually selectable for a swap into a given slot: eligible
 * players (see getAvailablePlayers) narrowed to the slot's allowed
 * positions, to games that haven't started yet (a locked player can be
 * viewed on the Players tab, but can never be swapped in), and to players
 * this team hasn't already used (getAvailablePlayers itself now includes
 * those -- flagged via alreadyUsedByYou -- for the Players tab's stat
 * comparison view, so this is the one place that has to filter them back
 * out: an already-used player must never be offered as a swap-in option).
 * Sorted by season-to-date average points (best first, no-history players
 * last), with last name as an alphabetical tiebreaker -- see lastNameKey
 * above for why this week's live points isn't a useful sort key here.
 */
export async function getEligibleCandidates(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
  week: number,
  positions: Position[],
): Promise<AvailablePlayer[]> {
  const players = await getAvailablePlayers(supabase, teamId, season, week);
  return players
    .filter(
      (p) =>
        positions.includes(p.position) && !p.locked && !p.alreadyUsedByYou,
    )
    .sort((a, b) => {
      if (a.avg_points == null && b.avg_points != null) return 1;
      if (a.avg_points != null && b.avg_points == null) return -1;
      if (
        a.avg_points != null &&
        b.avg_points != null &&
        a.avg_points !== b.avg_points
      ) {
        return b.avg_points - a.avg_points;
      }
      return lastNameKey(a.full_name).localeCompare(lastNameKey(b.full_name));
    });
}

export async function getCurrentWeek(
  supabase: SupabaseClient,
  season: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("player_week_stats")
    .select("week")
    .eq("season", season)
    .not("kickoff", "is", null)
    .lte("kickoff", new Date().toISOString())
    .order("week", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data && data.length > 0 ? data[0].week : 1;
}

export async function getLatestFilledWeek(
  supabase: SupabaseClient,
  teamId: string,
  season: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("lineups")
    .select("week")
    .eq("team_id", teamId)
    .eq("season", season)
    .order("week", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data && data.length > 0 ? data[0].week : 1;
}

export async function getLeagueTeams(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<LeagueTeamOption[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, team_name, logo_emoji, logo_image_url")
    .eq("league_id", leagueId)
    .order("team_name");

  if (error) throw error;
  return data ?? [];
}

export async function getCommissionedLeagues(
  supabase: SupabaseClient,
): Promise<CommissionedLeague[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, season")
    .eq("commissioner_user_id", user.id);

  if (error) throw error;
  return data ?? [];
}

export async function getCommissionerTeams(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<CommissionerTeamRow[]> {
  const { data: teams, error } = await supabase
    .from("teams")
    .select("id, team_name, owner_user_id")
    .eq("league_id", leagueId)
    .order("team_name");

  if (error) throw error;
  if (!teams || teams.length === 0) return [];

  const ownerIds = [...new Set(teams.map((t) => t.owner_user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", ownerIds);

  if (profilesError) throw profilesError;
  const emailById = new Map(
    (profiles ?? []).map((p) => [p.id, p.email as string]),
  );

  return teams.map((t) => ({
    ...t,
    owner_email: emailById.get(t.owner_user_id) ?? null,
  }));
}

export async function getAllProfiles(
  supabase: SupabaseClient,
): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, requested_team_name")
    .order("email");

  if (error) throw error;
  return data ?? [];
}

export async function createTeam(
  supabase: SupabaseClient,
  leagueId: string,
  teamName: string,
  ownerUserId: string,
): Promise<void> {
  const { error } = await supabase
    .from("teams")
    .insert({
      league_id: leagueId,
      team_name: teamName,
      owner_user_id: ownerUserId,
    });
  if (error) throw error;
}

export async function reassignTeamOwner(
  supabase: SupabaseClient,
  teamId: string,
  newOwnerUserId: string,
): Promise<void> {
  const { error } = await supabase
    .from("teams")
    .update({ owner_user_id: newOwnerUserId })
    .eq("id", teamId);
  if (error) throw error;
}

export async function renameTeam(
  supabase: SupabaseClient,
  teamId: string,
  teamName: string,
): Promise<void> {
  const { error } = await supabase
    .from("teams")
    .update({ team_name: teamName })
    .eq("id", teamId);
  if (error) throw error;
}

export async function getLeagueMessages(
  supabase: SupabaseClient,
  leagueId: string,
  limit = 200,
): Promise<LeagueMessage[]> {
  const { data: messages, error } = await supabase
    .from("league_messages")
    .select("id, league_id, user_id, body, created_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!messages || messages.length === 0) return [];

  const userIds = [...new Set(messages.map((m) => m.user_id))];
  const [
    { data: profiles, error: profilesError },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name").in("id", userIds),
    supabase
      .from("teams")
      .select("owner_user_id, logo_emoji, logo_image_url")
      .in("owner_user_id", userIds),
  ]);

  if (profilesError) throw profilesError;
  if (teamsError) throw teamsError;
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const teamByOwnerId = new Map((teams ?? []).map((t) => [t.owner_user_id, t]));

  return messages
    .map((m) => {
      const author = profileById.get(m.user_id);
      const authorTeam = teamByOwnerId.get(m.user_id);
      const author_name =
        author?.full_name ||
        author?.email ||
        `Family member (${m.user_id.slice(0, 8)})`;
      return {
        ...m,
        author_name,
        author_team_logo_emoji: authorTeam?.logo_emoji ?? null,
        author_team_logo_image_url: authorTeam?.logo_image_url ?? null,
      };
    })
    .reverse(); // oldest first for rendering
}

export async function postLeagueMessage(
  supabase: SupabaseClient,
  leagueId: string,
  body: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to post a message.");

  const { error } = await supabase
    .from("league_messages")
    .insert({ league_id: leagueId, user_id: user.id, body });
  if (error) throw error;
}
