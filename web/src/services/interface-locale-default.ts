import type { InterfaceLocale } from "@/lib/interface-locale";

/** Read only the visitor country from the same-origin edge resource; never persist the trace or IP. */
export async function detectInterfaceLocale(): Promise<InterfaceLocale> {
    const browserLocales = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language || "zh-CN"];
    const browserLanguages: Record<string, InterfaceLocale> = { en: "en-US", ja: "ja-JP", ko: "ko-KR", es: "es-ES", pt: "pt-BR", fr: "fr-FR", de: "de-DE" };
    const fallback = browserLocales.map((language): InterfaceLocale | undefined => {
        const tag = language.toLowerCase();
        if (tag.startsWith("zh")) {
            if (/(?:^|-)(?:hk|mo)(?:-|$)/.test(tag)) return "zh-HK";
            if (/(?:^|-)(?:tw|hant)(?:-|$)/.test(tag)) return "zh-TW";
            return "zh-CN";
        }
        return browserLanguages[tag.split("-")[0]];
    }).find(Boolean) || "zh-CN";
    const country = await fetch("/cdn-cgi/trace", { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(1200) })
        .then(response => response.ok ? response.text() : "")
        .then(trace => trace.match(/^loc=([A-Za-z]{2})\r?$/m)?.[1]?.toUpperCase() || "")
        .catch(() => "");
    const countries: Record<string, InterfaceLocale> = {
        CN: "zh-CN", HK: "zh-HK", MO: "zh-HK", TW: "zh-TW", JP: "ja-JP", KR: "ko-KR",
        BR: "pt-BR", PT: "pt-BR",
        FR: "fr-FR", BE: "fr-FR", LU: "fr-FR", DE: "de-DE", AT: "de-DE",
        US: "en-US", GB: "en-US", IE: "en-US", CA: "en-US", AU: "en-US", NZ: "en-US", SG: "en-US",
        ES: "es-ES", MX: "es-ES", GT: "es-ES", HN: "es-ES", SV: "es-ES", NI: "es-ES", CR: "es-ES", PA: "es-ES",
        CU: "es-ES", DO: "es-ES", PR: "es-ES", CO: "es-ES", VE: "es-ES", EC: "es-ES", PE: "es-ES", BO: "es-ES",
        PY: "es-ES", CL: "es-ES", AR: "es-ES", UY: "es-ES", GQ: "es-ES",
    };
    return countries[country] || fallback;
}
