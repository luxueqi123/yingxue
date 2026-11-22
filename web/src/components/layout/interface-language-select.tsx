import { Languages } from "lucide-react";
import { interfaceLocaleOptions, isInterfaceLocale } from "@/lib/interface-locale";
import { useInterfaceLocaleStore, useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function InterfaceLanguageSelect() {
    const { locale, t } = useInterfaceTranslation();
    const setLocale = useInterfaceLocaleStore((state) => state.setLocale);
    const pendingLocale = useInterfaceLocaleStore((state) => state.pendingLocale);
    const loadFailed = useInterfaceLocaleStore((state) => state.loadFailed);
    return <label className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <Languages className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
        <select aria-label={t("language")} aria-busy={Boolean(pendingLocale)} disabled={Boolean(pendingLocale)} value={pendingLocale ?? locale} className="h-8 max-w-28 rounded-md border border-border bg-background px-1 text-foreground focus-visible:outline-2 focus-visible:outline-ring" onChange={(event) => {
            if (isInterfaceLocale(event.target.value)) void setLocale(event.target.value);
        }}>
            {interfaceLocaleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {loadFailed && <span role="alert">{t("languageLoadFailed")}</span>}
    </label>;
}
