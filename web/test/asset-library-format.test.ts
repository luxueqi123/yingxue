import { describe, expect, it } from "bun:test";
import { assetCategoryLabel, assetProjectLabel, assetResolutionLabel, assetSizeLabel, assetSourceLabel, assetStorageLabel } from "@/pages/assets/asset-library-format";
import { assetArchiveFacts } from "@/pages/assets/asset-library-panels";
import { interfaceLocales, interfaceTranslator, loadInterfaceLocale } from "@/lib/interface-locale";
import type { Asset } from "@/stores/use-asset-store";

describe("asset library format", () => {
    it("localizes real asset details in every shipped language while preserving user content", async () => {
        const asset: Asset = { id: "owned-original", kind: "image", title: "雪 {title} <b>原图</b>", category: "material", source: "我的原始素材", coverUrl: "", tags: [], createdAt: "2026-11-01", updatedAt: "2026-11-01", data: { dataUrl: "", storageKey: "resource:owned-original", width: 1536, height: 1024, bytes: 100, mimeType: "image/png" } };
        const before = JSON.stringify(asset);
        for (const locale of interfaceLocales) {
            await loadInterfaceLocale(locale);
            const t = interfaceTranslator(locale);
            const facts = assetArchiveFacts(asset, undefined, t);
            expect(facts.some(fact => fact.value === "1536x1024")).toBe(true);
            expect(facts.some(fact => fact.value === asset.source)).toBe(true);
            expect(t("assetsUi.viewAsset", { title: asset.title })).toContain(asset.title);
            expect(assetSourceLabel({ ...asset, source: "批量上传", metadata: { source: "manual-batch" } }, t)).toBe(t("library.assets.batch.title"));
            expect(assetSourceLabel({ ...asset, source: "批量上传" }, t)).toBe("批量上传");
            expect(assetResolutionLabel({ ...asset, data: { ...asset.data, width: 32, height: 48 } }, t)).toBe(t("assetsUi.standardDefinition"));
            if (!locale.startsWith("zh")) {
                for (const category of ["character", "environment", "prop", "material", "other"]) expect(assetCategoryLabel(category, t), locale).not.toContain("assetsUi.");
                expect(assetSizeLabel(0, 0, t), locale).not.toBe("未知");
                expect(assetStorageLabel("resource:owned-original", t), locale).not.toBe("已上传");
                if (["en-US", "fr-FR", "de-DE", "es-ES", "pt-BR"].includes(locale)) {
                    for (const fact of facts) expect(fact.label, `${locale}: ${fact.label}`).not.toMatch(/[\u3400-\u9fff]/);
                }
            }
        }
        expect(JSON.stringify(asset)).toBe(before);
    });
    it("shows real media dimensions", () => {
        expect(assetSizeLabel(768, 1344)).toBe("768x1344");
        expect(assetSizeLabel(2, 3)).toBe("2x3");
    });

    it("treats zero, missing and the legacy 1x1 placeholder as unknown", () => {
        expect(assetSizeLabel(0, 0)).toBe("未知");
        expect(assetSizeLabel(1, 1)).toBe("未知");
        expect(assetSizeLabel(1080, 1)).toBe("未知");
        expect(assetSizeLabel(Number.NaN, 720)).toBe("未知");
    });

    it("labels drama assets by the project recorded in metadata", () => {
        const base: Asset = { id: "drama-res", kind: "video", title: "短剧视频", coverUrl: "", tags: [], createdAt: "", updatedAt: "", data: { url: "", storageKey: "resource:res", width: 0, height: 0, bytes: 1, mimeType: "video/mp4" } };
        expect(assetProjectLabel(base)).toBe("未关联项目");
        expect(assetProjectLabel({ ...base, metadata: { projectIds: ["prj-1"] } })).toBe("已关联项目");
        expect(assetProjectLabel({ ...base, metadata: { projectIds: ["prj-1"], projectName: "斗破" } })).toBe("斗破");
    });
});
