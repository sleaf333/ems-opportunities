#!/usr/bin/env bash
# Runs the database schema and permission tests against a throwaway local
# Postgres (no Supabase account needed). Requires Postgres 15+ installed.
#
#   npm run test:db
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

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$HERE/supabase_stub.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0001_init.sql"
"${PSQL[@]}" -f "$HERE/permissions_test.sql"

echo "All database tests passed."
