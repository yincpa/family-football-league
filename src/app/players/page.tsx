"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvailablePlayers, getMyTeamId } from "@/lib/queries";
import type { AvailablePlayer } from "@/lib/types";

type SortKey = "full_name" | "position" | "nfl_team" | "fantasy_points" | "locked";

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

  const sorted = useMemo(() => {
    const copy = [...players];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : typeof av === "boolean" && typeof bv === "boolean"
          ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv));
      return sortDesc ? -cmp : cmp;
    });
    return copy;
  }, [players, sortKey, sortDesc]);

  function headerClick(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: "full_name", label: "Player" },
    { key: "position", label: "Pos" },
    { key: "nfl_team", label: "Team" },
    { key: "fantasy_points", label: `Wk ${week} Pts` },
    { key: "locked", label: "Status" },
  ];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold mb-1">Available Players</h1>
      <p className="text-xs font-mono text-neutral-400 mb-2">
        Season {season} · Week {week}
        {(seasonDefaulted || weekDefaulted) && (
          <span className="text-amber-600"> (defaulted — add &amp;season=…&amp;week=… to the URL to pin this)</span>
        )}
      </p>
      <p className="text-sm text-neutral-500 mb-6">
        Players not yet used by this team, active this week. Click a column to sort.
      </p>

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
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 text-sm text-neutral-500">
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => headerClick(c.key)}
                  className="py-2 pr-4 cursor-pointer select-none hover:text-neutral-800"
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
                <td className="py-2 pr-4 font-medium">{p.full_name}</td>
                <td className="py-2 pr-4">{p.position}</td>
                <td className="py-2 pr-4">{p.nfl_team}</td>
                <td className="py-2 pr-4 tabular-nums">{p.fantasy_points.toFixed(2)}</td>
                <td className="py-2">
                  {p.locked ? (
                    <span className="text-xs text-neutral-400">locked</span>
                  ) : (
                    <span className="text-xs text-emerald-600">available</span>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-400">
                  No eligible players found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
