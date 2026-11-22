import { afterAll, expect, test } from "bun:test";
import { interfaceLocales, loadInterfaceLocale } from "../src/lib/interface-locale";
import { useInterfaceLocaleStore } from "../src/stores/use-interface-locale-store";
import { resourceStorageLabel, resourceStorageLocation, resourceStorageTitle } from "../src/lib/canvas/resource-storage-status";

const previous = useInterfaceLocaleStore.getState();
afterAll(async () => { await previous.setLocale(previous.locale, previous.preference); });

for (const locale of interfaceLocales) {
    test(`${locale}: resource badges and tooltips use the selected language and preserve storage identity`, async () => {
        await loadInterfaceLocale(locale);
        expect(await useInterfaceLocaleStore.getState().setLocale(locale)).toBe(true);
        const uploadedKey = "resource:中文 {name} <image>";
        const localKey = "image:中文 {name} <image>";
        expect(resourceStorageLocation(uploadedKey)).toBe("oss");
        expect(resourceStorageLocation(localKey)).toBe("local");
        expect(resourceStorageLocation()).toBe("none");
        const labels = [resourceStorageLabel(uploadedKey), resourceStorageLabel(localKey), resourceStorageLabel()];
        const titles = [resourceStorageTitle(uploadedKey), resourceStorageTitle(localKey), resourceStorageTitle()];
        expect(new Set(labels).size).toBe(3);
        for (const text of [...labels, ...titles]) {
            expect(text).not.toContain("assetsUi.");
            expect(text).not.toContain("{name}");
            expect(text.length).toBeGreaterThan(0);
            if (!locale.startsWith("zh")) expect(["已上传", "本地", "未同步", "已上传到对象存储，并以账号资源同步", "保存在当前浏览器本地，通常是对象存储未启用或上传失败后的降级", "还没有可同步的资源标识"]).not.toContain(text);
        }
        if (locale === "en-US") {
            expect(labels).toEqual(["Uploaded", "Local", "Not synced"]);
            expect(titles[1]).toContain("this browser");
            expect(titles[2]).toContain("no resource ID");
        }
        if (locale === "zh-CN") expect(labels).toEqual(["已上传", "本地", "未同步"]);
        expect(uploadedKey).toBe("resource:中文 {name} <image>");
        expect(localKey).toBe("image:中文 {name} <image>");
    });
}
