import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getLoadedInterfaceLocale, interfaceLocales, interfaceTranslator, isInterfaceLocale, loadInterfaceLocale, type InterfaceLocale, type InterfaceTranslate } from "@/lib/interface-locale";
import { detectInterfaceLocale } from "@/services/interface-locale-default";
import { getLoadedNativeLocale } from "@/i18n/locale-catalogs";

type InterfaceLocaleState = {
    locale: InterfaceLocale;
    ready: boolean;
    pendingLocale: InterfaceLocale | null;
    loadFailed: boolean;
    preference: "automatic" | "manual";
    setLocale: (locale: InterfaceLocale, preference?: "automatic" | "manual") => Promise<boolean>;
};

export const INTERFACE_LOCALE_KEY = "yingxue:interface-locale:v1";

export const useInterfaceLocaleStore = create<InterfaceLocaleState>()(persist(
    (set, get) => ({
        locale: "zh-CN",
        ready: false,
        pendingLocale: null,
        loadFailed: false,
        preference: "automatic",
        setLocale: (locale, preference = "manual") => {
            if (!isInterfaceLocale(locale)) return Promise.resolve(false);
            if (preference === "automatic" && get().preference === "manual") return Promise.resolve(false);
            if (getLoadedInterfaceLocale(locale) && getLoadedNativeLocale(locale)) {
                set({ locale, ready: true, pendingLocale: null, loadFailed: false, preference });
                return Promise.resolve(true);
            }
            set({ pendingLocale: locale, loadFailed: false, preference });
            return loadInterfaceLocale(locale).then(() => {
                if (get().pendingLocale !== locale) return false;
                set({ locale, ready: true, pendingLocale: null });
                return true;
            }, () => {
                if (get().pendingLocale !== locale) return false;
                set({ locale: getLoadedInterfaceLocale(get().locale) ? get().locale : "zh-CN", ready: true, pendingLocale: null, loadFailed: true });
                return false;
            });
        },
    }),
    {
        name: INTERFACE_LOCALE_KEY,
        // A blocked browser storage must not prevent an in-session language switch.
        storage: createJSONStorage(() => ({
            getItem: (key) => {
                try {
                    const saved = localStorage.getItem(key);
                    if (saved) return saved;
                    const native = JSON.parse(localStorage.getItem("yingce:locale") || "null") as { state?: { locale?: unknown } } | null;
                    return isInterfaceLocale(native?.state?.locale) ? JSON.stringify({ state: { locale: native.state.locale, preference: "manual" }, version: 0 }) : null;
                } catch { return null; }
            },
            setItem: (key, value) => { try { localStorage.setItem(key, value); } catch { /* Session preference remains active. */ } },
            removeItem: (key) => { try { localStorage.removeItem(key); } catch { /* No persisted preference to remove. */ } },
        })),
        partialize: ({ locale, preference }) => ({ locale, preference }),
        onRehydrateStorage: () => () => {
            // Synchronous storage errors arrive before Zustand installs its initial state.
            queueMicrotask(() => {
                const state = useInterfaceLocaleStore.getState();
                if (state.preference === "manual") {
                    void state.setLocale(state.locale);
                } else if (typeof window === "undefined") {
                    void state.setLocale("zh-CN", "automatic");
                } else {
                    // Show the saved/default language immediately; geolocation updates it in the background.
                    void state.setLocale(state.locale, "automatic");
                    void detectInterfaceLocale().then(locale => useInterfaceLocaleStore.getState().setLocale(locale, "automatic"));
                }
            });
        },
        merge: (saved, current) => {
            const record = saved && typeof saved === "object" ? saved as { locale?: unknown; preference?: unknown } : undefined;
            const locale = record?.locale;
            const validLocale = isInterfaceLocale(locale);
            return { ...current, locale: validLocale ? locale : "zh-CN", preference: validLocale && record?.preference !== "automatic" ? "manual" : "automatic" };
        },
    },
));

const translators = Object.fromEntries(interfaceLocales.map(locale => [locale, interfaceTranslator(locale)])) as Record<InterfaceLocale, InterfaceTranslate>;
export function useInterfaceTranslation() {
    const locale = useInterfaceLocaleStore((state) => state.locale);
    useInterfaceLocaleStore((state) => state.ready);
    return { locale, t: translators[locale] };
}
