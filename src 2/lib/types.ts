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
 * the shape the "available players" tab and roster editor both use. */
export interface AvailablePlayer extends NflPlayer {
  fantasy_points: number;
  kickoff: string | null;
  active: boolean;
  locked: boolean; // kickoff has already passed
}
