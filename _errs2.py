import subprocess,io,re
BUN=r"D:\天琊书客\项目\天琊映雪无限画布\.local\bun-runtime\oven\package\bin\bun.exe"
for t in ["test/ltv-audio-execution.test.ts","test/topaz-video-execution.test.ts","test/ark-video-execution.test.ts","test/project-document-persistence.test.ts","test/canvas-image-upload.test.tsx","test/canvas-node-config-reset.test.ts","test/create-canvas-handoff.test.ts","test/local-runtime-connection.test.ts","test/local-cli-settings.test.ts","test/ui-kit-retirement.test.ts","test/appearance-bootstrap.test.ts"]:
    p=subprocess.run([BUN,"test",t],cwd="web",capture_output=True,text=True,encoding="utf-8",errors="replace")
    s=(p.stdout or "")+(p.stderr or "")
    print("\n##########",t)
    for m in re.finditer(r"(?m)^error: .*", s): print("   ",m.group(0)[:200])
    for m in re.finditer(r"(?m)^\s*at ([^\n]+)$", s):
        print("    AT",m.group(1)[:190]); break
