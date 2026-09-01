"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvailablePlayers, getMyTeamId } from "@/lib/queries";
import type { AvailablePlayer, Position } from "@/lib/types";

type SortKey = keyof AvailablePlayer;

// Roster-slot-shaped tabs, not raw NFL positions -- FLEX is a real slot a
// family member fills, so it gets its own tab (RB/WR/TE pooled together)
// rather than making them flip between three tabs to compare FLEX options.
const POSITION_TABS = ["All", "QB", "RB", "WR", "TE", "FLEX", "K", "DST"] as const;
type PositionTab = (typeof POSITION_TABS)[number];

function tabPositions(tab: PositionTab): Position[] | null {
  if (tab === "All") return null; // no filter
  if (tab === "FLEX") return ["RB", "WR", "TE"];
  return [tab];
}

// The stat columns worth showing side-by-side for each position -- this is
// the actual "who do I start" comparison, so only fields relevant to that
// position appear (a kicker's FG/PAT, not a QB's passing line, etc).
// Shown only when a single specific position tab is active; "All" and
// "FLEX" mix positions where these columns wouldn't line up meaningfully.
const POSITION_STAT_COLUMNS: Partial<Record<Position, { key: SortKey; label: string }[]>> = {
  QB: [
    { key: "pass_yards", label: "Pass Yds" },
    { key: "pass_tds", label: "Pass TD" },
    { key: "pass_ints", label: "INT" },
    { key: "rush_yards", label: "Rush Yds" },
    { key: "rush_tds", label: "Rush TD" },
  ],
  RB: [
    { key: "rush_yards", label: "Rush Yds" },
    { key: "rush_tds", label: "Rush TD" },
    { key: "receptions", label: "Rec" },
    { key: "rec_yards", label: "Rec Yds" },
    { key: "rec_tds", label: "Rec TD" },
  ],
  WR: [
    { key: "receptions", label: "Rec" },
    { key: "rec_yards", label: "Rec Yds" },
    { key: "rec_tds", label: "Rec TD" },
    { key: "rush_yards", label: "Rush Yds" },
  ],
  TE: [
    { key: "receptions", label: "Rec" },
    { key: "rec_yards", label: "Rec Yds" },
    { key: "rec_tds", label: "Rec TD" },
  ],
  K: [
    { key: "fg_made", label: "FG" },
    { key: "pat_made", label: "PAT" },
  ],
  DST: [
    { key: "def_sacks", label: "Sacks" },
    { key: "def_ints", label: "INT" },
    { key: "def_fumble_rec", label: "FR" },
    { key: "def_tds", label: "TD" },
    { key: "points_allowed", label: "Pts Allow" },
  ],
};

function renderCell(p: AvailablePlayer, key: SortKey) {
  switch (key) {
        case "full_name":
      return (
        <span className="flex items-center gap-2">
          {p.headshot_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external nflverse/NFL.com URLs, not local assets.
            <img
              src={p.headshot_url}
              alt={p.full_name}
              className="w-6 h-6 rounded-full object-cover bg-neutral-100 shrink-0"
            />
          ) : (
            <span className="w-6 h-6 rounded-full bg-neutral-100 shrink-0 inline-block" />
          )}
          {p.full_name}
        </span>
      );
    case "position":
      return p.position;
    case "nfl_team":
      return p.nfl_team;
    case "fantasy_points":
      return p.fantasy_points.toFixed(2);
    case "avg_points":
      return p.avg_points != null ? p.avg_points.toFixed(2) : "—";
    case "locked":
      return p.locked ? (
        <span className="text-xs text-neutral-400">locked</span>
      ) : (
        <span className="text-xs text-emerald-600">available</span>
      );
    // Made/attempted pairs read better as "3/4" than as two separate columns.
    case "fg_made":
      return `${p.fg_made ?? 0}/${p.fg_att ?? 0}`;
    case "pat_made":
      return `${p.pat_made ?? 0}/${p.pat_att ?? 0}`;
    default: {
      const v = p[key];
      if (typeof v === "number") return Math.round(v).toString();
      return v == null ? "—" : String(v);
    }
  }
}

function PlayersTable() {
  const params = useSearchParams();
  // ?team=<uuid> still works as an override; normally we resolve the
  // logged-in user's own team automatically instead.
  const teamIdParam = params.get("team") ?? "";
  const seasonDefaulted = params.get("season") === null;
  const weekDefaulted = params.get("week") === null;
  const season = Number(params.get("season") ?? new Date().getFullYear());
  const week = Number(params.get("week") ?? 1);

  const [teamId, setTeamId] = useState<string>("");
  const [players, setPlayers] = useState<AvailablePlayer[]>([]);
  const [positionTab, setPositionTab] = useState<PositionTab>("All");
  const [sortKey, setSortKey] = useState<SortKey>("fantasy_points");
  const [sortDesc, setSortDesc] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Loading/error state is intentionally set from inside this effect as
    // a fetch-on-param-change pattern — fine for a client component like
    // this one (no Server Component purity constraints apply here).
    let cancelled = false;
    const supabase = createClient();

    async function run() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const resolvedTeamId = teamIdParam || (await getMyTeamId(supabase)) || "";
        if (cancelled) return;
        setTeamId(resolvedTeamId);
        if (!resolvedTeamId) return;
        const data = await getAvailablePlayers(supabase, resolvedTeamId, season, week);
        if (!cancelled) setPlayers(data);
      } catch (e) {
        if (!cancelled) setErrorMsg(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();

    return () => {
      cancelled = true;
    };
  }, [teamIdParam, season, week]);

  const filtered = useMemo(() => {
    const allowed = tabPositions(positionTab);
    return allowed ? players.filter((p) => allowed.includes(p.position)) : players;
  }, [players, positionTab]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Null stats (a field that doesn't apply to this position, or no
      // season history yet) sort to the bottom regardless of direction,
      // rather than falling into the string-compare case below.
      const cmp =
        av == null && bv == null
          ? 0
          : av == null
          ? 1
          : bv == null
          ? -1
          : typeof av === "number" && typeof bv === "number"
          ? av - bv
          : typeof av === "boolean" && typeof bv === "boolean"
          ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv));
      return sortDesc ? -cmp : cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDesc]);

  function headerClick(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  // Single-position tabs get that position's relevant stat columns inlined
  // between Team and the points columns; "All"/"FLEX" mix positions so
  // those columns are skipped there (nothing would line up meaningfully).
  const singlePosition = positionTab !== "All" && positionTab !== "FLEX" ? (positionTab as Position) : null;
  const statColumns = singlePosition ? POSITION_STAT_COLUMNS[singlePosition] ?? [] : [];

  const columns: { key: SortKey; label: string }[] = [
    { key: "full_name", label: "Player" },
    ...(singlePosition ? [] : [{ key: "position" as SortKey, label: "Pos" }]),
    { key: "nfl_team", label: "Team" },
    ...statColumns,
    { key: "fantasy_points", label: `Wk ${week} Pts` },
    { key: "avg_points", label: "Avg Pts" },
    { key: "locked", label: "Status" },
  ];

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold mb-1">Available Players</h1>
      <p className="text-xs font-mono text-neutral-400 mb-2">
        Season {season} · Week {week}
        {(seasonDefaulted || weekDefaulted) && (
          <span className="text-amber-600"> (defaulted — add &amp;season=…&amp;week=… to the URL to pin this)</span>
        )}
      </p>
      <p className="text-sm text-neutral-500 mb-4">
        Players not yet used by this team, active this week. Pick a position to compare, click a column
        header to sort.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {POSITION_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setPositionTab(tab)}
            className={
              "text-sm px-3 py-1 rounded-full border " +
              (positionTab === tab
                ? "bg-neutral-900 text-white border-neutral-900"
                : "border-neutral-300 text-neutral-600 hover:border-neutral-500")
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {!loading && !teamId && (
        <p className="text-sm text-amber-600 border border-amber-300 rounded-md p-3 mb-4">
          No team is assigned to your account yet. Visit{" "}
          <a href="/account" className="underline underline-offset-4">
            your account page
          </a>{" "}
          for the ID to give the commissioner.
        </p>
      )}
      {errorMsg && <p className="text-sm text-red-600 mb-4">{errorMsg}</p>}
      {loading && <p className="text-sm text-neutral-400 mb-4">Loading…</p>}

      {teamId && !loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 text-sm text-neutral-500">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => headerClick(c.key)}
                    className="py-2 pr-4 cursor-pointer select-none hover:text-neutral-800 whitespace-nowrap"
                  >
                    {c.label}
                    {sortKey === c.key ? (sortDesc ? " ↓" : " ↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.player_id} className="border-b border-neutral-100">
                  {columns.map((c) => (
                    <td key={c.key} className="py-2 pr-4 tabular-nums whitespace-nowrap">
                      {renderCell(p, c.key)}
                    </td>
                  ))}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="py-6 text-center text-neutral-400">
                    No eligible players found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function PlayersPage() {
  return (
    <Suspense fallback={<main className="p-6 text-neutral-400">Loading…</main>}>
      <PlayersTable />
    </Suspense>
  );
}
