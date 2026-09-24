#!/usr/bin/env bash
# Export stubs from Postgres without a running GripMock process.
#
# Use when the gripmock container fails to start (for example proto errors)
# but postgres is healthy. `gripmock dump` needs the HTTP API and will not work.
#
# Usage:
#   ./scripts/export-stubs.sh [output_dir]
#   make export-stubs
#   make export-stubs OUT=./my_backup
#
# After `make reset-db` and a successful start, restore with:
#   curl -X POST -H 'Content-Type: application/json' \
#     --data-binary @stubs_export/stubs.json \
#     http://127.0.0.1:4771/api/stubs
#
# enabled_stubs.json is a reference only (stub_id + room name).
# Room ids change after a volume wipe.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${1:-stubs_export}"
STUBS_FILE="${OUT_DIR}/stubs.json"
ENABLED_FILE="${OUT_DIR}/enabled_stubs.json"

POSTGRES_USER="${POSTGRES_USER:-gripmock}"
POSTGRES_DB="${POSTGRES_DB:-gripmock}"

if [[ -f .env ]]; then
	set -a
	# shellcheck disable=SC1091
	source .env
	set +a
	POSTGRES_USER="${POSTGRES_USER:-gripmock}"
	POSTGRES_DB="${POSTGRES_DB:-gripmock}"
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx postgres; then
	echo "error: postgres is not running" >&2
	echo "start it with: docker compose up -d postgres" >&2
	exit 1
fi

run_psql() {
	docker compose exec -T postgres \
		psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -t -A -c "$1"
}

write_json() {
	local dest="$1"
	if command -v python3 >/dev/null 2>&1; then
		python3 -c 'import json,sys
data = json.load(sys.stdin)
with open(sys.argv[1], "w", encoding="utf-8") as out:
    json.dump(data, out, indent=2, ensure_ascii=False)
    out.write("\n")
' "$dest"
	else
		cat >"$dest"
		printf '\n' >>"$dest"
	fi
}

mkdir -p "$OUT_DIR"

STUBS_SQL=$(
	cat <<'SQL'
SELECT COALESCE(
  json_agg(stub ORDER BY stub->>'service', stub->>'method', (stub->>'id')::bigint),
  '[]'::json
)
FROM (
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'id', id,
      'name', NULLIF(name, ''),
      'service', service,
      'method', method,
      'options', CASE WHEN options = '{}'::jsonb THEN NULL ELSE options END,
      'headers', headers,
      'input', input,
      'inputs', CASE WHEN inputs = '[]'::jsonb THEN NULL ELSE inputs END,
      'output', output,
      'effects', CASE WHEN effects = '[]'::jsonb THEN NULL ELSE effects END,
      'source', NULLIF(source, '')
    )
  ) AS stub
  FROM stubs
) AS stubs_json;
SQL
)

ENABLED_SQL=$(
	cat <<'SQL'
SELECT COALESCE(
  json_agg(row_to_json(t) ORDER BY t.stub_id, t.room),
  '[]'::json
)
FROM (
  SELECT es.stub_id, r.name AS room
  FROM enabled_stubs AS es
  INNER JOIN rooms AS r ON r.id = es.room_id
) AS t;
SQL
)

run_psql "$STUBS_SQL" | write_json "$STUBS_FILE"

table_ready="$(run_psql "SELECT to_regclass('public.enabled_stubs') IS NOT NULL AND to_regclass('public.rooms') IS NOT NULL")"
if [[ "$table_ready" == "t" ]]; then
	run_psql "$ENABLED_SQL" | write_json "$ENABLED_FILE"
else
	printf '[]\n' >"$ENABLED_FILE"
fi

STUB_COUNT="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1], encoding="utf-8"))))' "$STUBS_FILE" 2>/dev/null || true)"
if [[ -z "${STUB_COUNT}" ]]; then
	STUB_COUNT="$(run_psql "SELECT COUNT(*) FROM stubs")"
fi

echo "exported ${STUB_COUNT} stubs to ${STUBS_FILE}"
echo "exported room bindings to ${ENABLED_FILE}"
