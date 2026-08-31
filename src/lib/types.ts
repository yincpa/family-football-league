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
}

export interface PlayerWeekStats {
  player_id: string;
  season: number;
  week: number;
  opponent: string | null;
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
 * in a raw user id. */
export interface Profile {
  id: string;
  email: string | null;
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
