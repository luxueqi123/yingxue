import type { ReactNode } from "react";
import { useEffect } from "react";

import { getAuthSession } from "@/services/api/auth";
import { FullScreenLoader } from "@/components/ui/aceternity/full-screen-loader";
import { preloadWorkspaceRoute } from "@/lib/workspace-route-modules";
import { useUserStore } from "@/stores/use-user-store";

export function AuthSessionHydrator({ children }: { children: ReactNode }) {
    const hydrated = useUserStore((state) => state.hydrated);
    const isPublicAuthRoute = typeof window !== "undefined" && (window.location.pathname === "/login" || window.location.pathname === "/register");

    useEffect(() => {
        let cancelled = false;
        // 登录态与当前工作区 chunk 并行恢复，避免进入应用后再出现一次页面级等待。
        preloadWorkspaceRoute(window.location.pathname);
        getAuthSession()
            .then(async (payload) => {
                if (!cancelled) {
                    const { applyUserSession } = await import("@/lib/user-session");
                    if (!cancelled) await applyUserSession(payload);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    // 游客只需要完成最小认证态，不应为登录页提前加载画布、素材和模型配置。
                    const userStore = useUserStore.getState();
                    userStore.clearSession();
                    userStore.setHydrated(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // 登录/注册页本身不依赖会话数据，先展示表单和背景影片；会话请求仍在后台完成。
    // 这样慢网络不会让首屏组件一直被全屏加载层遮住。
    return hydrated || isPublicAuthRoute ? children : <FullScreenLoader />;
}
