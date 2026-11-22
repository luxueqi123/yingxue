import { App, Button, Segmented } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import copyToClipboard from "copy-to-clipboard";
import { CheckCircle2, Copy, ExternalLink, FolderOpen, History, LoaderCircle, PlugZap, Plus, RefreshCw, Terminal, Trash2 } from "lucide-react";
import { motion } from "motion/react";

import { canvasThemes } from "@/lib/canvas-theme";
import { type InterfaceMessageKey } from "@/lib/interface-locale";
import { canvasAgentToolLabel as toolName } from "@/lib/canvas/canvas-agent-tool-label";
import { consumeLocalRuntimeEventStream, postCanvasRuntimeState, prepareCanvasRuntimeConnection, waitForCanvasRuntimeReconnect, type LocalRuntimeEvent } from "@/lib/canvas/local-runtime-connection";
import { createClientId } from "@/lib/client-id";
import { getLocalRuntimeSessionClient, useLocalRuntimeStore } from "@/stores/use-local-runtime-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import {
    canvasAgentConnectionStatusText,
    canvasAgentConnectionStartingPatch,
    canvasAgentTransientDisconnectPatch,
    useCanvasAgentStore,
    type AgentAttachment,
    type AgentChatItem,
    type AgentEventLog,
    type AgentPanelTab,
    type AgentPendingToolCall,
    type AgentThreadSummary,
} from "@/stores/canvas/use-canvas-agent-store";
import { canvasOperationPostconditionMessage, hashCanvasSnapshot, previewCanvasOperations, summarizeCanvasOperations, verifyCanvasOperations, type CanvasOperation, type CanvasSnapshot } from "@/lib/canvas/canvas-operation-contract";
import { buildCanvasContext, findCanvasNodes, getCanvasConnection, getCanvasGenerationTasks, getCanvasNode, getCanvasResources, validateCanvasOperations } from "@/lib/canvas/canvas-context-discovery";
import { isCanvasReadTool } from "@/lib/canvas/canvas-agent-protocol";
import { buildCanvasResourceReferences } from "@/lib/canvas/canvas-resource-references";
import { buildLocalAgentSetupCommands, detectLocalAgentSetupPlatform, type LocalAgentSetupPlatform } from "@/lib/canvas/local-agent-setup";
import { listAddedSkills, type Skill } from "@/services/api/skills";
import { skillRuntime } from "@/services/skill-runtime";
import { isProjectAgentReadTool, isProjectAgentToolName, runProjectAgentTool } from "@/services/api/project-agent-tools";
import { AgentChatComposer, AgentChatMessage, AgentPendingToolCard, AgentWorkingMessage, type CanvasAgentChatAttachment } from "./canvas-agent-chat-ui";
import { VoiceRecordingButton } from "@/components/conversation/voice-recording-button";
import { AgentChatEmptyState } from "./canvas-agent-panel-chrome";

const PANEL_MOTION_SECONDS = 0.5;
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_PAYLOAD_BYTES = 28 * 1024 * 1024;
const MAX_AGENT_TURN_PAYLOAD_BYTES = 56 * 1024 * 1024;
type InterfaceT = ReturnType<typeof useInterfaceTranslation>["t"];
type AgentEventPayload = {
    agent?: string;
    type?: string;
    thread_id?: string;
    item?: AgentEventItem;
    error?: { message?: string };
    message?: string;
    usage?: Record<string, unknown>;
};
type AgentEventItem = { id?: string; type?: string; text?: unknown; message?: unknown; server?: string; tool?: string; status?: string; arguments?: unknown; result?: unknown; error?: { message?: string } };

type AgentLogContext = { connected: boolean; enabled: boolean; activity: string; waiting: boolean; sending: boolean; messages: number; pendingTool?: string };
type AgentWorkspace = { canvasId: string; workspacePath: string; activeThreadId?: string };
type AgentThreadsResponse = { ok?: boolean; workspace?: AgentWorkspace; data?: AgentThreadSummary[] };
type AgentThreadResponse = { ok?: boolean; workspace?: AgentWorkspace; thread?: AgentThreadSummary; messages?: AgentChatItem[] };
type AgentTurnPayload = {
    text: string;
    prompt: string;
    canvasId: string;
    threadId?: string;
    attachments: Array<Pick<AgentAttachment, "name" | "type" | "dataUrl">>;
    skills: Array<{ skillId: string; name: string; description: string; version: string; files: Array<{ path: string; mimeType: string; contentBase64: string }> }>;
};

export const CanvasLocalAgentPanel = memo(function CanvasLocalAgentPanel({
    snapshot,
    canUndoOps,
    undoOpsCount = 0,
    collapsed,
    embedded,
    headless,
    autoConnect,
    onApplyOps,
    onUndoOps,
}: {
    snapshot: CanvasSnapshot;
    canUndoOps: boolean;
    undoOpsCount?: number;
    collapsed?: boolean;
    embedded?: boolean;
    headless?: boolean;
    autoConnect?: boolean;
    onApplyOps: (ops: CanvasOperation[], context?: { conversationId?: string; messageId?: string; source?: "online" | "local" }) => Promise<CanvasSnapshot>;
    onUndoOps: () => CanvasSnapshot | null;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useInterfaceTranslation();
    const tRef = useRef(t);
    const user = useUserStore((state) => state.user);
    const { message, modal } = App.useApp();
    const {
        width,
        connected,
        enabled,
        prompt,
        attachments,
        sending,
        waiting,
        messages,
        eventLogs,
        threads,
        activeThreadId,
        workspacePath,
        loadingThreads,
        activeTab,
        confirmTools,
        activity,
        connectError,
        pendingTool,
        setAgentState,
        addMessage: pushMessage,
        addEventLog: pushEventLog,
        clearEventLogs,
    } = useCanvasAgentStore();
    const [resizing, setResizing] = useState(false);
    const [retryTurn, setRetryTurn] = useState<AgentTurnPayload | null>(null);
    const [retryMessageId, setRetryMessageId] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    // 供 Agent 输入框「@」插入的画布节点引用候选（active 标记为可用，供「@」菜单列出），与「/」弹出的已加入技能候选
    const composerReferences = useMemo(() => buildCanvasResourceReferences(snapshot.nodes, snapshot.connections).map((item) => ({ ...item, active: true })), [snapshot]);
    const [composerSkills, setComposerSkills] = useState<Skill[]>([]);
    useEffect(() => {
        let cancelled = false;
        listAddedSkills()
            .then((result) => {
                if (!cancelled) setComposerSkills(result?.skills ?? []);
            })
            .catch(() => {
                // 技能列表加载失败只影响「/」菜单，不影响输入主功能
            });
        return () => {
            cancelled = true;
        };
    }, []);
    const snapshotRef = useRef(snapshot);
    const confirmToolsRef = useRef(confirmTools);
    const pendingToolRef = useRef<AgentPendingToolCall | null>(null);
    const onApplyOpsRef = useRef(onApplyOps);
    const autoConnectRef = useRef(false);
    const connectedRef = useRef(false);
    const errorLoggedRef = useRef(false);
    const attachmentUrlsRef = useRef(new Set<string>());
    const clientIdRef = useRef(createClientId());
    const runtimeRevisionRef = useRef(0);
    const runtimeStateHashRef = useRef("");
    const runtimeCanonicalStateHashRef = useRef("");
    const runtimeSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
    const connectionControllerRef = useRef<AbortController | null>(null);
    const activeToolRequestIdsRef = useRef(new Set<string>());
    const recoveredToolResultIdsRef = useRef(new Set<string>());
    const activeTurnRef = useRef<AgentTurnPayload | null>(null);
    const syncState = useCallback(
        (clientId: string, nextSnapshot: CanvasSnapshot) => {
            const stateHash = hashCanvasSnapshot(nextSnapshot);
            if (runtimeStateHashRef.current !== stateHash) {
                runtimeRevisionRef.current = runtimeStateHashRef.current ? runtimeRevisionRef.current + 1 : nextSnapshot.revision ?? 0;
                runtimeStateHashRef.current = stateHash;
            }
            // Canvas Agent 的 canonical hash 是服务端 SHA-256；浏览器本地校验使用轻量 FNV hash。
            // 不把浏览器 hash 当作服务端 hash 上送，避免跨运行时误判；服务端会根据完整快照重新计算。
            const envelope = { ...nextSnapshot, revision: runtimeRevisionRef.current };
            const queued = runtimeSyncQueueRef.current
                .catch(() => undefined)
                .then(async () => {
                    const result = await postCanvasRuntimeState(getLocalRuntimeSessionClient(), clientId, envelope);
                    runtimeRevisionRef.current = result.revision;
                    runtimeCanonicalStateHashRef.current = result.stateHash;
                    return result;
                })
                .catch(() => {
                    pushEventLog({
                        id: `${Date.now()}-${Math.random()}`,
                        time: new Date().toLocaleTimeString(),
                        title: tRef.current("agentLocalUiStatusSyncFailed" as InterfaceMessageKey),
                        text: tRef.current("agentLocalUiRuntimeNotReceivedCanvasState" as InterfaceMessageKey),
                    });
                    return undefined;
                });
            runtimeSyncQueueRef.current = queued.then(() => undefined);
            return queued;
        },
        [pushEventLog],
    );
    const loadThreads = useCallback(async () => {
        const projectId = snapshotRef.current.projectId;
        if ((!connectedRef.current && !useCanvasAgentStore.getState().connected) || !projectId) return;
        setAgentState({ loadingThreads: true });
        try {
            const data = await fetchAgentJson<AgentThreadsResponse>(`/agent/codex/threads?canvasId=${encodeURIComponent(projectId)}`);
            const current = useCanvasAgentStore.getState();
            setAgentState({
                threads: data.data || [],
                workspacePath: data.workspace?.workspacePath || current.workspacePath,
                activeThreadId: data.workspace?.activeThreadId || current.activeThreadId,
            });
            const nextThreadId = data.workspace?.activeThreadId || current.activeThreadId;
            if (nextThreadId && !current.messages.length) {
                const thread = await fetchAgentJson<AgentThreadResponse>(`/agent/codex/threads/${encodeURIComponent(nextThreadId)}?canvasId=${encodeURIComponent(projectId)}`);
                setAgentState({ messages: normalizeHistoryMessages(thread.messages || []) });
            }
        } catch (error) {
            addEventLog(tRef.current("agentLocalUiReadHistoryFailed" as InterfaceMessageKey), error);
        } finally {
            setAgentState({ loadingThreads: false });
        }
    }, [setAgentState]);

    useEffect(() => {
        snapshotRef.current = snapshot;
    }, [snapshot]);
    useEffect(() => {
        tRef.current = t;
    }, [t]);
    useEffect(() => {
        runtimeRevisionRef.current = 0;
        runtimeStateHashRef.current = "";
        runtimeCanonicalStateHashRef.current = "";
        activeTurnRef.current = null;
        setRetryTurn(null);
        setRetryMessageId(null);
    }, [snapshot.projectId]);
    useEffect(() => {
        if (!connected) return;
        const clientId = clientIdRef.current;
        snapshot.nodes.forEach((node) => {
            const continuation = node.metadata?.agentGenerationContinuation;
            const requestId = continuation?.source === "local" && continuation.status === "completed" ? continuation.messageId : undefined;
            if (!requestId || activeToolRequestIdsRef.current.has(requestId) || recoveredToolResultIdsRef.current.has(requestId)) return;
            recoveredToolResultIdsRef.current.add(requestId);
            void postToolResult(clientId, { requestId, result: snapshot })
                .then(() => {
                    syncState(clientId, snapshot);
                })
                .catch(() => {
                    recoveredToolResultIdsRef.current.delete(requestId);
                });
        });
    }, [connected, snapshot, syncState]);
    useEffect(() => {
        confirmToolsRef.current = confirmTools;
    }, [confirmTools]);
    useEffect(() => {
        pendingToolRef.current = pendingTool;
    }, [pendingTool]);
    useEffect(() => {
        onApplyOpsRef.current = onApplyOps;
    }, [onApplyOps]);
    useEffect(() => {
        if (activeTab !== "chat") return;
        const frame = requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
        return () => cancelAnimationFrame(frame);
    }, [activeTab, activeThreadId, messages, pendingTool, waiting]);
    useEffect(() => () => attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        connectionControllerRef.current = controller;
        const clientId = clientIdRef.current;
        let lastEventId = "";
        const receive = (event: LocalRuntimeEvent) => {
            if (event.id) lastEventId = event.id;
            if (event.type === "hello") {
                errorLoggedRef.current = false;
                connectedRef.current = true;
                setAgentState({ connected: true, activity: "已连接", connectError: "", messages: useCanvasAgentStore.getState().messages.filter((item) => !isConnectionErrorMessage(item, tRef.current)) });
                if (!headless) message.success(tRef.current("agentLocalUiLocalAgentConnected" as InterfaceMessageKey));
                syncState(clientId, snapshotRef.current);
                return;
            }
            if (event.type === "tool_call") {
                const data = parseEventJson<AgentPendingToolCall>(event.data);
                if (data) void handleToolCall(data);
                return;
            }
            if (event.type === "agent_event") {
                const data = parseEventJson<AgentEventPayload>(event.data);
                if (data) handleAgentEvent(data);
                return;
            }
            if (event.type === "agent_log") {
                const text = parseEventJson<{ text?: unknown }>(event.data)?.text;
                addEventLog(tRef.current("agentLocalUiLog" as InterfaceMessageKey), text, text);
                return;
            }
            if (event.type === "agent_error") {
                const errorMessage = parseEventJson<{ message?: unknown }>(event.data)?.message;
                setAgentState({ activity: "出错", waiting: false, sending: false });
                const messageId = addMessage({ role: "error", title: tRef.current("agentLocalUiErrorTitle" as InterfaceMessageKey), text: normalizeText(errorMessage) || tRef.current("agentLocalUiExecutionFailedRetry" as InterfaceMessageKey) });
                if (activeTurnRef.current) {
                    setRetryTurn(activeTurnRef.current);
                    setRetryMessageId(messageId || null);
                }
                addEventLog(tRef.current("agentLocalUiErrorTitle" as InterfaceMessageKey), errorMessage, errorMessage);
                return;
            }
            if (event.type === "agent_done") {
                setAgentState({ activity: "完成", waiting: false, sending: false });
                void loadThreads();
            }
        };
        void (async () => {
            while (!controller.signal.aborted) {
                try {
                    await prepareCanvasRuntimeConnection(useLocalRuntimeStore, controller.signal);
                    await consumeLocalRuntimeEventStream(getLocalRuntimeSessionClient(), `/events?clientId=${encodeURIComponent(clientId)}`, { signal: controller.signal, lastEventId, onEvent: receive });
                    if (!controller.signal.aborted) throw new Error("Canvas stream closed");
                } catch (error) {
                    if (controller.signal.aborted) return;
                    const wasConnected = connectedRef.current;
                    const text = tRef.current((wasConnected ? "agentLocalUiConnectionDroppedRetrying" : "agentLocalUiConnectionFailedCheckRuntime") as InterfaceMessageKey);
                    if (!errorLoggedRef.current || wasConnected) {
                        addEventLog(tRef.current((wasConnected ? "agentLocalUiConnectionDropped" : "agentLocalUiConnectionFailed") as InterfaceMessageKey), text);
                        if (!headless) message.error(text);
                    }
                    errorLoggedRef.current = true;
                    connectedRef.current = false;
                    setAgentState(canvasAgentTransientDisconnectPatch(wasConnected ? "正在重连" : "连接失败", text));
                    await waitForCanvasRuntimeReconnect(controller.signal);
                }
            }
        })();
        return () => {
            controller.abort();
            if (connectionControllerRef.current === controller) connectionControllerRef.current = null;
            connectedRef.current = false;
            setAgentState({ connected: false });
        };
    }, [enabled, loadThreads, message, setAgentState, syncState]);

    useEffect(() => {
        if (connected) void loadThreads();
    }, [connected, loadThreads, snapshot.projectId]);

    useEffect(() => {
        if (activeTab === "history" && connected) void loadThreads();
    }, [activeTab, connected, loadThreads]);

    useEffect(() => {
        if (!connected) return;
        const timer = setTimeout(() => syncState(clientIdRef.current, snapshot), 300);
        return () => clearTimeout(timer);
    }, [connected, snapshot, syncState]);

    const submitTurn = async (payload: AgentTurnPayload, appendUserMessage: boolean) => {
        const state = useCanvasAgentStore.getState();
        if (!state.connected || state.sending || state.waiting) return;
        activeTurnRef.current = payload;
        if (appendUserMessage) {
            setRetryTurn(null);
            setRetryMessageId(null);
        }
        setAgentState({ activity: appendUserMessage ? "发送中" : "重试中", sending: true, waiting: true });
        if (appendUserMessage) {
            const files = state.attachments;
            addMessage({ role: "user", text: payload.text || tRef.current("agentLocalUiSentImages" as InterfaceMessageKey), attachments: files });
            addEventLog(tRef.current("agentLocalUiUserSent" as InterfaceMessageKey), { text: payload.text, attachments: files.map(({ name, type, size }) => ({ name, type, size })) });
            // 保留附件的 data URL 供已发送消息持续显示和放大预览；仅释放 composer 的临时 object URL。
            files.forEach((item) => {
                URL.revokeObjectURL(item.url);
                attachmentUrlsRef.current.delete(item.url);
            });
            setAgentState({ prompt: "", attachments: [] });
        } else {
            addEventLog(tRef.current("agentRuntimeUiRetryTurn" as InterfaceMessageKey), { threadId: payload.threadId, attachments: payload.attachments.map(({ name, type }) => ({ name, type })) });
        }
        try {
            const data = await fetchAgentJson<{ threadId?: string }>("/agent/codex/turn", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    prompt: payload.prompt,
                    canvasId: payload.canvasId,
                    threadId: payload.threadId,
                    attachments: payload.attachments,
                    skills: payload.skills,
                }),
            });
            const acceptedPayload = data.threadId ? { ...payload, threadId: data.threadId } : payload;
            activeTurnRef.current = acceptedPayload;
            if (data.threadId) setAgentState({ activeThreadId: data.threadId });
            addEventLog(tRef.current((appendUserMessage ? "agentLocalUiLocalAgentAccepted" : "agentLocalUiLocalAgentAcceptedRetry") as InterfaceMessageKey), { accepted: true });
        } catch (error) {
            setRetryTurn(activeTurnRef.current);
            setAgentState({ activity: "发送失败", waiting: false });
            const failure = tRef.current((appendUserMessage ? "agentLocalUiSendFailed" : "agentLocalUiRetryFailed") as InterfaceMessageKey);
            const messageId = addMessage({ role: "error", title: failure, text: error instanceof Error ? error.message : failure });
            setRetryMessageId(messageId || null);
            addEventLog(failure, error);
        } finally {
            setAgentState({ sending: false });
        }
    };

    const sendPrompt = async (overrideText?: string) => {
        const text = (overrideText ?? prompt).trim();
        const files = attachments;
        if (!connected || !promptWithAttachments(text, files) || sending || waiting) return;
        if (attachmentPayloadBytes(files) > MAX_ATTACHMENT_PAYLOAD_BYTES) {
            addMessage({ role: "error", title: t("agentLocalUiImageTooLargeTitle" as InterfaceMessageKey), text: t("agentLocalUiImageAttachmentOverLimit" as InterfaceMessageKey) });
            return;
        }
        let skillExecution: Awaited<ReturnType<typeof skillRuntime.prepare<"localAgent">>>;
        try {
            skillExecution = await skillRuntime.prepare({ profile: "localAgent", prompt: text, skills: composerSkills });
        } catch (error) {
            addMessage({ role: "error", title: t("agentLocalUiSkillLoadFailedTitle" as InterfaceMessageKey), text: error instanceof Error ? error.message : t("agentLocalUiCannotReadSkillPackage" as InterfaceMessageKey) });
            return;
        }
        const requestPrompt = promptWithAttachments(skillExecution.prompt, files);
        const skillBundles: AgentTurnPayload["skills"] = skillExecution.skills;
        if (attachmentPayloadBytes(files) + skillBundlePayloadBytes(skillBundles) > MAX_AGENT_TURN_PAYLOAD_BYTES) {
            addMessage({ role: "error", title: t("agentLocalUiTurnContentTooLargeTitle" as InterfaceMessageKey), text: t("agentLocalUiTurnContentOverLimit" as InterfaceMessageKey) });
            return;
        }
        await submitTurn({
            text,
            prompt: requestPrompt,
            canvasId: snapshotRef.current.projectId,
            threadId: useCanvasAgentStore.getState().activeThreadId || undefined,
            attachments: files.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
            skills: skillBundles,
        }, true);
    };

    const addAttachments = async (files: FileList | File[] | null) => {
        if (!files) return;
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        const prev = useCanvasAgentStore.getState().attachments;
        try {
            const next = await Promise.all(
                images.slice(0, Math.max(0, MAX_ATTACHMENTS - prev.length)).map(async (file) => {
                    const dataUrl = await readDataUrl(file);
                    const url = URL.createObjectURL(file);
                    attachmentUrlsRef.current.add(url);
                    return { id: createId(), name: file.name, type: file.type, size: file.size, url, dataUrl };
                }),
            );
            const merged = [...prev, ...next];
            if (attachmentPayloadBytes(merged) > MAX_ATTACHMENT_PAYLOAD_BYTES) {
                next.forEach((item) => {
                    URL.revokeObjectURL(item.url);
                    attachmentUrlsRef.current.delete(item.url);
                });
                addMessage({ role: "error", title: t("agentLocalUiImageTooLargeTitle" as InterfaceMessageKey), text: t("agentLocalUiImageAttachmentMaxSize" as InterfaceMessageKey) });
                return;
            }
            if (next.length) setAgentState({ attachments: merged });
        } catch (error) {
            addMessage({ role: "error", title: t("agentLocalUiImageReadFailedTitle" as InterfaceMessageKey), text: error instanceof Error ? error.message : t("agentLocalUiImageReadFailed" as InterfaceMessageKey) });
        }
    };

    const removeAttachment = (id: string) => {
        const removed = attachments.find((item) => item.id === id);
        if (removed) {
            URL.revokeObjectURL(removed.url);
            attachmentUrlsRef.current.delete(removed.url);
        }
        setAgentState({ attachments: attachments.filter((item) => item.id !== id) });
    };

    const handleToolCall = async (payload: AgentPendingToolCall) => {
        if (confirmToolsRef.current && (payload.name === "canvas_apply_ops" || (isProjectAgentToolName(payload.name) && !isProjectAgentReadTool(payload.name)))) {
            if (pendingToolRef.current) {
                await postToolResult(clientIdRef.current, { requestId: payload.requestId, error: "仍有待确认的画布工具调用" });
                return;
            }
            pendingToolRef.current = payload;
            setAgentState({ pendingTool: payload, activity: "等待确认", waiting: false });
            addEventLog(tRef.current("agentLocalUiWaitingForConfirmation" as InterfaceMessageKey), payload, payload);
            return;
        }
        await runToolCall(payload);
    };

    const runToolCall = async (payload: AgentPendingToolCall) => {
        activeToolRequestIdsRef.current.add(payload.requestId);
        try {
            const input = (payload.input || {}) as Record<string, unknown>;
            const projectToolName = isProjectAgentToolName(payload.name) ? payload.name : null;
            setAgentState({ activity: payload.name === "canvas_apply_ops" ? "执行画布操作" : projectToolName ? "执行项目工具" : "读取画布", waiting: true });
            addEventLog(toolName(payload.name, tRef.current), payload, payload);
            if (payload.name === "canvas_apply_ops") {
                const currentSnapshot = snapshotRef.current;
                if (typeof input.expectedRevision === "number" && input.expectedRevision !== runtimeRevisionRef.current) throw new Error(`画布 revision 已从 ${input.expectedRevision} 变为 ${runtimeRevisionRef.current}，请重新读取 canvas_get_context 后再执行写操作`);
                // expectedStateHash is the Canvas Agent Runtime's canonical
                // SHA-256 hash. The browser intentionally uses a different,
                // synchronous fingerprint for local bookkeeping, so the
                // Runtime has already performed the authoritative check before
                // emitting this tool call. Comparing the two algorithms here
                // would reject every valid local write.
                const validation = validateCanvasOperations(currentSnapshot, (input.ops || []) as CanvasOperation[]);
                if (!validation.ok) throw new Error(`画布操作校验失败：${validation.issues.filter((item) => item.severity === "error").map((item) => item.message).join("；")}`);
            }
            const result =
                payload.name === "canvas_apply_ops"
                    ? await (async () => {
                          const before = snapshotRef.current;
                          const next = await onApplyOpsRef.current((input.ops || []) as CanvasOperation[], { source: "local", conversationId: activeThreadId || clientIdRef.current, messageId: payload.requestId });
                          const verification = verifyCanvasOperations(before, next, (input.ops || []) as CanvasOperation[]);
                          return {
                              ok: verification.ok,
                              message: canvasOperationPostconditionMessage(verification),
                              data: { verification, snapshot: next },
                              snapshot: next,
                          };
                      })()
                    : payload.name === "canvas_get_state" || payload.name === "canvas_export_snapshot"
                      ? snapshotRef.current
                    : payload.name === "canvas_get_context"
                      ? await readLocalCanvasContext()
                      : payload.name === "canvas_find_nodes"
                        ? findCanvasNodes(snapshotRef.current, input as Parameters<typeof findCanvasNodes>[1])
                        : payload.name === "canvas_get_node"
                          ? getCanvasNode(snapshotRef.current, { id: requireString(input.id, "id") })
                        : payload.name === "canvas_get_connection"
                            ? getCanvasConnection(snapshotRef.current, { id: requireString(input.id, "id") })
                        : payload.name === "canvas_get_generation_tasks"
                          ? getCanvasGenerationTasks(snapshotRef.current, input as Parameters<typeof getCanvasGenerationTasks>[1])
                        : payload.name === "canvas_get_resources"
                          ? getCanvasResources(snapshotRef.current, input as Parameters<typeof getCanvasResources>[1])
                        : payload.name === "canvas_validate_ops"
                            ? validateCanvasOperations(snapshotRef.current, (input.ops || []) as CanvasOperation[])
                            : payload.name === "canvas_get_selection"
                              ? (() => {
                                    const ids = new Set(snapshotRef.current.selectedNodeIds || []);
                                    return { nodes: snapshotRef.current.nodes.filter((node) => ids.has(node.id)) };
                                })()
                            : projectToolName
                              ? await runProjectAgentTool(projectToolName, input, snapshotRef.current.domainProjectId)
                              : snapshotRef.current;
            await postToolResult(clientIdRef.current, { requestId: payload.requestId, result });
            if (payload.name === "canvas_apply_ops") syncState(clientIdRef.current, (result as { snapshot?: CanvasSnapshot }).snapshot || snapshotRef.current);
            setAgentState({ activity: "工具完成", waiting: true });
            const completedTitle = tRef.current("agentLocalUiToolCompletedNamed" as InterfaceMessageKey, { name: toolName(payload.name, tRef.current) });
            addEventLog(completedTitle, result, result);
            addMessage({
                role: "tool",
                title: completedTitle,
                text: payload.name === "canvas_apply_ops" ? (result as { message?: string }).message || summarizeCanvasOperations((input.ops || []) as CanvasOperation[]) || "画布操作" : tRef.current("agentRuntimeUiToolStatusCompleted" as InterfaceMessageKey),
                detail: { requestId: payload.requestId, name: payload.name, input, result },
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : tRef.current("agentLocalUiCanvasOperationFailed" as InterfaceMessageKey);
            setAgentState({ activity: "工具失败", waiting: false });
            const title = tRef.current("agentLocalUiToolFailureTitle" as InterfaceMessageKey);
            addMessage({ role: "tool", title, text: errorMessage, detail: payload });
            await postToolResult(clientIdRef.current, { requestId: payload.requestId, error: errorMessage });
        } finally {
            activeToolRequestIdsRef.current.delete(payload.requestId);
        }
    };

    const readLocalCanvasContext = async () => {
        // Flush the latest browser snapshot first, then expose the Runtime's
        // canonical state hash to Codex. This keeps the local MCP path's
        // read→write precondition compatible with the server-side path.
        const synced = await syncState(clientIdRef.current, snapshotRef.current);
        const stateHash = synced?.stateHash || runtimeCanonicalStateHashRef.current;
        return buildCanvasContext(snapshotRef.current, {
            ...(stateHash ? { stateHash, hashSource: "canvas-server" as const } : {}),
        });
    };

    const rejectPendingTool = async () => {
        if (!pendingTool) return;
        await postToolResult(clientIdRef.current, { requestId: pendingTool.requestId, error: "用户取消了画布工具调用" });
        setAgentState({ activity: "已取消", waiting: false });
            addMessage({ role: "tool", title: t("agentRuntimeUiToolStatusRejected" as InterfaceMessageKey), text: toolName(pendingTool.name, t), detail: { requestId: pendingTool.requestId, name: pendingTool.name, input: pendingTool.input } });
        pendingToolRef.current = null;
        setAgentState({ pendingTool: null });
    };

    const approvePendingTool = async () => {
        if (!pendingTool) return;
        const tool = pendingTool;
        pendingToolRef.current = null;
        setAgentState({ pendingTool: null });
        await runToolCall(tool);
    };

    const undoLastTool = () => {
        const restored = onUndoOps();
        if (!restored) return;
        setAgentState({ activity: "已撤销" });
        addMessage({ role: "tool", title: t("agentLocalUiUndidAgentBatch" as InterfaceMessageKey), text: t("agentLocalUiCanvasRestoredBeforeWriteback" as InterfaceMessageKey), detail: restored });
        if (connected) syncState(clientIdRef.current, restored);
    };

    const toggleAgentConnection = () => {
        if (enabled) {
            connectionControllerRef.current?.abort();
            pendingToolRef.current = null;
            setAgentState({ enabled: false, connected: false, activity: "离线", connectError: "", waiting: false, sending: false, pendingTool: null });
            return;
        }
        errorLoggedRef.current = false;
        setAgentState(canvasAgentConnectionStartingPatch());
    };

    useEffect(() => {
        if (!autoConnect || autoConnectRef.current || enabled || connected) return;
        autoConnectRef.current = true;
        void toggleAgentConnection();
    }, [autoConnect, connected, enabled]);

    const startNewThread = async () => {
        const projectId = snapshotRef.current.projectId;
        if (!connected || !projectId) return;
        setAgentState({ loadingThreads: true });
        try {
            const data = await fetchAgentJson<AgentThreadResponse>("/agent/codex/threads/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ canvasId: projectId }) });
            activeTurnRef.current = null;
            setRetryTurn(null);
            setRetryMessageId(null);
            setAgentState({ activeThreadId: data.thread?.id || data.workspace?.activeThreadId || "", messages: [], activeTab: "chat", activity: "新对话" });
            await loadThreads();
        } catch (error) {
            const failure = t("agentLocalUiNewConversationFailed" as InterfaceMessageKey);
            addEventLog(failure, error);
            message.error(error instanceof Error ? error.message : failure);
        } finally {
            setAgentState({ loadingThreads: false });
        }
    };

    const resumeThread = async (threadId: string) => {
        const projectId = snapshotRef.current.projectId;
        if (!connected || !projectId || !threadId) return;
        setAgentState({ loadingThreads: true });
        try {
            const data = await fetchAgentJson<AgentThreadResponse>(`/agent/codex/threads/${encodeURIComponent(threadId)}/resume`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ canvasId: projectId }) });
            activeTurnRef.current = null;
            setRetryTurn(null);
            setRetryMessageId(null);
            setAgentState({ activeThreadId: data.thread?.id || threadId, messages: normalizeHistoryMessages(data.messages || []), activeTab: "chat", activity: "已恢复会话" });
            await loadThreads();
        } catch (error) {
            const failure = t("agentLocalUiConversationRestoreFailed" as InterfaceMessageKey);
            addEventLog(failure, error);
            message.error(error instanceof Error ? error.message : failure);
        } finally {
            setAgentState({ loadingThreads: false });
        }
    };

    const deleteThread = async (threadId: string) => {
        const projectId = snapshotRef.current.projectId;
        if (!connected || !projectId || !threadId) return;
        setAgentState({ loadingThreads: true });
        try {
            await fetchAgentJson(`/agent/codex/threads/${encodeURIComponent(threadId)}/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ canvasId: projectId }) });
            const current = useCanvasAgentStore.getState();
            if (current.activeThreadId === threadId) {
                activeTurnRef.current = null;
                setRetryTurn(null);
                setRetryMessageId(null);
            }
            setAgentState({
                threads: current.threads.filter((thread) => thread.id !== threadId),
                activeThreadId: current.activeThreadId === threadId ? "" : current.activeThreadId,
                messages: current.activeThreadId === threadId ? [] : current.messages,
            });
            message.success(t("agentLocalUiRecordDeleted" as InterfaceMessageKey));
        } catch (error) {
            const failure = t("agentLocalUiDeleteConversationFailed" as InterfaceMessageKey);
            addEventLog(failure, error);
            message.error(error instanceof Error ? error.message : failure);
        } finally {
            setAgentState({ loadingThreads: false });
        }
    };

    const confirmDeleteThread = (thread: AgentThreadSummary) => {
        const label = thread.name || thread.preview || t("agentLocalUiUnnamedConversation" as InterfaceMessageKey);
        modal.confirm({
            title: t("agentLocalUiDeleteConversationRecordsTitle" as InterfaceMessageKey),
            content: t("agentLocalUiConfirmDeleteConversation" as InterfaceMessageKey, { title: label.length > 48 ? `${label.slice(0, 48)}...` : label }),
            okText: t("agentRuntimeUiDeleteCountLabel" as InterfaceMessageKey),
            okType: "danger",
            cancelText: t("agentLocalUiCancel" as InterfaceMessageKey),
            onOk: () => deleteThread(thread.id),
        });
    };

    const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        let nextWidth = startWidth;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = clamp(startWidth + startX - moveEvent.clientX, 360, 760);
            setAgentState({ width: nextWidth });
        };
        const onUp = () => {
            localStorage.setItem("canvas-agent-panel-width", String(nextWidth));
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setResizing(false);
        };
        setResizing(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const addMessage = (item: Omit<AgentChatItem, "id">) => {
        const text = normalizeText(item.text);
        if (!text && !item.attachments?.length) return undefined;
        const next = { ...item, id: `${Date.now()}-${Math.random()}`, text };
        const currentMessages = useCanvasAgentStore.getState().messages;
        if (next.streamId) {
            const index = currentMessages.findIndex((message) => message.streamId === next.streamId);
            if (index >= 0) {
                setAgentState({ messages: currentMessages.map((message, i) => (i === index ? { ...message, ...next, id: message.id, text: next.text || message.text } : message)) });
                return currentMessages[index].id;
            }
        }
        const last = currentMessages.at(-1);
        if (last?.role === "assistant" && next.role === "assistant" && last.title === next.title) {
            const merged = mergeAgentText(last.text, next.text);
            if (merged === last.text) return last.id;
            setAgentState({ messages: [...useCanvasAgentStore.getState().messages.slice(0, -1), { ...last, text: merged, meta: next.meta || last.meta }] });
            return last.id;
        }
        pushMessage(next);
        return next.id;
    };

    const addEventLog = (title: string, text: unknown, raw?: unknown) => {
        pushEventLog({ id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString(), title, text: normalizeText(text) || title, raw });
    };

    const handleAgentEvent = (event: AgentEventPayload) => {
        if (shouldLogAgentEvent(event)) addEventLog(eventTitle(event, tRef.current), event, event);
        if (event.type === "thread.started" && event.thread_id) setAgentState({ activeThreadId: event.thread_id });
        const nextActivity = activityText(event);
        if (nextActivity) setAgentState({ activity: nextActivity });
        if (event.type === "turn.started") setAgentState({ waiting: true });
        if (event.type === "turn.completed") {
            activeTurnRef.current = null;
            setRetryTurn(null);
            setRetryMessageId(null);
            setAgentState({ waiting: false, sending: false });
        } else if (event.type === "turn.failed" || event.type === "error") {
            if (activeTurnRef.current) setRetryTurn(activeTurnRef.current);
            setAgentState({ waiting: false, sending: false });
        }
        const item = formatAgentEvent(event, tRef.current);
        if (item) {
            if (item.role === "error") setAgentState({ waiting: false, sending: false });
            const messageId = addMessage(item);
            if ((event.type === "turn.failed" || event.type === "error") && activeTurnRef.current && item.role === "error") setRetryMessageId(messageId || null);
        }
    };

    const content = (
        <>
            <div className="flex min-h-8 shrink-0 items-center justify-end gap-1 px-3 pb-1">
                <div className="mr-auto min-w-0 truncate px-1 text-[var(--fs-tiny)]" style={{ color: connected ? "#16a34a" : theme.node.muted }}>
                    {connected ? t("agentLocalUiLocalAgentConnected" as InterfaceMessageKey) : localAgentConnectionLabel(canvasAgentConnectionStatusText({ enabled, connected, activity, connectError }), t)}
                </div>
                {!connected ? (
                    <Button size="small" type={enabled ? "default" : "primary"} className="!h-7 !px-2.5" icon={<PlugZap className="size-3.5" />} onClick={toggleAgentConnection}>
                        {enabled ? t("agentLocalUiConnecting" as InterfaceMessageKey) : t("agentLocalUiConnect" as InterfaceMessageKey)}
                    </Button>
                ) : null}
                <Tooltip title={threads.length ? t("agentLocalUiHistorySessionsCount" as InterfaceMessageKey, { count: threads.length }) : t("agentLocalUiHistorySessions" as InterfaceMessageKey)}>
                    <Button type="text" className={`!h-7 !min-w-7 !px-1.5 ${activeTab === "history" ? "font-medium" : ""}`} style={{ color: activeTab === "history" ? theme.node.text : theme.node.muted, background: activeTab === "history" ? theme.spatial.surface : "transparent" }} icon={<History className="size-3.5" />} onClick={() => setAgentState({ activeTab: activeTab === "history" ? "chat" : "history" })} aria-label={t("agentLocalUiOpenHistorySessions" as InterfaceMessageKey)}>
                        {threads.length ? <span className="text-[var(--fs-tiny)] tabular-nums">{threads.length}</span> : null}
                    </Button>
                </Tooltip>
                <Tooltip title={t("agentLocalUiNewConversation" as InterfaceMessageKey)}>
                    <Button type="text" shape="circle" className="!h-7 !w-7 !min-w-7" disabled={!connected || loadingThreads} style={{ color: theme.node.muted }} icon={<Plus className="size-3.5" />} onClick={() => void startNewThread()} aria-label={t("agentLocalUiCreateNewConversation" as InterfaceMessageKey)} />
                </Tooltip>
            </div>

            {!connected ? (
                <AgentConnectView
                    theme={theme}
                    enabled={enabled}
                    activity={activity}
                    connectError={connectError}
                    onToggleEnabled={toggleAgentConnection}
                />
            ) : activeTab === "history" ? (
                <AgentHistoryView
                    theme={theme}
                    threads={threads}
                    activeThreadId={activeThreadId}
                    workspacePath={workspacePath}
                    loading={loadingThreads}
                    connected={connected}
                    onRefresh={() => void loadThreads()}
                    onNewThread={() => void startNewThread()}
                    onResumeThread={(threadId) => void resumeThread(threadId)}
                    onDeleteThread={confirmDeleteThread}
                />
            ) : (
                <>
                    <div ref={listRef} className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                        {!messages.length && !pendingTool && !waiting ? (
                            <AgentChatEmptyState
                                theme={theme}
                                nodeCount={snapshot.nodes.length}
                                onSelect={(text) => {
                                    setAgentState({ prompt: text });
                                    void sendPrompt(text);
                                }}
                            />
                        ) : null}
                        {messages.map((item) => (
                            <AgentChatMessage key={item.id} item={agentMessageToChatMessage(item)} theme={theme} user={user} isStreaming={(sending || waiting) && item.id === messages.at(-1)?.id && item.role === "assistant"} retrying={sending && item.id === retryMessageId} onRetry={item.id === retryMessageId && retryTurn ? () => void submitTurn(retryTurn, false) : undefined} onQuickAction={(text) => void sendPrompt(text)} />
                        ))}
                        {pendingTool ? (
                            <AgentPendingToolCard
                                summary={summarizeCanvasOperations(pendingTool.input?.ops || [], t) || toolName(pendingTool.name, t)}
                                detail={{ requestId: pendingTool.requestId, name: pendingTool.name, input: pendingTool.input, impact: previewCanvasOperations(pendingTool.input?.ops || [], snapshot, t) }}
                                theme={theme}
                                onReject={rejectPendingTool}
                                onApprove={approvePendingTool}
                            />
                        ) : null}
                        {waiting && !pendingTool ? <AgentWorkingMessage theme={theme} /> : null}
                    </div>
                    <AgentChatComposer
                        prompt={prompt}
                        attachments={attachments.map(agentAttachmentToChatAttachment)}
                        disabled={!connected}
                        sending={sending || waiting}
                        placeholder={t("agentLocalUiPromptPlaceholder" as InterfaceMessageKey)}
                        theme={theme}
                        references={composerReferences}
                        slashSkills={composerSkills}
                        includeAssetLibrary
                        onPromptChange={(prompt) => setAgentState({ prompt })}
                        onSubmit={sendPrompt}
                        onAddFiles={addAttachments}
                        onRemoveAttachment={removeAttachment}
                        left={
                            <>
                                <VoiceRecordingButton disabled={!connected || sending || waiting} onTranscribed={(text) => setAgentState({ prompt: prompt.trim() ? `${prompt} ${text}` : text })} />
                                {attachments.length ? (
                                    <span className="text-[var(--fs-label)]" style={{ color: theme.node.muted }}>
                                        {formatBytes(attachmentPayloadBytes(attachments))} / 30MB
                                    </span>
                                ) : null}
                            </>
                        }
                    />
                </>
            )}
        </>
    );

    if (headless) return null;
    if (embedded) return content;

    return (
        <motion.div
            className="relative z-[var(--z-panel-floating)] flex h-full shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: collapsed ? 0 : width + 1, opacity: collapsed ? 0 : 1 }}
            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "clip", pointerEvents: collapsed ? "none" : undefined }}
        >
            <motion.aside
                className="relative flex h-full shrink-0 flex-col border-l"
                initial={{ x: 48 }}
                animate={{ x: collapsed ? 28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ width, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            >
                <div className="absolute left-0 top-0 h-full w-1 cursor-col-resize transition hover:bg-current/20" onPointerDown={startResize} />
                {content}
            </motion.aside>
        </motion.div>
    );
});

function AgentLogView({
    logs,
    theme,
    context,
    onClear,
    onCopied,
    onCopyBlocked,
}: {
    logs: AgentEventLog[];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    context: AgentLogContext;
    onClear: () => void;
    onCopied: (text: string) => void;
    onCopyBlocked: (text: string) => void;
}) {
    const { t } = useInterfaceTranslation();
    const [mode, setMode] = useState<"text" | "json">("text");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const content = mode === "text" ? formatLogText(logs, context, t) : formatLogJson(logs, context);
    const lastError = [...logs].reverse().find((item) => /错误|失败|error|fail|failure|fallo|falha|失敗|エラー|오류|실패/i.test(`${item.title}\n${item.text}`));
    const copy = async (value = content, tip = t("agentLocalUiLogsCopied" as InterfaceMessageKey)) => {
        if (await copyToClipboard(value)) {
            onCopied(tip);
            return;
        }
        textareaRef.current?.focus();
        textareaRef.current?.select();
        onCopyBlocked(t("agentLocalUiLogSelectedCopyManually" as InterfaceMessageKey));
    };
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex min-h-full flex-col gap-3">
                <div>
                    <div className="text-base font-semibold leading-6">{t("agentLocalUiRunLogs" as InterfaceMessageKey)}</div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Segmented
                        size="small"
                        value={mode}
                        onChange={(value) => setMode(value as "text" | "json")}
                        options={[
                            { label: t("agentLocalUiDiagnosticLog" as InterfaceMessageKey), value: "text" },
                            { label: t("agentLocalUiRawJson" as InterfaceMessageKey), value: "json" },
                        ]}
                    />
                    <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: theme.node.muted }}>
                            {t("agentLocalUiEventLogCount" as InterfaceMessageKey, { count: logs.length })}
                        </span>
                        <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => void copy()}>
                            {t("agentLocalUiCopy" as InterfaceMessageKey)}
                        </Button>
                        <Button size="small" disabled={!lastError} onClick={() => lastError && void copy(formatLogText([lastError], context, t), t("agentLocalUiMostRecentErrorCopied" as InterfaceMessageKey))}>
                            {t("agentLocalUiMostRecentError" as InterfaceMessageKey)}
                        </Button>
                        <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} disabled={!logs.length} onClick={onClear}>
                            {t("agentLocalUiClear" as InterfaceMessageKey)}
                        </Button>
                    </div>
                </div>
                <textarea
                    ref={textareaRef}
                    readOnly
                    value={content}
                    className="thin-scrollbar min-h-[360px] flex-1 resize-none rounded-md border-0 p-3 font-mono text-xs leading-5 outline-none"
                    style={{ background: theme.spatial.surface, color: theme.node.text }}
                    onFocus={(event) => event.currentTarget.select()}
                />
            </div>
        </div>
    );
}

function AgentConnectView({
    theme,
    enabled,
    activity,
    connectError,
    onToggleEnabled,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    enabled: boolean;
    activity: string;
    connectError: string;
    onToggleEnabled: () => void;
}) {
    const { message } = App.useApp();
    const { t } = useInterfaceTranslation();
    const [platform, setPlatform] = useState<LocalAgentSetupPlatform>(() => detectLocalAgentSetupPlatform());
    const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
    const commands = buildLocalAgentSetupCommands(origin, platform);
    const statusText = localAgentConnectionLabel(canvasAgentConnectionStatusText({ enabled, connected: false, activity, connectError }), t);
    const statusColor = connectError ? "#dc2626" : enabled ? "#d97706" : theme.node.muted;
    const copyCommand = async (value: string, label: string) => {
        if (await copyToClipboard(value)) {
            message.success(t("agentLocalUiCommandCopied" as InterfaceMessageKey, { command: label }));
            return;
        }
        message.warning(t("agentLocalUiCopyFailedManually" as InterfaceMessageKey));
    };
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto w-full max-w-[620px] space-y-5 pb-4">
                <div>
                    <div className="text-base font-semibold leading-6">{t("agentLocalUiConnectLocalAgent" as InterfaceMessageKey)}</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {t("agentLocalUiConnectLocalAgentDescription" as InterfaceMessageKey)}
                    </div>
                </div>
                <div className="rounded-md p-3" style={{ background: theme.spatial.surface }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 text-sm font-medium leading-5">{t("agentLocalUiWebConnection" as InterfaceMessageKey)}</span>
                                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[var(--fs-label)] leading-4" style={{ background: theme.node.fill, color: statusColor }}>
                                    {enabled ? <LoaderCircle className="size-3 shrink-0 animate-spin" /> : <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />}
                                    <span className="truncate">{statusText}</span>
                                </span>
                            </div>
                            <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                {enabled ? t("agentLocalUiDetectingLocalRuntime" as InterfaceMessageKey) : t("agentLocalUiCompleteStepsBeforeConnecting" as InterfaceMessageKey)}
                            </div>
                        </div>
                        <Button className="!h-8 !px-3" type={enabled ? "default" : "primary"} icon={<PlugZap className="size-4" />} onClick={onToggleEnabled}>
                            {enabled ? t("agentLocalUiStopRetrying" as InterfaceMessageKey) : connectError ? t("agentLocalUiReconnect" as InterfaceMessageKey) : t("agentLocalUiStartConnecting" as InterfaceMessageKey)}
                        </Button>
                    </div>
                    <div className="mt-3 grid gap-2.5">
                        {connectError ? (
                            <div className="rounded-md px-2.5 py-2 text-xs leading-5" style={{ background: "rgba(220,38,38,.08)", color: "#dc2626" }}>
                                {connectError}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div>
                    <section className="border-b pb-4" style={{ borderColor: theme.node.stroke }}>
                        <div className="flex items-start gap-3">
                            <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold" style={{ background: theme.node.fill, color: theme.node.text }}>1</span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <div className="text-sm font-medium leading-5">{t("agentLocalUiInstallLocalRuntime" as InterfaceMessageKey)}</div>
                                        <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>{t("agentLocalUiInstallRuntimeRequirements" as InterfaceMessageKey)}</div>
                                    </div>
                                    <Segmented
                                        size="small"
                                        value={platform}
                                        options={[
                                            { label: "macOS / Linux", value: "unix" },
                                            { label: "Windows", value: "windows" },
                                        ]}
                                        onChange={(value) => setPlatform(value as LocalAgentSetupPlatform)}
                                    />
                                </div>
                                <CommandBlock value={commands.install} theme={theme} t={t} onCopy={() => copyCommand(commands.install, t("agentLocalUiInstallCommand" as InterfaceMessageKey))} />
                            </div>
                        </div>
                    </section>

                    <section className="border-b py-4" style={{ borderColor: theme.node.stroke }}>
                        <div className="flex items-start gap-3">
                            <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold" style={{ background: theme.node.fill, color: theme.node.text }}>2</span>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium leading-5">{t("agentLocalUiStartAndAuthorizeSite" as InterfaceMessageKey)}</div>
                                <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                    {t("agentLocalUiCommandBoundToSite" as InterfaceMessageKey)} <span className="font-mono">{origin}</span>{t("agentLocalUiKeepTerminalRunning" as InterfaceMessageKey)}
                                </div>
                                <CommandBlock value={commands.start} theme={theme} t={t} onCopy={() => copyCommand(commands.start, t("agentLocalUiStartCommand" as InterfaceMessageKey))} />
                            </div>
                        </div>
                    </section>

                    <section className="pt-4">
                        <div className="flex items-start gap-3">
                            <span className="grid size-6 shrink-0 place-items-center rounded-full" style={{ background: theme.node.fill, color: theme.node.text }}><CheckCircle2 className="size-3.5" /></span>
                            <div className="min-w-0 flex-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                <div className="text-sm font-medium" style={{ color: theme.node.text }}>{t("agentLocalUiCurrentSupport" as InterfaceMessageKey)}</div>
                                <div className="mt-1">{t("agentLocalUiSupportDescription" as InterfaceMessageKey)}</div>
                                <Button type="link" size="small" className="mt-1 !h-7 !px-0" href="https://github.com/ddcat-ai/open-ai-canvas/tree/main/canvas-agent" target="_blank" rel="noreferrer" icon={<ExternalLink className="size-3.5" />}>
                                    {t("agentLocalUiViewFullGuide" as InterfaceMessageKey)}
                                </Button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

function CommandBlock({
    value,
    theme,
    t,
    onCopy,
}: {
    value: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    t: InterfaceT;
    onCopy: () => void | Promise<void>;
}) {
    return (
        <div className="mt-3 overflow-hidden rounded-md" style={{ background: "rgba(0,0,0,.22)" }}>
            <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5" style={{ borderColor: theme.node.stroke }}>
                <span className="inline-flex items-center gap-1.5 text-[var(--fs-label)]" style={{ color: theme.node.muted }}>
                    <Terminal className="size-3.5" />
                    {t("agentLocalUiTerminalCommand" as InterfaceMessageKey)}
                </span>
                <Button type="text" size="small" className="!h-6 !px-1.5" icon={<Copy className="size-3.5" />} onClick={() => void onCopy()} aria-label={t("agentLocalUiCopyTerminalCommand" as InterfaceMessageKey)}>
                    {t("agentLocalUiCopy" as InterfaceMessageKey)}
                </Button>
            </div>
            <pre className="thin-scrollbar overflow-x-auto whitespace-pre p-3 font-mono text-[11px] leading-5" style={{ color: theme.node.text }}>{value}</pre>
        </div>
    );
}

function AgentHistoryView({
    theme,
    threads,
    activeThreadId,
    workspacePath,
    loading,
    connected,
    onRefresh,
    onNewThread,
    onResumeThread,
    onDeleteThread,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    threads: AgentThreadSummary[];
    activeThreadId: string;
    workspacePath: string;
    loading: boolean;
    connected: boolean;
    onRefresh: () => void;
    onNewThread: () => void;
    onResumeThread: (threadId: string) => void;
    onDeleteThread: (thread: AgentThreadSummary) => void;
}) {
    const { t } = useInterfaceTranslation();
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-3">
                <div className="flex min-w-0 items-center gap-2 text-xs" style={{ color: theme.node.muted }}>
                    <FolderOpen className="size-3.5 shrink-0" />
                    <span className="shrink-0">{t("agentLocalUiWorkspace" as InterfaceMessageKey)}</span>
                    <span className="min-w-0 truncate" title={workspacePath}>
                        {workspacePath || t("agentLocalUiDefaultCanvasDirectory" as InterfaceMessageKey)}
                    </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm" style={{ color: theme.node.muted }}>
                        {threads.length ? t("agentLocalUiHistoryCount" as InterfaceMessageKey, { count: threads.length }) : connected ? t("agentLocalUiNoHistory" as InterfaceMessageKey) : t("agentLocalUiNotConnected" as InterfaceMessageKey)}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="small" icon={<RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />} disabled={!connected || loading} onClick={onRefresh}>
                            {t("agentLocalUiRefresh" as InterfaceMessageKey)}
                        </Button>
                        <Button size="small" type="primary" icon={<Plus className="size-3.5" />} disabled={!connected || loading} onClick={onNewThread}>
                            {t("agentLocalUiNewConversation" as InterfaceMessageKey)}
                        </Button>
                    </div>
                </div>
                <div className="space-y-2">
                    {threads.map((thread) => {
                        const active = thread.id === activeThreadId;
                        return (
                            <div key={thread.id} className="rounded-md px-2.5 py-2 transition-colors" style={{ background: active ? theme.accent.primarySoft : "transparent", color: theme.node.text }}>
                                <div className="flex items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {active ? (
                                                <span className="shrink-0 text-[var(--fs-tiny)] font-medium" style={{ color: theme.node.text }}>
                                                    {t("agentLocalUiCurrent" as InterfaceMessageKey)}
                                                </span>
                                            ) : null}
                                            <div className="truncate text-sm font-medium leading-5">{thread.name || thread.preview || t("agentLocalUiUnnamedConversation" as InterfaceMessageKey)}</div>
                                        </div>
                                        <div className="truncate text-[var(--fs-label)] leading-4 opacity-65">{thread.preview || thread.id}</div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <span className="text-[var(--fs-tiny)] opacity-55">{formatThreadTime(thread.updatedAt || thread.createdAt)}</span>
                                        <Button size="small" className="!h-6 !px-2" disabled={loading} onClick={() => onResumeThread(thread.id)}>
                                            {t("agentLocalUiOpenConversation" as InterfaceMessageKey)}
                                        </Button>
                                        <Tooltip title={t("agentLocalUiDeleteRecord" as InterfaceMessageKey)}>
                                            <Button size="small" danger type="text" className="!h-6 !w-6 !min-w-6" disabled={loading} icon={<Trash2 className="size-3.5" />} onClick={() => onDeleteThread(thread)} />
                                        </Tooltip>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {!threads.length ? (
                        <div className="px-3 py-8 text-center text-sm" style={{ color: theme.node.muted }}>
                            {connected ? t("agentLocalUiWorkspaceHasNoConversations" as InterfaceMessageKey) : t("agentLocalUiConnectToSeeHistory" as InterfaceMessageKey)}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

async function postToolResult(clientId: string, body: { requestId: string; result?: unknown; error?: string }) {
    const response = await getLocalRuntimeSessionClient().request(`/canvas/result?clientId=${encodeURIComponent(clientId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("Canvas Agent 工具结果写回失败");
}

function agentMessageToChatMessage(item: AgentChatItem) {
    return { ...item, attachments: item.attachments?.map(agentAttachmentToChatAttachment) };
}

function agentAttachmentToChatAttachment(item: AgentAttachment): CanvasAgentChatAttachment {
    return { id: item.id, name: item.name, url: item.dataUrl || item.url };
}

function formatAgentEvent(event: AgentEventPayload, t: InterfaceT): Omit<AgentChatItem, "id"> | null {
    const item = event.item;
    if (event.type === "turn.failed" || event.type === "error") return { role: "error", title: t("agentLocalUiModelCallFailedTitle" as InterfaceMessageKey), text: normalizeText(event.error?.message || event.message) || t("agentLocalUiModelCallFailedRetry" as InterfaceMessageKey), detail: event };
    if (event.type === "item.completed" && item?.type === "error") return { role: "error", title: t("agentLocalUiErrorTitle" as InterfaceMessageKey), text: normalizeText(item.message), detail: item };
    if ((event.type === "item.updated" || event.type === "item.completed") && item?.type === "agent_message") return { role: "assistant", title: "Codex", text: stringText(item.text), meta: usageText(event), streamId: item.id };
    if (event.type === "item.completed" && isMcpToolItem(item) && isReadTool(String(item?.tool || ""))) return { role: "tool", title: t("agentLocalUiToolCompletedNamed" as InterfaceMessageKey, { name: toolName(String(item?.tool || ""), t) }), text: item?.error?.message || toolSummary(item, t), detail: toolDetail(item) };
    const text = eventText(event);
    if (text) return { role: "assistant", title: "Codex", text, meta: usageText(event) };
    return null;
}

function parseEventJson<T>(data: string) {
    try {
        return JSON.parse(data) as T;
    } catch {
        return null;
    }
}

function formatLogText(logs: AgentEventLog[], context: AgentLogContext, t: InterfaceT) {
    const head = [
        t("agentLocalUiDiagnosticsLog" as InterfaceMessageKey),
        `${t("agentLocalUiConnectionLabel" as InterfaceMessageKey)}: ${context.connected ? t("agentLocalUiOnline" as InterfaceMessageKey) : context.enabled ? t("agentLocalUiConnecting" as InterfaceMessageKey) : t("agentLocalUiNotEnabled" as InterfaceMessageKey)}`,
        `${t("agentLocalUiStatusLabel" as InterfaceMessageKey)}: ${agentActivityLabel(context.activity, t)}`,
        `waiting: ${context.waiting}`,
        `sending: ${context.sending}`,
        `messages: ${context.messages}`,
        `pendingTool: ${context.pendingTool ? toolName(context.pendingTool, t) : "none"}`,
        `logs: ${logs.length}`,
    ].join("\n");
    const body = logs
        .map((item, index) => {
            const detail = item.raw == null ? item.text : JSON.stringify(item.raw, null, 2);
            return [`#${index + 1} ${item.time} ${item.title}`, detail].filter(Boolean).join("\n");
        })
        .join("\n\n---\n\n");
    return [head, body || t("agentLocalUiNoEventLogs" as InterfaceMessageKey)].join("\n\n");
}

function formatLogJson(logs: AgentEventLog[], context: AgentLogContext) {
    return JSON.stringify({ context, logs: logs.map(({ time, title, text, raw }) => ({ time, title, text, raw })) }, null, 2);
}

function eventText(event: AgentEventPayload) {
    return event.type === "item.completed" && event.item?.type === "agent_message" ? stringText(event.item.text) : "";
}

function usageText(event: AgentEventPayload) {
    const usage = event.usage;
    if (!usage || typeof usage !== "object") return undefined;
    const total = numberField(usage, "total_tokens");
    const input = numberField(usage, "input_tokens");
    const output = numberField(usage, "output_tokens");
    if (total) return `${total} tok`;
    if (input || output) return `${input || 0}/${output || 0} tok`;
    return undefined;
}

function activityText(event: AgentEventPayload) {
    const name = event.type || "";
    if (name === "thread.started") return "已创建会话";
    if (name === "turn.started") return "思考中";
    if (name === "turn.completed") return "完成";
    if (name === "turn.failed" || name === "error") return "出错";
    if (name === "item.started") return isMcpToolItem(event.item) ? `调用${String(event.item?.tool || "")}` : "执行步骤";
    if (name === "item.completed") return isMcpToolItem(event.item) ? "工具完成" : "更新消息";
    return "";
}

function eventTitle(event: AgentEventPayload, t: InterfaceT) {
    const item = event.item;
    if (event.type === "thread.started") return t("agentLocalUiEventCodexSessionCreated" as InterfaceMessageKey);
    if (event.type === "turn.started") return t("agentLocalUiEventStarted" as InterfaceMessageKey);
    if (event.type === "turn.completed") return t("agentLocalUiEventTurnCompleted" as InterfaceMessageKey);
    if (event.type === "stream.summary") return t("agentLocalUiEventStreamSummary" as InterfaceMessageKey);
    if (event.type === "turn.failed" || event.type === "error") return t("agentLocalUiEventTurnFailed" as InterfaceMessageKey);
    if (event.type === "item.started" && isMcpToolItem(item)) return t("agentLocalUiToolCallNamed" as InterfaceMessageKey, { name: toolName(String(item?.tool || ""), t) });
    if (event.type === "item.completed" && isMcpToolItem(item)) return t("agentLocalUiToolCompletedNamed" as InterfaceMessageKey, { name: toolName(String(item?.tool || ""), t) });
    if (event.type === "item.completed" && item?.type === "agent_message") return t("agentLocalUiCodexReply" as InterfaceMessageKey);
    return event.type || t("agentLocalUiCodexEvent" as InterfaceMessageKey);
}

function shouldLogAgentEvent(event: AgentEventPayload) {
    const itemType = event.item?.type || "";
    return !["item.updated"].includes(event.type || "") && !["reasoning"].includes(itemType) && !(event.type === "item.started" && itemType === "agent_message");
}

function isConnectionErrorMessage(item: AgentChatItem, t: InterfaceT) {
    const connectionMessages = [
        t("agentLocalUiConnectionDroppedRetrying" as InterfaceMessageKey),
        t("agentLocalUiConnectionFailedCheckRuntime" as InterfaceMessageKey),
    ];
    return item.role === "error" && (connectionMessages.includes(item.text) || /连接失败|无法连接本地 Agent|本地 Agent 连接失败|connection failed|unable to connect/i.test(item.text));
}

function localAgentConnectionLabel(status: string, t: InterfaceT) {
    if (status === "连接中") return t("agentLocalUiConnecting" as InterfaceMessageKey);
    if (status === "正在重连") return t("agentLocalUiReconnecting" as InterfaceMessageKey);
    if (status === "连接失败") return t("agentLocalUiConnectionFailed" as InterfaceMessageKey);
    if (status === "未连接") return t("agentLocalUiNotConnected" as InterfaceMessageKey);
    return status;
}

function agentActivityLabel(activity: string, t: InterfaceT) {
    if (activity.startsWith("调用")) return t("agentLocalUiToolCallNamed" as InterfaceMessageKey, { name: toolName(activity.slice(2), t) });
    const labels: Record<string, InterfaceMessageKey> = {
        "就绪": "agentLocalUiActivityReady" as InterfaceMessageKey,
        "连接中": "agentLocalUiConnecting" as InterfaceMessageKey,
        "已连接": "agentLocalUiLocalAgentConnected" as InterfaceMessageKey,
        "出错": "agentLocalUiErrorTitle" as InterfaceMessageKey,
        "完成": "agentRuntimeUiToolStatusCompleted" as InterfaceMessageKey,
        "正在重连": "agentLocalUiReconnecting" as InterfaceMessageKey,
        "连接失败": "agentLocalUiConnectionFailed" as InterfaceMessageKey,
        "发送中": "agentLocalUiActivitySending" as InterfaceMessageKey,
        "重试中": "agentRuntimeUiRetrying" as InterfaceMessageKey,
        "发送失败": "agentLocalUiSendFailed" as InterfaceMessageKey,
        "等待确认": "agentLocalUiWaitingForConfirmation" as InterfaceMessageKey,
        "执行画布操作": "agentLocalUiActivityApplyingCanvasOperations" as InterfaceMessageKey,
        "执行项目工具": "agentLocalUiActivityRunningProjectTool" as InterfaceMessageKey,
        "读取画布": "agentLocalUiActivityReadingCanvas" as InterfaceMessageKey,
        "工具完成": "agentRuntimeUiToolStatusCompleted" as InterfaceMessageKey,
        "工具失败": "agentLocalUiToolFailureTitle" as InterfaceMessageKey,
        "已取消": "agentRuntimeUiToolStatusRejected" as InterfaceMessageKey,
        "已撤销": "agentLocalUiActivityUndone" as InterfaceMessageKey,
        "离线": "agentLocalUiOffline" as InterfaceMessageKey,
        "新对话": "agentLocalUiNewConversation" as InterfaceMessageKey,
        "已恢复会话": "agentLocalUiConversationRestored" as InterfaceMessageKey,
        "已创建会话": "agentLocalUiEventSessionCreated" as InterfaceMessageKey,
        "思考中": "agentLocalUiEventThinking" as InterfaceMessageKey,
        "执行步骤": "agentLocalUiEventRunningStep" as InterfaceMessageKey,
        "更新消息": "agentLocalUiEventMessageUpdated" as InterfaceMessageKey,
    };
    const key = labels[activity];
    return key ? t(key) : activity;
}

function isReadTool(name: string) {
    return isCanvasReadTool(name) || isProjectAgentReadTool(name);
}

function isMcpToolItem(item?: AgentEventItem) {
    return item?.type === "mcp_tool_call";
}

function toolDetail(item?: AgentEventItem) {
    return { server: item?.server, tool: item?.tool, status: item?.status, arguments: item?.arguments, result: parseToolResult(item?.result), error: item?.error };
}

function toolSummary(item: AgentEventItem | undefined, t: InterfaceT) {
    const result = parseToolResult(item?.result);
    const nodeField = objectField(result, "nodes");
    const connectionField = objectField(result, "connections");
    const nodes = Array.isArray(nodeField) ? nodeField : [];
    const connections = Array.isArray(connectionField) ? connectionField : [];
    if (Array.isArray(nodeField) || Array.isArray(connectionField)) return t("toolLabelUi.readSummary", { nodes: nodes.length, connections: connections.length });
    return t("agentRuntimeUiToolStatusCompleted");
}

function parseToolResult(result: unknown) {
    const content = objectField(result, "content");
    const text = Array.isArray(content)
        ? content
              .map((item) => objectField(item, "text"))
              .filter((item): item is string => typeof item === "string")
              .join("\n")
        : "";
    try {
        return text ? JSON.parse(text) : result;
    } catch {
        return text || result;
    }
}

function normalizeText(value: unknown) {
    if (typeof value === "string") return value.trim();
    if (value instanceof Error) return value.message;
    if (value == null) return "";
    return JSON.stringify(value, null, 2);
}

function stringText(value: unknown) {
    return typeof value === "string" ? value : "";
}

function requireString(value: unknown, field: string) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必须是非空字符串`);
    return value;
}

function objectField(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function numberField(value: unknown, key: string) {
    const field = objectField(value, key);
    return typeof field === "number" ? field : 0;
}

function mergeAgentText(prev: string, next: string) {
    if (!next || prev === next || prev.endsWith(next)) return prev;
    if (next.startsWith(prev)) return next;
    for (let size = Math.min(prev.length, next.length); size > 0; size--) {
        if (prev.endsWith(next.slice(0, size))) return `${prev}${next.slice(size)}`;
    }
    const half = Math.floor(prev.length / 2);
    if (prev.length > 12 && next.length > 12 && prev.slice(half) === next.slice(0, prev.length - half)) return prev;
    return `${prev}${next}`;
}

function promptWithAttachments(text: string, attachments: AgentAttachment[]) {
    if (!attachments.length) return text;
    const names = attachments.map((item) => item.name).join("、");
    return [text, `用户上传了 ${attachments.length} 张图片附件：${names}。`].filter(Boolean).join("\n\n");
}

function attachmentPayloadBytes(attachments: AgentAttachment[]) {
    return attachments.reduce((total, item) => total + item.dataUrl.length, 0);
}

function skillBundlePayloadBytes(skills: AgentTurnPayload["skills"]) {
    return skills.reduce((total, skill) => total + skill.files.reduce((fileTotal, file) => fileTotal + file.contentBase64.length, 0), 0);
}

function formatBytes(bytes: number) {
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`;
}

async function fetchAgentJson<T>(path: string, init?: RequestInit) {
    const res = await getLocalRuntimeSessionClient().request(path, init);
    const data = (await res.json().catch(() => ({}))) as T;
    if (!res.ok) throw new Error("本地 Agent 请求失败");
    return data;
}

function normalizeHistoryMessages(messages: AgentChatItem[]) {
    return messages
        .map((item, index) => ({
            ...item,
            id: item.id || `history-${index}`,
            text: normalizeText(item.text),
        }))
        .filter((item) => item.text);
}

function formatThreadTime(value?: number) {
    if (!value) return "";
    return new Date(value * 1000).toLocaleString();
}

function createId() {
    return createClientId();
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function readDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
        reader.readAsDataURL(file);
    });
}
