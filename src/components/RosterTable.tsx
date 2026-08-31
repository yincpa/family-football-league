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
  locked: boolean;
};

export default function RosterTable({
  teamId,
  season,
  week,
  initialRows,
}: {
  teamId: string;
  season: number;
  week: number;
  initialRows: RosterRow[];
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
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {ROSTER_SLOTS.map((slot) => {
          const row = rows.find((r) => r.slot === slot);
          const isOpen = openSlot === slot;
          const error = errorBySlot[slot];
          return (
            <Fragment key={slot}>
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-mono text-xs text-neutral-500">{slot}</td>
                <td className="py-2 pr-4 font-medium">{row?.fullName ?? "— empty —"}</td>
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
              </tr>
              {isOpen && (
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
                            <span>
                              {c.full_name}{" "}
                              <span className="text-neutral-400">
                                ({c.position} · {c.nfl_team})
                              </span>
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="tabular-nums text-neutral-500">
                                {c.fantasy_points.toFixed(2)}
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
