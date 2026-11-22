import { expect, test } from "bun:test";
import { buildCanvasAssetCatalog } from "../src/lib/canvas/canvas-asset-catalog";
import { recordReplacedMediaVersion } from "../src/lib/canvas/canvas-media-versions";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const image: CanvasNodeData = { id: "image", type: CanvasNodeType.Image, title: "镜头", position: { x: 0, y: 0 }, width: 400, height: 200, metadata: { content: "/old.png", storageKey: "old" } };

test("asset catalog groups history, batches and legacy versions without mutating nodes", () => {
    const history = recordReplacedMediaVersion(image, { ...image, metadata: { content: "/new.png", storageKey: "new" } }, "upload");
    const nodes: CanvasNodeData[] = [history,
        { ...image, id: "root", title: "组图", metadata: { isBatchRoot: true, batchChildIds: ["a", "b"], primaryImageId: "b" } },
        { ...image, id: "a", metadata: { content: "/a.png", batchRootId: "root" } },
        { ...image, id: "b", metadata: { content: "/b.png", batchRootId: "root" } },
        { ...image, id: "va", metadata: { content: "/va.png", versionOfNodeId: "v", versionLabel: "A", versionPrimary: false } },
        { ...image, id: "vb", metadata: { content: "/vb.png", versionOfNodeId: "v", versionLabel: "B", versionPrimary: true } },
        { ...image, id: "empty", metadata: {} },
        { ...image, id: "upload", metadata: { content: "/tmp.png", fileUpload: "uploading" } },
        { ...image, id: "text", type: CanvasNodeType.Text, title: "剧本.md", metadata: { content: "# 剧本" } },
    ];
    const before = JSON.stringify(nodes);
    const catalog = buildCanvasAssetCatalog(nodes);
    expect(JSON.stringify(nodes)).toBe(before);
    const images = catalog.find((group) => group.kind === "image")!.entries;
    expect(images).toHaveLength(3);
    expect(images.find((entry) => entry.nodeId === "image")!.versions).toHaveLength(2);
    expect(images.find((entry) => entry.nodeId === "root")!.versions.find((version) => version.primary)?.nodeId).toBe("b");
    expect(images.find((entry) => entry.versions.some((version) => version.nodeId === "va"))!.versions.find((version) => version.primary)?.nodeId).toBe("vb");
    expect(catalog.find((group) => group.kind === "markdown")!.entries).toHaveLength(1);
});
