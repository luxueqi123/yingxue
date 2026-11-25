#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
report="$RUNNER_TEMP/yingxue-web-candidate.json"
cd "$repo_root/web"

bun scripts/test-isolated.mjs --process-isolation \
    test/auth-login-consent.test.tsx test/auth-registration-agreement.test.ts \
    test/auth-registration-recovery.interaction.test.ts test/payment-wallet-contract.test.ts \
    test/payment-options.test.ts test/workspace-wallet-history.test.tsx test/ltv-case-media.test.ts \
    test/site-appearance-and-skins.test.ts test/personal-appearance.test.tsx \
    test/agent-sidebar-presentation.test.tsx test/system-update-sources.test.ts \
    test/upstream-skills-visibility.test.ts

if CANVAS_WEB_TEST_FAILURE_REPORT="$report" bun run test --process-isolation; then
    exit 0
fi
test -s "$report"
baseline="$(gh api "repos/$GITHUB_REPOSITORY/releases?per_page=30" | jq -r --arg target "$GITHUB_REF_NAME" '
    [.[] | select(.tag_name != $target and .draft == false and .prerelease == false and any(.assets[]; .name == "yingxue-update.json" and .state == "uploaded"))]
    | first.tag_name // empty
')"
test -n "$baseline"
git merge-base --is-ancestor "refs/tags/$baseline" HEAD
mapfile -t failed_files < <(jq -r 'keys[]' "$report")
test "${#failed_files[@]}" -gt 0
for file in "${failed_files[@]}"; do
    if ! git diff --quiet "refs/tags/$baseline" HEAD -- "$file"; then
        echo "Changed test failed: $file" >&2
        exit 1
    fi
done

scratch="$(mktemp -d "$RUNNER_TEMP/yingxue-web-baseline.XXXXXX")"
git worktree add --detach "$scratch/previous" "refs/tags/$baseline"
trap 'git worktree remove --force "$scratch/previous"' EXIT
previous="$scratch/previous/web"
(cd "$previous" && bun install --frozen-lockfile)
previous_report="$RUNNER_TEMP/yingxue-web-baseline.json"
status=0
CANVAS_WEB_TEST_ROOT="$previous" CANVAS_WEB_TEST_FAILURE_REPORT="$previous_report" \
    bun "$repo_root/web/scripts/test-isolated.mjs" --process-isolation "${failed_files[@]}" || status=$?
test "$status" -le 1
test -s "$previous_report"

python3 - "$report" "$previous_report" "$baseline" <<'PY'
import json
import sys
from pathlib import Path

candidate, previous = [json.loads(Path(path).read_bytes()) for path in sys.argv[1:3]]
changed = [file for file, result in candidate.items() if not result["reasons"] or result != previous.get(file)]
if changed:
    raise SystemExit("New or changed test failures:\n" + "\n".join(changed))
print(f"Reproduced {len(candidate)} unchanged failing test files on {sys.argv[3]}. Release acceptance tests passed separately.")
PY
