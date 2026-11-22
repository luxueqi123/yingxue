import { expect, test } from "bun:test";
import { buildCaseStoryboard } from "../src/lib/case-storyboard";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

test("故事板按已存分类及明确分组组织节点，不把未标记素材猜成角色或成片", () => {
    const node = (id: string, type: CanvasNodeType, extra = {}): CanvasNodeData => ({ id, type, title: id, position: { x: 10, y: 20 }, width: 100, height: 80, ...extra });
    const nodes = [node("人物设定", CanvasNodeType.Frame), node("hero", CanvasNodeType.Image, { parentId: "人物设定" }), node("room", CanvasNodeType.Image, { metadata: { assetCategory: "environment" } }), node("other", CanvasNodeType.Image), node("clip", CanvasNodeType.Video), node("film", CanvasNodeType.Video, { metadata: { videoEditOperation: "concat" } }), node("story", CanvasNodeType.Script), node("sound", CanvasNodeType.Audio)];
    const before = JSON.stringify(nodes);
    const board = buildCaseStoryboard(nodes);
    expect(board.image.map(row => [row.node.id, row.category])).toEqual([["hero", "character"], ["room", "scene"], ["other", "other"]]);
    expect(board.video.map(row => row.category)).toEqual(["clip", "film"]);
    expect(board.text[0].category).toBe("script");
    expect(board.audio[0].node.id).toBe("sound");
    expect(JSON.stringify(nodes)).toBe(before);
    expect(Object.values(buildCaseStoryboard(nodes, "人物设定")).flat().map(row => row.node.id)).toEqual(["hero"]);
    expect(Object.values(buildCaseStoryboard(nodes, "no match")).flat()).toEqual([]);
});
