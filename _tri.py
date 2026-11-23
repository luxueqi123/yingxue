import subprocess, os, sys

REVS = ["01a2d171", "HEAD", "MERGE_HEAD"]


def short(rev, path):
    p = subprocess.run(["git", "rev-parse", f"{rev}:{path}"], capture_output=True, text=True)
    return p.stdout.strip()[:8] if p.returncode == 0 else "-"


def main(paths):
    for f in paths:
        cells = [short(r, f) for r in REVS]
        disk = "disk" if os.path.exists(f) else "--"
        print(f"{cells[0]:9} {cells[1]:9} {cells[2]:9} {disk:4} {f}")


if __name__ == "__main__":
    main(sys.argv[1:])
