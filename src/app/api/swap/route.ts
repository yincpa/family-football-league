// Handles a lineup swap: change one roster slot to a different player.
//
// The `lineups` UPDATE RLS policy already enforces the two most important
// rules at the database level — the caller must own the team, and BOTH the
// slot's current player and the new player must not have started yet
// (Postgres applies the policy's USING clause to the new row too when no
// WITH CHECK is given, so the "new player hasn't started" side is covered
// for free). Everything else — the new player being active/not on a bye,
// eligible for this slot's position, not already used by this team in an
// earlier week, and not already sitting in a different slot this same
// week — isn't expressible as RLS, so it's checked here before the update,
// with clear error messages instead of a generic RLS denial.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROSTER_SLOTS, SLOT_POSITIONS, type Slot } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { teamId, season, week, slot, playerId } = body as {
    teamId?: string;
    season?: number;
    week?: number;
    slot?: string;
    playerId?: string;
  };

  if (!teamId || !season || !week || !slot || !playerId) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!ROSTER_SLOTS.includes(slot as Slot)) {
    return NextResponse.json({ error: "Not a valid roster slot." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!team) {
    return NextResponse.json({ error: "That's not your team." }, { status: 403 });
  }

  const { data: currentLineup } = await supabase
    .from("lineups")
    .select("player_id")
    .eq("team_id", teamId)
    .eq("season", season)
    .eq("week", week)
    .eq("slot", slot)
    .maybeSingle();

  if (!currentLineup) {
    return NextResponse.json({ error: "That lineup slot doesn't exist yet." }, { status: 404 });
  }

  const now = Date.now();

  if (currentLineup.player_id) {
    const { data: currentStats } = await supabase
      .from("player_week_stats")
      .select("kickoff")
      .eq("player_id", currentLineup.player_id)
      .eq("season", season)
      .eq("week", week)
      .maybeSingle();
    if (currentStats?.kickoff && new Date(currentStats.kickoff).getTime() <= now) {
      return NextResponse.json(
        { error: "That slot is locked — the current player's game has already started." },
        { status: 409 }
      );
    }
  }

  if (playerId === currentLineup.player_id) {
    return NextResponse.json({ error: "That player is already in this slot." }, { status: 400 });
  }

  type CandidateRow = {
    kickoff: string | null;
    active: boolean;
    nfl_players: { position: string } | { position: string }[] | null;
  };

  const { data: candidate } = await supabase
    .from("player_week_stats")
    .select("kickoff, active, nfl_players(position)")
    .eq("player_id", playerId)
    .eq("season", season)
    .eq("week", week)
    .maybeSingle<CandidateRow>();

  if (!candidate) {
    return NextResponse.json({ error: "That player isn't in this week's pool." }, { status: 400 });
  }
  if (!candidate.active) {
    return NextResponse.json({ error: "That player is inactive this week." }, { status: 400 });
  }
  if (!candidate.kickoff) {
    return NextResponse.json({ error: "That player is on a bye this week." }, { status: 400 });
  }
  if (new Date(candidate.kickoff).getTime() <= now) {
    return NextResponse.json({ error: "That player's game has already started." }, { status: 400 });
  }

  const candidatePosition = Array.isArray(candidate.nfl_players)
    ? candidate.nfl_players[0]?.position
    : candidate.nfl_players?.position;
  if (!candidatePosition || !SLOT_POSITIONS[slot as Slot].includes(candidatePosition as never)) {
    return NextResponse.json({ error: `That player isn't eligible for ${slot}.` }, { status: 400 });
  }

  const { data: usedBefore } = await supabase
    .from("lineups")
    .select("id")
    .eq("team_id", teamId)
    .eq("season", season)
    .eq("player_id", playerId)
    .lt("week", week)
    .limit(1);
  if (usedBefore && usedBefore.length > 0) {
    return NextResponse.json(
      { error: "This team has already used that player in a previous week." },
      { status: 400 }
    );
  }

  const { data: dupThisWeek } = await supabase
    .from("lineups")
    .select("slot")
    .eq("team_id", teamId)
    .eq("season", season)
    .eq("week", week)
    .eq("player_id", playerId)
    .neq("slot", slot)
    .limit(1);
  if (dupThisWeek && dupThisWeek.length > 0) {
    return NextResponse.json(
      { error: "That player is already in another slot this week." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("lineups")
    .update({ player_id: playerId, is_auto_filled: false, updated_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("season", season)
    .eq("week", week)
    .eq("slot", slot)
    .select();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "The database rejected that update — the slot may no longer be editable." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, lineup: updated[0] });
}
