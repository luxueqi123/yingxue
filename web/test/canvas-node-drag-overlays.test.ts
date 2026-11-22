import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "bun:test";
import { moduleGroupSource } from "./helpers/module-group-source";

const projectSource = moduleGroupSource("pages/canvas/project.tsx");
const selectionControllerSource = readFileSync(resolve(import.meta.dir, "../src/pages/canvas/use-canvas-selection-controller.ts"), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

describe("canvas node drag overlays", () => {
    test("hides floating editors and selection controls for the whole drag preview", () => {
        expect(projectSource).toContain("const isCanvasNodeMoving = isNodeDragging || Boolean(dragPreview?.nodeIds.size);");
        const flatSource = flat(projectSource);
        const overlayStart = flatSource.indexOf("{dialogNode &&");
        expect(overlayStart).toBeGreaterThan(-1);
        const overlayCondition = flatSource.slice(overlayStart, flatSource.indexOf("<CanvasNodePanelOverlay", overlayStart));
        expect(overlayCondition).toContain("!selectionBox");
        expect(overlayCondition).toContain("!isCanvasNodeMoving");
        expect(projectSource).not.toContain("angleNode?.metadata?.content && !isCanvasNodeMoving");
        expect(projectSource).toContain("emotionNode?.metadata?.content && !isCanvasNodeMoving");
        expect(projectSource).toContain("selectedNodeBounds && !selectionBox && !isCanvasNodeMoving");
        expect(overlayCondition).toContain("!deferDragOverlays");
        expect(projectSource).toContain("node={isCanvasNodeMoving || deferDragOverlays || nodeImageSettingsOpen || emotionNodeId || angleNodeId ? null : toolbarNode}");
        expect(projectSource).toContain("onNodeDragEnd: handleNodeDragEnd");
        expect(projectSource).toContain("setDialogNodeId(node.id);");
        expect(selectionControllerSource).toContain("if (clickedNodeId) onNodeDragEnd?.(clickedNodeId);");
    });
});
