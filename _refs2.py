import re
from pathlib import Path
syms = ['CanvasAgentOp', 'CanvasAgentSnapshot', 'CanvasAgentOperationImpact', 'CanvasAgentGenerationVerification', 'CanvasAgentPostcondition', 'verifyCanvasAgentOps', 'canvasAgentPostconditionMessage', 'summarizeCanvasAgentOps', 'previewCanvasAgentOps', 'applyCanvasAgentOps', 'hashCanvasAgentSnapshot', 'CanvasAgentResource', 'buildCanvasAgentContext', 'findCanvasAgentNodes', 'getCanvasAgentNode', 'getCanvasAgentConnection', 'getCanvasAgentGenerationTasks', 'getCanvasAgentResources', 'validateCanvasAgentOps', 'useCanvasAgentOperations']
root = Path('web')
files = [p for p in root.rglob('*') if p.suffix in ('.ts', '.tsx')]
tot = 0
for p in files:
    t = p.read_text(encoding='utf-8', errors='replace')
    hits = []
    for s in syms:
        c = len(re.findall(r'\b' + s + r'\b', t))
        if c:
            hits.append('%s=%d' % (s, c))
    if hits:
        print('%-90s %s' % (str(p).replace('\\', '/'), ' '.join(hits)))
        tot += 1
print('files', tot)
