"""Classify bun-test failures against a baseline run, distinguishing
"was passing before" (true regression) from "test did not exist before"
(new upstream test that fails here)."""

import re
import sys

LINE_RE = re.compile(r"^\((pass|fail)\)\s+(.*?)\s+\[[\d.]+ms\]\s*$")


def load(path):
    passes, fails = set(), set()
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            m = LINE_RE.match(line.strip())
            if not m:
                continue
            (passes if m.group(1) == "pass" else fails).add(m.group(2))
    return passes, fails


def main():
    base_pass, base_fail = load(sys.argv[1])
    now_pass, now_fail = load(sys.argv[2])
    print(f"baseline: {len(base_pass)} pass / {len(base_fail)} fail")
    print(f"current:  {len(now_pass)} pass / {len(now_fail)} fail")

    regressions = sorted(now_fail & base_pass)
    new_tests = sorted(n for n in now_fail if n not in base_pass and n not in base_fail)
    inherited = sorted(now_fail & base_fail)

    print(f"\n=== TRUE REGRESSIONS (passed in baseline, fail now): {len(regressions)}")
    for name in regressions:
        print("  ", name)
    print(f"\n=== NEW tests failing (not present in baseline): {len(new_tests)}")
    for name in new_tests:
        print("  ", name)
    print(f"\n=== pre-existing failures still failing: {len(inherited)}")
    for name in inherited:
        print("  ", name)

    fixed = sorted(base_fail - now_fail - set(new_tests))
    print(f"\n=== now passing (was failing in baseline): {len(fixed)}")
    for name in fixed:
        print("  ", name)


if __name__ == "__main__":
    main()
