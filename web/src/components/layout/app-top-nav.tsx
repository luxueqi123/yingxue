import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { BannerAnnouncementsSlider } from "@/components/layout/banner-announcements-slider";
import { ModelSetupGuide } from "@/components/layout/model-setup-guide";
import { WorkspaceCommandPalette } from "@/components/layout/workspace-command-palette";
import { readWorkspaceSidebarCollapsed, writeWorkspaceSidebarCollapsed } from "@/components/layout/workspace-sidebar-state";
import { WorkspaceSidebarNav } from "@/components/layout/workspace-sidebar-nav";
import { WorkspaceTopBar } from "@/components/layout/workspace-top-bar";
import { WorkspaceTopBarExtensionProvider } from "@/components/layout/workspace-top-bar-extension";
import { WorkspaceWalletHost } from "@/components/layout/workspace-wallet-host";
import { GenerationSuccessNotifier } from "@/components/layout/generation-success-notifier";
import { useWorkspaceDocumentTitle } from "@/hooks/use-workspace-document-title";
import { WorkspaceStorageLimitNotice } from "@/components/layout/workspace-storage-limit-notice";
import { cn } from "@/lib/utils";
import { isSpatialWorkbenchPath, workspacePagePath } from "@/lib/workspace-routes";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function AppWorkspaceShell({ children }: { children: ReactNode }) {
    const { t } = useInterfaceTranslation();
    const location = useLocation();
    const { pathname } = location;
    const navigate = useNavigate();
    const [mobileSidebarExpanded, setMobileSidebarExpanded] = useState(false);
    const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(readWorkspaceSidebarCollapsed);
    const [mobileViewport, setMobileViewport] = useState(() => window.innerWidth < 1024);
    const [paletteOpen, setPaletteOpen] = useState(false);
    useWorkspaceDocumentTitle();

    const pagePath = workspacePagePath(pathname);
    const hideChrome = pathname.startsWith("/admin") || /^\/canvas\/[^/]+/.test(pagePath);
    const showGlobalTopBar = !hideChrome;
    const spatialWorkbench = isSpatialWorkbenchPath(pathname);
    const creationWorkspace = pagePath === "/create";
    const ltvHome = pathname === "/" || pathname === "/home";
    const sidebarCollapsed = !mobileViewport && desktopSidebarCollapsed;
    const teamWorkspace = pathname.startsWith("/teams/");

    const isMobileViewport = () => mobileViewport;

    useEffect(() => {
        const viewport = window.matchMedia("(max-width: 1023px)");
        const update = () => setMobileViewport(viewport.matches);
        update();
        viewport.addEventListener("change", update);
        return () => viewport.removeEventListener("change", update);
    }, []);

    const toggleSidebar = () => {
        if (isMobileViewport()) {
            setMobileSidebarExpanded((current) => !current);
            return;
        }
        setDesktopSidebarCollapsed((current) => {
            const next = !current;
            writeWorkspaceSidebarCollapsed(next);
            return next;
        });
    };

    const expandDesktopSidebar = () => {
        setDesktopSidebarCollapsed(false);
        writeWorkspaceSidebarCollapsed(false);
    };

    const collapseDesktopSidebar = () => {
        if (isMobileViewport()) {
            setMobileSidebarExpanded(false);
            return;
        }
        setDesktopSidebarCollapsed(true);
        writeWorkspaceSidebarCollapsed(true);
    };

    const handleNavClick = () => {
        if (isMobileViewport()) setMobileSidebarExpanded(false);
    };

    // ⌘K / Ctrl+K 全局呼出搜索面板。
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (teamWorkspace) return;
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setPaletteOpen((open) => !open);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [teamWorkspace]);

    useEffect(() => {
        const handleWorkspaceNavigation = (rawEvent: Event) => {
            const event = rawEvent as CustomEvent<{ to?: string }>;
            if (!event.detail?.to) return;
            event.preventDefault();
            navigate(event.detail.to, { state: pathname === "/settings" ? location.state : { returnTo: pathname + location.search + location.hash, returnState: location.state } });
        };
        window.addEventListener("workspace:navigate", handleWorkspaceNavigation);
        return () => window.removeEventListener("workspace:navigate", handleWorkspaceNavigation);
    }, [navigate, location, pathname]);

    return (
        <>
            <WorkspaceTopBarExtensionProvider>
                <div
                    className={cn(
                        "app-workspace-shell flex h-dvh min-h-0 w-full flex-col overflow-hidden",
                        sidebarCollapsed && "is-sidebar-collapsed",
                        spatialWorkbench && "is-spatial",
                        creationWorkspace && "is-creation-workspace",
                        ltvHome && "is-ltv-home",
                    )}
                >
                    {!hideChrome && mobileSidebarExpanded ? <button type="button" className="app-workspace-sidebar-scrim lg:hidden" aria-label={t("collapse")} onClick={() => setMobileSidebarExpanded(false)} /> : null}

                    {showGlobalTopBar ? <BannerAnnouncementsSlider /> : null}

                    <div className="app-workspace-main-row flex min-h-0 min-w-0 flex-1 overflow-hidden">
                        {!hideChrome ? (
                            <aside className={cn("app-workspace-sidebar flex h-full shrink-0 flex-col overflow-hidden", mobileSidebarExpanded && "is-mobile-expanded", sidebarCollapsed && !mobileViewport && "is-collapsed")}>
                                <WorkspaceSidebarNav collapsed={sidebarCollapsed && !isMobileViewport()} onNavigate={handleNavClick} onOpenSearch={() => setPaletteOpen(true)} onExpand={expandDesktopSidebar} onCollapse={collapseDesktopSidebar} />
                            </aside>
                        ) : null}

                        <div className="app-workspace-stage relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            {showGlobalTopBar ? <WorkspaceTopBar sidebarOpen={isMobileViewport() ? mobileSidebarExpanded : !sidebarCollapsed} onToggleSidebar={toggleSidebar} /> : null}
                            <div className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden", showGlobalTopBar && "workspace-route-content")}>{children}</div>
                        </div>
                    </div>

                    {paletteOpen && !teamWorkspace ? (
                        <Suspense fallback={null}>
                            <WorkspaceCommandPalette open onClose={() => setPaletteOpen(false)} />
                        </Suspense>
                    ) : null}
                </div>
            </WorkspaceTopBarExtensionProvider>
            <WorkspaceWalletHost />
            <WorkspaceStorageLimitNotice />
            <GenerationSuccessNotifier />
            <ModelSetupGuide hidden={pathname === "/login" || pathname === "/register" || pathname.startsWith("/admin") || teamWorkspace || pathname === "/projects/new" || pathname.startsWith("/dramas/")} />
        </>
    );
}
