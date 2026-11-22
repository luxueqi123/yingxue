#!/usr/bin/env bash
set -euo pipefail

baseline_tag="$(gh api "repos/$GITHUB_REPOSITORY/releases?per_page=30" | jq -r --arg target "$GITHUB_REF_NAME" '
    [.[] | select(.tag_name != $target and .draft == false and .prerelease == false and any(.assets[]; .name == "yingxue-update.json" and .state == "uploaded"))]
    | first.tag_name // empty
')"
revision="$(git rev-parse HEAD)"
baseline_ref="$revision^1"
if [[ -n "$baseline_tag" ]]; then
    baseline_ref="refs/tags/$baseline_tag"
    git merge-base --is-ancestor "$baseline_ref" "$revision"
fi
baseline="$(git rev-parse "$baseline_ref^{commit}")"
echo "Rehearsing PostgreSQL migration $baseline -> $revision"
rehearsal="$(mktemp -d "$RUNNER_TEMP/yingxue-rehearsal.XXXXXX")"
git worktree add --detach "$rehearsal/previous" "$baseline"
trap 'git worktree remove "$rehearsal/previous"' EXIT

export CANVAS_DATABASE_DRIVER=postgres
export DATABASE_URL='postgres://postgres:canvas_test@127.0.0.1:5432/canvas_previous?sslmode=disable'
export CANVAS_BACKEND_DATA_DIR="$rehearsal/previous-data"
(cd "$rehearsal/previous/backend" && go run ./cmd/migrate-schema up)

docker exec "$POSTGRES_CONTAINER" psql -X -U postgres -d canvas_previous -v ON_ERROR_STOP=1 -c \
    "CREATE TABLE release_rehearsal_fixture (id text PRIMARY KEY); INSERT INTO release_rehearsal_fixture VALUES ('pre-upgrade');"
docker exec "$POSTGRES_CONTAINER" pg_dump -U postgres -d canvas_previous -Fc > "$rehearsal/baseline.dump"
docker exec "$POSTGRES_CONTAINER" createdb -U postgres canvas_candidate
docker exec -i "$POSTGRES_CONTAINER" pg_restore -U postgres -d canvas_candidate --exit-on-error < "$rehearsal/baseline.dump"

export DATABASE_URL='postgres://postgres:canvas_test@127.0.0.1:5432/canvas_candidate?sslmode=disable'
export CANVAS_BACKEND_DATA_DIR="$rehearsal/candidate-data"
(cd backend && go build -o "$rehearsal/migrate-schema" ./cmd/migrate-schema)
"$rehearsal/migrate-schema" up
"$rehearsal/migrate-schema" verify
[[ "$(docker exec "$POSTGRES_CONTAINER" psql -XAt -U postgres -d canvas_candidate -c 'SELECT id FROM release_rehearsal_fixture')" == pre-upgrade ]]
