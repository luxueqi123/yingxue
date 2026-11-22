import { lazy, Suspense, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import { ConfigProvider } from "antd";
import { AppWorkspaceShell } from "@/components/layout/app-top-nav";
import { cn } from "@/lib/utils";
import { isSpatialWorkbenchPath, workspacePagePath } from "@/lib/workspace-routes";
import { getWorkspaceAntThemeConfig } from "@/lib/app-theme";
import { useGlobalAgentStore } from "@/stores/use-global-agent-store";
import { useWorkspaceButtonFeedback } from "@/hooks/use-workspace-button-feedback";
import { useUserStore } from "@/stores/use-user-store";
import { useAgentPanelDock } from "@/components/canvas/use-agent-panel-dock";
import { TeamInvitationCenter } from "@/components/layout/team-invitation-center";
import { TeamSpaceDirectoryHost } from "@/components/layout/team-space-directory";
import { getFeatureAvailability } from "@/services/api/auth";
import "@/styles/workspace-product.css";
import "@/styles/workspace-menus.css";
const workspaceTheme = getWorkspaceAntThemeConfig();
const GlobalAgentPanel = lazy(() => import("@/components/canvas/canvas-cloud-agent-panel").then((module) => ({ default: module.CanvasCloudAgentPanel })));
export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const adminWorkspace = pathname === "/admin" || pathname.startsWith("/admin/");
    const teamWorkspace = pathname.startsWith("/teams/");
    const spatialWorkbench = isSpatialWorkbenchPath(pathname);
    const canvasEditor = /^\/canvas\/[^/]+(?:\/|$)/.test(workspacePagePath(pathname));
    const productWorkspace = !adminWorkspace && !canvasEditor;
    const userId = useUserStore((state) => state.user?.id);
    const teamsEnabled = useUserStore((state) => state.features.teamsEnabled);
    useEffect(() => {
        if (!userId || adminWorkspace) return;
        let active = true;
        const refresh = async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const { features } = await getFeatureAvailability();
                if (active && useUserStore.getState().user?.id === userId) useUserStore.getState().setFeatures(features);
            } catch (error) {
                if (active) console.warn("工作台功能开放状态刷新失败", error);
            }
        };
        document.addEventListener("visibilitychange", refresh);
        return () => {
            active = false;
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [userId, adminWorkspace]);
    const agentDock = useAgentPanelDock();
    const agentDocked = Boolean(userId) && !productWorkspace && !adminWorkspace && agentDock.active;
    useWorkspaceButtonFeedback(productWorkspace);
    const creationWorkspace = pathname === "/" || pathname === "/home" || pathname === "/create";
    const wasCanvasEditorRef = useRef(canvasEditor);
    useLayoutEffect(() => {
        if (teamWorkspace) useGlobalAgentStore.getState().reset();
    }, [teamWorkspace]);
    // 从画布编辑器回到创作首页时收起 Agent：画布里停靠在右侧的面板到首页会变成浮窗，挡住首页。
    // 只收起面板，对话和运行照常继续；在绘制前收起，首页不会先闪出浮窗。
    useLayoutEffect(() => {
        const leftCanvasEditor = wasCanvasEditorRef.current && !canvasEditor;
        wasCanvasEditorRef.current = canvasEditor;
        if (leftCanvasEditor && creationWorkspace) useGlobalAgentStore.getState().closeAgent();
    }, [canvasEditor, creationWorkspace]);
    useLayoutEffect(() => {
        // Ant Design 浮层挂载在 body，必须用路由级标记隔离用户工作台与画布编辑器、运营后台。
        document.body.classList.toggle("app-user-overlays", !adminWorkspace);
        document.body.classList.toggle("app-spatial-overlays", spatialWorkbench);
        document.body.classList.toggle("app-product-overlays", productWorkspace);
        return () => {
            document.body.classList.remove("app-user-overlays");
            document.body.classList.remove("app-spatial-overlays");
            document.body.classList.remove("app-product-overlays");
        };
    }, [adminWorkspace, spatialWorkbench, productWorkspace]);
    const globalAgent =
        userId && !teamWorkspace ? (
            <Suspense fallback={null}>
                <GlobalAgentPanel key={userId} />
            </Suspense>
        ) : null;
    if (adminWorkspace)
        return (
            <>
                {children}
                {globalAgent}
            </>
        );
    return (
        <ConfigProvider
            theme={productWorkspace ? workspaceTheme : undefined}
            select={productWorkspace ? { classNames: { popup: { root: "workspace-quiet-popup" } } } : undefined}
            dropdown={productWorkspace ? { classNames: { root: "workspace-quiet-popup" } } : undefined}
            popover={productWorkspace ? { classNames: { root: "workspace-quiet-popup" } } : undefined}
        >
            <div
                className={cn("app-user-workspace h-dvh overflow-hidden text-foreground", spatialWorkbench && "app-spatial-workspace", productWorkspace && "app-product-workspace")}
                style={agentDocked ? { paddingRight: agentDock.width } : undefined}
                data-agent-docked={agentDocked || undefined}
            >
                <AppWorkspaceShell>{children}</AppWorkspaceShell>
            </div>
            {globalAgent}
            {userId && teamsEnabled ? (
                <>
                    <TeamSpaceDirectoryHost key={`directory:${userId}`} userId={userId} />
                    <TeamInvitationCenter key={userId} />
                </>
            ) : null}
        </ConfigProvider>
    );
}
