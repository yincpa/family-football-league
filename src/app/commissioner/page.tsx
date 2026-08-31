"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createTeam,
  getCommissionedLeagues,
  getCommissionerTeams,
  reassignTeamOwner,
} from "@/lib/queries";
import type { CommissionedLeague, CommissionerTeamRow } from "@/lib/types";

// Loose UUID shape check -- just a friendlier first-pass error than
// waiting on a raw Postgres foreign-key failure for an obvious typo. The
// database (owner_user_id references auth.users) is still the real check:
// a well-formed but nonexistent id fails there, and that error is shown
// as-is rather than silently swallowed.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function LeagueSection({ league }: { league: CommissionedLeague }) {
  const [teams, setTeams] = useState<CommissionerTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Bumped after a create/reassign succeeds to trigger the effect below to
  // refetch, rather than calling a reload function from inside the effect
  // (React's exhaustive-deps/set-state-in-effect linting wants the fetch
  // that owns setLoading/setTeams defined inline in the effect itself).
  const [reloadKey, setReloadKey] = useState(0);

  const [reassignOpenFor, setReassignOpenFor] = useState<string | null>(null);
  const [reassignValue, setReassignValue] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const [newTeamName, setNewTeamName] = useState("");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const supabase = createClient();
        const data = await getCommissionerTeams(supabase, league.id);
        if (!cancelled) setTeams(data);
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
  }, [league.id, reloadKey]);

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const name = newTeamName.trim();
    const ownerId = newOwnerId.trim();
    if (!name) {
      setCreateError("Give the team a name.");
      return;
    }
    if (!UUID_RE.test(ownerId)) {
      setCreateError("That doesn't look like a valid user ID (should look like 8-4-4-4-12 hex characters).");
      return;
    }
    setCreating(true);
    try {
      const supabase = createClient();
      await createTeam(supabase, league.id, name, ownerId);
      setNewTeamName("");
      setNewOwnerId("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleReassign(teamId: string) {
    setReassignError(null);
    const ownerId = reassignValue.trim();
    if (!UUID_RE.test(ownerId)) {
      setReassignError("That doesn't look like a valid user ID (should look like 8-4-4-4-12 hex characters).");
      return;
    }
    setReassignBusy(true);
    try {
      const supabase = createClient();
      await reassignTeamOwner(supabase, teamId, ownerId);
      setReassignOpenFor(null);
      setReassignValue("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setReassignError(e instanceof Error ? e.message : String(e));
    } finally {
      setReassignBusy(false);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-1">
        {league.name} <span className="text-neutral-400 font-normal">· season {league.season}</span>
      </h2>

      {errorMsg && <p className="text-sm text-red-600 mb-3">{errorMsg}</p>}
      {loading ? (
        <p className="text-sm text-neutral-400">Loading teams…</p>
      ) : (
        <table className="w-full text-left border-collapse mb-4">
          <thead>
            <tr className="border-b border-neutral-200 text-sm text-neutral-500">
              <th className="py-2 pr-4">Team</th>
              <th className="py-2 pr-4">Owner</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const isOpen = reassignOpenFor === t.id;
              return (
                <tr key={t.id} className="border-b border-neutral-100 align-top">
                  <td className="py-2 pr-4 font-medium">{t.team_name}</td>
                  <td className="py-2 pr-4">
                    {t.owner_email ?? <span className="text-neutral-400 font-mono text-xs">{t.owner_user_id}</span>}
                  </td>
                  <td className="py-2">
                    {isOpen ? (
                      <div className="flex flex-col gap-1 max-w-xs">
                        <input
                          type="text"
                          value={reassignValue}
                          onChange={(e) => setReassignValue(e.target.value)}
                          placeholder="New owner's user ID"
                          className="text-sm border border-neutral-300 rounded px-2 py-1"
                        />
                        {reassignError && <p className="text-xs text-red-600">{reassignError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleReassign(t.id)}
                            disabled={reassignBusy}
                            className="text-xs bg-neutral-900 text-white rounded px-2 py-1 disabled:opacity-50"
                          >
                            {reassignBusy ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => {
                              setReassignOpenFor(null);
                              setReassignError(null);
                            }}
                            className="text-xs text-neutral-500 underline underline-offset-4"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setReassignOpenFor(t.id);
                          setReassignValue("");
                          setReassignError(null);
                        }}
                        className="text-xs underline underline-offset-4 text-neutral-500 hover:text-neutral-800"
                      >
                        Reassign
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {teams.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-neutral-400 text-sm">
                  No teams in this league yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <form onSubmit={handleCreateTeam} className="border border-neutral-200 rounded-md p-4 max-w-md">
        <p className="text-sm font-medium mb-3">Add a new team</p>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name"
            className="text-sm border border-neutral-300 rounded px-2 py-1"
          />
          <input
            type="text"
            value={newOwnerId}
            onChange={(e) => setNewOwnerId(e.target.value)}
            placeholder="Owner's user ID (from their Account page)"
            className="text-sm border border-neutral-300 rounded px-2 py-1"
          />
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <button
            type="submit"
            disabled={creating}
            className="text-sm bg-neutral-900 text-white rounded px-3 py-1.5 self-start disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create team"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function CommissionerPage() {
  const [leagues, setLeagues] = useState<CommissionedLeague[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const supabase = createClient();
        const data = await getCommissionedLeagues(supabase);
        if (!cancelled) setLeagues(data);
      } catch (e) {
        if (!cancelled) setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-1">Commissioner</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Create teams and assign them to family members. To assign someone, have them sign up first and
        copy the user ID shown on their{" "}
        <a href="/account" className="underline underline-offset-4">
          Account page
        </a>
        , then paste it below.
      </p>

      {errorMsg && <p className="text-sm text-red-600 mb-4">{errorMsg}</p>}

      {leagues === null && !errorMsg && <p className="text-sm text-neutral-400">Loading…</p>}

      {leagues !== null && leagues.length === 0 && (
        <p className="text-sm text-neutral-500 border border-neutral-200 rounded-md p-4">
          You&apos;re not the commissioner of any league. (This page only does anything for the account
          listed as a league&apos;s <code>commissioner_user_id</code> in Supabase.)
        </p>
      )}

      {leagues?.map((league) => (
        <LeagueSection key={league.id} league={league} />
      ))}
    </main>
  );
}
