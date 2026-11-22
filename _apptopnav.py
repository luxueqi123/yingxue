from pathlib import Path

PATH = Path("web/src/components/layout/app-top-nav.tsx")

raw = PATH.read_bytes().decode("utf-8")
lines = raw.split("\r\n")

# 保留文件头到 scrim 行（索引 0..66，即 1..67 行），之后整体替换 return 主体。
head_lines = lines[:67]

tail = [
    "",
    "                {showGlobalTopBar ? <BannerAnnouncementsSlider /> : null}",
    "",
    "                <div className=\"app-workspace-main-row flex min-h-0 min-w-0 flex-1 overflow-hidden\">",
    "                    {!hideChrome ? (",
    "                        <aside",
    "                            className={cn(",
    "                                \"app-workspace-sidebar flex h-full shrink-0 flex-col overflow-hidden\",",
    "                                mobileSidebarExpanded && \"is-mobile-expanded\",",
    "                                sidebarCollapsed && !mobileViewport && \"is-collapsed\",",
    "                            )}",
    "                        >",
    "                            <WorkspaceSidebarNav",
    "                                collapsed={sidebarCollapsed && !isMobileViewport()}",
    "                                onNavigate={handleNavClick}",
    "                                onOpenSearch={() => setPaletteOpen(true)}",
    "                                onExpand={() => ltvHome ? setHomeSidebarCollapsed(false) : expandDesktopSidebar()}",
    "                                onCollapse={collapseDesktopSidebar}",
    "                            />",
    "                        </aside>",
    "                    ) : null}",
    "",
    "                    <div className=\"app-workspace-stage relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden\">",
    "                        {showGlobalTopBar ? <WorkspaceTopBar sidebarOpen={isMobileViewport() ? mobileSidebarExpanded : !sidebarCollapsed} onToggleSidebar={toggleSidebar} /> : null}",
    "                        <div className=\"relative min-h-0 min-w-0 flex-1 overflow-hidden\">{children}</div>",
    "                    </div>",
    "                </div>",
    "",
    "                <WorkspaceCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />",
    "            </div>",
    "            </WorkspaceTopBarExtensionProvider>",
    "            <WorkspaceWalletHost />",
    "            <ModelSetupGuide hidden={pathname === \"/login\" || pathname === \"/register\" || pathname.startsWith(\"/admin\")} />",
    "        </>",
    "    );",
    "}",
    "",
]

out = head_lines + tail
PATH.write_bytes("\r\n".join(out).encode("utf-8"))

text = PATH.read_bytes().decode("utf-8")
print("markers:", text.count("<<<<<<<"))
print("has BannerAnnouncementsSlider use:", "{showGlobalTopBar ? <BannerAnnouncementsSlider /> : null}" in text)
print("has expandDesktopSidebar use:", "expandDesktopSidebar()" in text)
print("has onCollapse:", "onCollapse={collapseDesktopSidebar}" in text)
print("has WorkspaceWalletHost:", "<WorkspaceWalletHost />" in text)
