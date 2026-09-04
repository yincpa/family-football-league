"use client";

import { Fragment, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getEligibleCandidates } from "@/lib/queries";
import { ROSTER_SLOTS, SLOT_POSITIONS, type Slot, type AvailablePlayer } from "@/lib/types";

export type RosterRow = {
  slot: Slot;
  playerId: string | null;
  fullName: string | null;
  points: number | null;
  kickoff: string | null;
  headshotUrl: string | null;
  opponent: string | null;
  opponentIsHome: boolean | null;
  locked: boolean;
};

// "vs SEA" for a home game, "@ SEA" for a road game, or null on a bye (no
// opponent that week) -- shared by the main roster rows and the swap
// candidate list below, since both need the same "who are they playing"
// context to help decide whether to start someone.
function formatOpponent(opponent: string | null, isHome: boolean | null): string | null {
  if (!opponent) return null;
  return isHome ? `vs ${opponent}` : `@ ${opponent}`;
}

// Small, round, falls back to a plain gray circle (not an error icon) if a
// player has no headshot on file -- true for a handful of obscure/deep-bench
// players nflverse doesn't have a photo for.
function Headshot({ url, alt, size = 28 }: { url: string | null; alt: string; size?: number }) {
  if (!url) {
    return (
      <span
        style={{ width: size, height: size }}
        className="rounded-full bg-neutral-100 shrink-0 inline-block"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external nflverse/NFL.com URLs, not local assets.
    <img
      src={url}
      alt={alt}
      style={{ width: size, height: size }}
      className="rounded-full object-cover bg-neutral-100 shrink-0"
    />
  );
}

export default function RosterTable({
  teamId,
  season,
  week,
  initialRows,
  readOnly = false,
}: {
  teamId: string;
  season: number;
  week: number;
  initialRows: RosterRow[];
  // True on the League Lineups page (viewing a teammate's lineup) -- hides
  // the Swap column entirely rather than showing a button that would just
  // fail server-side, since /api/swap already rejects edits to a team you
  // don't own.
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<RosterRow[]>(initialRows);
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [candidates, setCandidates] = useState<AvailablePlayer[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [swappingSlot, setSwappingSlot] = useState<Slot | null>(null);
  const [errorBySlot, setErrorBySlot] = useState<Partial<Record<Slot, string>>>({});

  async function toggleSlot(slot: Slot) {
    if (openSlot === slot) {
      setOpenSlot(null);
      return;
    }
    setOpenSlot(slot);
    setErrorBySlot((prev) => ({ ...prev, [slot]: undefined }));
    setLoadingCandidates(true);
    try {
      const supabase = createClient();
      const list = await getEligibleCandidates(supabase, teamId, season, week, SLOT_POSITIONS[slot]);
      setCandidates(list);
    } catch (e) {
      setErrorBySlot((prev) => ({ ...prev, [slot]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function handleSwap(slot: Slot, candidate: AvailablePlayer) {
    setSwappingSlot(slot);
    setErrorBySlot((prev) => ({ ...prev, [slot]: undefined }));
    try {
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, season, week, slot, playerId: candidate.player_id }),
      });
      const result = await res.json();
      if (!res.ok) {
        setErrorBySlot((prev) => ({ ...prev, [slot]: result.error ?? "That swap didn't go through." }));
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.slot === slot
            ? {
                slot,
                playerId: candidate.player_id,
                fullName: candidate.full_name,
                points: candidate.fantasy_points,
                kickoff: candidate.kickoff,
                headshotUrl: candidate.headshot_url,
                opponent: candidate.opponent,
                opponentIsHome: candidate.opponent_is_home,
                locked: candidate.locked,
              }
            : r
        )
      );
      setOpenSlot(null);
    } catch (e) {
      setErrorBySlot((prev) => ({ ...prev, [slot]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSwappingSlot(null);
    }
  }

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-neutral-200 text-sm text-neutral-500">
          <th className="py-2 pr-4">Slot</th>
          <th className="py-2 pr-4">Player</th>
          <th className="py-2 pr-4 text-right">Pts</th>
          <th className="py-2">Status</th>
          {!readOnly && <th className="py-2"></th>}
        </tr>
      </thead>
      <tbody>
        {ROSTER_SLOTS.map((slot) => {
          const row = rows.find((r) => r.slot === slot);
          const isOpen = openSlot === slot;
          const error = errorBySlot[slot];
          const opponentLabel = row ? formatOpponent(row.opponent, row.opponentIsHome) : null;
          return (
            <Fragment key={slot}>
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-mono text-xs text-neutral-500">{slot}</td>
                <td className="py-2 pr-4 font-medium">
                  <span className="flex items-center gap-2">
                    {row?.playerId && <Headshot url={row.headshotUrl} alt={row.fullName ?? ""} />}
                    {row?.fullName ?? "— empty —"}
                    {opponentLabel && (
                      <span className="text-xs font-normal text-neutral-400">{opponentLabel}</span>
                    )}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {row?.points != null ? row.points.toFixed(2) : "-"}
                </td>
                <td className="py-2">
                  {!row?.playerId ? (
                    ""
                  ) : row.locked ? (
                    <span className="text-xs text-neutral-400">locked</span>
                  ) : (
                    <span className="text-xs text-emerald-600">editable</span>
                  )}
                </td>
                {!readOnly && (
                  <td className="py-2 text-right">
                    {row && !row.locked && (
                      <button
                        onClick={() => toggleSlot(slot)}
                        className="text-xs underline underline-offset-4 text-neutral-500 hover:text-neutral-800"
                      >
                        {isOpen ? "Cancel" : "Swap"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
              {!readOnly && isOpen && (
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <td colSpan={5} className="py-3 px-4">
                    {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
                    {loadingCandidates ? (
                      <p className="text-sm text-neutral-400">Loading eligible players…</p>
                    ) : candidates.length === 0 ? (
                      <p className="text-sm text-neutral-400">No eligible players to swap in.</p>
                    ) : (
                      <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                        {candidates.map((c) => (
                          <li key={c.player_id} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <Headshot url={c.headshot_url} alt={c.full_name} size={24} />
                              {c.full_name}{" "}
                              <span className="text-neutral-400">
                                ({c.position} · {c.nfl_team}
                                {formatOpponent(c.opponent, c.opponent_is_home)
                                  ? ` · ${formatOpponent(c.opponent, c.opponent_is_home)}`
                                  : ""}
                                )
                              </span>
                            </span>
                            <span className="flex items-center gap-3">
                              {/* This week's fantasy_points is always 0 here -- every candidate's
                                  game hasn't kicked off yet (that's the swap-eligibility rule), so
                                  season-to-date average is the only number that actually tells you
                                  anything before you pick. Null (Week 1, or an unproven rookie) just
                                  means no history exists yet -- shown plainly rather than as 0.00,
                                  which would misleadingly look like a real (bad) score. */}
                              <span
                                className="tabular-nums text-neutral-500 text-xs w-24 text-right"
                                title="Season-to-date average points"
                              >
                                {c.avg_points != null ? `${c.avg_points.toFixed(2)} avg` : "no history"}
                              </span>
                              <button
                                onClick={() => handleSwap(slot, c)}
                                disabled={swappingSlot === slot}
                                className="text-xs bg-neutral-900 text-white rounded px-2 py-1 disabled:opacity-50"
                              >
                                {swappingSlot === slot ? "Swapping…" : "Use"}
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
