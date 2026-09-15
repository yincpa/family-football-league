"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyTeam } from "@/lib/queries";

export default function NavBar() {
  const [email, setEmail] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      setReady(true);
      setTeamName(
        data.user ? ((await getMyTeam(supabase))?.team_name ?? null) : null,
      );
    }
    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      if (session?.user) {
        getMyTeam(supabase).then((team) =>
          setTeamName(team?.team_name ?? null),
        );
      } else {
        setTeamName(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto max-w-5xl flex items-center justify-between gap-6 px-6 py-3 text-sm overflow-x-auto whitespace-nowrap">
        {/* "/" itself decides where to send you: /account if you're
            signed in, /standings if you're not -- see src/app/page.tsx. */}
        <Link href="/" className="font-semibold shrink-0">
          2026 Yin Family Fantasy Football GM League
        </Link>
        <div className="flex items-center gap-8 shrink-0">
          {email && (
            <>
              {/* Team name once the commissioner's set one up for you;
                  falls back to email before that (e.g. right after signup).
                  Placed first, ahead of the other tabs, so your team is
                  the first thing you see. */}
              <Link
                href="/account"
                className="text-blue-600 font-medium hover:underline underline-offset-4"
              >
                {teamName ?? email}
              </Link>
              <Link
                href="/standings"
                className="hover:underline underline-offset-4"
              >
                Standings
              </Link>
              {/* No query string here on purpose -- each page defaults
                  season to the current year and week to the latest one
                  worth looking at on its own (see getLatestFilledWeek).
                  Used to hardcode ?season=2026&week=1 so everyone landed on
                  the real league before that defaulting logic was trusted;
                  now that it's confirmed working, forcing week=1 here would
                  just override it and always show the oldest week instead
                  of the current one. */}
              <Link
                href="/roster"
                className="hover:underline underline-offset-4"
              >
                My Lineup
              </Link>
              <Link
                href="/league-lineups"
                className="hover:underline underline-offset-4"
              >
                League Lineups
              </Link>
              <Link
                href="/players"
                className="hover:underline underline-offset-4"
              >
                Players
              </Link>
              <Link href="/chat" className="hover:underline underline-offset-4">
                Chat
              </Link>
              {/* Shown to everyone signed in, not just the commissioner —
                  the page itself checks leagues.commissioner_user_id, and
                  RLS enforces the same restriction at the database level,
                  so there's no separate authorization check needed here.
                  Deliberately faint -- it's not meant for most people to
                  click, just present for the rare person who needs it. */}
              <Link
                href="/commissioner"
                className="text-neutral-300 hover:underline underline-offset-4"
              >
                Commissioner
              </Link>
            </>
          )}
          {!email && (
            <Link
              href="/standings"
              className="hover:underline underline-offset-4"
            >
              Standings
            </Link>
          )}
          {ready && !email && (
            <>
              <Link
                href="/login"
                className="hover:underline underline-offset-4"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="hover:underline underline-offset-4"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
