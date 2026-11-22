import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { moduleGroupSource } from "./helpers/module-group-source";

const source = (name: string) => readFileSync(resolve(import.meta.dir, `../src/pages/canvas/${name}`), "utf8");

describe("storyboard prompt panel boundaries", () => {
    test("video-story original frame column uses an accessible bounded image preview", () => {
        const script = moduleGroupSource("components/canvas/canvas-script-node.tsx");
        expect(script).toContain('column.field === "frameUrl"');
        expect(script).toContain('alt={t("completeUi.204", { value0: shotNumber })}');
        expect(script).toContain('loading="lazy"');
        expect(script).toContain('value ? t("completeUi.201") : t("completeUi.202")');
    });
    test("creation and duplication clear the previous node panel", () => {
        const operations = source("use-canvas-node-operations.ts");
        expect(operations).toContain("if (type === CanvasNodeType.Script) setDialogNodeId(null)");
        expect(operations).toContain("if (source.type === CanvasNodeType.Script) setDialogNodeId(null)");
        expect(operations).toContain("primaryNode.type !== CanvasNodeType.Script ? primaryNode.id : null");
    });

    test("single and batch connection creation clear the previous panel", () => {
        const connections = source("use-canvas-connection-controller.ts");
        expect(connections.match(/if \(nodeType === CanvasNodeType.Script\) setDialogNodeId\(null\)/g)).toHaveLength(2);
    });

    test("focusing a storyboard does not open a panel", () => {
        expect(source("use-canvas-viewport-controller.ts")).toContain("node.type === CanvasNodeType.Drawing || node.type === CanvasNodeType.Script ? null : node.id");
    });

    test("click and overlay guards remain while the storyboard editor stays available", () => {
        const project = source("project.tsx");
        expect(project).toMatch(/else if \(node.type === CanvasNodeType.Script\) \{\s*setDialogNodeId\(null\)/);
        expect(project).toContain("dialogNode.type !== CanvasNodeType.Script");
        expect(project).toContain("onOpen={() => setScriptEditorNodeId(contentNode.id)}");
        expect(project).toContain("onGenerateScript={(prompt) => void generateScriptRows(contentNode.id, prompt)}");
    });

    test("storyboard generation strips legacy style blocks and sends structured project context", () => {
        const storyboard = source("use-canvas-storyboard.ts");
        expect(storyboard).toContain("stripProjectStyleExecutionBlocks(prompt)");
        expect(storyboard).toContain("projectStyle: storyboardContext.projectStyle");
        expect(storyboard).toContain("characters: storyboardContext.characters");
    });
});
