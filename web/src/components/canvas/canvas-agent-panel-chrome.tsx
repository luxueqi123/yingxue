import { Button } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";

import { BookOpenCheck, BookOpenText, Bot, Clapperboard, Focus, Globe2, History, LayoutTemplate, Laptop, PanelRightClose, PanelsTopLeft, Plus, RotateCcw, Workflow } from "lucide-react";
import { useNavigate } from "react-router";

import type { CanvasContextSummary } from "@/lib/canvas/canvas-context-summary";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { useUserStore } from "@/stores/use-user-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { CanvasAgentMode } from "./canvas-agent-chat-ui";

export function AgentPanelChrome({
    theme,
    mode,
    context,
    referenceCount,
    confirmTools,
    canUndo,
    undoCount,
    onModeChange,
    onConfirmToolsChange,
    onUndo,
    onCollapse,
    historyCount = 0,
    historyActive = false,
    onOpenHistory,
    onNewChat,
    newChatDisabled = false,
}: {
    theme: CanvasTheme;
    mode: CanvasAgentMode;
    context: CanvasContextSummary;
    referenceCount: number;
    confirmTools: boolean;
    canUndo: boolean;
    undoCount: number;
    onModeChange: (mode: CanvasAgentMode) => void;
    onConfirmToolsChange: (confirm: boolean) => void;
    onUndo: () => void;
    onCollapse: () => void;
    historyCount?: number;
    historyActive?: boolean;
    onOpenHistory?: () => void;
    onNewChat?: () => void;
    newChatDisabled?: boolean;
}) {
    const navigate = useNavigate();
    const { t } = useInterfaceTranslation();

    return (
        <header className="shrink-0 px-3 pb-1.5 pt-2.5">
            <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: theme.accent.primarySoft, color: theme.accent.primary }}>
                    <Bot className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                        <div className="truncate text-sm font-semibold leading-5">Agent</div>
                        <span className="truncate text-[var(--fs-label)]" style={{ color: theme.node.muted }}>{t("agentChromeCanvasCollaboration")}</span>
                    </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <Tooltip title={t("agentChromeSkillsTitle")}>
                        <Button type="text" shape="circle" className="!h-7 !w-7 !min-w-7" style={{ color: theme.node.muted }} icon={<BookOpenCheck className="size-3.5" />} onClick={() => navigate("/skills")} aria-label={t("agentChromeOpenSkills")} />
                    </Tooltip>
                    {onOpenHistory ? (
                        <Tooltip title={historyCount ? t("agentChromeHistoryCount", { count: historyCount }) : t("agentChromeHistoryTitle")}>
                            <Button type="text" className={`!h-7 !min-w-7 !px-1.5 ${historyActive ? "font-medium" : ""}`} style={{ color: historyActive ? theme.node.text : theme.node.muted, background: historyActive ? theme.spatial.surface : "transparent" }} icon={<History className="size-3.5" />} onClick={onOpenHistory} aria-label={t("agentChromeOpenHistory")}>
                                {historyCount ? <span className="text-[var(--fs-tiny)] tabular-nums">{historyCount}</span> : null}
                            </Button>
                        </Tooltip>
                    ) : null}
                    {onNewChat ? (
                        <Tooltip title={t("agentChromeNewChat")}>
                            <Button type="text" shape="circle" className="!h-7 !w-7 !min-w-7" disabled={newChatDisabled} style={{ color: theme.node.muted }} icon={<Plus className="size-3.5" />} onClick={onNewChat} aria-label={t("agentChromeCreateChat")} />
                        </Tooltip>
                    ) : null}
                    <Tooltip title={t("agentChromeCollapseAgent")}>
                        <Button type="text" shape="circle" className="!h-7 !w-7 !min-w-7" style={{ color: theme.node.muted }} icon={<PanelRightClose className="size-3.5" />} onClick={onCollapse} aria-label={t("agentChromeCollapseAgent")} />
                    </Tooltip>
                </div>
            </div>

            <div className="mt-1 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-0.5 px-0.5 text-[var(--fs-label)]" style={{ color: theme.node.muted }}>
                <span className="font-medium" style={{ color: theme.node.text }}>{t("agentChromeNodeCount", { count: context.nodeCount })}</span>
                {context.selectedCount ? <span className="inline-flex items-center gap-1"><Focus className="size-3" />{t("agentChromeSelectedCount", { count: context.selectedCount })}</span> : <span>{t("agentChromeNoSelection")}</span>}
                {context.chapterLabel ? <span className="inline-flex min-w-0 items-center gap-1"><BookOpenText className="size-3 shrink-0" /><span className="max-w-32 truncate">{context.chapterLabel}{context.shotLabel ? ` · ${context.shotLabel}` : ""}</span></span> : null}
                {referenceCount ? <span>{t("agentChromeReferenceCount", { count: referenceCount })}</span> : null}
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <AgentModeSwitch value={mode} theme={theme} onChange={onModeChange} />
                    <Tooltip title={undoCount ? t("agentChromeUndoCount", { count: undoCount }) : t("agentChromeUndoUnavailable")}>
                        <Button type="text" shape="circle" className="!h-6 !w-6 !min-w-6" disabled={!canUndo} style={{ color: theme.node.muted }} icon={<RotateCcw className="size-3" />} onClick={onUndo} aria-label={t("agentChromeUndoLatest")} />
                    </Tooltip>
                </div>
            </div>
        </header>
    );
}

function AgentModeSwitch({ value, theme, onChange }: { value: CanvasAgentMode; theme: CanvasTheme; onChange: (value: CanvasAgentMode) => void }) {
    const { t } = useInterfaceTranslation();
    return (
        <div className="inline-flex h-7 shrink-0 items-center rounded-full p-0.5 text-[var(--fs-label)]" style={{ background: `${theme.node.text}08`, boxShadow: `inset 0 1px 0 ${theme.node.text}08` }} role="group" aria-label={t("agentChromeRuntimeLocation")}>
            {(["online", "local"] as const).map((item) => {
                const active = value === item;
                const Icon = item === "online" ? Globe2 : Laptop;
                return (
                    <button key={item} type="button" className="inline-flex h-6 items-center gap-1 rounded-full px-2 transition-[background-color,color,transform] duration-200 active:scale-95" style={{ background: active ? theme.node.fill : "transparent", color: active ? theme.node.text : theme.node.muted, boxShadow: active ? `0 4px 12px ${theme.spatial.shadow}` : "none" }} onClick={() => onChange(item)} aria-pressed={active}>
                        <Icon className="size-3" />
                        {item === "online" ? t("agentChromeWebsite") : t("agentChromeLocalDevice")}
                    </button>
                );
            })}
        </div>
    );
}

const starterActions = [
    { id: "short-drama", labelKey: "agentChromeStarterBuildShortDrama", icon: Clapperboard },
    { id: "organize-canvas", labelKey: "agentChromeStarterOrganizeCanvas", icon: LayoutTemplate },
    { id: "generate-storyboard", labelKey: "agentChromeStarterGenerateStoryboard", icon: PanelsTopLeft },
    { id: "check-connections", labelKey: "agentChromeStarterCheckConnections", icon: Workflow },
];

export function AgentChatEmptyState({ theme, nodeCount, hasDraft = false, onSelect }: { theme: CanvasTheme; nodeCount: number; hasDraft?: boolean; onSelect: (value: string) => void }) {
    const { t } = useInterfaceTranslation();
    const shortDramaEnabled = useUserStore((state) => state.features.shortDramaEnabled);
    const visibleStarterActions = shortDramaEnabled ? starterActions : starterActions.filter((item) => item.id !== "short-drama");
    return (
        <div className="flex h-full items-center px-5 py-8">
            <div className="mx-auto w-full max-w-[380px]">
                <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-md" style={{ background: theme.accent.primarySoft, color: theme.accent.primary }}><Bot className="size-3.5" /></span>
                    <span className="text-[var(--fs-label)] font-medium" style={{ color: theme.node.muted }}>{nodeCount ? t("agentChromeCanvasNodeContext", { count: nodeCount }) : t("agentChromeBlankCanvas")}</span>
                </div>
                <h2 className="mt-3 text-[var(--fs-heading-lg)] font-semibold leading-6" style={{ color: theme.node.text }}>{hasDraft ? t("agentChromeIdeaReady") : t("agentChromeStartFromCanvas")}</h2>
                {hasDraft ? <p className="mt-2 text-xs leading-6" style={{ color: theme.node.muted }}>{t("agentChromeDraftGuidance")}</p> : <div className="mt-4 grid grid-cols-1 gap-1">
                    {visibleStarterActions.map(({ id, labelKey, icon: Icon }) => {
                        const label = t(labelKey as InterfaceMessageKey);
                        return (
                            <button key={id} type="button" className="group flex min-h-11 min-w-0 items-center gap-2.5 rounded-md px-2.5 text-left text-xs font-medium transition-colors" style={{ color: theme.node.text }} onMouseEnter={(event) => { event.currentTarget.style.background = theme.spatial.surface; }} onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }} onFocus={(event) => { event.currentTarget.style.background = theme.spatial.surface; }} onBlur={(event) => { event.currentTarget.style.background = "transparent"; }} onClick={() => onSelect(label)}>
                                <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: theme.spatial.surface, color: theme.node.muted }}><Icon className="size-3.5" /></span>
                                <span className="min-w-0 truncate">{label}</span>
                            </button>
                        );
                    })}
                </div>}
            </div>
        </div>
    );
}
