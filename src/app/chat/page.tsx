"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getLeagueMessages, postLeagueMessage } from "@/lib/queries";
import type { LeagueMessage } from "@/lib/types";

// Same env var the Standings page uses to find "the" league -- see the note
// there. NEXT_PUBLIC_* vars are safe to read client-side; Next.js inlines
// them at build time.
const LEAGUE_ID = process.env.NEXT_PUBLIC_DEMO_LEAGUE_ID ?? "";

// Polling rather than Supabase Realtime -- simpler to build and plenty
// responsive for a family league chat (nobody needs sub-second delivery).
const POLL_MS = 10000;

export default function ChatPage() {
  const [messages, setMessages] = useState<LeagueMessage[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  // Starts already "not loading" when there's no league to fetch for, so
  // the effect below never needs to call setState synchronously just to
  // handle that case.
  const [loading, setLoading] = useState(!!LEAGUE_ID);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!LEAGUE_ID) return;
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setMyUserId(data.user?.id ?? null);
    });

    async function load() {
      try {
        const data = await getLeagueMessages(supabase, LEAGUE_ID);
        if (!cancelled) setMessages(data);
      } catch (e) {
        if (!cancelled) setErrorMsg(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setSendError(null);
    try {
      const supabase = createClient();
      await postLeagueMessage(supabase, LEAGUE_ID, body);
      setDraft("");
      const data = await getLeagueMessages(supabase, LEAGUE_ID);
      setMessages(data);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 flex flex-col h-[calc(100vh-4rem)]">
      <h1 className="text-2xl font-semibold mb-1">League Chat</h1>
      <p className="text-sm text-neutral-500 mb-4">Talk trash, celebrate wins, coordinate lineups.</p>

      {!LEAGUE_ID && (
        <p className="text-sm text-amber-600 border border-amber-300 rounded-md p-3 mb-4">
          No league connected yet.
        </p>
      )}
      {errorMsg && <p className="text-sm text-red-600 mb-4">{errorMsg}</p>}

      <div className="flex-1 overflow-y-auto border border-neutral-200 rounded-md p-4 mb-4 flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-neutral-400">No messages yet — say hello!</p>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === myUserId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <span className="text-xs text-neutral-400 mb-0.5">
                  {m.author_name} · {new Date(m.created_at).toLocaleString()}
                </span>
                <span
                  className={`text-sm rounded-lg px-3 py-2 max-w-xs break-words ${
                    mine ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
                  }`}
                >
                  {m.body}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          disabled={!LEAGUE_ID}
          className="flex-1 text-sm border border-neutral-300 rounded-md px-3 py-2"
        />
        <button
          type="submit"
          disabled={sending || !LEAGUE_ID}
          className="text-sm bg-neutral-900 text-white rounded-md px-4 py-2 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      {sendError && <p className="text-xs text-red-600 mt-2">{sendError}</p>}
    </main>
  );
}
