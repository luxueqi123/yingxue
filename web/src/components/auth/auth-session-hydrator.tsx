import type { ReactNode } from "react";
import { useEffect } from "react";

import { getAuthSession, type AuthSessionPayload } from "@/services/api/auth";
import { FullScreenLoader } from "@/components/ui/aceternity/full-screen-loader";
import { preloadWorkspaceRoute } from "@/lib/workspace-route-modules";
import { useUserStore } from "@/stores/use-user-store";

export function AuthSessionHydrator({ children }: { children: ReactNode }) {
    const hydrated = useUserStore((state) => state.hydrated);
    const isPublicAuthRoute = typeof window !== "undefined" && (window.location.pathname === "/login" || window.location.pathname === "/register");

    useEffect(() => {
        let cancelled = false;
        getAuthSession()
            .then(async (payload) => {
                if (cancelled) return;
                if (!payload.user) {
                    applyAnonymousSession(payload);
                    return;
                }
                // 账号数据、画布和素材持久化只属于已登录工作区，登录页不下载这些模块。
                const { applyUserSession } = await import("@/lib/user-session");
                if (cancelled) return;
                await applyUserSession(payload);
                preloadWorkspaceRoute(window.location.pathname);
            })
            .catch(() => {
                if (!cancelled) applyAnonymousSession({ user: null, logicalModels: [] });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // 登录/注册页本身不依赖会话数据，先展示表单和背景影片；会话请求仍在后台完成。
    // 这样慢网络不会让首屏组件一直被全屏加载层遮住。
    return hydrated || isPublicAuthRoute ? children : <FullScreenLoader />;
}

function applyAnonymousSession(payload: AuthSessionPayload) {
    const store = useUserStore.getState();
    store.clearSession();
    store.setRuntimeLimits(payload.runtimeLimits);
    store.setDrawingEngine(payload.drawingEngine);
    store.setFeatures(payload.features);
    store.setHydrated(true);
}
