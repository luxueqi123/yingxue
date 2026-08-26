import type { ReactNode } from "react";
import { lazy, Suspense, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { AuthSessionHydrator } from "@/components/auth/auth-session-hydrator";
import { FullScreenLoader } from "@/components/ui/aceternity/full-screen-loader";
import { getAntThemeConfig } from "@/lib/app-theme";
import { listRegisteredPlugins } from "@/lib/plugins/plugin-registry";
import { appQueryClient } from "@/lib/query-client";
import { usePluginStore } from "@/stores/use-plugin-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

const ClientRootInit = lazy(() => import("@/components/layout/client-root-init").then((module) => ({ default: module.ClientRootInit })));

export function AppProviders({ children }: { children: ReactNode }) {
    const theme = useThemeStore((state) => state.theme);
    const dark = theme === "dark";
    const ensurePlugin = usePluginStore((state) => state.ensurePlugin);

    useEffect(() => {
        for (const plugin of listRegisteredPlugins()) ensurePlugin(plugin.manifest);
    }, [ensurePlugin]);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.colorScheme = theme;
    }, [dark, theme]);

    return (
        <ConfigProvider locale={zhCN} theme={getAntThemeConfig(dark)}>
            <App message={{ duration: 3, maxCount: 3 }} notification={{ duration: 4.5, maxCount: 3, placement: "topRight" }}>
                <QueryClientProvider client={appQueryClient}>
                    <AuthSessionHydrator>
                        <AuthenticatedClientRoot>{children}</AuthenticatedClientRoot>
                    </AuthSessionHydrator>
                </QueryClientProvider>
            </App>
        </ConfigProvider>
    );
}

function AuthenticatedClientRoot({ children }: { children: ReactNode }) {
    const user = useUserStore((state) => state.user);
    if (!user) return children;
    return (
        <Suspense fallback={<FullScreenLoader label="正在恢复工作区" detail="加载你的创作环境" />}>
            <ClientRootInit>{children}</ClientRootInit>
        </Suspense>
    );
}
