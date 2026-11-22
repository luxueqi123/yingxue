import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import { createCanvasStateWriter } from "../src/lib/canvas/canvas-editor-state";
import { stampCanvasNodeChanges, updateCanvasNode, updateCanvasNodes } from "../src/lib/canvas/canvas-node-timestamps";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

// Execute the actual page callbacks with deferred React publication. Replaying an
// earlier metadata updater must not roll back the synchronous editor ref used by Save.
const page = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const parsedPage = parse(page, { sourceType: "module", plugins: ["typescript", "jsx"] });
function callback(name: string, dependencies: Record<string, unknown>) {
    let declaration: string | undefined;
    const visit = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        const node = value as Record<string, unknown>;
        if (node.type === "VariableDeclarator" && (node.id as { name?: string })?.name === name) {
            const initializer = node.init as { start: number; end: number };
            declaration = `const ${name} = ${page.slice(initializer.start, initializer.end)};`;
            return;
        }
        for (const child of Object.values(node)) {
            if (Array.isArray(child)) child.forEach(visit);
            else if (child && typeof child === "object") visit(child);
        }
    };
    visit(parsedPage);
    if (!declaration) throw new Error(`Missing page callback ${name}`);
    const code = new Bun.Transpiler({ loader: "ts" }).transformSync(declaration);
    return new Function(...Object.keys(dependencies), code + `\nreturn ${name};`)(...Object.values(dependencies)) as (id: string, update: (node: CanvasNodeData) => CanvasNodeData) => void;
}

for (const name of ["updateNodeFromContent", "updateMediaNodeFromContent"]) {
    test(`${name}: metadata publication and React replay preserve a newer rename for immediate Save`, () => {
        const initial: CanvasNodeData[] = [{ id: "image", type: CanvasNodeType.Image, title: "old", position: { x: 0, y: 0 }, width: 420, height: 240, metadata: {} }];
        const nodesRef = { current: initial };
        const pending: Array<CanvasNodeData[] | ((nodes: CanvasNodeData[]) => CanvasNodeData[])> = [];
        const setNodesState = (value: typeof pending[number]) => pending.push(value);
        const setNodes = createCanvasStateWriter(nodesRef, setNodesState, stampCanvasNodeChanges);
        const setContentNodes = createCanvasStateWriter(nodesRef, setNodesState);
        const timers: Array<() => void> = [];
        const update = callback(name, {
            useCallback: (fn: unknown) => fn, setNodesState, setContentNodes, nodesRef, updateCanvasNode, updateCanvasNodes,
            pendingMediaUpdatesRef: { current: new Map() }, mediaUpdateTimerRef: { current: null },
            setTimeout: (fn: () => void) => { timers.push(fn); return 1; },
        });
        update("image", node => ({ ...node, metadata: { ...node.metadata, naturalWidth: 1280 } }));
        timers.forEach(run => run());
        setNodes(nodes => nodes.map(node => ({ ...node, title: "renamed" })));
        let rendered = initial;
        for (const value of pending) {
            if (typeof value === "function") { value(rendered); rendered = value(rendered); }
            else rendered = value;
        }
        expect(nodesRef.current[0].title).toBe("renamed");
        expect(nodesRef.current[0].metadata?.naturalWidth).toBe(1280);
        expect(rendered).toEqual(nodesRef.current);
    });
}
