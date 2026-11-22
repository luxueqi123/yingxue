from pathlib import Path
p = Path('web/src/types/canvas.ts')
t = p.read_text(encoding='utf-8')
n = t
n = n.replace(
    'import type { ArtCritiqueNodeState } from "@/lib/art-critique/contracts";',
    'import type { ArtCritiqueNodeState } from "@/lib/art-critique/contracts";\nimport type { PortraitClearanceNodeState } from "@/lib/portrait-clearance/contracts";',
    1)
n = n.replace('    workflowProvider?: "model" | "runninghub";',
              '    workflowProvider?: "model" | "runninghub" | "comfyui";', 1)
n = n.replace('    runningHubWorkflowKind?: "workflow" | "app";',
              '    runningHubWorkflowKind?: "workflow" | "app";\n    comfyBridgeWorkflowId?: string;', 1)
n = n.replace('    relation?: "storyboard-output" | "storyboard-asset-reference" | "batch-output";',
              '    relation?: "storyboard-output" | "storyboard-asset-reference" | "batch-output";', 1)
assert n != t
p.write_text(n, encoding='utf-8')
print('types/canvas.ts patched')
