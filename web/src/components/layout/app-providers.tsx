import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/i18n";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-hk";
import "dayjs/locale/zh-tw";
import "dayjs/locale/ja";
import "dayjs/locale/ko";
import "dayjs/locale/es";
import "dayjs/locale/pt-br";
import "dayjs/locale/fr";
import "dayjs/locale/de";
import frFR from "antd/locale/fr_FR";
import deDE from "antd/locale/de_DE";
import { AppFeedbackProvider } from "@/components/layout/app-feedback";
import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import zhHK from "antd/locale/zh_HK";
import zhTW from "antd/locale/zh_TW";
import jaJP from "antd/locale/ja_JP";
import koKR from "antd/locale/ko_KR";
import esES from "antd/locale/es_ES";
import ptBR from "antd/locale/pt_BR";
import type { Locale } from "antd/es/locale";
import type { InterfaceLocale } from "@/lib/interface-locale";
import { useInterfaceLocaleStore } from "@/stores/use-interface-locale-store";

import { AuthSessionHydrator } from "@/components/auth/auth-session-hydrator";
import { getAntThemeConfig } from "@/lib/app-theme";
import { applySkinTheme } from "@/lib/skin-themes";
import { appQueryClient } from "@/lib/query-client";
import { isIsolatedPrevisRepro } from "@/lib/dev-repro";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { applyAppearanceMetadata, useAppearanceStore } from "@/stores/use-appearance-store";
import { useUserStore } from "@/stores/use-user-store";
import { refreshPublicAppearance } from "@/services/appearance-bootstrap";
import { useEffectiveSkin } from "@/stores/use-appearance-preferences-store";
import { applyThemePackCanvas } from "@/themes/apply";

const ClientRootInit = lazy(() => import("@/components/layout/client-root-init").then((module) => ({ default: module.ClientRootInit })));
const componentLocales: Record<InterfaceLocale, Locale> = {
    "zh-CN": zhCN, "zh-HK": zhHK, "zh-TW": zhTW, "en-US": enUS,
    "ja-JP": jaJP, "ko-KR": koKR, "es-ES": esES, "pt-BR": ptBR, "fr-FR": frFR, "de-DE": deDE,
};

function ClientRootBoundary({ children }: { children: ReactNode }) {
    const authenticated = useUserStore((state) => Boolean(state.user));
    // 后台能力初始化不能遮住已打开的页面；保持同一页面实例以保留草稿和当前操作。
    return (
        <Suspense fallback={null}>
            {children}
            {authenticated ? <Suspense fallback={null}><ClientRootInit>{null}</ClientRootInit></Suspense> : null}
        </Suspense>
    );
}

export function AppProviders({ children }: { children: ReactNode }) {
    const locale = useInterfaceLocaleStore((state) => state.locale);
    const localeReady = useInterfaceLocaleStore((state) => state.ready);
    useLayoutEffect(() => { document.documentElement.lang = locale; dayjs.locale(locale === "en-US" ? "en" : locale === "ko-KR" ? "ko" : locale === "ja-JP" ? "ja" : locale === "es-ES" ? "es" : locale === "fr-FR" ? "fr" : locale === "de-DE" ? "de" : locale.toLowerCase()); }, [locale]);
    const theme = useActiveTheme();
    const dark = theme === "dark";
    const appearance = useAppearanceStore((state) => state.appearance);
    const appearanceResolved = useAppearanceStore((state) => state.resolved);
    const skin = useEffectiveSkin();

    useLayoutEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.colorScheme = theme;
        // 尚未收到公开配置时保留 HTML 中的品牌信息，避免默认品牌覆盖映雪标题。
        if (appearanceResolved) {
            applyThemePackCanvas(skin.id);
            applySkinTheme(skin, theme);
            applyAppearanceMetadata({ ...appearance, activeSkin: skin });
        }
    }, [appearance, appearanceResolved, dark, theme, skin]);

    // DEV 复现台必须是同源本地确定性场景：AuthSessionHydrator 会打 /api/auth/session，
    // ClientRootInit 会打 /api/model-catalog，没有后端时产生真实 502，与导演台无关却会污染判据。
    // 与启动入口共用精确路径边界；生产构建中 import.meta.env.DEV 为 false，始终不启用隔离。
    const isolateDevRepro = typeof window !== "undefined" && isIsolatedPrevisRepro(import.meta.env.DEV, window.location.pathname);

    useEffect(() => {
        if (isolateDevRepro) return;
        const refresh = () => {
            if (document.visibilityState === "visible") void refreshPublicAppearance();
        };
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [isolateDevRepro]);

    return (
        <I18nextProvider i18n={i18n}><ConfigProvider button={{ autoInsertSpace: false }} locale={componentLocales[locale]} theme={getAntThemeConfig(dark, skin)} wave={{ disabled: true }}>
            <AppFeedbackProvider>
                <QueryClientProvider client={appQueryClient}>
                    {isolateDevRepro ? (
                        children
                    ) : (
                        <AuthSessionHydrator>
                            <ClientRootBoundary>{children}</ClientRootBoundary>
                        </AuthSessionHydrator>
                    )}
                </QueryClientProvider>
            </AppFeedbackProvider>
        </ConfigProvider></I18nextProvider>
    );
}
