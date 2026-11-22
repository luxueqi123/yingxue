import { expect, test } from "bun:test";
import { resolve } from "node:path";
import type { ChunkingContext } from "rolldown";
import { canvasRouteChunks, workspaceStartupChunks } from "../vite-plugins/workspace-startup-chunks";

const root = resolve(import.meta.dir, "..").replace(/\\/g, "/");
const moduleId = (path: string) => `${root}/${path}`;

function graph() {
    const imports = new Map([
        ["src/main.tsx", ["src/bootstrap.ts"]],
        ["src/application.tsx", ["src/shared.ts"]],
        ["src/layouts/user-layout.tsx", ["src/shared.ts"]],
        ["src/pages/home/index.tsx", ["src/home.ts", "src/session-shared.ts"]],
        ["src/lib/user-session.ts", ["src/session-shared.ts", "node_modules/session-storage/index.js"]],
        ["src/pages/create/index.tsx", ["src/create.ts"]],
        ["src/pages/canvas/index.tsx", ["src/canvas-list.ts", "src/shared.ts"]],
        ["src/pages/canvas/project.tsx", ["src/editor.ts", "src/shared.ts", "node_modules/editor-controls/index.js", "src/agent-shared.ts", "src/asset-helper.ts"]],
        ["src/asset-helper.ts", ["src/asset-protocol.ts"]],
        ["src/pages/assets/index.tsx", ["src/asset-helper.ts"]],
        ["src/editor.ts", ["src/editor-toolbar.ts"]],
        ["src/components/canvas/canvas-cloud-agent-panel.tsx", ["src/agent-shared.ts"]],
    ].map(([path, dependencies]) => [moduleId(path as string), (dependencies as string[]).map(moduleId)]));
    return { getModuleInfo: (id: string) => ({
        importedIds: imports.get(id) || [],
        importers: [...imports].filter(([, dependencies]) => dependencies.includes(id)).map(([parent]) => parent),
        dynamicImporters: id === moduleId("src/components/canvas/canvas-cloud-agent-panel.tsx") ? [moduleId("src/layouts/user-layout.tsx")] : [],
        dynamicallyImportedIds: id === moduleId("src/editor.ts") ? [moduleId("src/lazy-3d.ts")] : [],
    }) } as unknown as ChunkingContext;
}

test("editor static dependencies share chunks without changing startup or canvas list ownership", () => {
    const chunks = workspaceStartupChunks(root);
    const canvas = canvasRouteChunks(root);
    const context = graph();
    const name = (path: string) => chunks.name(moduleId(path), context) ?? canvas.name(moduleId(path), context);
    expect(name("src/bootstrap.ts")).toBe("entry-bootstrap");
    expect(name("src/shared.ts")).toBe("workspace-startup");
    expect(name("src/home.ts")).toBe("home-content");
    expect(name("src/lib/user-session.ts")).toBe("workspace-session");
    expect(name("src/session-shared.ts")).toBe("workspace-session");
    expect(name("node_modules/session-storage/index.js")).toBe("session-controls");
    expect(name("src/create.ts")).toBe("workspace-creation");
    expect(name("src/canvas-list.ts")).toBe("canvas-library");
    expect(name("src/pages/canvas/project.tsx")).toBe("canvas-editor");
    expect(name("src/editor-toolbar.ts")).toBe("canvas-editor");
    expect(name("node_modules/editor-controls/index.js")).toBe("canvas-editor");
    expect(name("src/lazy-3d.ts")).toBeNull();
    expect(name("src/agent-shared.ts")).toBe("workspace-agent");
    expect(name("src/asset-helper.ts")).toBe("canvas-editor-common");
    expect(name("src/asset-protocol.ts")).toBe("canvas-editor-common");
    expect(name("src/pages/assets/index.tsx")).toBeNull();
    expect(canvas.entriesAware).toBe(false);
    expect(canvas.priority).toBeLessThan(chunks.priority);
    expect(name("src/components/canvas/canvas-cloud-agent-panel.tsx")).toBe("workspace-agent");
    expect(name("src/pages/admin/index.tsx")).toBeNull();
});
