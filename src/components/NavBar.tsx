"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NavBar() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto max-w-3xl flex items-center justify-between px-6 py-3 text-sm">
        <Link href="/" className="font-semibold">
          Yin Family Football League
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/standings" className="hover:underline underline-offset-4">
            Standings
          </Link>
          {email && (
            <>
              {/* TEMP: hardcoded to season 2026 week 1 (the live season) so
                  everyone lands on the real league by default — remove this
                  query string entirely once the pages' own defaulting logic
                  is trusted to always pick the right season/week on its own. */}
              <Link href="/players?season=2026&week=1" className="hover:underline underline-offset-4">
                Players
              </Link>
              <Link href="/roster?season=2026&week=1" className="hover:underline underline-offset-4">
                My Lineup
              </Link>
              <Link href="/chat" className="hover:underline underline-offset-4">
                Chat
              </Link>
              {/* Shown to everyone signed in, not just the commissioner —
                  the page itself checks leagues.commissioner_user_id and
                  shows a "not a commissioner" message to anyone else, so
                  there's no separate authorization check needed here. */}
              <Link href="/commissioner" className="hover:underline underline-offset-4">
                Commissioner
              </Link>
              <Link href="/account" className="hover:underline underline-offset-4">
                {email}
              </Link>
            </>
          )}
          {ready && !email && (
            <>
              <Link href="/login" className="hover:underline underline-offset-4">
                Sign in
              </Link>
              <Link href="/signup" className="hover:underline underline-offset-4">
                Sign up
              </Link>
            </>
          )}
          {/* mailto: link, not a page -- always visible (signed in or not)
              since anyone, including someone who hasn't signed up yet,
              might need to reach the commissioner. */}
          
            href="mailto:yincpa@gmail.com"
            className="hover:underline underline-offset-4 text-neutral-500"
          >
            Contact Commissioner
          </a>
        </div>
      </nav>
    </header>
  );
}
