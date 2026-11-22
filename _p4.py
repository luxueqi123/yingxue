import io,subprocess,sys
def t(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8","replace")
nd=["canPreview ? setImagePreview(reference) : onInsert(reference)","setImagePreview","defaultCreationMode","initialComposerPreferences.mode || defaultCreationMode","saved.mode || defaultCreationMode","creation-user-message-attachments"]
for p in ["web/src/components/canvas/canvas-node-prompt-panel.tsx","web/src/pages/create/index.tsx"]:
    print("###",p)
    for rev,name in [("01a2d171","BASE"),("HEAD","映雪"),("MERGE_HEAD","UP")]:
        s=t(rev,p)
        print("  %-6s %s"%(name,"MISSING" if s is None else " ".join(("Y" if n in s else "n") for n in nd)))
    s=io.open(p,encoding="utf-8",errors="replace").read()
    print("  %-6s %s"%("disk"," ".join(("Y" if n in s else "n") for n in nd)))
