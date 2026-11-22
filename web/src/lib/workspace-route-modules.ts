import { preloadableLazy } from "@/lib/preloadable-lazy";

// 用户端页面统一在这里声明：路由渲染和导航意图预取用同一个组件实例，
// 预取完成后切换页面同步渲染，不再闪出加载提示。
export const workspaceRoutePages = {
    home: preloadableLazy(() => import("@/pages/home")),
    studio: preloadableLazy(() => import("@/pages/studio")),
    creativeTool: preloadableLazy(() => import("@/pages/create/creative-tool-page")),
    prompts: preloadableLazy(() => import("@/pages/prompts")),
    wallet: preloadableLazy(() => import("@/pages/wallet")),
    dramaList: preloadableLazy(() => import("@/pages/drama")),
    dramaCreate: preloadableLazy(() => import("@/pages/drama/create")),
    dramaStudio: preloadableLazy(() => import("@/pages/drama/detail")),

    assets: preloadableLazy(() => import("@/pages/assets")),
    canvas: preloadableLazy(() => import("@/pages/canvas")),
    canvasProject: preloadableLazy(() => import("@/pages/canvas/project")),
    create: preloadableLazy(() => import("@/pages/create")),
    ecommerce: preloadableLazy(() => import("@/pages/ecommerce")),
    imageWorkbench: preloadableLazy(() => import("@/pages/workbench/image-workbench-route")),
    videoWorkbench: preloadableLazy(() => import("@/pages/workbench/video-workbench-page")),
    projects: preloadableLazy(() => import("@/pages/projects")),
    projectDetail: preloadableLazy(() => import("@/pages/projects/detail")),
    projectCreate: preloadableLazy(() => import("@/pages/projects/create")),
    legacyProjects: preloadableLazy(() => import("@/pages/projects/legacy-index")),
    legacyProjectDetail: preloadableLazy(() => import("@/pages/projects/legacy-detail")),
    skills: preloadableLazy(() => import("@/pages/skills")),
    skillWorkbench: preloadableLazy(() => import("@/pages/skills/skill-workbench-route")),
    plugins: preloadableLazy(() => import("@/pages/plugins")),
    eagleLibrary: preloadableLazy(() => import("@/pages/plugins/eagle")),
    tasks: preloadableLazy(() => import("@/pages/tasks")),
    settings: preloadableLazy(() => import("@/pages/settings")),
    referral: preloadableLazy(() => import("@/pages/referral")),
};

export const loadCanvasProjectPage = workspaceRoutePages.canvasProject.preload;

const workspaceRouteSlugs: Record<string, keyof typeof workspaceRoutePages> = {
home: "home", studio: "studio", prompts: "prompts", wallet: "wallet", dramas: "dramaList",
    create: "create",
    canvas: "canvas",
    assets: "assets",
    projects: "projects",
    tasks: "tasks",
    skills: "skills",
    plugins: "plugins",
    settings: "settings",
    referral: "referral",
    ecommerce: "ecommerce",
};

function warm(key: keyof typeof workspaceRoutePages) {
    // 预取失败不打断交互；真正打开页面时会重新拉取并交给路由错误页。
    void workspaceRoutePages[key].preload().catch(() => undefined);
}

export function preloadWorkspaceRoute(pathnameOrSlug: string) {
    // 根路径就是创作页，预加载时仍映射到其内部模块名。
    const segments = pathnameOrSlug.split(/[?#]/, 1)[0].split("/").filter(Boolean);
    const slug = segments[0] || "home";
    // 具体画布项目由 /canvas/:id 自己加载；不要在认证恢复阶段额外预加载画布列表。
    if (slug === "canvas" && segments.length > 1) return;
    if (slug === "dramas" && segments.length > 1) { warm(segments[1] === "new" ? "dramaCreate" : "dramaStudio"); return; }
    if (slug === "projects" && segments[1] === "legacy") { warm("legacyProjects"); return; }
    if (slug === "projects" && segments.length > 1) {
        if (["overview", "chapters", "workflow", "canvases", "editor", "assets", "settings"].includes(segments[2] || "")) {
            warm("legacyProjectDetail");
            return;
        }
        warm(segments[1] === "new" ? "projectCreate" : "projectDetail");
        return;
    }
    if (slug === "skills" && segments[2] === "edit") {
        warm("skillWorkbench");
        return;
    }
    if (slug === "plugins" && segments[1] === "eagle") {
        warm("eagleLibrary");
        return;
    }
    if (slug === "toolbox") {
        if (segments[1] === "image") warm("imageWorkbench");
        if (segments[1] === "video") warm("videoWorkbench");
        return;
    }
    const key = workspaceRouteSlugs[slug];
    if (key) warm(key);
}

export const loadHomePage = () => import("@/pages/home");
export const loadAssetsPage = () => import("@/pages/assets");
export const loadCanvasPage = () => import("@/pages/canvas");
export const loadCreatePage = () => import("@/pages/create");
export const loadProjectsPage = () => import("@/pages/projects");
export const loadProjectDetailPage = () => import("@/pages/projects/detail");
export const loadProjectCreatePage = () => import("@/pages/projects/create");
export const loadSkillWorkbenchPage = () => import("@/pages/skills/workbench");
export const loadDramaListPage = () => import("@/pages/drama");
export const loadDramaCreatePage = () => import("@/pages/drama/create");
export const loadDramaStudioPage = () => import("@/pages/drama/detail");
export const loadWalletPage = () => import("@/pages/wallet");
