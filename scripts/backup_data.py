"""
Scheduled job: exports every real (non-view) table in the Supabase database
to CSV files under backups/<date>/, so the GitHub Actions workflow can
commit them straight into the repo. Git then becomes the backup archive --
every past day's snapshot stays recoverable from git history for as long as
the repo exists, at zero extra cost and with no separate service to manage.

Why this exists: the Supabase Free plan takes *no* automatic backups at all
(that's a paid-plan feature) and free projects can pause after 7 days with
no traffic. This script is the safety net in the meantime -- it doesn't
replace upgrading to a paid plan if this ever needs airtight recovery, but
it means a bad SQL Editor mistake, an accidental table drop, or a paused/
lost project isn't a season-ending event: the most recent commit under
backups/ has everything needed to reconstruct the data by hand.

Deliberately only backs up tables (leagues, teams, lineups, ...), not the
derived views (standings, team_week_points, team_used_players) -- those are
just SQL computed live from the tables below every time they're queried, so
backing them up would be redundant (and they'd be instantly out of date
anyway). Restoring the tables regenerates the views for free.

Not every table here is equally irreplaceable:
  - lineups is the one truly irreplaceable table -- it's the record of each
    team's actual weekly picks, a human decision that exists nowhere else.
  - player_week_stats, nfl_players, and weekly_awards are all *derived* from
    nflverse's public stats plus this app's scoring code, so in a pinch they
    could be regenerated from scratch by re-running refresh_scores.py for
    every past week of the season. Backing them up here just saves that
    replay step (and preserves nflverse data exactly as scored at the time,
    in case nflverse ever revises a stat retroactively).
  - leagues, teams, and profiles hold real signup/setup choices (team names,
    who owns which team, commissioner) that would be a hassle, not a
    disaster, to redo by hand.
  - league_messages is social/sentimental, not gameplay-critical.
All are backed up anyway since doing so costs nothing extra.

Needs the same two environment variables as refresh_scores.py:
  SUPABASE_URL              - same value as NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY - the SERVICE ROLE key (Supabase dashboard ->
                               Settings -> API), NOT the anon/publishable
                               key. Needed to read every league's/team's
                               data, not just whatever a single logged-in
                               user could see under RLS.
"""
import os
import sys
from datetime import datetime, timezone

import pandas as pd
from supabase import create_client

# Every real table in supabase/schema.sql plus the later migrations under
# supabase/*.sql -- NOT the three derived views (standings, team_week_points,
# team_used_players), which are just live SQL over these tables and would
# be redundant (and stale the moment a new lineup or stat comes in) to back
# up separately. A table that doesn't exist yet in a given deployment (e.g.
# league_messages, if that migration hasn't been applied) is skipped with a
# warning rather than failing the whole run -- see fetch_all_rows below.
TABLES = [
    "leagues",
    "teams",
    "profiles",
    "lineups",
    "player_week_stats",
    "weekly_awards",
    "nfl_players",
    "league_messages",
]

PAGE_SIZE = 1000


def fetch_all_rows(supabase, table):
    """
    Supabase/PostgREST caps a single .select() response at 1000 rows by
    default -- player_week_stats alone can run well past that over a full
    season (hundreds of players x up to 18 weeks), so this pages through
    with .range() until a page comes back short, meaning there's nothing
    left to fetch.
    """
    rows = []
    start = 0
    while True:
        res = (
            supabase.table(table)
            .select("*")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        page = res.data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def main():
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase = create_client(supabase_url, supabase_key)

    # Dated per run (UTC, since that's what GitHub Actions runs on) so every
    # day's backup lands in its own folder -- browsing backups/ in GitHub
    # directly is itself a simple point-in-time picker, no git commands
    # needed to see what the data looked like on a given day.
    run_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_dir = os.path.join("backups", run_date)
    os.makedirs(out_dir, exist_ok=True)

    total_rows = 0
    backed_up = []
    for table in TABLES:
        try:
            rows = fetch_all_rows(supabase, table)
        except Exception as e:
            # A missing table (migration not applied yet in this
            # deployment) or a transient read error shouldn't sink the rest
            # of the backup -- print it plainly so it shows up in the
            # Action's log, and move on to the next table.
            print(f"  SKIPPED {table}: {e}")
            continue

        path = os.path.join(out_dir, f"{table}.csv")
        pd.DataFrame(rows).to_csv(path, index=False)
        print(f"  Backed up {len(rows)} rows from {table} -> {path}")
        total_rows += len(rows)
        backed_up.append(table)

    if not backed_up:
        print("Nothing backed up -- every table failed. Failing the run.")
        sys.exit(1)

    print(f"Done. {total_rows} total rows across {len(backed_up)} tables.")


if __name__ == "__main__":
    main()
