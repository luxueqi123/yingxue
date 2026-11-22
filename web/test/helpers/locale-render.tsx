import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { getLoadedInterfaceLocale, type InterfaceLocale } from "@/lib/interface-locale";
import { getLoadedNativeLocale } from "@/i18n/locale-catalogs";

// Exercise both translation APIs used by the actual mixed native/extended UI.
export function renderInLocale(children: ReactNode, locale: InterfaceLocale) {
    const legacy = getLoadedInterfaceLocale(locale);
    const native = getLoadedNativeLocale(locale);
    if (!legacy || !native) throw new Error(`Load ${locale} before rendering`);
    const instance = createInstance();
    void instance.init({
        lng: locale,
        initAsync: false,
        fallbackLng: false,
        interpolation: { escapeValue: false },
        resources: { [locale]: { translation: {
            ...Object.fromEntries(Object.entries(legacy).map(([key, text]) => [key, text?.replace(/\{\{?(\w+)\}?\}/g, "{{$1}}")])),
            ...native,
        } } },
    });
    return renderToStaticMarkup(<I18nextProvider i18n={instance}>{children}</I18nextProvider>);
}
