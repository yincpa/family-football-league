import { createClient } from "@/lib/supabase/server";
import { getTeamLineup, getMyTeamId } from "@/lib/queries";
import { ROSTER_SLOTS } from "@/lib/types";
import RosterTable, { type RosterRow } from "@/components/RosterTable";
import { TeamLogo } from "@/components/TeamLogoEditor";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; season?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const seasonDefaulted = sp.season === undefined;
  const weekDefaulted = sp.week === undefined;
  const season = Number(sp.season ?? new Date().getFullYear());
  const week = Number(sp.week ?? 1);

  const supabase = await createClient();
  // The middleware already requires a logged-in user to reach this page —
  // ?team= still works as an override (e.g. a commissioner peeking at
  // another team in the same league), but normally we resolve the caller's
  // own team automatically instead of needing it pasted into the URL.
  const teamId = sp.team ?? (await getMyTeamId(supabase)) ?? "";
  const lineup = teamId ? await getTeamLineup(supabase, teamId, season, week) : [];

  // The team being viewed isn't necessarily "my" team (?team= lets a
  // commissioner peek at someone else's), so this is looked up by teamId
  // directly rather than reusing getMyTeam -- same read either way, "league
  // members can read teams" RLS covers anyone in the same league.
  const { data: viewedTeam } = teamId
    ? await supabase.from("teams").select("team_name, logo_emoji, logo_image_url").eq("id", teamId).maybeSingle()
    : { data: null };

  type StatsRow = {
    player_id: string;
    fantasy_points: number;
    kickoff: string | null;
    nfl_players: { full_name: string; headshot_url: string | null } | { full_name: string; headshot_url: string | null }[] | null;
  };

  const playerIds = lineup.map((l) => l.player_id).filter(Boolean) as string[];
  let playerDetails: Record<
    string,
    { full_name: string; fantasy_points: number; kickoff: string | null; headshot_url: string | null }
  > = {};

  if (playerIds.length > 0) {
    const { data } = await supabase
      .from("player_week_stats")
      .select("player_id, fantasy_points, kickoff, nfl_players(full_name, headshot_url)")
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
            headshot_url: joined?.headshot_url ?? null,
          },
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
      locked,
    };
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      {viewedTeam && (
        <div className="flex items-center gap-2 mb-1">
          <TeamLogo
            emoji={viewedTeam.logo_emoji}
            imageUrl={viewedTeam.logo_image_url}
            teamName={viewedTeam.team_name}
            size={28}
          />
          <span className="text-sm font-medium text-neutral-600">{viewedTeam.team_name}</span>
        </div>
      )}
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
        Click &quot;Swap&quot; on any editable slot to change it — a slot locks once that player&apos;s
        game has started, and you can only swap in a player who hasn&apos;t been used before and whose
        own game hasn&apos;t started.
      </p>

      {!teamId && (
        <p className="text-sm text-amber-600 border border-amber-300 rounded-md p-3 mb-4">
          No team is assigned to your account yet. Visit{" "}
          <a href="/account" className="underline underline-offset-4">
            your account page
          </a>{" "}
          for the ID to give the commissioner.
        </p>
      )}

      {teamId && <RosterTable teamId={teamId} season={season} week={week} initialRows={initialRows} />}
    </main>
  );
}
