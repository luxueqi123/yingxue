import { resolve } from "node:path";
import type { ChunkingContext } from "rolldown";

function staticModules(webDir: string, roots: string[], context: ChunkingContext) {
    const modules = new Set<string>();
    const visit = (id: string) => {
        if (modules.has(id)) return;
        const info = context.getModuleInfo(id);
        if (!info) return;
        modules.add(id);
        for (const dependency of info.importedIds) visit(dependency);
    };
    for (const root of roots) visit(resolve(webDir, root).replace(/\\/g, "/"));
    return modules;
}

function sharedStaticModules(modules: Set<string>, root: string, context: ChunkingContext) {
    const shared = new Set<string>();
    const visit = (id: string) => {
        if (id === root || !modules.has(id) || shared.has(id)) return;
        shared.add(id);
        for (const dependency of context.getModuleInfo(id)?.importedIds || []) visit(dependency);
    };
    for (const id of modules) {
        if (id === root) continue;
        const info = context.getModuleInfo(id);
        if (info && (info.dynamicImporters.length || info.importers.some(importer => !modules.has(importer)))) visit(id);
    }
    return shared;
}

/** Merge the existing static startup graph without pulling in lazy editors. */
export function workspaceStartupChunks(webDir: string) {
    let startup: Set<string> | undefined;
    let home: Set<string> | undefined;
    let session: Set<string> | undefined;
    let creation: Set<string> | undefined;
    let bootstrap: Set<string> | undefined;
    let agent: Set<string> | undefined;
    return {
        name(id: string, context: ChunkingContext) {
            bootstrap ??= staticModules(webDir, ["src/main.tsx"], context);
            startup ??= staticModules(webDir, [
                "src/application.tsx", "src/layouts/user-layout.tsx",
            ], context);
            home ??= staticModules(webDir, ["src/pages/home/index.tsx"], context);
            session ??= staticModules(webDir, ["src/lib/user-session.ts"], context);
            creation ??= staticModules(webDir, ["src/pages/create/index.tsx"], context);
            agent ??= staticModules(webDir, ["src/components/canvas/canvas-cloud-agent-panel.tsx"], context);
            // Keep the tiny entry independent of the workspace (including /welcome).
            if (bootstrap.has(id)) return id.includes("/node_modules/") ? null : "entry-bootstrap";
            if (startup.has(id)) return id.includes("/node_modules/") ? "workspace-controls" : "workspace-startup";
            // Session recovery is needed on every private route, including admin.
            // Shared stores must not make it import the lobby or creation page.
            if (session.has(id)) return id.includes("/node_modules/") ? "session-controls" : "workspace-session";
            if (home.has(id)) return id.includes("/node_modules/") ? "home-controls" : "home-content";
            if (creation.has(id)) return id.includes("/node_modules/") ? "creation-controls" : "workspace-creation";
            if (agent.has(id)) return id.includes("/node_modules/") ? "agent-controls" : "workspace-agent";
            return null;
        },
        minSize: 0,
        priority: 25,
        includeDependenciesRecursively: false,
    };
}

/** Coalesce small canvas dependencies while preserving every lazy entry boundary. */
export function canvasRouteChunks(webDir: string) {
    let library: Set<string> | undefined;
    let editor: Set<string> | undefined;
    let libraryShared: Set<string> | undefined;
    let editorShared: Set<string> | undefined;
    return {
        name(id: string, context: ChunkingContext) {
            library ??= staticModules(webDir, ["src/pages/canvas/index.tsx"], context);
            editor ??= staticModules(webDir, ["src/pages/canvas/project.tsx"], context);
            libraryShared ??= sharedStaticModules(library, resolve(webDir, "src/pages/canvas/index.tsx").replace(/\\/g, "/"), context);
            editorShared ??= sharedStaticModules(editor, resolve(webDir, "src/pages/canvas/project.tsx").replace(/\\/g, "/"), context);
            // Other routes share these helpers, but must never import a canvas entry
            // just to use them. List callers also must not fetch editor-only helpers.
            if (libraryShared.has(id)) return "canvas-library-common";
            if (editorShared.has(id)) return "canvas-editor-common";
            if (library.has(id)) return "canvas-library";
            if (editor.has(id)) return "canvas-editor";
            return null;
        },
        minSize: 0,
        priority: 24,
        includeDependenciesRecursively: false,
        entriesAware: false,
    };
}
