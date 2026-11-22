import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { useLocaleStore } from "@/stores/use-locale-store";
import { getLoadedInterfaceLocale } from "@/lib/interface-locale";
import { getLoadedNativeLocale } from "./locale-catalogs";
import { DEFAULT_LOCALE, type AppLocale } from "./locales";
import { personalAppearanceMessages } from "./personal-appearance-messages";
import { personalAvatarMessages } from "./personal-avatar-messages";
import { communityWorkMessages } from "./community-work-messages";

function messages(locale: AppLocale) {
    const legacy = Object.fromEntries(Object.entries(getLoadedInterfaceLocale(locale) ?? {}).map(([key, text]) => [key, typeof text === "string" ? text.replace(/\{\{?(\w+)\}?\}/g, "{{$1}}") : text]));
    return { ...legacy, ...getLoadedNativeLocale(locale), personalAppearance: personalAppearanceMessages[locale], personalAvatar: personalAvatarMessages[locale], communityWorks: communityWorkMessages[locale] };
}
export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
    resources: { "zh-CN": { translation: messages("zh-CN") } },
    lng: "zh-CN",
    fallbackLng: DEFAULT_LOCALE,
    initAsync: false,
    returnNull: false,
    interpolation: { escapeValue: false },
});
function applyLocale(locale: AppLocale) {
    if (!getLoadedInterfaceLocale(locale) || !getLoadedNativeLocale(locale)) return;
    i18n.addResourceBundle(locale, "translation", messages(locale), true, true);
    void i18n.changeLanguage(locale);
}
applyLocale(useLocaleStore.getState().locale);
useLocaleStore.subscribe((state, previous) => {
    if (state.ready && (state.locale !== previous.locale || !previous.ready)) applyLocale(state.locale);
});
export function currentLocale(): AppLocale {
    return useLocaleStore.getState().locale;
}
export function translate(key: string, options?: Record<string, unknown>): string {
    return i18n.t(key, options) as string;
}
export async function switchLocale(next: AppLocale) {
    if (next === currentLocale()) return;
    // Both translation providers observe this store. Keep the current editor
    // mounted so changing language cannot discard unsent text or attachments.
    await useLocaleStore.getState().setLocale(next);
}
