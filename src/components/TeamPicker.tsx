"use client";

import { useRouter } from "next/navigation";
import type { LeagueTeamOption } from "@/lib/types";

/**
 * Dropdown for switching which team's lineup the League Lineups page shows.
 * A plain <select> rather than a fancier menu -- this is a family app, and
 * a native select is the least code that works well on both desktop and
 * phone, and needs no extra styling to look right in a <select>'s option
 * list (an uploaded logo photo can't render inside an <option> anyway --
 * that's shown separately, next to the page heading, once a team is
 * picked). Navigates by changing the URL's ?team= (season/week carry over
 * unchanged), so the page itself stays a Server Component that just reads
 * searchParams -- no client-side data fetching needed here.
 */
export default function TeamPicker({
  teams,
  selectedTeamId,
  season,
  week,
}: {
  teams: LeagueTeamOption[];
  selectedTeamId: string;
  season: number;
  week: number;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedTeamId}
      onChange={(e) => router.push(`/league-lineups?team=${e.target.value}&season=${season}&week=${week}`)}
      className="text-sm border border-neutral-300 rounded-md px-3 py-1.5 bg-white"
    >
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.logo_emoji ? `${t.logo_emoji} ` : ""}
          {t.team_name}
        </option>
      ))}
    </select>
  );
}
