# Yin Family Football League — app

Next.js + Supabase. Companion to the Python prototype/schema that validated
the game's rules against real 2025 NFL data.

## What's here vs. what's next

Working right now: the project builds cleanly and has three real pages —
`/roster`, `/players`, `/standings` — that read from a Supabase database
using the schema in `../yin-family-league/supabase/schema.sql`. They are
currently **read-only previews** driven by URL parameters
(`?team=<uuid>&season=2026&week=1`) rather than real sign-in, because
there's no Supabase project connected yet.

Not built yet, on purpose (next increments once the database exists and we
can test against real rows):
- Sign-in (Supabase Auth) and a real "pick your team" flow, replacing the
  `?team=` URL parameter.
- The actual swap/edit UI on the roster page (today it only displays the
  lineup; the validation logic — locked slots, already-used players — is
  already proven out in `simulate.py`'s `apply_swap` and needs porting here).
- The scheduled job that refreshes `player_week_stats` as each game finishes.
- A commissioner/admin view.

## Local setup

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase project's
                                    # URL + anon key from Project Settings > API
npm run dev
```

## Deploying

Push this folder to a GitHub repo, then import it in Vercel — it auto-detects
Next.js. Add the same two environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the Vercel project's Environment
Variables settings; never commit `.env.local`.
