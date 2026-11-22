import collections
import json
import sys

ENV_MARKERS = ("go-sqlite3 requires cgo", "DDCAT_SMOKE_API_KEY", "redis-server unavailable")


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


def real_failures(path, top_only=True):
    outs, status = load(path)
    res = {}
    for key, action in status.items():
        pkg, test = key
        if action != "fail" or not test:
            continue
        if top_only and "/" in test:
            continue
        text = " ".join(line for line in outs.get(key, []))
        if any(marker in text for marker in ENV_MARKERS):
            continue
        msgs = [ln.strip() for ln in outs.get(key, []) if ".go:" in ln]
        msgs = [ln for ln in msgs if not any(marker in ln for marker in ENV_MARKERS)]
        res[key] = msgs[:3]
    return res


def main():
    base = real_failures(sys.argv[1])
    integ = real_failures(sys.argv[2])
    print(f"baseline real failures: {len(base)}")
    print(f"integration real failures: {len(integ)}")
    print()
    print("=== regressions (real failures new in integration) ===")
    for key in sorted(integ):
        if key in base:
            continue
        pkg = key[0].split("/")[-1]
        print(f"[{pkg}] {key[1]}")
        for msg in integ[key]:
            print("     ", msg[:170])
    print()
    print("=== fixed (real failures gone in integration) ===")
    for key in sorted(base):
        if key not in integ:
            print(f"  [{key[0].split('/')[-1]}] {key[1]}")


if __name__ == "__main__":
    main()
