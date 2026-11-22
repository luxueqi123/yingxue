import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { Button } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useMemo, useState } from "react";
import { AtSign, Trash2, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { AgentImagePreview, type CanvasAgentChatMessage } from "./canvas-agent-chat-ui";
import { useResolvedCanvasResourceReferences } from "./use-resolved-canvas-resource-references";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasNodeType, type CanvasAssistantMessage, type CanvasAssistantReference, type CanvasAssistantSession } from "@/types/canvas";
import { useThemeStore } from "@/stores/use-theme-store";

export function AssistantHistory({ sessions, activeSession, onOpen, onDelete }: { sessions: CanvasAssistantSession[]; activeSession: CanvasAssistantSession | null; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
    const { t } = useInterfaceTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="space-y-3">
            <div className="text-sm" style={{ color: theme.node.muted }}>
                {sessions.length ? t("agentLocalUiHistoryCount", { count: sessions.length }) : t("agentLocalUiNoHistory")}
            </div>
            {sessions.map((session) => (
                <div key={session.id} className="rounded-md px-2.5 py-2 transition-colors" style={{ background: session.id === activeSession?.id ? theme.accent.primarySoft : "transparent", color: theme.node.text }}>
                    <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                                {session.id === activeSession?.id ? (
                                    <span className="shrink-0 text-[var(--fs-tiny)] font-medium" style={{ color: theme.node.text }}>
                                        {t("canvasUi.current")}
                                    </span>
                                ) : null}
                                <div className="truncate text-sm font-medium leading-5">{session.title}</div>
                            </div>
                            <div className="truncate text-[var(--fs-label)] leading-4 opacity-65">{sessionPreview(session)}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <span className="text-[var(--fs-tiny)] opacity-55">{formatSessionTime(session.updatedAt || session.createdAt)}</span>
                            <Button size="small" className="!h-6 !px-2" onClick={() => onOpen(session.id)}>
                                {t("agentLocalUiOpenConversation")}
                            </Button>
                            <Tooltip title={t("agentLocalUiDeleteRecord")}>
                                <Button size="small" danger type="text" className="!h-6 !w-6 !min-w-6" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(session.id)} />
                            </Tooltip>
                        </div>
                    </div>
                </div>
            ))}
            {!sessions.length ? (
                <div className="px-3 py-8 text-center text-sm" style={{ color: theme.node.muted }}>
                    {t("canvasCompleteUi.agentHistoryEmpty")}
                </div>
            ) : null}
        </div>
    );
}

export function MessageReferences({ message }: { message: CanvasAssistantMessage }) {
    return (
        <div className={`flex max-w-[88%] flex-wrap gap-2 ${message.role === "user" ? "ml-auto justify-end" : "ml-11 justify-start"}`}>
            {message.references?.map((item, index, references) => (
                <AssistantReferenceChip key={item.id} item={item} label={assistantImageReferenceLabel(references, index)} />
            ))}
        </div>
    );
}

export function promptAlreadyHasMention(prompt: string, label: string) {
    const token = `@${label}`;
    let from = 0;
    while (from <= prompt.length) {
        const index = prompt.indexOf(token, from);
        if (index < 0) return false;
        const next = prompt[index + token.length];
        if (!next || /\s|[,.!?;:，。！？；：、)\]}】）]/.test(next)) return true;
        from = index + 1;
    }
    return false;
}

export function AssistantReferenceChip({ item, label, previewUrl, onRemove, onInsertMention }: { item: CanvasAssistantReference; label?: string; previewUrl?: string; onRemove?: () => void; onInsertMention?: (label: string) => void }) {
    const { t } = useInterfaceTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [previewOpen, setPreviewOpen] = useState(false);
    const mentionReference = useMemo(() => assistantReferencesToMentionReferences([item]), [item]);
    const resolvedReference = useResolvedCanvasResourceReferences(mentionReference)[0];
    const text = (item.text || item.title).replace(/\s+/g, " ").trim().slice(0, 1) || "文";
    const imageUrl = previewUrl || resolvedReference?.previewUrl || item.dataUrl;
    const hasImage = Boolean(imageUrl || item.storageKey);
    const chipStyle = { background: theme.spatial.surface, color: theme.node.text };
    const actionStyle = { background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text };

    if (hasImage) {
        return (
            <>
                <span className="group/chip relative inline-flex h-12 shrink-0 items-center overflow-visible rounded-md" style={chipStyle}>
                    <button
                        type="button"
                        className="grid size-12 shrink-0 overflow-hidden rounded-l-md border-0 p-0"
                        style={{ background: theme.toolbar.itemHover }}
                        title={t("agentUiEnlargeImagePreview")}
                        aria-label={t("creationPagePreviewAttachment", { name: label || item.title })}
                        disabled={!imageUrl}
                        onClick={() => imageUrl && setPreviewOpen(true)}
                        onDoubleClick={() => imageUrl && setPreviewOpen(true)}
                    >
                        {imageUrl ? (
                            <img src={imageUrl} alt="" className="size-full object-cover" />
                        ) : (
                            <span className="text-[var(--fs-micro)] opacity-50">…</span>
                        )}
                    </button>
                    {label && onInsertMention ? (
                        <button
                            type="button"
                            className="inline-flex h-12 max-w-[112px] min-w-0 items-center gap-1 border-0 bg-transparent px-2.5 text-[var(--fs-tiny)] opacity-80 hover:opacity-100"
                            title={t("canvasCompleteUi.insertMention", { value0: label })}
                            onClick={() => onInsertMention(label)}
                        >
                            <AtSign className="size-2.5 shrink-0" />
                            <span className="truncate">{label}</span>
                        </button>
                    ) : label ? (
                        <span className="inline-flex h-12 max-w-[112px] min-w-0 items-center gap-1 px-2.5 text-[var(--fs-tiny)] opacity-80">
                            <AtSign className="size-2.5 shrink-0" />
                            <span className="truncate">{label}</span>
                        </span>
                    ) : null}
                    {onRemove ? (
                        <button
                            type="button"
                            className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover/chip:opacity-100 group-focus-within/chip:opacity-100"
                            style={actionStyle}
                            onClick={onRemove}
                            aria-label={t("canvasScriptUi068")}
                        >
                            <X className="size-3" />
                        </button>
                    ) : null}
                </span>
                {previewOpen && imageUrl ? <AgentImagePreview attachment={{ id: item.id, url: imageUrl, name: item.title || label || t("contextImage") }} onClose={() => setPreviewOpen(false)} /> : null}
            </>
        );
    }

    return (
        <span className="group/chip relative inline-flex h-12 max-w-[168px] shrink-0 items-center gap-2 overflow-hidden rounded-md px-2.5 text-sm" style={chipStyle}>
            <span className="grid size-8 shrink-0 place-items-center rounded-md text-sm font-medium" style={{ background: theme.toolbar.itemHover }}>
                {text}
            </span>
            <span className="min-w-0 truncate text-[var(--fs-tiny)] opacity-80">{item.title}</span>
            {onRemove ? (
                <button
                    type="button"
                    className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover/chip:opacity-100"
                    style={actionStyle}
                    onClick={onRemove}
                    aria-label={t("canvasScriptUi068")}
                >
                    <X className="size-3" />
                </button>
            ) : null}
        </span>
    );
}

export function assistantReferencesToMentionReferences(references: CanvasAssistantReference[]): CanvasResourceReference[] {
    return references.flatMap((item, index): CanvasResourceReference[] => {
        if (item.dataUrl || item.storageKey) {
            const label = assistantImageReferenceLabel(references, index) || item.title;
            return [{ id: item.id, nodeId: item.id, kind: "image", label, title: item.title, previewUrl: item.dataUrl, storageKey: item.storageKey, active: true }];
        }
        if (item.text) {
            const label = item.type === CanvasNodeType.Skill ? `技能${index + 1}` : `文本${index + 1}`;
            return [{ id: item.id, nodeId: item.id, kind: item.type === CanvasNodeType.Skill ? "skill" : "text", label, title: item.title, text: item.text, active: true }];
        }
        return [];
    });
}

export function assistantImageReferenceLabel(references: CanvasAssistantReference[], index: number) {
    if (!references[index]?.dataUrl && !references[index]?.storageKey) return undefined;
    const imageIndex = references.slice(0, index + 1).filter((item) => item.dataUrl || item.storageKey).length - 1;
    return imageIndex >= 0 ? imageReferenceLabel(imageIndex) : undefined;
}

export function assistantMessageToChatMessage(message: CanvasAssistantMessage): CanvasAgentChatMessage {
    return { id: message.id, role: message.role, title: message.title, text: message.text, meta: message.meta, detail: message.detail };
}

export function formatSessionTime(value?: string) {
    return value ? new Date(value).toLocaleString() : "";
}

export function sessionPreview(session: CanvasAssistantSession) {
    return session.messages.at(-1)?.text || `${session.messages.length} 条消息`;
}
