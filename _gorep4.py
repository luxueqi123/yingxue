"""Definitive go-test failure classifier.

For every top-level test that failed, collect every message line from its whole
subtree. The test is environment-limited only when every message line is an
environment marker; otherwise the non-marker lines are the real evidence."""

import collections
import json
import re
import sys

ENV_MARKERS = (
    "go-sqlite3 requires cgo",
    "DDCAT_SMOKE_API_KEY",
    "redis-server unavailable",
    "redis-server not",
    "set CANVAS_TEST_POSTGRES_DSN",
)

MSG_RE = re.compile(r"^\s+(\S+\.go:\d+):")


def load(path):
    lines_by_key = collections.defaultdict(list)
    status = {}
    with open(path, encoding="utf-8-sig", errors="replace") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw.startswith("{"):
                continue
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            key = (d.get("Package") or "", d.get("Test") or "")
            if d.get("Action") == "output":
                lines_by_key[key].append((d.get("Output") or "").rstrip("\n"))
            elif d.get("Action") in ("pass", "fail", "skip"):
                status[key] = d["Action"]
    return lines_by_key, status


def real_failures(path):
    lines_by_key, status = load(path)
    per_pkg = collections.defaultdict(list)
    for (pkg, test), lines in lines_by_key.items():
        per_pkg[pkg].append((test, lines))
    out = {}
    for (pkg, test), action in status.items():
        if action != "fail" or "/" in test or not test:
            continue
        msgs = []
        for other, lines in per_pkg[pkg]:
            if other == test or other.startswith(test + "/"):
                msgs.extend(lines)
        evidence = [ln.strip() for ln in msgs if MSG_RE.match(ln)]
        real = [ln for ln in evidence if not any(m in ln for m in ENV_MARKERS)]
        if not evidence:
            out[(pkg, test)] = ["<no message line captured>"]
        elif real:
            out[(pkg, test)] = real[:4]
    return out


def main():
    base = real_failures(sys.argv[1])
    integ = real_failures(sys.argv[2])
    print(f"baseline real failures: {len(base)}")
    print(f"integration real failures: {len(integ)}")
    print("\n=== regressions (new in integration) ===")
    for key in sorted(integ):
        if key in base:
            continue
        print(f"[{key[0].split('/')[-1]}] {key[1]}")
        for msg in integ[key]:
            print("     ", msg[:190])
    print("\n=== fixed (gone in integration) ===")
    for key in sorted(base):
        if key not in integ:
            print(f"  [{key[0].split('/')[-1]}] {key[1]}")
    print("\n=== pre-existing on both sides ===")
    for key in sorted(base):
        if key in integ:
            print(f"  [{key[0].split('/')[-1]}] {key[1]}")


if __name__ == "__main__":
    main()
