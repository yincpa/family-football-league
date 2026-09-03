"use client";

import { useRouter } from "next/navigation";

/**
 * Dropdown for switching which week's lineup the League Lineups page
 * shows -- capped at maxWeek (the most recent week whose games have
 * actually started, see getCurrentWeek() in queries.ts) so you can look
 * back at any past week's locked-in lineup and scores, but can't jump
 * ahead to a future week that hasn't happened yet. Navigates by changing
 * the URL's ?week= (team/season carry over unchanged), same pattern as
 * TeamPicker.
 */
export default function WeekPicker({
  selectedWeek,
  maxWeek,
  teamId,
  season,
}: {
  selectedWeek: number;
  maxWeek: number;
  teamId: string;
  season: number;
}) {
  const router = useRouter();
  const weeks: number[] = [];
  for (let w = 1; w <= maxWeek; w++) weeks.push(w);

  return (
    <select
      value={selectedWeek}
      onChange={(e) => router.push(`/league-lineups?team=${teamId}&season=${season}&week=${e.target.value}`)}
      className="text-sm border border-neutral-300 rounded-md px-3 py-1.5 bg-white"
    >
      {weeks.map((w) => (
        <option key={w} value={w}>
          Week {w}
        </option>
      ))}
    </select>
  );
}
