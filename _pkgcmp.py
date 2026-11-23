"""Compare a plugin package artifact across revisions: manifest version and the
ordered $ref list under protocol.poll (and protocol.result), so we can tell
whether a manual merge dropped keys."""

import io
import json
import subprocess
import sys
import zipfile

REVS = ("01a2d171", "HEAD", "MERGE_HEAD")


def manifest(rev, path):
    p = subprocess.run(["git", "cat-file", "blob", f"{rev}:{path}"], capture_output=True)
    if p.returncode != 0:
        return None, []
    z = zipfile.ZipFile(io.BytesIO(p.stdout))
    names = z.namelist()
    if "manifest.json" not in names:
        return None, names
    return json.loads(z.read("manifest.json")), names


def refs(node):
    out = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref" and isinstance(value, str):
                out.append(value)
            else:
                out.extend(refs(value))
    elif isinstance(node, list):
        for item in node:
            out.extend(refs(item))
    return out


def main():
    path = sys.argv[1]
    for rev in REVS:
        m, names = manifest(rev, path)
        if m is None:
            print(f"{rev}: no manifest (files={names})")
            continue
        providers = (m.get("contributes") or {}).get("providers") or []
        print(f"===== {rev}  version={m.get('version')}")
        for provider in providers:
            proto = provider.get("protocol", {})
            print(f"   provider={provider.get('id')}")
            for section in ("create", "poll", "result"):
                if section in proto:
                    print(f"      {section}: {refs(proto[section])}")


if __name__ == "__main__":
    main()
