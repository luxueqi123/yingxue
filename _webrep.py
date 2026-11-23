"""Diff bun-test failures between two captured runs (Chinese failure names included)."""

import re
import sys

FAIL_RE = re.compile(r"^\(fail\)\s+(.*?)\s+\[[\d.]+ms\]\s*$")


def failures(path):
    out = set()
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            m = FAIL_RE.match(line.strip())
            if m:
                out.add(m.group(1))
    return out


def main():
    base = failures(sys.argv[1])
    now = failures(sys.argv[2])
    print(f"baseline failures: {len(base)}")
    print(f"current failures:  {len(now)}")
    print("\n=== regression (fails now, passed in baseline) ===")
    for name in sorted(now - base):
        print("  ", name)
    print("\n=== fixed (failed in baseline, passes now) ===")
    for name in sorted(base - now):
        print("  ", name)
    print("\n=== pre-existing on both ===")
    for name in sorted(base & now):
        print("  ", name)


if __name__ == "__main__":
    main()
