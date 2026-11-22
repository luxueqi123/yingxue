import { expect, test } from "bun:test";
import { loadInterfaceLocale } from "../src/lib/interface-locale";
import { loadNativeLocale, nativeLocaleMessage } from "../src/i18n/locale-catalogs";
import { SUPPORTED_LOCALES } from "../src/i18n/locales";

test("every registered language loads actual image upload failure reasons without losing HTTP status", async () => {
    for (const { code } of SUPPORTED_LOCALES) {
        const legacy = await loadInterfaceLocale(code);
        await loadNativeLocale(code, legacy);
        const decode = nativeLocaleMessage(code, "imageUpload.decodeFailed");
        const account = nativeLocaleMessage(code, "imageUpload.accountChanged");
        const request = nativeLocaleMessage(code, "imageUpload.requestFailed");
        expect(decode?.length).toBeGreaterThan(15);
        expect(account?.length).toBeGreaterThan(10);
        expect(request).toContain("{{status}}");
        if (!["zh-CN", "zh-HK", "zh-TW", "ja-JP"].includes(code)) {
            expect(decode).not.toMatch(/[\u3400-\u9fff]/);
            expect(account).not.toMatch(/[\u3400-\u9fff]/);
        }
    }
});
