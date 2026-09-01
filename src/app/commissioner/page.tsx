"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createTeam,
  getAllProfiles,
  getCommissionedLeagues,
  getCommissionerTeams,
  reassignTeamOwner,
  renameTeam,
} from "@/lib/queries";
import type { CommissionedLeague, CommissionerTeamRow, Profile } from "@/lib/types";

/** How a signed-up person shows up throughout this page: full name first
 * (that's what the commissioner actually recognizes), with the email
 * alongside so there's no ambiguity if two people share a name. Falls back
 * to whatever's available for an older account that signed up before the
 * name field existed. */
function profileLabel(p: Profile): string {
  if (p.full_name && p.email) return `${p.full_name} (${p.email})`;
  return p.full_name ?? p.email ?? p.id;
}

function OwnerSelect({
  profiles,
  value,
  onChange,
}: {
  profiles: Profile[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-neutral-300 rounded px-2 py-1 bg-white"
    >
      <option value="">Choose a family member…</option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {profileLabel(p)}
        </option>
      ))}
    </select>
  );
}

function LeagueSection({ league, profiles }: { league: CommissionedLeague; profiles: Profile[] }) {
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

  const [renameOpenFor, setRenameOpenFor] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

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

  // Signed-up accounts that don't already own a team in this league --
  // these are the people the commissioner still needs to act on. Computed
  // client-side from the two lists already in memory rather than a new
  // query, same "merge in the browser" approach used everywhere else here.
  const assignedIds = new Set(teams.map((t) => t.owner_user_id));
  const waitingProfiles = profiles.filter((p) => !assignedIds.has(p.id));

  function startTeamForPerson(p: Profile) {
    setNewOwnerId(p.id);
    setNewTeamName(p.requested_team_name ?? "");
    setCreateError(null);
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const name = newTeamName.trim();
    if (!name) {
      setCreateError("Give the team a name.");
      return;
    }
    if (!newOwnerId) {
      setCreateError("Choose an owner for the team.");
      return;
    }
    setCreating(true);
    try {
      const supabase = createClient();
      await createTeam(supabase, league.id, name, newOwnerId);
      setNewTeamName("");
      setNewOwnerId("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(teamId: string) {
    setRenameError(null);
    const name = renameValue.trim();
    if (!name) {
      setRenameError("Team name can't be blank.");
      return;
    }
    setRenameBusy(true);
    try {
      const supabase = createClient();
      await renameTeam(supabase, teamId, name);
      setRenameOpenFor(null);
      setRenameValue("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenameBusy(false);
    }
  }

  async function handleReassign(teamId: string) {
    setReassignError(null);
    if (!reassignValue) {
      setReassignError("Choose a new owner.");
      return;
    }
    setReassignBusy(true);
    try {
      const supabase = createClient();
      await reassignTeamOwner(supabase, teamId, reassignValue);
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
              const isReassigning = reassignOpenFor === t.id;
              const isRenaming = renameOpenFor === t.id;
              return (
                <tr key={t.id} className="border-b border-neutral-100 align-top">
                  <td className="py-2 pr-4 font-medium">
                    {isRenaming ? (
                      <div className="flex flex-col gap-1 max-w-xs">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          placeholder="Team name"
                          className="text-sm border border-neutral-300 rounded px-2 py-1"
                        />
                        {renameError && <p className="text-xs text-red-600">{renameError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRename(t.id)}
                            disabled={renameBusy}
                            className="text-xs bg-neutral-900 text-white rounded px-2 py-1 disabled:opacity-50"
                          >
                            {renameBusy ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => {
                              setRenameOpenFor(null);
                              setRenameError(null);
                            }}
                            className="text-xs text-neutral-500 underline underline-offset-4"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>{t.team_name}</span>
                        <button
                          onClick={() => {
                            setReassignOpenFor(null);
                            setReassignError(null);
                            setRenameOpenFor(t.id);
                            setRenameValue(t.team_name);
                            setRenameError(null);
                          }}
                          className="text-xs underline underline-offset-4 text-neutral-400 hover:text-neutral-700"
                        >
                          Rename
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {t.owner_email ?? <span className="text-neutral-400 font-mono text-xs">{t.owner_user_id}</span>}
                  </td>
                  <td className="py-2">
                    {isReassigning ? (
                      <div className="flex flex-col gap-1 max-w-xs">
                        <OwnerSelect profiles={profiles} value={reassignValue} onChange={setReassignValue} />
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
                          setRenameOpenFor(null);
                          setRenameError(null);
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

      {!loading && waitingProfiles.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 rounded-md p-4 mb-4">
          <p className="text-sm font-medium mb-3">
            Signed up, waiting for a team ({waitingProfiles.length})
          </p>
          <ul className="flex flex-col gap-2">
            {waitingProfiles.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-medium">{p.full_name ?? "(no name given)"}</span>{" "}
                  <span className="text-neutral-500">{p.email}</span>
                  {p.requested_team_name && (
                    <span className="text-neutral-500">
                      {" "}
                      — wants to call their team &ldquo;{p.requested_team_name}&rdquo;
                    </span>
                  )}
                </div>
                <button
                  onClick={() => startTeamForPerson(p)}
                  className="text-xs bg-neutral-900 text-white rounded px-2 py-1 whitespace-nowrap"
                >
                  Set up team
                </button>
              </li>
            ))}
          </ul>
        </div>
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
          <OwnerSelect profiles={profiles} value={newOwnerId} onChange={setNewOwnerId} />
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
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const supabase = createClient();
        const [leagueData, profileData] = await Promise.all([
          getCommissionedLeagues(supabase),
          getAllProfiles(supabase),
        ]);
        if (!cancelled) {
          setLeagues(leagueData);
          setProfiles(profileData);
        }
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
        Create teams and assign them to family members. Anyone you want to assign a team to needs to sign
        up first — once they have an account, they&apos;ll show up below by name and email, along with the
        team name they asked for.
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
        <LeagueSection key={league.id} league={league} profiles={profiles} />
      ))}
    </main>
  );
}
