import subprocess,io,os,json
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"; HEAD="98822b65"; UP="b9d60f98"; BASE="01a2d171"
plan=json.load(io.open("_mtplan2.json",encoding="utf-8"))
safe=set(plan["safe"])
imp=set()
mapping=json.load(io.open("_attrib.json",encoding="utf-8")) if os.path.exists("_attrib.json") else None
import re
# test-implicated source files from mapping in _attrib.py
srcs=["web/src/lib/app-theme.ts","web/src/lib/skin-themes.ts","web/src/pages/admin/theme/admin-ant-theme.ts","web/src/pages/auth/auth-scene.tsx","web/src/main.tsx","web/index.html","web/src/components/brand/brand-logo.tsx","web/src/stores/use-appearance-store.ts","web/src/pages/canvas/project.tsx","web/src/components/canvas/canvas-file-upload-content.tsx","web/src/lib/canvas/canvas-project-domain.ts","web/src/pages/create/index.tsx","web/src/pages/create/creation-workspace.tsx","web/src/components/layout/workspace-top-bar.tsx","web/src/components/assets/asset-library-picker-modal.tsx","web/src/components/canvas/canvas-node-prompt-panel.tsx","web/src/services/api/task-center.ts","web/src/lib/generation-task-display.ts","web/src/pages/tasks/index.tsx","web/src/services/api/generation-task.ts","web/src/pages/canvas/use-canvas-generation.ts","web/src/lib/canvas/canvas-generation-task-sync.ts","web/src/services/resource-blob-cache.ts","web/src/services/api/image.ts","web/src/stores/use-config-store.ts","web/src/pages/settings/channel-settings-pane.tsx","web/src/pages/admin/channels/channels-page.tsx","web/src/pages/settings/index.tsx","web/src/components/layout/client-root-init.tsx","web/src/services/user-data-sync.ts","web/src/stores/canvas/use-canvas-store.ts","web/src/stores/use-asset-store.ts","web/src/services/canvas-asset-repair.ts","web/src/lib/user-session.ts","web/src/router.tsx","web/src/components/layout/workspace-sidebar-nav.tsx","web/src/layouts/user-layout.tsx","web/src/lib/workspace-route-modules.ts","web/src/styles/globals.css","web/src/components/conversation/README.md"]
json.dump(srcs, io.open("_srcs.json","w",encoding="utf-8"), ensure_ascii=False)
print("在 MT-safe 中且被测试牵连的文件：")
for p in srcs:
    if p in safe: print("   MT-SAFE  ",p)
print()
print("被测试牵连但不在 MT-safe：")
for p in srcs:
    if p not in safe: print("   **       ",p)
