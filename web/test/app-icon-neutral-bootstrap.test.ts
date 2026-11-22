import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readProjectFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

// 使用获准的映雪标识启动，外观加载后仍允许自定义站点标识覆盖。
describe("app icon bootstrap", () => {
    const indexHtml = readProjectFile("index.html");
    const appearanceStore = readProjectFile("src/stores/use-appearance-store.ts");

    test("index.html declares the approved branded icon without a placeholder request", () => {
        expect(indexHtml).toContain('<link rel="icon" type="image/png" href="/brand/yingxue-leaf-20261107-icon.png" />');
        expect(indexHtml).not.toContain('href="data:,"');
        expect(indexHtml).not.toContain('<link rel="icon" href="/logo.svg"');
    });

    test("the appearance store remains the single writer of the favicon", () => {
        expect(appearanceStore).toContain('link[rel~="icon"]');
        expect(appearanceStore).toContain("favicon.href = appearance.logoConfigured || appearance.darkLogoConfigured");
        expect(appearanceStore).toContain("? appearanceLogoURL(appearance, mode)");
        expect(appearanceStore).toContain('`/brand/yingxue-symbol-20261107-${mode}.svg`');
    });
});
