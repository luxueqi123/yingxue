import os
paths=["web/src/stores/canvas/use-canvas-agent-store.ts","web/src/components/canvas/use-resolved-canvas-resource-references.ts","web/src/components/canvas/canvas-agent-panel-chrome.tsx","web/src/pages/canvas/canvas-version-history.tsx","web/src/pages/canvas/canvas-version-preview.tsx","web/src/pages/canvas/canvas-sync-status.tsx","web/src/pages/canvas/use-canvas-active-tasks.ts"]
for p in paths: print(os.path.exists(p), os.path.getsize(p) if os.path.exists(p) else "", p)
