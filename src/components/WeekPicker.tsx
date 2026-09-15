"use client";

import { useRouter } from "next/navigation";

/**
 * Dropdown for switching which week a lineup page shows, capped at
 * maxWeek. Shared by both League Lineups (maxWeek = getCurrentWeek, the
 * most recent week that's started) and My Lineup (maxWeek =
 * getLatestFilledWeek, the latest week auto-fill has opened up) -- each
 * page passes its own basePath so this doesn't need to know which one
 * it's on. Same plain-<select> pattern as TeamPicker, for the same
 * reasons: least code, works everywhere, and keeps the page itself a
 * Server Component driven entirely by URL search params.
 */
export default function WeekPicker({
  selectedWeek,
  maxWeek,
  teamId,
  season,
  basePath,
}: {
  selectedWeek: number;
  maxWeek: number;
  teamId: string;
  season: number;
  basePath: string;
}) {
  const router = useRouter();
  const weeks: number[] = [];
  for (let w = 1; w <= maxWeek; w++) weeks.push(w);

  return (
    <select
      value={selectedWeek}
      onChange={(e) =>
        router.push(
          `${basePath}?team=${teamId}&season=${season}&week=${e.target.value}`,
        )
      }
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
