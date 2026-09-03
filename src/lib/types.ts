// Shared types mirroring supabase/schema.sql. Keep these in sync with the
// database — if the schema changes, update here too.

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";
export type Slot = "QB" | "RB1" | "RB2" | "WR1" | "WR2" | "TE" | "FLEX" | "K" | "DST";

export const ROSTER_SLOTS: Slot[] = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX", "K", "DST"];

export const SLOT_POSITIONS: Record<Slot, Position[]> = {
  QB: ["QB"],
  RB1: ["RB"],
  RB2: ["RB"],
  WR1: ["WR"],
  WR2: ["WR"],
  TE: ["TE"],
  FLEX: ["RB", "WR", "TE"],
  K: ["K"],
  DST: ["DST"],
};

export interface NflPlayer {
  player_id: string;
  full_name: string;
  position: Position;
  nfl_team: string;
  headshot_url: string | null; // from nflverse's roster data; null for obscure/deep-bench players
}

export interface PlayerWeekStats {
  player_id: string;
  season: number;
  week: number;
  opponent: string | null;
  opponent_is_home: boolean | null; // true = this player's team hosts `opponent`; false = they're on the road
  kickoff: string | null; // ISO timestamp, null = bye week
  game_final: boolean;
  active: boolean;
  fantasy_points: number;
  updated_at: string;
}

export interface Team {
  id: string;
  league_id: string;
  owner_user_id: string;
  team_name: string;
}

/** A team's logo, however it's set: an emoji character in logo_emoji, an
 * uploaded photo's URL in logo_image_url, or neither yet. The app treats
 * these as mutually exclusive -- setting one always clears the other -- so
 * anywhere a logo renders, the rule is: image if present, else emoji, else
 * a plain fallback (team_name's first letter). */
export interface TeamLogo {
  id: string;
  logo_emoji: string | null;
  logo_image_url: string | null;
}

/** A league the logged-in user commissions (leagues.commissioner_user_id
 * matches them), for the /commissioner view. */
export interface CommissionedLeague {
  id: string;
  name: string;
  season: number;
}

/** A team as shown on the commissioner view -- the owner's email comes
 * from `profiles` (a mirror of auth.users, which isn't queryable directly
 * from the browser), joined client-side rather than via a DB foreign key
 * since owner_user_id and profiles.id both reference auth.users
 * independently, not each other. */
export interface CommissionerTeamRow {
  id: string;
  team_name: string;
  owner_user_id: string;
  owner_email: string | null;
}

/** A signed-up account, for the commissioner's owner-picker dropdown --
 * lets the commissioner choose a family member by email instead of typing
 * in a raw user id. full_name and requested_team_name are collected at
 * signup time (see the signup form) so the commissioner can identify an
 * unrecognized email and knows what team name to give them, even before
 * a team has been created. */
export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  requested_team_name: string | null;
}

export interface Lineup {
  id: string;
  team_id: string;
  season: number;
  week: number;
  slot: Slot;
  player_id: string | null;
  is_auto_filled: boolean;
}

export interface StandingsRow {
  team_id: string;
  league_id: string;
  team_name: string;
  total_points: number;
}

/** One team's points for one week -- from the `team_week_points` view. Only
 * has a row for a team/week once that team has a lineup for that week (see
 * getWeeklyTeamPoints), which is what makes "season-to-date" work for free:
 * a week nobody's been auto-filled for yet just doesn't appear. */
export interface WeeklyTeamPoints {
  team_id: string;
  week: number;
  points: number;
}

/** One message in a league's chat, joined with the author's display info
 * (email/full_name) client-side -- same "two queries + merge" pattern used
 * for CommissionerTeamRow's owner_email, since league_messages.user_id and
 * profiles.id both reference auth.users independently. */
export interface LeagueMessage {
  id: string;
  league_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string; // full_name, falling back to email, falling back to a short id
  author_team_logo_emoji: string | null;
  author_team_logo_image_url: string | null;
}
/** One weekly bonus award earned by a team -- "mvp" (started the NFL
 * player who scored the most fantasy points that week -- multiple teams
 * can win this together, since this league has no draft exclusivity and
 * more than one team can independently roster the same player) or "gm"
 * (highest raw lineup total that week, before bonuses -- also multi-winner
 * on an exact tie). Only appears once a week is fully final -- see
 * refresh_scores.py's compute_weekly_awards(). mvp_player_id is only set
 * on "mvp" rows. */
export interface WeeklyAward {
  team_id: string;
  week: number;
  award_type: "mvp" | "gm";
  bonus_points: number;
  mvp_player_id: string | null;
}

/** A player joined with this week's stats, annotated with lock status —
 * the shape the "available players" tab and roster editor both use.
 *
 * The raw box-score fields (pass_yards, receptions, def_sacks, etc.) are
 * only ever a subset for any given player -- a QB never has fg_made, a
 * kicker never has pass_yards -- so unused ones come back null rather than
 * 0, to distinguish "doesn't apply to this position" from "did nothing." */
export interface AvailablePlayer extends NflPlayer {
  fantasy_points: number;
  kickoff: string | null;
  opponent: string | null; // this week's opponent team code, null on a bye
  opponent_is_home: boolean | null; // true = home game ("vs OPP"), false = road game ("@ OPP")
  active: boolean;
  locked: boolean; // kickoff has already passed
  avg_points: number | null; // season-to-date average over prior weeks, null if no history yet
  pass_yards: number | null;
  pass_tds: number | null;
  pass_ints: number | null;
  rush_yards: number | null;
  rush_tds: number | null;
  receptions: number | null;
  rec_yards: number | null;
  rec_tds: number | null;
  fumbles_lost: number | null;
  fg_made: number | null;
  fg_att: number | null;
  pat_made: number | null;
  pat_att: number | null;
  def_sacks: number | null;
  def_ints: number | null;
  def_fumble_rec: number | null;
  def_tds: number | null;
  points_allowed: number | null;
}

/** A team in a league, for the League Lineups team-picker dropdown -- just
 * enough to render a name (and logo, where a spot for one exists) in a
 * <select>, not the full Team shape (which also carries league_id/
 * owner_user_id that this doesn't need). */
export interface LeagueTeamOption {
  id: string;
  team_name: string;
  logo_emoji: string | null;
  logo_image_url: string | null;
}
