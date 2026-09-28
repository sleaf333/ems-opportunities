#!/usr/bin/env bash
# Runs the database schema and permission tests against a throwaway local
# Postgres (no Supabase account needed). Requires Postgres 15+ installed.
#
#   npm run test:db
#
# Two databases are built:
#   upgrade: 0001 + the original seed, then 0002, then checks that existing
#            data was carried over (the path a live project takes).
#   fresh:   every migration + seed.sql, then the full permission tests.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGBIN="$(pg_config --bindir 2>/dev/null || ls -d /usr/lib/postgresql/*/bin | tail -1)"
WORK="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"

# initdb refuses to run as root; use the postgres OS user when we are root.
run() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

chmod 777 "$WORK"
cleanup() {
  run "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

run "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
run "$PGBIN/pg_ctl" -D "$WORK/data" -l "$WORK/log" \
  -o "-p $PORT -k $WORK -c listen_addresses=''" -w start >/dev/null

psql_db() {
  local db="$1"; shift
  psql -h "$WORK" -p "$PORT" -U postgres -d "$db" -v ON_ERROR_STOP=1 -q -X "$@"
}

migrations=("$ROOT"/supabase/migrations/*.sql)

# Upgrade path.
psql_db postgres -c "create database upgrade"
psql_db upgrade -f "$HERE/supabase_stub.sql"
psql_db upgrade -f "$ROOT/supabase/migrations/0001_init.sql"
psql_db upgrade -f "$HERE/upgrade_fixture.sql"
for m in "${migrations[@]:1}"; do psql_db upgrade -f "$m"; done
psql_db upgrade -f "$HERE/upgrade_test.sql"
echo "Upgrade tests passed."

# Fresh install.
psql_db postgres -c "create database fresh"
psql_db fresh -f "$HERE/supabase_stub.sql"
for m in "${migrations[@]}"; do psql_db fresh -f "$m"; done
psql_db fresh -f "$ROOT/supabase/seed.sql"
psql_db fresh -f "$HERE/permissions_test.sql"

echo "All database tests passed."
