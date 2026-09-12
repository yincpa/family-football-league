"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getLeagueMessages, postLeagueMessage } from "@/lib/queries";
import type { LeagueMessage } from "@/lib/types";
import { TeamLogo } from "@/components/TeamLogoEditor";

// Same env var the Standings page uses to find "the" league -- see the note
// there. NEXT_PUBLIC_* vars are safe to read client-side; Next.js inlines
// them at build time.
const LEAGUE_ID = process.env.NEXT_PUBLIC_DEMO_LEAGUE_ID ?? "";

// Polling rather than Supabase Realtime -- simpler to build and plenty
// responsive for a family league chat (nobody needs sub-second delivery).
const POLL_MS = 10000;

// A curated set rather than a full emoji library/keyboard -- no new
// dependency, and covers the actual vocabulary of a family fantasy league
// chat (trash talk, celebrating, reacting to a bad beat) better than an
// alphabetical wall of every emoji ever made would.
const EMOJI_CHOICES = [
  "😀",
  "😂",
  "🤣",
  "😅",
  "😎",
  "🥳",
  "😭",
  "😤",
  "😡",
  "🤔",
  "🙄",
  "😬",
  "🥶",
  "🤯",
  "😱",
  "🫡",
  "👍",
  "👎",
  "🙌",
  "🙏",
  "👏",
  "💪",
  "🤝",
  "🤦",
  "❤️",
  "🔥",
  "💯",
  "⚡",
  "🎉",
  "🚀",
  "💔",
  "😴",
  "🏈",
  "🏆",
  "🥇",
  "🐐",
  "🤡",
  "📈",
  "📉",
  "🎯",
];

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

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

  // Closes the emoji popover on an outside click or Escape, same
  // conventions as any other dropdown/menu on the page.
  useEffect(() => {
    if (!showEmojiPicker) return;
    function handlePointerDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setShowEmojiPicker(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showEmojiPicker]);

  // Auto-grows the composer as you type a longer/multi-line message,
  // capped by the max-h-32 + overflow-y-auto on the textarea itself so it
  // can never eat the whole page.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  async function sendMessage() {
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

  // Enter sends (matching every other chat app); Shift+Enter inserts a
  // real newline instead, for anyone typing more than one line.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Inserts at the cursor (not just appended to the end) so picking an
  // emoji mid-sentence works the way it does everywhere else, then puts
  // the cursor right after it and gives focus back to the textarea.
  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    const cursor = start + emoji.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <main className="mx-auto max-w-4xl p-6 flex flex-col h-[calc(100vh-4rem)]">
      <h1 className="text-2xl font-semibold mb-1">League Chat</h1>
      <p className="text-sm text-neutral-500 mb-4">
        Talk trash, celebrate wins, coordinate lineups.
      </p>

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
          <p className="text-sm text-neutral-400">
            No messages yet — say hello!
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === myUserId;
            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
              >
                <TeamLogo
                  emoji={m.author_team_logo_emoji}
                  imageUrl={m.author_team_logo_image_url}
                  teamName={m.author_name}
                  size={28}
                />
                <div
                  className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                >
                  <span className="text-xs text-neutral-400 mb-0.5">
                    {m.author_name} · {new Date(m.created_at).toLocaleString()}
                  </span>
                  <span
                    className={`text-sm rounded-lg px-3 py-2 max-w-[75%] break-words whitespace-pre-wrap ${
                      mine
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-900"
                    }`}
                  >
                    {m.body}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="relative flex items-end gap-2"
      >
        {showEmojiPicker && (
          <div
            ref={pickerRef}
            className="absolute bottom-full left-0 mb-2 grid grid-cols-8 gap-1 bg-white border border-neutral-200 rounded-md shadow-lg p-2 z-10"
          >
            {EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="text-lg leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-100"
                aria-label={`Insert ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowEmojiPicker((v) => !v)}
          disabled={!LEAGUE_ID}
          aria-label="Add emoji"
          aria-expanded={showEmojiPicker}
          className="text-lg border border-neutral-300 rounded-md w-10 h-10 flex items-center justify-center shrink-0 hover:bg-neutral-50 disabled:opacity-50"
        >
          😊
        </button>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for a new line)"
          disabled={!LEAGUE_ID}
          rows={1}
          className="flex-1 text-sm border border-neutral-300 rounded-md px-3 py-2 resize-none max-h-32 overflow-y-auto"
        />

        <button
          type="submit"
          disabled={sending || !LEAGUE_ID}
          className="text-sm bg-neutral-900 text-white rounded-md px-4 py-2 h-10 disabled:opacity-50 shrink-0"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      {sendError && <p className="text-xs text-red-600 mt-2">{sendError}</p>}
    </main>
  );
}
