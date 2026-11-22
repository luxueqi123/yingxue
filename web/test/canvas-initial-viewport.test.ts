import { expect, test } from "bun:test";
import { initialCanvasViewport } from "../src/lib/canvas/canvas-viewport";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const nodes: CanvasNodeData[] = [
    { id: "far-away", type: CanvasNodeType.Image, position: { x: 12000, y: -8000 }, width: 640, height: 360, title: "Saved image" },
];

test("first-device open without a saved viewport shows off-origin cloud content", () => {
    const size = { width: 1440, height: 1000 };
    const view = initialCanvasViewport(nodes, size);
    const centerX = (12000 + 320) * view.k + view.x;
    const centerY = (-8000 + 180) * view.k + view.y;
    expect(centerX).toBeCloseTo(size.width / 2);
    expect(centerY).toBeCloseTo(size.height / 2);
    expect(view.k).toBeLessThanOrEqual(1);
});

test("an existing user's viewport is retained even when intentionally off-canvas", () => {
    const saved = { x: -123, y: 456, k: 0.4 };
    expect(initialCanvasViewport(nodes, { width: 1440, height: 1000 }, saved)).toEqual(saved);
});

test("empty projects retain the origin instead of deriving infinite bounds", () => {
    expect(initialCanvasViewport([], { width: 390, height: 844 })).toEqual({ x: 0, y: 0, k: 1 });
});
