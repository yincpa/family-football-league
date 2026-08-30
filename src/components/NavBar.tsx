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
              {/* TEMP: hardcoded to the 2025 test-data season/week until the
                  real 2026 season kicks off in September — remove the query
                  string once the season default should point at the live year. */}
              <Link href="/players?season=2025&week=1" className="hover:underline underline-offset-4">
                Players
              </Link>
              <Link href="/roster?season=2025&week=1" className="hover:underline underline-offset-4">
                My Lineup
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
        </div>
      </nav>
    </header>
  );
}
