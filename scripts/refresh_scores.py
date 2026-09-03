"""
Scheduled job: refreshes fantasy_points for every player/week from fresh
nflverse-data, and auto-fills any team's lineup for a week that has just
started and doesn't have a lineup yet. Run on a schedule by the GitHub
Actions workflow at .github/workflows/refresh-scores.yml.

Deliberately self-contained (doesn't import the yin-family-league/
prototype's other modules) so it only depends on files that actually live
in the deployed repo. Scoring/pool-building logic is a direct port of
scoring.py / league.py / simulate.py, validated earlier in the prototype —
kept identical here except for one fix (see NOTE below).

Needs two things passed in as environment variables:
  SUPABASE_URL              - same value as NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY - the SERVICE ROLE key (Supabase dashboard ->
                               Settings -> API), NOT the anon/publishable
                               key. This bypasses Row Level Security, which
                               this job needs since it writes league-wide
                               data (every team's lineup, every player's
                               score) rather than acting as one logged-in
                               user.
Optional:
  REFRESH_SEASON             - defaults to 2026 (the live season). Only
                                ever pass 2025 manually, for testing against
                                the historical test data.
"""
import os
import sys

import pandas as pd
from supabase import create_client

SEASON = int(os.environ.get("REFRESH_SEASON", "2026"))
MAX_WEEK = 18
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
# Bonus points for each weekly award -- see compute_weekly_awards() below.
# A plain constant so it's a one-line change to retune later once a few
# real weeks have gone by.
BONUS_POINTS = 25

ROSTER_SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX", "K", "DST"]


def fetch_csv(url):
    return pd.read_csv(url, low_memory=False)


# ---------------------------------------------------------------------
# Scoring — ported verbatim from the prototype's scoring.py.
# ---------------------------------------------------------------------
OFFENSE = dict(
    pass_yard=1 / 25, pass_td=4, pass_int=-2, pass_2pt=2,
    rush_yard=1 / 10, rush_td=6, rush_2pt=2,
    reception=1, rec_yard=1 / 10, rec_td=6, rec_2pt=2,
    fumble_lost=-2,
)


def score_offense_row(row):
    pts = 0.0
    pts += row.get("passing_yards", 0) * OFFENSE["pass_yard"]
    pts += row.get("passing_tds", 0) * OFFENSE["pass_td"]
    pts += row.get("passing_interceptions", 0) * OFFENSE["pass_int"]
    pts += row.get("passing_2pt_conversions", 0) * OFFENSE["pass_2pt"]
    pts += row.get("rushing_yards", 0) * OFFENSE["rush_yard"]
    pts += row.get("rushing_tds", 0) * OFFENSE["rush_td"]
    pts += row.get("rushing_2pt_conversions", 0) * OFFENSE["rush_2pt"]
    pts += row.get("receptions", 0) * OFFENSE["reception"]
    pts += row.get("receiving_yards", 0) * OFFENSE["rec_yard"]
    pts += row.get("receiving_tds", 0) * OFFENSE["rec_td"]
    pts += row.get("receiving_2pt_conversions", 0) * OFFENSE["rec_2pt"]
    fumbles_lost = (
        row.get("sack_fumbles_lost", 0)
        + row.get("rushing_fumbles_lost", 0)
        + row.get("receiving_fumbles_lost", 0)
    )
    pts += fumbles_lost * OFFENSE["fumble_lost"]
    return round(pts, 2)


KICKER = dict(fg_0_39=3, fg_40_49=4, fg_50_plus=5, fg_missed=-1, pat_made=1, pat_missed=-1)


def score_kicker_row(row):
    pts = 0.0
    pts += row.get("fg_made_0_19", 0) * KICKER["fg_0_39"]
    pts += row.get("fg_made_20_29", 0) * KICKER["fg_0_39"]
    pts += row.get("fg_made_30_39", 0) * KICKER["fg_0_39"]
    pts += row.get("fg_made_40_49", 0) * KICKER["fg_40_49"]
    pts += (row.get("fg_made_50_59", 0) + row.get("fg_made_60_", 0)) * KICKER["fg_50_plus"]
    pts += row.get("fg_missed", 0) * KICKER["fg_missed"]
    pts += row.get("pat_made", 0) * KICKER["pat_made"]
    pts += row.get("pat_missed", 0) * KICKER["pat_missed"]
    return round(pts, 2)


DEFENSE = dict(sack=1, interception=2, fumble_recovery=2, safety=2, def_or_st_td=6, blocked_kick=2)

POINTS_ALLOWED_TIERS = [(0, 10), (6, 7), (13, 4), (17, 1), (27, 0), (34, -1), (45, -3), (999, -5)]


def points_allowed_score(points_allowed):
    for cap, pts in POINTS_ALLOWED_TIERS:
        if points_allowed <= cap:
            return pts
    return -5


def score_defense_row(row, points_allowed):
    pts = 0.0
    pts += row.get("def_sacks", 0) * DEFENSE["sack"]
    pts += row.get("def_interceptions", 0) * DEFENSE["interception"]
    pts += row.get("fumble_recovery_opp", 0) * DEFENSE["fumble_recovery"]
    pts += row.get("def_safeties", 0) * DEFENSE["safety"]
    def_tds = row.get("def_tds", 0) + row.get("fumble_recovery_tds", 0) + row.get("special_teams_tds", 0)
    pts += def_tds * DEFENSE["def_or_st_td"]
    blocks = row.get("def_punt_blocks", 0) + row.get("def_pat_blocks", 0) + row.get("def_fg_blocks", 0)
    pts += blocks * DEFENSE["blocked_kick"]
    pts += points_allowed_score(points_allowed)
    return round(pts, 2)


# ---------------------------------------------------------------------
# Raw box-score stats — kept alongside fantasy_points (which used to be
# the ONLY thing this script carried forward) so the app can show family
# members what a player actually did, not just the final point total.
# Column lists are shared with upsert_player_week_stats below so every row
# written to Supabase has the same shape regardless of position.
# ---------------------------------------------------------------------
RAW_OFFENSE_COLS = [
    "pass_yards", "pass_tds", "pass_ints", "rush_yards", "rush_tds",
    "receptions", "rec_yards", "rec_tds", "fumbles_lost",
    "fg_made", "fg_att", "pat_made", "pat_att",
]
RAW_DST_COLS = ["def_sacks", "def_ints", "def_fumble_rec", "def_tds"]
RAW_STAT_COLS = RAW_OFFENSE_COLS + RAW_DST_COLS + ["points_allowed"]


def row_raw_offense_stats(row):
    if row["position"] == "K":
        fg_made = (
            row.get("fg_made_0_19", 0) + row.get("fg_made_20_29", 0) + row.get("fg_made_30_39", 0)
            + row.get("fg_made_40_49", 0) + row.get("fg_made_50_59", 0) + row.get("fg_made_60_", 0)
        )
        return {
            "fg_made": fg_made,
            "fg_att": fg_made + row.get("fg_missed", 0),
            "pat_made": row.get("pat_made", 0),
            "pat_att": row.get("pat_made", 0) + row.get("pat_missed", 0),
        }
    return {
        "pass_yards": row.get("passing_yards", 0),
        "pass_tds": row.get("passing_tds", 0),
        "pass_ints": row.get("passing_interceptions", 0),
        "rush_yards": row.get("rushing_yards", 0),
        "rush_tds": row.get("rushing_tds", 0),
        "receptions": row.get("receptions", 0),
        "rec_yards": row.get("receiving_yards", 0),
        "rec_tds": row.get("receiving_tds", 0),
        "fumbles_lost": (
            row.get("sack_fumbles_lost", 0)
            + row.get("rushing_fumbles_lost", 0)
            + row.get("receiving_fumbles_lost", 0)
        ),
    }


def row_raw_defense_stats(row):
    return {
        "def_sacks": row.get("def_sacks", 0),
        "def_ints": row.get("def_interceptions", 0),
        "def_fumble_rec": row.get("fumble_recovery_opp", 0),
        "def_tds": row.get("def_tds", 0) + row.get("fumble_recovery_tds", 0) + row.get("special_teams_tds", 0),
    }


# ---------------------------------------------------------------------
# Pool building — ported from league.py's build_weekly_pool, with one
# fix: nflverse's `gametime` is documented as Eastern Time, not UTC. The
# original prototype export parsed it as a naive timestamp and appended
# "Z" (claiming UTC) without converting — every kickoff stored in Supabase
# so far is off by 4-5 hours. Harmless for the already-finished 2025 test
# season, but would have broken kickoff-based locking once real 2026 games
# were live. Fixed here by localizing to America/New_York first, then
# converting to UTC before formatting.
# ---------------------------------------------------------------------
def add_kickoff_utc(games):
    naive_kickoff = pd.to_datetime(
        games["gameday"].astype(str) + " " + games["gametime"].astype(str), errors="coerce"
    )
    games["kickoff"] = (
        naive_kickoff.dt.tz_localize("America/New_York", ambiguous="NaT", nonexistent="NaT").dt.tz_convert("UTC")
    )
    return games


def build_weekly_pool(season, max_week=MAX_WEEK):
    games = fetch_csv(f"{BASE}/schedules/games.csv")
    games = games[games["season"] == season].copy()
    pw = fetch_csv(f"{BASE}/stats_player/stats_player_week_{season}.csv")
    tw = fetch_csv(f"{BASE}/stats_team/stats_team_week_{season}.csv")
    rw = fetch_csv(f"{BASE}/weekly_rosters/roster_weekly_{season}.csv")

    games = games[games["week"] <= max_week].copy()
    games = add_kickoff_utc(games)

    home = games[["season", "week", "home_team", "away_team", "kickoff", "game_id", "home_score", "away_score"]].rename(
        columns={"home_team": "team", "away_team": "opp"}
    )
    home["points_allowed"] = games["away_score"]
    away = games[["season", "week", "away_team", "home_team", "kickoff", "game_id", "home_score", "away_score"]].rename(
        columns={"away_team": "team", "home_team": "opp"}
    )
    away["points_allowed"] = games["home_score"]
    team_games = pd.concat(
        [home[["season", "week", "team", "opp", "kickoff", "game_id", "points_allowed"]],
         away[["season", "week", "team", "opp", "kickoff", "game_id", "points_allowed"]]]
    )

    pw = pw[pw["week"] <= max_week].copy()
    pw = pw[pw["position"].isin(["QB", "RB", "WR", "TE", "K"])].copy()

    def row_points(row):
        if row["position"] == "K":
            return score_kicker_row(row)
        return score_offense_row(row)

    pw["fantasy_points"] = pw.apply(row_points, axis=1)
    raw = pw.apply(row_raw_offense_stats, axis=1, result_type="expand")
    pw = pd.concat([pw, raw], axis=1)
    # A few of our column names (e.g. "receptions", "pat_made") match names
    # nflverse already uses in the source file — concat above duplicates
    # those rather than overwriting, so drop the original and keep our
    # freshly computed version (same values, just avoids ambiguous columns).
    pw = pw.loc[:, ~pw.columns.duplicated(keep="last")]

    rw_slim = rw[["season", "week", "gsis_id", "team", "status", "headshot_url"]].rename(columns={"gsis_id": "player_id"})
    pw = pw.merge(rw_slim, on=["season", "week", "player_id"], suffixes=("", "_roster"), how="left")
    pw["team"] = pw["team"].where(pw["team"].notna(), pw["team_roster"])
    pw["active"] = pw["status"] == "ACT"

    pw = pw.merge(team_games, on=["season", "week", "team"], how="left")

    offense_pool = pw[[
    "player_id", "player_display_name", "position", "team", "week",
    "fantasy_points", "kickoff", "active", "opp", "headshot_url", *RAW_OFFENSE_COLS,
    ]].rename(columns={"player_display_name": "name", "opp": "opponent"})

    tw = tw[tw["week"] <= max_week].copy()
    tw = tw.merge(team_games, on=["season", "week", "team"], how="left")
    tw["fantasy_points"] = tw.apply(
        lambda r: score_defense_row(r, r["points_allowed"] if pd.notna(r["points_allowed"]) else 0), axis=1
    )
    dst_raw = tw.apply(row_raw_defense_stats, axis=1, result_type="expand")
    tw = pd.concat([tw, dst_raw], axis=1)
    tw = tw.loc[:, ~tw.columns.duplicated(keep="last")]  # see note in build_weekly_pool above
    tw["player_id"] = "DST_" + tw["team"]
    tw["name"] = tw["team"] + " D/ST"
    tw["position"] = "DST"
    tw["active"] = tw["kickoff"].notna()
    tw["headshot_url"] = None  # team defenses aren't individual players -- no photo, ever

    dst_pool = tw[[
    "player_id", "name", "position", "team", "week", "fantasy_points", "kickoff", "active", "opp",
    "headshot_url", *RAW_DST_COLS, "points_allowed",
    ]].rename(columns={"opp": "opponent"})

    pool = pd.concat([offense_pool, dst_pool], ignore_index=True)
    return pool


# ---------------------------------------------------------------------
# Preseason roster preview — a fallback used ONLY when the season's real
# stats file (stats_player_week_{season}.csv) doesn't exist yet, i.e.
# before that season's Week 1 games have actually been played. nflverse
# finalizes each team's 53-man roster (roster_weekly_{season}.csv) and
# publishes the full season schedule (games.csv) well before any games are
# played, so this builds a *preview* pool from those two files instead —
# real player names/positions/teams/kickoff times, with fantasy_points
# fixed at 0 since nothing has happened yet. This is what lets family
# members browse "who's on my team" and "available players" a week or more
# before the season actually starts.
#
# Every row this produces gets upserted with the same
# (player_id, season, week) key that real stats rows use later, so once
# stats_player_week_{season}.csv actually appears (main() always tries the
# real stats path first), the placeholder 0-point rows are transparently
# overwritten with real scores — no separate cleanup step needed.
# ---------------------------------------------------------------------
def build_preseason_pool(season, max_week=MAX_WEEK):
    games = fetch_csv(f"{BASE}/schedules/games.csv")
    games = games[games["season"] == season].copy()
    games = games[games["week"] <= max_week].copy()
    games = add_kickoff_utc(games)

    home = games[["season", "week", "home_team", "away_team", "kickoff"]].rename(
        columns={"home_team": "team", "away_team": "opp"}
    )
    away = games[["season", "week", "away_team", "home_team", "kickoff"]].rename(
        columns={"away_team": "team", "home_team": "opp"}
    )
    team_games = pd.concat([home, away], ignore_index=True)

    rw = fetch_csv(f"{BASE}/weekly_rosters/roster_weekly_{season}.csv")
    rw = rw[(rw["season"] == season) & (rw["week"] <= max_week)].copy()
    rw = rw[rw["position"].isin(["QB", "RB", "WR", "TE", "K"])].copy()
    rw = rw[rw["status"] == "ACT"].copy()  # active 53-man roster only, not IR/PS/cut

    offense_pool = rw.merge(team_games, on=["season", "week", "team"], how="left")
    offense_pool = offense_pool.rename(columns={"gsis_id": "player_id", "full_name": "name", "opp": "opponent"})
    offense_pool["fantasy_points"] = 0.0
    offense_pool["active"] = True
    for col in RAW_OFFENSE_COLS:
        offense_pool[col] = 0.0
    offense_pool = offense_pool[
        ["player_id", "name", "position", "team", "week", "fantasy_points", "kickoff", "active", "opponent",
         "headshot_url", *RAW_OFFENSE_COLS]
    ].dropna(subset=["player_id", "name"])

    dst_pool = team_games.drop_duplicates(["season", "week", "team"]).copy()
    dst_pool["player_id"] = "DST_" + dst_pool["team"]
    dst_pool["name"] = dst_pool["team"] + " D/ST"
    dst_pool["position"] = "DST"
    dst_pool["fantasy_points"] = 0.0
    dst_pool["active"] = dst_pool["kickoff"].notna()
    dst_pool["points_allowed"] = 0.0
    dst_pool["headshot_url"] = None  # team defenses aren't individual players -- no photo, ever
    for col in RAW_DST_COLS:
        dst_pool[col] = 0.0
    dst_pool = dst_pool.rename(columns={"opp": "opponent"})
    dst_pool = dst_pool[
        ["player_id", "name", "position", "team", "week", "fantasy_points", "kickoff", "active", "opponent",
         "headshot_url", *RAW_DST_COLS, "points_allowed"]
    ]

    return pd.concat([offense_pool, dst_pool], ignore_index=True)


# ---------------------------------------------------------------------
# Auto-fill — ported from simulate.py, adapted to be stateless per run
# (used_players comes from querying Supabase's `lineups` table instead of
# an in-memory object, since this script starts fresh on every schedule
# tick rather than running as one long-lived process).
# ---------------------------------------------------------------------
def season_to_date_avg(pool, through_week):
    past = pool[(pool["week"] < through_week) & (pool["active"])]
    avg = past.groupby(["player_id", "position", "name"], as_index=False)["fantasy_points"].mean()
    return avg.rename(columns={"fantasy_points": "avg_points"})


def rank_pool(pool, week, prior_season_pool=None):
    if week == 1:
        if prior_season_pool is not None:
            return (
                prior_season_pool[prior_season_pool["active"]]
                .groupby(["player_id", "position", "name"], as_index=False)["fantasy_points"]
                .mean()
                .rename(columns={"fantasy_points": "avg_points"})
            )
        return pd.DataFrame(columns=["player_id", "position", "name", "avg_points"])
    return season_to_date_avg(pool, week)


def auto_fill_lineup(used_players, pool_week, rank_df):
    eligible = pool_week[
        pool_week["active"] & pool_week["kickoff"].notna() & (~pool_week["player_id"].isin(used_players))
    ].copy()
    eligible = eligible.merge(rank_df[["player_id", "avg_points"]], on="player_id", how="left")
    eligible["avg_points"] = eligible["avg_points"].fillna(-999)
    eligible = eligible.sort_values("avg_points", ascending=False)

    used_this_week = set()

    def take(pos_list, n):
        cand = eligible[eligible["position"].isin(pos_list) & (~eligible["player_id"].isin(used_this_week))]
        picks = cand.head(n)
        for _, r in picks.iterrows():
            used_this_week.add(r["player_id"])
        return picks

    qb, rb, wr, te = take(["QB"], 1), take(["RB"], 2), take(["WR"], 2), take(["TE"], 1)
    flex, k, dst = take(["RB", "WR", "TE"], 1), take(["K"], 1), take(["DST"], 1)

    slot_rows = {
        "QB": qb,
        "RB1": rb.iloc[[0]] if len(rb) > 0 else rb,
        "RB2": rb.iloc[[1]] if len(rb) > 1 else rb.iloc[0:0],
        "WR1": wr.iloc[[0]] if len(wr) > 0 else wr,
        "WR2": wr.iloc[[1]] if len(wr) > 1 else wr.iloc[0:0],
        "TE": te, "FLEX": flex, "K": k, "DST": dst,
    }
    return {slot: (rows.iloc[0]["player_id"] if len(rows) > 0 else None) for slot, rows in slot_rows.items()}


# ---------------------------------------------------------------------
# Supabase writes
# ---------------------------------------------------------------------
def upsert_in_batches(supabase, table, rows, on_conflict, batch=500):
    for i in range(0, len(rows), batch):
        supabase.table(table).upsert(rows[i:i + batch], on_conflict=on_conflict).execute()


def upsert_nfl_players(supabase, pool):
    players = (
        pool.sort_values("week")
        .groupby("player_id", as_index=False)
        .last()[["player_id", "name", "position", "team", "headshot_url"]]
        .rename(columns={"name": "full_name", "team": "nfl_team"})
        .dropna(subset=["player_id", "full_name", "position", "nfl_team"])
    )
    rows = players.to_dict("records")
    # headshot_url is legitimately null for plenty of rows (every team
    # defense, plus any offensive player nflverse doesn't have a photo on
    # file for) -- turn pandas' NaN into a real null rather than leaving a
    # float NaN in the payload, which isn't valid JSON.
    for r in rows:
        if pd.isna(r.get("headshot_url")):
            r["headshot_url"] = None
    upsert_in_batches(supabase, "nfl_players", rows, on_conflict="player_id")
    return len(rows)


def upsert_player_week_stats(supabase, pool):
    now_utc = pd.Timestamp.now(tz="UTC")
    rows = []
    for _, r in pool.iterrows():
        if pd.isna(r["player_id"]):
            continue
        kickoff = r["kickoff"]
        row = {
            "player_id": r["player_id"],
            "season": SEASON,
            "week": int(r["week"]),
            "opponent": r["opponent"] if pd.notna(r["opponent"]) else None,
            "kickoff": kickoff.strftime("%Y-%m-%dT%H:%M:%SZ") if pd.notna(kickoff) else None,
            "game_final": bool(pd.notna(kickoff) and kickoff <= now_utc),
            "active": bool(r["active"]) if pd.notna(r["active"]) else False,
            "fantasy_points": round(float(r["fantasy_points"]), 2) if pd.notna(r["fantasy_points"]) else 0.0,
        }
        # Raw box-score stats (see RAW_STAT_COLS) — not every column applies
        # to every position (e.g. a QB has no fg_made), those come through
        # as NaN from the pool-building step and are stored as null here.
        for col in RAW_STAT_COLS:
            val = r[col] if col in r.index else None
            row[col] = round(float(val), 2) if pd.notna(val) else None
        rows.append(row)
    upsert_in_batches(supabase, "player_week_stats", rows, on_conflict="player_id,season,week")
    return len(rows)


def process_team(supabase, team_id, team_name, pool, prior_pool, now_utc):
    existing = (
        supabase.table("lineups")
        .select("week, player_id")
        .eq("team_id", team_id)
        .eq("season", SEASON)
        .execute()
        .data
    )
    filled_weeks = {row["week"] for row in existing}
    used_players = {row["player_id"] for row in existing if row["player_id"]}

    newly_filled = []
    for week in range(1, MAX_WEEK + 1):
        if week in filled_weeks:
            continue
        pool_week = pool[pool["week"] == week]
        if pool_week.empty:
            continue

        if week > 1:
            # Only ready to auto-fill once the PREVIOUS week has actually
            # kicked off. This is what stops the algorithm from pre-claiming
            # the whole season's best players the first time it ever runs —
            # each week only becomes fillable once the one before it is
            # underway. Week 1 has no previous week to wait on, so it's
            # eligible as soon as its own pool exists (even a preseason
            # roster preview with 0 points), which is what lets teams see
            # and adjust their opening lineup ahead of kickoff instead of
            # only after it's already locked.
            prior_week_pool = pool[pool["week"] == week - 1]
            latest_prior_kickoff = prior_week_pool["kickoff"].max()
            if pd.isna(latest_prior_kickoff) or latest_prior_kickoff > now_utc:
                continue  # previous week hasn't started yet — not time to auto-fill this one

        rank_df = rank_pool(pool, week, prior_season_pool=prior_pool if week == 1 else None)
        lineup = auto_fill_lineup(used_players, pool_week, rank_df)

        rows = []
        for slot, player_id in lineup.items():
            if player_id is None:
                continue
            rows.append({
                "team_id": team_id, "season": SEASON, "week": week,
                "slot": slot, "player_id": player_id, "is_auto_filled": True,
            })
            used_players.add(player_id)
        if rows:
            supabase.table("lineups").insert(rows).execute()
            newly_filled.append(week)

    if newly_filled:
        print(f"  auto-filled {team_name}: week(s) {newly_filled}")


def main():
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase = create_client(supabase_url, supabase_key)

    print(f"Fetching fresh nflverse data for season {SEASON}...")
    preseason = False
    try:
        pool = build_weekly_pool(SEASON, max_week=MAX_WEEK)
    except Exception as e:
        # Most likely cause: nflverse hasn't published this season's real
        # stats file yet because Week 1 hasn't been played. Before giving
        # up, try the preseason roster preview (real rosters + schedule,
        # 0 points) so the app still has real players to show ahead of
        # kickoff. Only if THAT also fails do we exit cleanly without
        # failing the workflow run.
        print(f"Season {SEASON} stats aren't published yet ({e}). Trying the preseason roster preview...")
        try:
            pool = build_preseason_pool(SEASON, max_week=MAX_WEEK)
        except Exception as e2:
            print(f"Preseason roster data isn't available yet either ({e2}). Nothing to do.")
            return
        if pool.empty:
            print("Preseason roster preview came back empty. Nothing to do.")
            return
        preseason = True
    prior_pool = build_weekly_pool(SEASON - 1, max_week=MAX_WEEK)

    n_players = upsert_nfl_players(supabase, pool)
    n_stats = upsert_player_week_stats(supabase, pool)
    label = "preseason roster preview — 0 pts until games are played" if preseason else "live stats"
    print(f"Upserted {n_players} players, {n_stats} weekly stat rows ({label}).")

    now_utc = pd.Timestamp.now(tz="UTC")
    leagues = supabase.table("leagues").select("id").eq("season", SEASON).execute().data
    league_ids = [row["id"] for row in leagues]
    if not league_ids:
        print(f"No leagues found for season {SEASON} — nothing to auto-fill.")
        return

    teams = supabase.table("teams").select("id, team_name").in_("league_id", league_ids).execute().data
    print(f"Checking auto-fill for {len(teams)} team(s)...")
    for team in teams:
        process_team(supabase, team["id"], team["team_name"], pool, prior_pool, now_utc)

    print("Done.")


if __name__ == "__main__":
    sys.exit(main())
