import io, os, subprocess

ROOT = os.path.abspath(".")
T = "backend/cmd/migrate-sqlite-postgres/main_test.go"

def blob(rev):
    r = subprocess.run(["git", "cat-file", "blob", "%s:%s" % (rev, T)], capture_output=True)
    if r.returncode:
        return None
    return r.stdout.decode("utf-8", "replace")

head = blob("HEAD")
up = blob("MERGE_HEAD")
disk = io.open(os.path.join(ROOT, T.replace("/", os.sep)), encoding="utf-8", errors="replace").read()

MARK = "func TestCanvasHistoryCompositeKeyMigration(t *testing.T) {"

head_part = head[: head.index(MARK)].replace("\r\n", "\n") if MARK in head else head
up_part = up[up.index(MARK):] if MARK in up else ""

merged = head_part.rstrip("\n") + "\n\n" + up_part.replace("\r\n", "\n").rstrip("\n") + "\n"
merged = merged.replace("\n", "\r\n")

print("head lines", head.count("\n"), "up lines", up.count("\n"), "disk lines", disk.count("\n"))
print("new lines", merged.count("\r\n"))
print("has both tests:", "TestPaymentExportCoverageRejectsMixedPaymentHistoryWithoutWrites" in merged,
      "TestCanvasHistoryCompositeKeyMigration" in merged)
print("ends with brace:", merged.rstrip().endswith("}"))

if "--write" in os.sys.argv:
    bak = os.path.join(ROOT, ".local/cache/pre-fix6/main_test.go")
    os.makedirs(os.path.dirname(bak), exist_ok=True)
    io.open(bak, "w", encoding="utf-8", newline="").write(disk)
    io.open(os.path.join(ROOT, T.replace("/", os.sep)), "w", encoding="utf-8", newline="").write(merged)
    print("written")
