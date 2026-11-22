import zhCN from "./locales/zh-CN";
import { interfaceLocales, type InterfaceLocale } from "./interface-locale-ids";
import { legacyMessagesFromNative, loadNativeLocale, nativeLocaleMessage } from "@/i18n/locale-catalogs";

export { interfaceLocales, type InterfaceLocale } from "./interface-locale-ids";
export type InterfaceMessageKey = keyof typeof zhCN;
export type InterfaceMessages = Partial<Record<InterfaceMessageKey, string>>;
export type InterfaceValues = Record<string, string | number>;
export type InterfaceTranslate = (key: InterfaceMessageKey | (string & {}), values?: InterfaceValues) => string;

export const interfaceLocaleOptions = [
    { value: "zh-CN", label: "简体中文" },
    { value: "zh-HK", label: "繁體中文（香港）" },
    { value: "zh-TW", label: "繁體中文（台灣）" },
    { value: "en-US", label: "English" },
    { value: "ja-JP", label: "日本語" },
    { value: "ko-KR", label: "한국어" },
    { value: "es-ES", label: "Español" },
    { value: "pt-BR", label: "Português (Brasil)" },
    { value: "fr-FR", label: "Français" },
    { value: "de-DE", label: "Deutsch" },
] as const satisfies readonly { value: InterfaceLocale; label: string }[];

export function isInterfaceLocale(value: unknown): value is InterfaceLocale {
    return interfaceLocales.some(locale => locale === value);
}

// Only registered, local UI resources are loaded. User/project content is never a translation key.
export function createInterfaceLocaleRegistry(loaders: Partial<Record<InterfaceLocale, () => Promise<InterfaceMessages>>>) {
    const bundles = new Map<InterfaceLocale, InterfaceMessages>([["zh-CN", zhCN]]);
    const pending = new Map<InterfaceLocale, Promise<InterfaceMessages>>();
    return {
        get: (locale: InterfaceLocale) => bundles.get(locale),
        load(locale: InterfaceLocale): Promise<InterfaceMessages> {
            const existing = pending.get(locale);
            if (existing) return existing;
            const cached = bundles.get(locale);
            const loader = loaders[locale];
            if (!cached && !loader) return Promise.reject(new Error("Unregistered interface language"));
            const request = cached ? Promise.resolve(cached) : loader!().then(bundle => {
                bundles.set(locale, bundle);
                return bundle;
            }, error => {
                pending.delete(locale);
                throw error;
            });
            pending.set(locale, request);
            return request;
        },
        translate(locale: InterfaceLocale, key: string, values: InterfaceValues = {}) {
            const legacyKey = key as InterfaceMessageKey;
            const text = bundles.get(locale)?.[legacyKey] ?? nativeLocaleMessage(locale, key) ?? zhCN[legacyKey] ?? key;
            return text.replace(/\{\{?(\w+)\}?\}/g, (token, name: string) =>
                Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
        },
    };
}

function loadSupplementedLocale(locale: "fr-FR" | "de-DE", supplement: () => Promise<{ default: InterfaceMessages }>): Promise<InterfaceMessages> {
    return Promise.all([loadNativeLocale(locale), supplement(), loadNativeLocale("en-US"), import("./locales/en-US")])
        .then(([native, messages, nativeEnglish, legacyEnglish]) => ({
            ...legacyMessagesFromNative(native, { native: nativeEnglish, legacy: legacyEnglish.default }),
            ...messages.default,
        }));
}

const registry = createInterfaceLocaleRegistry({
    "en-US": () => import("./locales/en-US").then(module => module.default),
    "zh-HK": () => import("./locales/zh-HK").then(module => module.default),
    "zh-TW": () => import("./locales/zh-TW").then(module => module.default),
    "ja-JP": () => import("./locales/ja-JP").then(module => module.default),
    "ko-KR": () => import("./locales/ko-KR").then(module => module.default),
    "es-ES": () => import("./locales/es-ES").then(module => module.default),
    "pt-BR": () => import("./locales/pt-BR").then(module => module.default),
    "fr-FR": () => loadSupplementedLocale("fr-FR", () => import("./locales/fr-FR")),
    "de-DE": () => loadSupplementedLocale("de-DE", () => import("./locales/de-DE")),
});

const localeLoads = new Map<InterfaceLocale, Promise<InterfaceMessages>>();
export function loadInterfaceLocale(locale: InterfaceLocale): Promise<InterfaceMessages> {
    const existing = localeLoads.get(locale);
    if (existing) return existing;
    const pending = registry.load(locale).then(async bundle => {
        await loadNativeLocale(locale, bundle);
        return bundle;
    }).catch(error => {
        localeLoads.delete(locale);
        throw error;
    });
    localeLoads.set(locale, pending);
    return pending;
}
export const getLoadedInterfaceLocale = registry.get;
export const translateInterface = registry.translate;

export function interfaceTranslator(locale: InterfaceLocale): InterfaceTranslate {
    return (key, values) => translateInterface(locale, key, values);
}
