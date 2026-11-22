import subprocess
P="web/src/pages/canvas/canvas-project-top-bar.tsx"
def git(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n")
for ref in ["HEAD","MERGE_HEAD"]:
    s=git(ref)
    print("=====",ref,len(s))
    for i,l in enumerate(s.split("\n")):
        if any(k in l for k in ["agentOpen","compactAgentStatus","onToggleAgent","agentPanelWidth","Bot","CanvasAgent"]):
            print("  ",i+1,l.strip()[:130])
