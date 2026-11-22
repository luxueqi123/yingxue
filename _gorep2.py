"""Classify go test failures as environment-limited (cgo/redis/smoke) or real,
aggregating subtest output into the parent test. Then diff baseline vs integration."""

import collections
import json
import sys

ENV_MARKERS = ("go-sqlite3 requires cgo", "DDCAT_SMOKE_API_KEY", "redis-server unavailable", "redis-server not")


def load(path):
    outs = collections.defaultdict(list)
    status = {}
    with open(path, encoding="utf-8-sig", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                d = json.loads(line)
            except ValueError:
                continue
            key = (d.get("Package") or "", d.get("Test") or "")
            if d.get("Action") == "output":
                outs[key].append((d.get("Output") or "").rstrip())
            if d.get("Action") in ("pass", "fail", "skip"):
                status[key] = d["Action"]
    return outs, status


def real_failures(path):
    outs, status = load(path)
    by_pkg = collections.defaultdict(list)
    for (pkg, test), lines in outs.items():
        by_pkg[pkg].append((test, lines))
    res = {}
    for (pkg, test), action in status.items():
        if action != "fail" or "/" in test:
            continue
        msgs = []
        for other, lines in by_pkg[pkg]:
            if other == test or other.startswith(test + "/"):
                msgs.extend(lines)
        joined = "\n".join(msgs)
        if any(m in joined for m in ENV_MARKERS):
            go_msgs = [ln.strip() for ln in msgs if ".go:" in ln]
            non_env = [ln for ln in go_msgs if not any(m in ln for m in ENV_MARKERS)]
            if not non_env:
                continue
            msgs = non_env
        res[(pkg, test)] = [ln.strip() for ln in msgs if ".go:" in ln][:3]
    return res


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
            print("     ", msg[:200])
    print("\n=== fixed (gone in integration) ===")
    for key in sorted(base):
        if key not in integ:
            print(f"  [{key[0].split('/')[-1]}] {key[1]}")
    print("\n=== still failing on both sides (pre-existing) ===")
    for key in sorted(base):
        if key in integ:
            print(f"  [{key[0].split('/')[-1]}] {key[1]}")


if __name__ == "__main__":
    main()
