import subprocess
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
keys=["web/src/services/api/generation-task.ts","web/src/services/api/task-center.ts","web/src/pages/create/index.tsx","web/src/components/layout/workspace-sidebar-nav.tsx","web/src/services/skill-runtime.ts","web/src/stores/use-config-store.ts"]
for p in keys:
    m=subprocess.run(["git","cat-file","blob","%s:%s"%(MT,p)],capture_output=True).stdout.decode("utf-8","replace")
    marks={k: m.count(k) for k in ["<<<<<<<","runLocalDreaminaGeneration","usesLocalDreamina","consumeCanvasAgentGenerationContinuation","consumeCanvasGenerationContinuation","CanvasAgentOperationImpact","CanvasOperationImpact","budgetCanvasAgentHistory","budgetAgentHistory","allowLocalChannel","comfyui-bridge"]}
    print(p)
    for k,v in marks.items():
        if v: print("    ",k,"=",v)
