import subprocess

NEEDLE_ROOT = '{ path: "/", element: <RequireAuth>{deferred(<CreatePage />)}</RequireAuth> }'
NEEDLE_HOME = 'path: "/home"'
NEEDLE_SHOWCASE = "ShowcasePage"

for ref in ["01a2d171", "d2caa680", "bdd61bbf", "98822b65", "origin/main", ":"]:
    r = subprocess.run(["git", "show", ref + ":web/test/workspace-route-loading.test.ts"], capture_output=True, text=True)
    if r.returncode != 0:
        print(ref, "ERR")
        continue
    t = r.stdout
    print(ref, "| rootCreate:", NEEDLE_ROOT in t, "| homeNeg:", NEEDLE_HOME in t, "| lines:", len(t.splitlines()))

print("--- welcome-application ---")
for ref in ["origin/main", "HEAD", ":"]:
    r = subprocess.run(["git", "show", ref + ":web/src/welcome-application.tsx"], capture_output=True, text=True)
    print(ref, "rc=", r.returncode)
    if r.returncode == 0:
        print("\n".join(r.stdout.splitlines()[:25]))

print("--- origin vite input ---")
r = subprocess.run(["git", "show", "origin/main:web/vite.config.ts"], capture_output=True, text=True)
for line in r.stdout.splitlines():
    if any(k in line for k in ("input", "welcome", "index.html", "rollupOptions")):
        print(line)
