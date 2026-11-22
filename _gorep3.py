"""Print the raw captured output for a named set of top-level go test failures."""

import collections
import json
import sys


def load(path):
    outs = collections.defaultdict(list)
    with open(path, encoding="utf-8-sig", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("Action") == "output":
                key = (d.get("Package") or "", d.get("Test") or "")
                outs[key].append((d.get("Output") or "").rstrip())
    return outs


def main():
    outs = load(sys.argv[1])
    wanted = sys.argv[2:]
    for key, lines in outs.items():
        pkg, test = key
        if not test:
            continue
        top = test.split("/")[0]
        if top not in wanted:
            continue
        print(f"===== [{pkg.split('/')[-1]}] {test}")
        for ln in lines:
            print("   ", ln)


if __name__ == "__main__":
    main()
