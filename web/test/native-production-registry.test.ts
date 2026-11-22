import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { validateNativeProductionRegistry } from "../src/lib/production-project-registry";

function registry(kind = "case") {
    const id = "native-lux-example";
    return { version: 1, entries: [{
        item: { id, kind, name: "镜头重拍", description: "原片参考与映雪重建流程", category: "creative", source: "luxreal", author: "映雪", available: true,
            presentation: kind === "case" ? "reconstruction" : "image-template",
            ...(kind === "case" ? { localMedia: "/production-library/native-media/" + id + "/reference.mp4", localCover: "/production-library/native-media/" + id + "/first-frame.webp" } : {}) },
        project: { id, snapshotPath: "/production-library/native-projects/" + id + ".json", sha256: "a".repeat(64), nodeCount: 5, connectionCount: 3, generationNodeCount: 2 },
        provenance: { sourcePack: "luxreal", sourceSha256: "b".repeat(64), reconstruction: true },
        mediaAssets: kind === "case" ? [
            { role: "reference-video", path: "/production-library/native-media/" + id + "/reference.mp4", sourcePack: "luxreal", sourcePath: id + "/reference.mp4", mimeType: "video/mp4", bytes: 1024, sha256: "c".repeat(64) },
            { role: "first-frame", path: "/production-library/native-media/" + id + "/first-frame.webp", sourcePack: "luxreal", sourcePath: id + "/first-frame.webp", mimeType: "image/webp", bytes: 256, sha256: "d".repeat(64) },
        ] : [],
    }] };
}

test("原生重建案例与无成片制作模板分别准入，不依赖LTV标识", () => {
    expect(validateNativeProductionRegistry(registry())[0].item.kind).toBe("case");
    expect(validateNativeProductionRegistry(registry("template"))[0].item.kind).toBe("template");
});

test("缺演示、目录穿越、重复ID和无制作节点不能作为原生案例准入", () => {
    const missing = registry(); delete missing.entries[0].item.localMedia;
    expect(() => validateNativeProductionRegistry(missing)).toThrow();
    const traversal = registry(); traversal.entries[0].project.snapshotPath = "/production-library/native-projects/../private.json";
    expect(() => validateNativeProductionRegistry(traversal)).toThrow();
    const duplicate = registry(); duplicate.entries.push(duplicate.entries[0]);
    expect(() => validateNativeProductionRegistry(duplicate)).toThrow();
    const noGeneration = registry(); noGeneration.entries[0].project.generationNodeCount = 0;
    expect(() => validateNativeProductionRegistry(noGeneration)).toThrow();
    const badHash = registry(); badHash.entries[0].project.sha256 = "unknown";
    expect(() => validateNativeProductionRegistry(badHash)).toThrow();
});

test("模板允许一对一主题封面，但拒绝借图、路径穿越与成片媒体", () => {
    const value = registry("template");
    const item = value.entries[0].item as Record<string, unknown>;
    item.cover = "/production-library/editorial-covers/native-lux-example.webp";
    expect(validateNativeProductionRegistry(value)[0].item.cover).toBe(item.cover);
    for (const cover of ["/production-library/editorial-covers/another.webp", "https://example.com/film.webp", "/production-library/editorial-covers/../private.webp"]) {
        item.cover = cover;
        expect(() => validateNativeProductionRegistry(value)).toThrow();
    }
    item.cover = "/production-library/editorial-covers/native-lux-example.webp";
    item.localMedia = "/production-library/native-media/native-lux-example/reference.mp4";
    expect(() => validateNativeProductionRegistry(value)).toThrow();
});

test("原生案例逐文件登记实际来源、路径、MIME、字节数和SHA-256", () => {
    const valid = registry();
    expect(validateNativeProductionRegistry(valid)[0].mediaAssets).toHaveLength(2);

    const missing = registry(); delete missing.entries[0].mediaAssets;
    expect(() => validateNativeProductionRegistry(missing)).toThrow();

    const badDigest = registry(); badDigest.entries[0].mediaAssets[1].sha256 = "unknown";
    expect(() => validateNativeProductionRegistry(badDigest)).toThrow();

    const wrongSource = registry(); wrongSource.entries[0].mediaAssets[0].sourcePath = "../other/reference.mp4";
    expect(() => validateNativeProductionRegistry(wrongSource)).toThrow();

    const wrongPath = registry(); wrongPath.entries[0].mediaAssets[0].path = "/production-library/native-media/another/reference.mp4";
    expect(() => validateNativeProductionRegistry(wrongPath)).toThrow();

    const empty = registry(); empty.entries[0].mediaAssets[1].bytes = 0;
    expect(() => validateNativeProductionRegistry(empty)).toThrow();
});

test("无演示媒体的制作模板不携带案例媒体清单", () => {
    const template = registry("template");
    template.entries[0].mediaAssets.push({ role: "reference-video", path: "/production-library/native-media/native-lux-example/reference.mp4", sourcePack: "luxreal", sourcePath: "native-lux-example/reference.mp4", mimeType: "video/mp4", bytes: 1, sha256: "c".repeat(64) });
    expect(() => validateNativeProductionRegistry(template)).toThrow();
});

test("生成的30个制作模板保留逐条主题封面", () => {
    const generated = JSON.parse(readFileSync(new URL("../src/lib/native-production-assets.json", import.meta.url), "utf8")) as {
        entries: Array<{ item: { id: string; kind: string; cover?: string } }>;
    };
    const templates = generated.entries.filter(entry => entry.item.kind === "template");

    expect(templates).toHaveLength(30);
    for (const entry of templates) {
        const cover = `/production-library/editorial-covers/${entry.item.id}.webp`;
        expect(entry.item.cover).toBe(cover);
        expect(existsSync(new URL(`../public${cover}`, import.meta.url))).toBe(true);
    }
});
