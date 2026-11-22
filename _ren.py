import re
from pathlib import Path

PATHMAP = {
    "@/lib/canvas/canvas-agent-ops": "@/lib/canvas/canvas-operation-contract",
    "./canvas-agent-ops": "./canvas-operation-contract",
    "@/lib/canvas/canvas-agent-context-budget": "@/lib/canvas/agent-context-budget",
    "@/lib/canvas/canvas-agent-context": "@/lib/canvas/canvas-context-discovery",
    "@/lib/canvas/canvas-agent-storyboard": "@/lib/canvas/canvas-storyboard-operations",
    "@/lib/canvas/canvas-agent-workflow": "@/lib/canvas/canvas-workflow-builder",
    "../src/lib/canvas/canvas-agent-ops": "../src/lib/canvas/canvas-operation-contract",
    "../src/lib/canvas/canvas-agent-context": "../src/lib/canvas/canvas-context-discovery",
    "../src/lib/canvas/canvas-agent-context-budget": "../src/lib/canvas/agent-context-budget",
    "../src/lib/canvas/canvas-agent-storyboard": "../src/lib/canvas/canvas-storyboard-operations",
    "../src/lib/canvas/canvas-agent-workflow": "../src/lib/canvas/canvas-workflow-builder",
    "../src/pages/canvas/use-canvas-agent-operations": "../src/pages/canvas/use-canvas-operation-history",
    "./use-canvas-agent-operations": "./use-canvas-operation-history",
}

SYMMAP = {
    "CanvasAgentOp": "CanvasOperation",
    "CanvasAgentSnapshot": "CanvasSnapshot",
    "CanvasAgentOperationImpact": "CanvasOperationImpact",
    "CanvasAgentGenerationVerification": "CanvasGenerationVerification",
    "CanvasAgentPostcondition": "CanvasOperationPostcondition",
    "verifyCanvasAgentOps": "verifyCanvasOperations",
    "canvasAgentPostconditionMessage": "canvasOperationPostconditionMessage",
    "summarizeCanvasAgentOps": "summarizeCanvasOperations",
    "previewCanvasAgentOps": "previewCanvasOperations",
    "applyCanvasAgentOps": "applyCanvasOperations",
    "hashCanvasAgentSnapshot": "hashCanvasSnapshot",
    "CanvasAgentResource": "CanvasResourceInsight",
    "buildCanvasAgentContext": "buildCanvasContext",
    "findCanvasAgentNodes": "findCanvasNodes",
    "getCanvasAgentNode": "getCanvasNode",
    "getCanvasAgentConnection": "getCanvasConnection",
    "getCanvasAgentGenerationTasks": "getCanvasGenerationTasks",
    "getCanvasAgentResources": "getCanvasResources",
    "validateCanvasAgentOps": "validateCanvasOperations",
    "budgetCanvasAgentHistory": "budgetAgentHistory",
    "runCanvasAgentGenerationOps": "runCanvasGenerationOps",
    "consumeCanvasAgentGenerationContinuation": "consumeCanvasGenerationContinuation",
    "persistCanvasAgentGenerationContinuationEffect": "persistCanvasOperationContinuationEffect",
}

def rewrite(text: str) -> str:
    for a, b in sorted(PATHMAP.items(), key=lambda kv: -len(kv[0])):
        text = text.replace('"%s"' % a, '"%s"' % b).replace("'%s'" % a, "'%s'" % b)
    for a, b in SYMMAP.items():
        text = re.sub(r'\b%s\b' % re.escape(a), b, text)
    return text

targets = []
for arg in ['web/src', 'web/test']:
    for p in Path(arg).rglob('*'):
        if p.suffix in ('.ts', '.tsx'):
            t = p.read_text(encoding='utf-8')
            if any(k in t for k in PATHMAP) or any(re.search(r'\b%s\b' % k, t) for k in SYMMAP):
                targets.append(p)

for p in targets:
    t = p.read_text(encoding='utf-8')
    n = rewrite(t)
    if n != t:
        p.write_text(n, encoding='utf-8')
        print('rewrote', p)
print('files touched:', len(targets))
