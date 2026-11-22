from pathlib import Path

PATH = Path("web/src/components/layout/workspace-top-bar.tsx")

CONTENT = '''import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Link, useLocation } from "react-router";

import { YingxueBrandLettering } from "@/components/brand/yingxue-brand-lettering";
import { SystemAnnouncementCenter } from "@/components/layout/system-announcement-center";
import { WorkspaceAccountMenu } from "@/components/layout/workspace-account-menu";
import { WorkspaceCreditGiftMark } from "@/components/layout/workspace-credit-gift-mark";
import { WorkspaceTopBarExtensionSlot } from "@/components/layout/workspace-top-bar-extension";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

const PAGE_TITLES: Record<string, string> = {
    home: "创作大厅",
    studio: "工作流",
    create: "创作",
    projects: "短剧创作",
    canvas: "画布",
    tasks: "任务",
    assets: "素材库",
    skills: "Skills 广场",
    prompts: "提示词库",
    plugins: "插件中心",
    wallet: "积分中心",
    settings: "设置",
};

const STUDIO_TITLES: Record<string, string> = { cases: "灵感广场", skills: "专业技能", agents: "专业 Agent", voices: "音色参考", workflows: "工作流" };

export function WorkspaceTopBar({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { availableMicrocredits } = useWalletBalance(user?.id, creditsEnabled);
    const { pathname, search } = useLocation();

    const slug = pathname.split("/").filter(Boolean)[0];
    const pageTitle = (slug === "studio" ? STUDIO_TITLES[new URLSearchParams(search).get("tab") || "workflows"] : undefined) || (slug && PAGE_TITLES[slug]) || "映雪";
    const balance = availableMicrocredits === null ? "--" : (availableMicrocredits / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 });

    return (
        <header className="app-workspace-topbar">
            <button type="button" className="app-workspace-mobile-menu app-workspace-topbar-icon-button" aria-label={sidebarOpen ? "收起侧栏" : "展开侧栏"} onClick={onToggleSidebar}>
                {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </button>
            <nav className="app-workspace-topbar-breadcrumb" aria-label="当前位置">
                <Link to="/" aria-label="映雪首页" className="shrink-0 font-medium text-foreground/70 transition-colors hover:text-foreground"><YingxueBrandLettering className="h-5 w-12" /></Link>
                <span className="shrink-0 text-foreground/30" aria-hidden="true">/</span>
                <span className="truncate font-medium text-foreground">{pageTitle}</span>
            </nav>
            <WorkspaceTopBarExtensionSlot />
            <div className="app-workspace-topbar-actions">
                {creditsEnabled ? <button type="button" className="app-workspace-topbar-credit-pill" aria-label={`打开积分中心，可用 ${balance} 积分`} onClick={() => openWorkspaceWallet()}>
                    <WorkspaceCreditGiftMark />
                    <span>积分</span>
                    <strong>{balance}</strong>
                </button> : null}
                {user ? <SystemAnnouncementCenter userId={user.id} className="app-workspace-topbar-icon-button" autoOpen /> : null}
                <AnimatedThemeToggler className="app-workspace-topbar-icon-button" theme={theme} onThemeChange={setTheme} aria-label="切换主题" />
                <WorkspaceAccountMenu />
            </div>
        </header>
    );
}
'''

lines = CONTENT.split("\n")
body = "\r\n".join(lines)
PATH.write_bytes(body.encode("utf-8"))
print("wrote", PATH, "lines:", len(lines))
