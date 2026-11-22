import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
    return readFileSync(resolve(import.meta.dir, path), "utf8");
}

describe("workspace route loading", () => {
    test("keeps lazy workspace routes inside the workspace stage", () => {
        const router = source("../src/router.tsx");
        const deferred = router.slice(router.indexOf("function deferred"), router.indexOf("function fullScreenDeferred"));

        expect(deferred).toContain("return element;");
        expect(router).toContain("useDeferredValue(guardedOutlet)");
        expect(deferred).not.toContain("FullScreenLoader");
        expect(router).toContain("fullScreenDeferred(<LoginPage />)");
        expect(router).toContain("fullScreenDeferred(<SharedCanvasPage />)");
    });

    test("preloads the reported workspace routes before navigation", () => {
        const modules = source("../src/lib/workspace-route-modules.ts");
        const navigation = source("../src/components/layout/workspace-sidebar-nav.tsx");

        for (const route of ["projects", "canvas", "assets", "create"]) {
            expect(modules).toContain(`${route}: preloadableLazy(() => import`);
        }
        expect(modules).toContain('projectDetail: preloadableLazy(() => import("@/pages/projects/detail"))');
        expect(modules).toContain('slug === "projects" && segments.length > 1');
        expect(navigation).toContain("onPointerEnter={() => preloadWorkspaceRoute(linkTo)}");
        expect(navigation).toContain("onPointerDown={() => preloadWorkspaceRoute(linkTo)}");
        expect(navigation).toContain("onFocus={() => preloadWorkspaceRoute(linkTo)}");
    });

    test("renders preloaded workspace pages without suspending the layout", async () => {
        const router = source("../src/router.tsx");
        const layout = source("../src/layouts/user-layout.tsx");
        const html = source("../index.html");

        // 功能守卫在页面 Suspense 之外，懒加载会把整个工作区换成全屏加载页。
        expect(router).toContain('import { RequireFeature } from "@/components/auth/require-feature";');
        expect(router).not.toContain("const RequireFeature = lazy(");
        expect(router).not.toMatch(/const \w+Page = lazy\(load\w+Page\)/);
        expect(layout).not.toContain("preloadWorkspaceNavigationPages");
        expect(source("../src/lib/workspace-route-modules.ts")).not.toContain("preloadWhenIdle");
        expect(html).not.toContain('style="background:#ffffff"');
        expect(html).toContain("html.dark body");

        const { preloadableLazy } = await import("../src/lib/preloadable-lazy");
        function Loaded() {
            return null;
        }
        const Page = preloadableLazy(async () => ({ default: Loaded }));
        expect((Page({}) as { type: unknown }).type).not.toBe(Loaded);
        await Page.preload();
        expect((Page({}) as { type: unknown }).type).toBe(Loaded);
    });

    test("opens the approved public lobby and preserves all native private routes", () => {
        const router = source("../src/router.tsx");
        const navigation = source("../src/components/layout/workspace-sidebar-nav.tsx");

        expect(router).toContain('{ path: "/", element: deferred(<HomePage />, true) }');
        expect(router).toContain('{ path: "/create", element: deferred(<CreatePage />) }');
        expect(router).toContain("const allowAnonymous = isGuestWorkspacePath(pathname);");
        expect(router).toContain("<RequireAuth allowAnonymous={allowAnonymous}>");
        expect(router).toContain('{ path: "/assets", element: <RequireAuth>{deferred(<AssetsPage />)}</RequireAuth> }');
        expect(router).toContain('path: "/canvas/:id"');
        expect(router).toContain("<CanvasProjectPage />");
        expect(router).not.toContain("<CanvasRefreshShell");
        expect(router).toContain('path: "/home"');
        expect(router).toContain("HomePage");
        expect(navigation).toContain('{ ...toolItem("create", "/", t), id: "home", title: t("nav.sidebar.home") }');
        expect(navigation).not.toContain('to: "/create"');
        expect(navigation).not.toContain('to: "/home"');
    });

    test("preloads canvas detail and paints opening feedback before navigation", () => {
        const modules = source("../src/lib/workspace-route-modules.ts");
        const router = source("../src/router.tsx");
        const canvasLibrary = source("../src/pages/canvas/index.tsx");
        const canvasCard = source("../src/components/canvas/canvas-folder-card.tsx");

        expect(modules).toContain('canvasProject: preloadableLazy(() => import("@/pages/canvas/project"))');
        expect(modules).toContain("loadCanvasProjectPage = workspaceRoutePages.canvasProject.preload");
        expect(router).toContain("const CanvasProjectPage = workspaceRoutePages.canvasProject;");
        expect(canvasLibrary).toContain("setOpeningProjectId(id)");
        expect(canvasLibrary).toContain("window.requestAnimationFrame(() => navigate(");
        expect(canvasCard).toContain("onPointerEnter={onPrefetch}");
        expect(canvasCard).toContain("canvasLibraryOpening");
    });

    test("keeps the drama studio views in-page and canvas-only state out of the global layout", () => {
        const detail = source("../src/pages/projects/detail.tsx");
        const layout = source("../src/layouts/user-layout.tsx");
        const canvas = source("../src/pages/canvas/index.tsx");

        // 角色、待处理、设置都是制作台内的整页视图，不再用抽屉遮挡分镜。
        for (const panel of ["CastPanel", "InboxPanel", "SettingsPanel"]) expect(detail).toContain(`<${panel}`);
        expect(detail).not.toContain("AppDrawer");
        expect(layout).not.toContain("useCanvasUiStore");
        expect(layout).not.toContain("CanvasDeleteProjectsDialog");
        expect(canvas).toMatch(/deleteDialogOpen\s*\?\s*\(?\s*<Suspense/);
    });

    test("does not poll wallet balance from permanent workspace chrome", () => {
        const wallet = source("../src/hooks/use-wallet-balance.ts");
        expect(wallet).not.toContain("refetchInterval:");
        expect(wallet).toContain("wallet:updated");
        expect(wallet).toContain("WALLET_STALE_TIME_MS");
    });

    test("defers modal-only markdown runtimes until interaction", () => {
        const changelogButton = source("../src/components/layout/app-changelog-modal.tsx");
        const announcements = source("../src/components/layout/system-announcement-center.tsx");

        expect(changelogButton).toContain('lazy(() => import("@/components/layout/app-changelog-dialog")');
        expect(changelogButton).not.toContain('from "react-markdown"');
        expect(announcements).toContain('lazy(() => import("@/components/ui/aceternity/announcement-timeline-modal")');
    });

    test("never restores a full-page animated loading screen", () => {
        const loader = source("../src/components/ui/aceternity/full-screen-loader.tsx");
        const router = source("../src/router.tsx");
        expect(loader).not.toContain("LoadingSignal");
        expect(loader).toContain("return null");
        expect(router).toContain("fallback={null}");
    });
});

describe("workspace wallet entry", () => {
    test("keeps authenticated wallet deep links and the credits modal entry", () => {
        const router = source("../src/router.tsx");
        const modules = source("../src/lib/workspace-route-modules.ts");
        const host = source("../src/components/layout/workspace-wallet-modal.tsx");
        const palette = source("../src/components/layout/workspace-command-palette.tsx");
        const canvasTopBar = source("../src/pages/canvas/canvas-project-top-bar.tsx");
        const topBar = source("../src/components/layout/workspace-top-bar.tsx");
        const walletPage = source("../src/pages/wallet/index.tsx");

        expect(router).toContain('path: "/wallet"');
        expect(router).toContain('<RequireFeature feature="creditsEnabled">{deferred(<WalletPage />)}</RequireFeature>');
        expect(modules).toContain("pages/wallet");
        expect(host).toContain("export function WorkspaceWalletModal");
        expect(palette).toContain("run: () => openWorkspaceWallet()");
        expect(palette).toContain('navigate(`/login?next=${encodeURIComponent("/wallet")}`)');
        expect(canvasTopBar).toContain("openWorkspaceWallet()");
        expect(canvasTopBar).not.toContain('to="/wallet"');
        expect(topBar).toContain("openWorkspaceWallet()");
        expect(walletPage).toContain("wallet-library-page");
    });
});
