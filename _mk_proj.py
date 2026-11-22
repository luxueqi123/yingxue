# -*- coding: utf-8 -*-
"""project.tsx 6 块并集裁决。"""
import json, subprocess
from pathlib import Path
P="web/src/pages/canvas/project.tsx"
def git(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
HEAD=git("HEAD"); ORIG=git("MERGE_HEAD")
def find(lines,needle,start=0,nth=1):
    n=0
    for i in range(start,len(lines)):
        if needle in lines[i]:
            n+=1
            if n==nth: return i
    raise SystemExit("NOT FOUND %r nth=%d"%(needle,nth))
def rng(lines,a,b,a_nth=1,b_nth=1):
    i=find(lines,a,0,a_nth); j=find(lines,b,i,b_nth); return lines[i:j+1]
def ind(ls,n): return [(" "*n)+l if l.strip() else l for l in ls]

# B1 映雪简报/面板宽度/hook + codex 本地运行时探测 + 上游 agentMentionReferences
B1  = ["    const codexAutoConnect = shouldAutoConnectCanvasRuntime(searchParams);",
       "    const codexCompactAgent = codexAutoConnect && readLocalRuntimeBootstrapState().legacyDeepLinkRejected;"]
B1 += rng(HEAD,"const [creationBrief, setCreationBrief]","= useCanvasAssistantVisibility();")
B1[-1] = "    const { agentMode, assistantClosing, assistantMounted, assistantOpen, closeAgent, openAgent: openAssistantAgent, setAgentMode } = useCanvasAssistantVisibility();"
B1 += [l for l in ORIG if "const agentMentionReferences = useMemo(" in l]

# B2 映雪简报恢复 + 上游 ?agent=1 深链
B2  = rng(HEAD,'const briefId = searchParams.get("brief");',"}, [projectId, saveCanvasProject, setNodes, setSearchParams, updateProject]);")
B2 += [""] + ["    useEffect(() => {"] + rng(ORIG,'if (!projectLoaded || searchParams.get("agent") !== "1") return;',"}, [projectLoaded, searchParams, setSearchParams, openAgent]);")

# B3 映雪案例参考绑定 + 上游换行签名的 handleReplaceNodeReference
B3  = rng(HEAD,"const handleBindCaseReferences = useCallback((targetNodeId","}, [connectionsRef, message, modal, nodesRef, setNodes]);")
B3 += [""] + ORIG[find(ORIG,"const handleReplaceNodeReference = useCallback("):find(ORIG,"if (!sourceNode || sourceNode.id === oldReference.nodeId) return;")+1]

# B4 deps 并集
B4 = [rng(HEAD,"[configInputsById, handleBindCaseReferences,","workspaceMode],")[0].replace("mentionReferencesByNodeId, projectId,","mentionReferencesByNodeId, message, projectId,")]

# B5 映雪智能体列 + 上游活动任务/专注模式条
B5 = ind(rng(HEAD,"{assistantMounted ? (",") : null}"),4) + [""] + rng(ORIG,"<CanvasActiveTaskPanel tasks={activeTasks}","onFit={fitCanvasContent}")

# B6 映雪分镜多视图 + 上游换行缩进
B6 = ind(rng(HEAD,"<CanvasScriptEditor","onVideoInputModeChange={(storyboardVideoInputMode)"),4) + [ORIG[find(ORIG,"<CanvasScriptEditor")+23]]

spec={1:B1,2:B2,3:B3,4:B4,5:B5,6:B6}
Path("_spec_proj.json").write_text(json.dumps({P:{str(k):v for k,v in spec.items()}},ensure_ascii=False,indent=1),encoding="utf-8")
for k,v in sorted(spec.items()):
    print("######## B%d (%d lines)"%(k,len(v)))
    for l in v[:2]+["   . . ."]+v[-2:]: print("  |",l[:120])
