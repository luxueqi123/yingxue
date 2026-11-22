import { canvasPromptAssetMentionIds } from "@/lib/canvas/canvas-resource-references";
import { CanvasSyncPendingError, createSyncSingleFlight, waitForCanvasSync } from "@/lib/canvas/sync-recovery";
import { canvasOperationValue, canvasOperationValueEqual, diffCanvasObject } from "@/lib/canvas/canvas-operations";
import type { CanvasOperation } from "@/services/api/user-data";
import { canonicalize } from "json-canonicalize";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import {
    applyRemoteCanvasOperations,
    deleteRemoteAssets,
    deleteRemoteCanvasProject,
    getRemoteAsset,
    getRemoteAssetsByIds,
    getRemoteCanvasProject,
    getRemoteUserDataSnapshot,
    listRemoteAssetsPage,
    restoreRemoteCanvasHistory,
    upsertRemoteAsset,
    upsertRemoteCanvasProject,
} from "@/services/api/user-data";
import type { CanvasOperationsRequest } from "@/services/api/user-data";
const SERVER_OPTIONAL_OPERATION_FIELDS = new Set<string>(["projectId", "starterMode", "appearance", "timeline", "agentDraft"]);
import { buildCanvasOperations } from "@/lib/canvas/canvas-operations";
import { fenceRejectedTaskTimestampMutation, repairLegacyTaskIdFence } from "@/lib/canvas/canvas-task-mutation";
import { submitCanvasMutationBatches } from "./canvas-mutation-batches";
import { canvasEditLeases } from "./canvas-edit-leases";
import { CanvasMutationJournalBusyError, readCanvasMutationJournal, persistCanvasMutation, removeCanvasMutation, type PendingCanvasMutation } from "./canvas-mutation-journal";

export { buildCanvasOperations } from "@/lib/canvas/canvas-operations";
import { ApiError } from "@/services/api/request";
import { canvasContentHash, sameCanvasContent } from "@/lib/canvas/canvas-content";
import { rebaseCanvasLocalEdits } from "@/lib/canvas/canvas-sync-rebase";
import { initialCanvasViewport } from "@/lib/canvas/canvas-viewport";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { preserveCanvasSyncDraft, readCanvasSyncDrafts } from "@/services/canvas-sync-drafts";
import { appQueryClient } from "@/lib/query-client";
import { parseAssetRecordList } from "@/lib/asset-record";
import { assetForRemoteSync } from "@/lib/asset-remote-sync";
import type { Asset } from "@/stores/use-asset-store";
import { flushAssetStorePersistence, getGenerationAssetDefaults, useAssetStore } from "@/stores/use-asset-store";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { acceptRemoteCanvasProject, flushCanvasStorePersistence, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useSyncProgressStore } from "@/stores/use-sync-progress-store";
import { useCanvasHistoryStore } from "@/stores/canvas/use-canvas-history-store";
import { repairMissingCanvasAssets, repairMissingCanvasVideoPreviews, collectCanvasMediaAssetIds, rebindInconsistentCanvasAssets, type CanvasAssetRebindResult } from "@/services/canvas-asset-repair";
import { canvasNodeToAsset } from "@/lib/canvas/canvas-node-asset";
import { applyAgentCanvasPatch, mergeAgentCanvasEditor, mergeThreeWayValue, type AgentCanvasPatch } from "@/lib/canvas/agent-canvas-patch";
import { collectLocalMediaKeys, ensureRemoteResourceReferences, restoreRemoteTextNodeContents } from "./user-data-sync-media";

export { numberValue } from "./user-data-sync-media";

const syncSingleFlight = createSyncSingleFlight();
const remoteUserDataReadyListeners = new Set<() => void | Promise<void>>();
let activeRemoteUserId = "";
type RemoteUserDataPhase = "inactive" | "hydrating" | "ready" | "failed";

let remoteUserDataPhase: RemoteUserDataPhase = "inactive";
let syncTimer: number | null = null;
let syncPromise: Promise<void> | null = null;
let syncQueued = false;
let autoSyncQueued = false;
let syncRetryAttempt = 0;
let remoteOperationTail: Promise<void> = Promise.resolve();
let subscriptionsInstalled = false;
let acknowledgedAssets = new Map<string, Asset>();
let acknowledgedProjects = new Map<string, CanvasProject>();
const pendingCanvasMutations = new Map<string, PendingCanvasMutation>();
// A duplicate/opened tab can inherit sessionStorage. Reuse its identity only on
// reload, when the original in-flight editor snapshots still belong to this tab.
let mutationClientId = "";
if (typeof window !== "undefined") {
    const reload = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload";
    mutationClientId = newCanvasMutationId();
    try {
        mutationClientId = (reload && window.sessionStorage.getItem("yingce:mutation-client")) || mutationClientId;
        window.sessionStorage.setItem("yingce:mutation-client", mutationClientId);
    } catch {
        // The durable IndexedDB journal still gates writes when session storage is blocked.
    }
}
let incrementalSession = false;
let sessionEpoch = 0;
const verifiedProjects = new Set<string>();
const verifiedAssets = new Set<string>();
const remoteProjectLoadPromises = new Map<string, Promise<CanvasProject | undefined>>();
const REMOTE_SYNC_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;

async function loadPendingCanvasMutations() {
    const epoch = sessionEpoch;
    const scope = getActiveUserScope();
    const entries = await readCanvasMutationJournal(scope);
    if (epoch !== sessionEpoch || scope !== getActiveUserScope()) throw new Error("账号已切换，已停止读取待同步操作");
    pendingCanvasMutations.clear();
    for (const entry of entries) {
        const repaired = prepareJournalRequestForReplay(entry.request, entry.baseline, entry.prepared);
        if (repaired !== entry.request) {
            entry.request = repaired;
            await persistCanvasMutation(entry);
            if (epoch !== sessionEpoch || scope !== getActiveUserScope()) throw new Error("账号已切换，已停止读取待同步操作");
        }
        pendingCanvasMutations.set(entry.journalId, entry);
    }
}

function newCanvasMutationId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function submitPendingCanvasMutation(entry: PendingCanvasMutation, assertSession: () => void) {
    const ids = new Set([...entry.request.operations, ...(entry.remainingOperations || [])].flatMap((operation) => (operation.type === "create_node" ? [operation.node.id] : "id" in operation ? [operation.id] : [])));
    return submitCanvasMutationBatches(entry, {
        persist: () => persistCanvasMutation(entry),
        assertSession,
        newId: newCanvasMutationId,
        send: async (request) => {
            let sending = request;
            let repaired = false;
            let leaseRefreshed = false;
            const delays = [250, 600, 1200];
            for (let attempt = 0; ; attempt++) {
                assertSession();
                try {
                    const response = await applyRemoteCanvasOperations(entry.projectId, sending);
                    if (response.mutationId !== sending.mutationId) throw new Error("服务端未返回匹配的画布操作回执");
                    return response;
                } catch (error) {
                    assertSession();
                    // Replay the durable receipt before reacquiring a lease: ownership
                    // may have moved after this exact request committed successfully.
                    if (!leaseRefreshed && error instanceof ApiError && error.status === 409 && error.reason === "canvas_edit_lease_conflict") {
                        canvasEditLeases.invalidate(entry.projectId, ids);
                        const proofs = await canvasEditLeases.proofs(entry.projectId, ids, sending.editProofs);
                        assertSession();
                        sending = { ...sending, editProofs: proofs };
                        entry.request = sending;
                        await persistCanvasMutation(entry);
                        leaseRefreshed = true;
                        continue;
                    }
                    if (error instanceof ApiError && error.reason === "canvas_concurrent_write" && attempt < delays.length) {
                        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
                        continue;
                    }
                    // Only a definite rolled-back field conflict permits a new body/ID.
                    if (!repaired && error instanceof ApiError && error.status === 409 && error.reason === "canvas_field_conflict") {
                        const candidate = repairPendingCanvasMutationRequest(sending, entry.baseline, entry.prepared);
                        const repairedBody = candidate !== sending ? candidate : undefined;
                        const legacy = repairLegacyTaskIdFence(repairedBody ?? sending, entry.baseline, entry.prepared) ?? repairedBody;
                        const fenced = fenceRejectedTaskTimestampMutation(legacy ?? sending, entry.baseline, entry.prepared) ?? legacy;
                        if (fenced) {
                            sending = { ...fenced, mutationId: newCanvasMutationId() };
                            entry.request = sending;
                            await persistCanvasMutation(entry);
                            repaired = true;
                            continue;
                        }
                    }
                    throw error;
                }
            }
        },
    });
}

export async function initializeRemoteUserDataSession(userId: string) {
    await withRemoteUserDataSyncExclusive(async () => {
        resetRemoteUserDataSync();
        activeRemoteUserId = userId;
        await loadPendingCanvasMutations();
        incrementalSession = true;
        acknowledgedProjects = new Map(useCanvasStore.getState().projects.map((project) => [project.id, project]));
        for (const pending of pendingCanvasMutations.values()) {
            if (pending.baseline) acknowledgedProjects.set(pending.projectId, pending.baseline);
            if (!useCanvasStore.getState().openProject(pending.projectId)) useCanvasStore.setState((state) => ({ projects: [...state.projects, pending.localPrepared] }));
        }
        acknowledgedAssets = new Map(useAssetStore.getState().assets.map((asset) => [asset.id, asset]));
        remoteUserDataPhase = "ready";
        notifyRemoteUserDataReady();
        if (pendingCanvasMutations.size) scheduleRemoteUserDataSync();
    });
}

function liveCanvasIfUnchanged(id: string, snapshot: CanvasProject | null | undefined) {
    const live = useCanvasStore.getState().openProject(id);
    if (live === snapshot) return live;
    if (!snapshot) return live ? undefined : null;
    return live && sameCanvasContent(live, snapshot) ? live : undefined;
}

export async function loadCanvasProjectForEditing(id: string, options: { latest?: boolean; historyRestore?: { snapshotId: string; revision: number }; onLoad?: (project: CanvasProject) => void } = {}) {
    const forceRemoteRefresh = Boolean(options.latest || options.historyRestore);
    if (!forceRemoteRefresh) {
        const draft = useCanvasStore.getState().getDraftProject(id);
        if (draft) {
            options.onLoad?.(draft);
            return draft;
        }
    }
    const epoch = sessionEpoch;
    if (!forceRemoteRefresh) {
        const pending = remoteProjectLoadPromises.get(id);
        if (pending) {
            return pending.then(() => {
                if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新打开画布");
                // The editor can change while the shared load flushes its cache.
                // A late subscriber must receive those edits, not the old response.
                const project = useCanvasStore.getState().openProject(id);
                if (project) options.onLoad?.(project);
                return project;
            });
        }
    }
    const request = withRemoteUserDataSyncExclusive(async () => {
        if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新打开画布");
        requireRemoteUserDataBaseline();
        const journal = [...pendingCanvasMutations.values()].find((entry) => entry.projectId === id);
        if (journal && (options.latest || options.historyRestore)) {
            const entries = [...pendingCanvasMutations.values()].filter((entry) => entry.projectId === id);
            if (entries.some((entry) => !entry.rejectedReason)) throw new Error("画布仍有结果未确认的保存请求，请等待原请求重放后再加载或恢复版本");
            await preserveCanvasSyncDraft(useCanvasStore.getState().openProject(id) || journal.localPrepared, getActiveUserScope());
            for (const entry of entries) {
                await removeCanvasMutation(entry);
                pendingCanvasMutations.delete(entry.journalId);
            }
        }
        if (journal && !options.historyRestore && !options.latest) {
            const local = useCanvasStore.getState().openProject(id) || journal.localPrepared;
            options.onLoad?.(local);
            scheduleRemoteUserDataSync();
            return local;
        }
        const scope = getActiveUserScope();
        if (!forceRemoteRefresh && verifiedProjects.has(id)) {
            const local = useCanvasStore.getState().openProject(id);
            if (local) {
                options.onLoad?.(local);
                return local;
            }
        }
        const requireUnchangedLocal = (snapshot: CanvasProject | null | undefined, message: string) => {
            if (epoch !== sessionEpoch || getActiveUserScope() !== scope) throw new Error("账号已切换，请重新打开画布");
            const live = liveCanvasIfUnchanged(id, snapshot);
            if (live === undefined) throw new Error(message);
            return live;
        };
        if (options.historyRestore) {
            const local = useCanvasStore.getState().openProject(id);
            if (local) {
                const draftCount = await preserveCanvasSyncDraft(local, scope);
                useSyncProgressStore.getState().setProjectProgress(id, { draftCount });
            }
            requireUnchangedLocal(local, "本地内容仍在更新，请稍后再恢复历史版本");
            const { snapshotId, revision } = options.historyRestore;
            try {
                const saved = await restoreRemoteCanvasHistory(id, snapshotId, revision);
                if (epoch !== sessionEpoch || getActiveUserScope() !== scope) throw new Error("账号已切换，请重新打开画布查看恢复结果");
                if (saved.project.revision !== revision + 1) throw new Error("恢复结果的版本无效，请重新核对云端内容");
            } catch (error) {
                if (epoch === sessionEpoch && getActiveUserScope() === scope && error instanceof ApiError && (error.status === 409 || error.status === 428)) {
                    useSyncProgressStore.getState().setProjectProgress(id, { phase: "conflict", message: error.message });
                }
                throw error;
            }
        }
        let remote: CanvasProject;
        try {
            const knownRemote = verifiedProjects.has(id) ? acknowledgedProjects.get(id) : undefined;
            remote = (await getRemoteCanvasProject(id, knownRemote)).project;
        } catch (error) {
            if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新打开画布");
            const local = useCanvasStore.getState().openProject(id);
            if (error instanceof ApiError && error.status === 404 && local?.revision === 0) {
                options.onLoad?.(local);
                return local;
            }
            throw error;
        }
        if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新打开画布");
        await loadReferencedAssets(collectAssetIds(remote));
        const hash = await canvasContentHash(remote);
        const restored = await restoreRemoteTextNodeContents(remote);
        if (epoch !== sessionEpoch || getActiveUserScope() !== scope) throw new Error("账号已切换，请重新打开画布");
        const local = useCanvasStore.getState().openProject(id);
        const cachedClean = local?.remoteContentHash && local.remoteContentHash === (await canvasContentHash(local));
        const dirty = local && (!verifiedProjects.has(id) && incrementalSession ? !cachedClean : !sameCanvasContent(acknowledgedProjects.get(id), local));
        if (dirty && !sameCanvasContent(local, remote)) {
            if (!options.latest && !options.historyRestore && local.revision !== undefined) {
                if (incrementalSession && !verifiedProjects.has(id) && !cachedClean) {
                    const draftCount = await preserveCanvasSyncDraft(local, scope);
                    useSyncProgressStore.getState().setProjectProgress(id, { draftCount });
                }
                const current = requireUnchangedLocal(local, "画布仍在更新，请稍后重新打开");
                // Session initialization reads the cache, including unsaved edits.
                // Only a matching cloud ancestor can authorize cache deletions.
                const baseline = incrementalSession && !verifiedProjects.has(id) ? (local.revision === remote.revision && local.remoteContentHash === hash ? remote : undefined) : acknowledgedProjects.get(id);
                const merged = { ...rebaseCanvasLocalEdits(baseline, restored, current || local), remoteContentHash: hash };
                options.onLoad?.(merged);
                acknowledgedProjects.set(id, { ...remote, remoteContentHash: hash });
                verifiedProjects.add(id);
                acceptRemoteCanvasProject(merged);
                await flushCanvasStorePersistence();
                if (epoch !== sessionEpoch || getActiveUserScope() !== scope) throw new Error("账号已切换，请重新打开画布");
                const pending = !sameCanvasContent(remote, merged);
                useSyncProgressStore
                    .getState()
                    .setProjectProgress(id, { phase: pending ? "pending" : "done", pendingChanges: pending ? 1 : 0, cloudRevision: remote.revision, errorKind: undefined, message: pending ? "本地修改等待保存到云端" : "已加载云端最新版本" });
                if (pending) scheduleRemoteUserDataSync();
                return merged;
            }
            const draftCount = await preserveCanvasSyncDraft(local, scope);
            requireUnchangedLocal(local, "画布仍在更新，已保留本地内容，请稍后再加载最新版本");
            useSyncProgressStore.getState().setProjectProgress(id, { draftCount });
        }
        // Editing/generation may continue during the network request or draft write.
        // Viewport-only updates are not document edits and must not block adopting cloud content.
        const live = requireUnchangedLocal(local, "画布仍在更新，已保留本地内容，请稍后再加载最新版本");
        // The backend stores a neutral viewport, not this device's camera position.
        const viewport = initialCanvasViewport(remote.nodes || [], { width: window.innerWidth, height: window.innerHeight }, live?.viewport || local?.viewport);
        const project = { ...restored, viewport, remoteContentHash: hash };
        // Align live editor refs synchronously before publishing the new revision.
        // A generation callback must never see old rendered nodes paired with a new revision.
        options.onLoad?.(project);
        // Recovered text is a local repair until the operations API acknowledges it.
        acknowledgedProjects.set(id, { ...remote, viewport, remoteContentHash: hash });
        verifiedProjects.add(id);
        acceptRemoteCanvasProject(project);
        await flushCanvasStorePersistence();
        const pending = !sameCanvasContent(remote, restored);
        useSyncProgressStore.getState().setProjectProgress(id, { phase: pending ? "pending" : "done", message: pending ? "正文已恢复，等待保存到云端" : "已加载云端最新版本" });
        if (pending) scheduleRemoteUserDataSync();
        return project;
    });
    remoteProjectLoadPromises.set(id, request);
    const clearPending = () => {
        if (remoteProjectLoadPromises.get(id) === request) remoteProjectLoadPromises.delete(id);
    };
    void request.then(clearPending, clearPending);
    return request;
}

// Never replace edits made while the Agent was running. Leave the acknowledged
// baseline untouched on conflict, so automatic sync cannot silently overwrite it.
const agentCanvasListeners = new Set<(project: CanvasProject, previous: CanvasProject | undefined, source?: "agent" | "sync") => void>();

export function subscribeAgentCanvasRefresh(listener: (project: CanvasProject, previous: CanvasProject | undefined, source?: "agent" | "sync") => void) {
    agentCanvasListeners.add(listener);
    return () => {
        agentCanvasListeners.delete(listener);
    };
}

export async function refreshCanvasAfterAgent(id: string, source: "agent" | "sync" = "agent") {
    const epoch = sessionEpoch;
    return withRemoteUserDataSyncExclusive(async () => {
        if (!activeRemoteUserId) throw new Error("请先登录再刷新 Agent 画布结果");
        if ([...pendingCanvasMutations.values()].some((entry) => entry.projectId === id)) {
            scheduleRemoteUserDataSync();
            return useCanvasStore.getState().openProject(id) || undefined;
        }
        const knownRemote = verifiedProjects.has(id) ? acknowledgedProjects.get(id) : undefined;
        const { project } = await getRemoteCanvasProject(id, knownRemote);
        if (epoch !== sessionEpoch) throw new Error("账号已切换");
        const current = useCanvasStore.getState().projects.find((candidate) => candidate.id === id);
        const baseline = acknowledgedProjects.get(id);
        const cachedDirty = current && incrementalSession && !verifiedProjects.has(id) && current.remoteContentHash !== (await canvasContentHash(current));
        const baselineClean = baseline && baseline.remoteContentHash === (await canvasContentHash(baseline));
        if (epoch !== sessionEpoch) throw new Error("账号已切换");

        let projected = project;
        if (current && (cachedDirty || !sameCanvasContent(baseline, current)) && !sameCanvasContent(current, project)) {
            // A missing/out-of-order Agent delta is recoverable when local and remote
            // edits touch different fields. Rebase the cloud snapshot onto the live
            // editor before escalating to a user-visible conflict.
            if (!cachedDirty && current.revision === project.revision && baseline?.revision === project.revision && sameCanvasContent(baseline, project)) {
                useSyncProgressStore.getState().setProjectProgress(id, { phase: "pending", message: "本地修改等待保存到云端" });
                scheduleRemoteUserDataSync();
                return current;
            }
            try {
                if (!baseline || (cachedDirty && !baselineClean)) throw new Error("缺少画布合并基线");
                projected = source === "sync" ? rebaseCanvasLocalEdits(baseline, project, current) : mergeAgentCanvasEditor(baseline, project, current.nodes, current.connections, current);
            } catch (error) {
                await preserveAgentConflict(current);
                throw error instanceof Error ? error : new Error("Agent 更新与本地编辑存在不可自动合并的冲突");
            }
        }

        projected = await restoreRemoteTextNodeContents(projected);
        const hash = await canvasContentHash(project);
        projected = { ...projected, viewport: current?.viewport || project.viewport, remoteContentHash: hash };
        if (epoch !== sessionEpoch || useCanvasStore.getState().openProject(id) !== (current || null)) throw new Error("画布仍在更新，请重新同步 Agent 结果");
        try {
            if (!sameCanvasContent(current, projected)) {
                for (const listener of agentCanvasListeners) listener(projected, current, source);
            }
        } catch (error) {
            if (current) await preserveAgentConflict(current);
            throw error;
        }
        acknowledgedProjects.set(id, { ...project, viewport: projected.viewport, remoteContentHash: hash });
        verifiedProjects.add(id);
        useCanvasStore.setState((state) => ({ projects: [...state.projects.filter((candidate) => candidate.id !== id), projected] }));
        await flushCanvasStorePersistence();
        const pending = !sameCanvasContent(project, projected);
        useSyncProgressStore.getState().setProjectProgress(id, { phase: pending ? "pending" : "done", message: pending ? "Agent 结果已合并，本地修改等待保存" : "已同步 Agent 画布结果" });
        if (pending) scheduleRemoteUserDataSync();
        return projected;
    });
}

export async function applyAgentCanvasPatches(id: string, patches: AgentCanvasPatch[]) {
    const epoch = sessionEpoch;
    return withRemoteUserDataSyncExclusive(async () => {
        if (epoch !== sessionEpoch || !activeRemoteUserId) throw new Error("账号已切换或未登录，已停止 Agent 画布同步");
        if ([...pendingCanvasMutations.values()].some((entry) => entry.projectId === id)) throw new Error("画布仍有未确认操作，请等待原请求重放后校准 Agent 结果");
        const baseline = acknowledgedProjects.get(id);
        const current = useCanvasStore.getState().projects.find((project) => project.id === id);
        if (!baseline || !current) throw new Error("缺少画布同步基线，需要重新读取画布");
        let remote = baseline;
        let projected = current;
        // A rejected delta requests a snapshot through createAgentCanvasSync.
        // Only that reconciliation can distinguish stale replay from a conflict.
        if (incrementalSession && !verifiedProjects.has(id) && baseline.remoteContentHash !== (await canvasContentHash(baseline))) throw new Error("本地缓存尚未核对，请加载云端最新版本");
        if (current.revision !== baseline.revision || !Number.isSafeInteger(baseline.revision)) throw new Error("画布同步基线已变化");
        const orderedPatches: AgentCanvasPatch[] = [];
        const seenRevisions = new Set<number>();
        for (const patch of [...patches].sort((left, right) => (left.revision ?? 0) - (right.revision ?? 0))) {
            if (!Number.isSafeInteger(patch.revision) || !Number.isSafeInteger(patch.baseRevision)) throw new Error("Agent 增量缺少版本，请重新读取画布");
            if (seenRevisions.has(patch.revision!)) continue;
            seenRevisions.add(patch.revision!);
            orderedPatches.push(patch);
        }
        for (const patch of orderedPatches) {
            if (patch.revision! <= remote.revision!) continue;
            if (patch.baseRevision !== remote.revision || patch.revision !== patch.baseRevision! + 1) throw new Error("Agent 画布增量版本不连续，请重新读取画布");
            remote = { ...applyAgentCanvasPatch(remote, patch), revision: patch.revision };
            projected = { ...applyAgentCanvasPatch(projected, patch), revision: patch.revision };
        }
        if (projected === current) return current;
        const hash = await canvasContentHash(remote);
        if (epoch !== sessionEpoch || useCanvasStore.getState().openProject(id) !== current) throw new Error("画布仍在更新，请重新同步 Agent 结果");
        remote = { ...remote, remoteContentHash: hash };
        projected = { ...projected, remoteContentHash: hash };
        if (!sameCanvasContent(projected, current)) {
            for (const listener of agentCanvasListeners) listener(projected, current);
        }
        acknowledgedProjects.set(id, remote);
        verifiedProjects.add(id);
        if (projected === current) return current;
        useCanvasStore.setState((state) => ({ projects: state.projects.map((project) => (project.id === id ? projected : project)) }));
        await flushCanvasStorePersistence();
        useSyncProgressStore.getState().setProjectProgress(id, { phase: sameCanvasContent(remote, projected) ? "done" : "pending", message: "已同步 Agent 画布结果" });
        return projected;
    });
}

async function preserveAgentConflict(project: CanvasProject) {
    useSyncProgressStore.getState().setProjectProgress(project.id, { phase: "conflict", message: "云端画布已有更新，请保留草稿并加载最新版本" });
    const draftCount = await preserveCanvasSyncDraft(project);
    useSyncProgressStore.getState().setProjectProgress(project.id, { draftCount });
}

async function waitForRemoteProjectLoads(projectIds?: string | readonly string[]) {
    const selected = projectIds === undefined ? undefined : new Set(typeof projectIds === "string" ? [projectIds] : projectIds);
    const pending = [...remoteProjectLoadPromises].filter(([id]) => !selected || selected.has(id)).map(([, promise]) => promise);
    if (pending.length) await Promise.all(pending);
}

export async function loadAssetLibraryPage(options: Parameters<typeof listRemoteAssetsPage>[0]) {
    const epoch = sessionEpoch;
    const scope = getActiveUserScope();
    const userId = activeRemoteUserId || scope;
    const result = await listRemoteAssetsPage(options);
    // 同一账号的后台同步初始化也会推进 epoch，不能把已成功的只读分页误判为切换账号。
    if (scope !== getActiveUserScope() || (epoch !== sessionEpoch && activeRemoteUserId !== userId)) throw new Error("账号已切换，请重新加载素材库");
    // 分页列表是展示数据，不是同步快照。不要把每一页都合并进全局
    // asset store，否则滚动/翻页会不断重建并持久化整个素材数组。
    // 真正被画布引用的素材仍由 loadAssetsForUse 按 ID 拉取并写入 store。
    return { ...result, assets: parseAssetRecordList(result.assets) };
}

function acceptRemoteAssets(remoteAssets: Asset[]) {
    const assets = parseAssetRecordList(remoteAssets);
    if (!assets.length) return;
    const current = new Map(useAssetStore.getState().assets.map((asset) => [asset.id, asset]));
    const accepted: Array<{ remote: Asset; merged: Asset }> = [];
    for (const asset of assets) {
        const local = current.get(asset.id);
        const baseline = acknowledgedAssets.get(asset.id);
        let merged = asset;
        if (local && !sameEntitySnapshot(baseline, local)) {
            if (!baseline) continue;
            try {
                merged = mergeThreeWayValue(local, baseline, asset) as Asset;
            } catch {
                throw assetRemoteVersionConflict();
            }
        }
        accepted.push({ remote: asset, merged });
    }
    // Keep the baseline and cache atomic if any item conflicts with local edits.
    for (const { remote, merged } of accepted) {
        acknowledgedAssets.set(remote.id, remote);
        verifiedAssets.add(remote.id);
        current.set(remote.id, merged);
    }
    useAssetStore.setState({ assets: [...current.values()] });
}

function collectAssetIds(value: unknown, ids = new Set<string>()): Set<string> {
    if (!value || typeof value !== "object") return ids;
    for (const [key, child] of Object.entries(value)) {
        if (key === "assetId" && typeof child === "string" && child) ids.add(child);
        else if (child && typeof child === "object") collectAssetIds(child, ids);
    }
    return ids;
}

async function loadReferencedAssets(ids: Iterable<string>, refresh = false) {
    const epoch = sessionEpoch;
    const loadedIds = new Set(useAssetStore.getState().assets.map((asset) => asset.id));
    const pending = [...new Set(ids)].filter((id) => refresh || !loadedIds.has(id) || !verifiedAssets.has(id));
    for (let offset = 0; offset < pending.length; offset += 100) {
        const { assets } = await getRemoteAssetsByIds(pending.slice(offset, offset + 100));
        if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新读取素材");
        acceptRemoteAssets(assets);
    }
}

export async function loadAssetsForUse(ids: Iterable<string>, options?: { refresh?: boolean }) {
    const epoch = sessionEpoch;
    const requestedIds = [...new Set(ids)];
    await withRemoteUserDataSyncExclusive(async () => {
        if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新读取素材");
        if (options?.refresh && !activeRemoteUserId) throw new Error("请登录后刷新素材");
        if (activeRemoteUserId) await loadReferencedAssets(requestedIds, options?.refresh);
        const available = new Set(useAssetStore.getState().assets.map((asset) => asset.id));
        if (requestedIds.some((id) => !available.has(id) || (activeRemoteUserId && !verifiedAssets.has(id)))) throw new Error("部分素材不存在或无权访问，请重新选择素材");
    });
}

export async function syncRemoteUserData(userId?: string | null) {
    // 登录/切换账号时，服务端快照建立新的远端基线；本地 IndexedDB 只负责首屏缓存，
    // 不能把服务端已经删除或当前用户无权访问的实体重新补回去。后续增量保存必须基于这份基线做冲突校验。
    await withRemoteUserDataSyncExclusive(async () => {
        incrementalSession = false;
        activeRemoteUserId = userId || "";
        acknowledgedProjects.clear();
        acknowledgedAssets.clear();
        pendingCanvasMutations.clear();
        if (!activeRemoteUserId) {
            remoteUserDataPhase = "inactive";
            return;
        }
        remoteUserDataPhase = "hydrating";
        try {
            await loadPendingCanvasMutations();
            // 登录只拉一次聚合快照。摘要列表再逐条请求详情会把 N 条数据放大成 2N+2 个请求，
            // 并且会在登录阶段同时触发大量媒体解析，任何一项失败都会污染登录结果。
            const snapshot = await getRemoteUserDataSnapshot();
            const localProjects = useCanvasStore.getState().projects;
            const remoteById = new Map(snapshot.projects.map((project) => [project.id, project]));
            // Archive unsynced work before replacing the active cache, including deleted remote canvases.
            for (const local of localProjects) {
                const clean = local.remoteContentHash && local.remoteContentHash === (await canvasContentHash(local));
                if (!clean && !sameCanvasContent(local, remoteById.get(local.id))) await preserveCanvasSyncDraft(local);
            }
            const remoteProjects = await Promise.all(
                snapshot.projects.map(async (project) => {
                    const local = localProjects.find((item) => item.id === project.id);
                    const draftCount = (await readCanvasSyncDrafts(project.id)).length;
                    useSyncProgressStore.getState().setProjectProgress(project.id, { phase: "done", draftCount, message: "已保存到云端" });
                    const viewport = initialCanvasViewport(project.nodes || [], { width: window.innerWidth, height: window.innerHeight }, local?.viewport);
                    return { ...project, viewport, remoteContentHash: await canvasContentHash(project) };
                }),
            );
            const pendingByProject = new Map([...pendingCanvasMutations.values()].map((entry) => [entry.projectId, entry]));
            const projects = remoteProjects.map((project) => {
                const pending = pendingByProject.get(project.id);
                return pending ? localProjects.find((local) => local.id === project.id) || pending.localPrepared : project;
            });
            for (const [id, pending] of pendingByProject) {
                if (!remoteById.has(id)) projects.push(localProjects.find((local) => local.id === id) || pending.localPrepared);
                useSyncProgressStore.getState().setProjectProgress(id, { phase: "pending", message: "正在重放未确认的画布操作" });
            }
            if (useCanvasStore.getState().projects !== localProjects) throw new Error("本地画布仍在更新，已保留本地内容，请重新同步");
            useCanvasStore.getState().replaceProjects(projects);
            useAssetStore.getState().replaceAssets(mergeRemoteAssetsWithLocalPending(parseAssetRecordList(snapshot.assets), useAssetStore.getState().assets));
            const repair = repairMissingCanvasAssets();
            await Promise.all([flushCanvasStorePersistence(), flushAssetStorePersistence()]);
            acknowledgedProjects = new Map(remoteProjects.map((project) => [project.id, project]));
            for (const pending of pendingCanvasMutations.values()) {
                if (pending.baseline) acknowledgedProjects.set(pending.projectId, pending.baseline);
            }
            acknowledgedAssets = new Map(parseAssetRecordList(snapshot.assets).map((asset) => [asset.id, asset]));
            remoteUserDataPhase = "ready";
            notifyRemoteUserDataReady();
            if (pendingCanvasMutations.size) scheduleRemoteUserDataSync();
            if (repair.createdAssets > 0 || repair.updatedProjects > 0) await drainRemoteUserDataChanges();
        } catch (error) {
            remoteUserDataPhase = "failed";
            throw error;
        }
    });
}

export function installRemoteUserDataAutoSync() {
    if (subscriptionsInstalled) return;
    subscriptionsInstalled = true;
    useCanvasStore.subscribe((state, previous) => {
        if (state.projects === previous.projects) return;
        const before = new Map(previous.projects.map((project) => [project.id, project]));
        const changed = state.projects.filter((project) => !sameCanvasContent(before.get(project.id), project));
        if (!changed.length && state.projects.length === previous.projects.length) return;
        if (remoteUserDataPhase === "ready") {
            for (const project of changed) {
                if (sameCanvasContent(acknowledgedProjects.get(project.id), project)) continue;
                if (useSyncProgressStore.getState().syncingProjects[project.id]?.phase === "conflict") continue;
                useSyncProgressStore.getState().setProjectProgress(project.id, { phase: "pending", message: "有修改等待保存" });
            }
        }
        scheduleRemoteUserDataSync();
    });
    useAssetStore.subscribe((state, previous) => {
        if (state.assets !== previous.assets) scheduleRemoteUserDataSync();
    });
}

export function resetRemoteUserDataSync() {
    sessionEpoch += 1;
    // In-flight work keeps its epoch guard; a stalled old account must not
    // hold the next account's queue or replace its active save promise.
    remoteOperationTail = Promise.resolve();
    syncPromise = null;
    incrementalSession = false;
    verifiedProjects.clear();
    verifiedAssets.clear();
    remoteProjectLoadPromises.clear();
    activeRemoteUserId = "";
    remoteUserDataPhase = "inactive";
    acknowledgedAssets.clear();
    acknowledgedProjects.clear();
    pendingCanvasMutations.clear();
    canvasEditLeases.reset();
    if (syncTimer) {
        window.clearTimeout(syncTimer);
        syncTimer = null;
    }
    syncRetryAttempt = 0;
    syncQueued = false;
    autoSyncQueued = false;
    useSyncProgressStore.getState().clearAll();
}

export function hasRemoteUserDataSyncSession() {
    return Boolean(activeRemoteUserId) && remoteUserDataPhase === "ready";
}

/**
 * 串行执行用户数据同步、账号切换和登出相关的远端操作。
 *
 * 前一个操作失败只影响它自己，不能让后续操作永远停在 rejected tail；当前操作的
 * 结果仍原样返回，由调用方决定如何提示或重试，避免同步层把写入失败伪装成成功。
 */
export function withRemoteUserDataSyncExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const pending = remoteOperationTail
        .then(
            () => undefined,
            () => undefined,
        )
        .then(operation);
    remoteOperationTail = pending.then(
        () => undefined,
        () => undefined,
    );
    return pending;
}

export function scheduleRemoteUserDataSync() {
    if (typeof window === "undefined" || !activeRemoteUserId || remoteUserDataPhase !== "ready") return;
    if (syncPromise) {
        autoSyncQueued = true;
        return;
    }
    autoSyncQueued = false;
    if (syncTimer) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
        syncTimer = null;
        void saveRemoteUserDataNow().catch((error) => console.warn("云端自动同步失败", error));
    }, 1200);
}

function isRetryableRemoteSyncError(error: unknown) {
    if (error instanceof CanvasSyncPendingError) return true;
    if (error instanceof CanvasMutationJournalBusyError) return true;
    if (error instanceof ApiError) return ["canvas_concurrent_write", "canvas_edit_lease_conflict"].includes(error.reason || "") || error.retryable;
    if (error instanceof DOMException && error.name === "AbortError") return false;
    if (typeof error === "object" && error !== null && "permanent" in error) {
        return (error as { permanent?: unknown }).permanent !== true;
    }
    // Plain errors from validation/local storage should remain visible instead of
    // being retried indefinitely. Transport failures are normalized as ApiError.
    return false;
}

function updateRetryProgress(delayMs: number) {
    const seconds = Math.max(1, Math.ceil(delayMs / 1_000));
    const progress = useSyncProgressStore.getState();
    for (const item of Object.values(progress.syncingProjects)) {
        if (item.phase !== "error" && !(item.phase === "pending" && item.errorKind === "network")) continue;
        progress.setProjectProgress(item.projectId, {
            message: `${item.message || "云端同步失败"}；${seconds} 秒后自动重试`,
        });
    }
}

function stopRetryProgress() {
    const progress = useSyncProgressStore.getState();
    for (const item of Object.values(progress.syncingProjects)) {
        if ((item.phase !== "error" && item.errorKind !== "network") || !item.message?.includes("自动重试")) continue;
        progress.setProjectProgress(item.projectId, { phase: "error", message: "云端同步失败，请点击立即重试" });
    }
}

function scheduleRemoteUserDataRetry(error: unknown) {
    if (!isRetryableRemoteSyncError(error) || !activeRemoteUserId || remoteUserDataPhase !== "ready") return false;
    if (syncRetryAttempt >= REMOTE_SYNC_RETRY_DELAYS_MS.length) {
        stopRetryProgress();
        return false;
    }
    const delayMs = remoteUserDataRetryDelay(syncRetryAttempt, error instanceof ApiError ? error.retryAfterMs || 0 : 0);
    syncRetryAttempt += 1;
    if (syncTimer) window.clearTimeout(syncTimer);
    updateRetryProgress(delayMs);
    syncTimer = window.setTimeout(() => {
        syncTimer = null;
        void saveRemoteUserDataNow().catch((retryError) => console.warn("云端自动重试失败", retryError));
    }, delayMs);
    return true;
}

/** 用户主动点击重试时重新开始退避窗口，不影响本地已保存的内容。 */
export function retryRemoteUserDataSync(projectId?: string) {
    syncRetryAttempt = 0;
    if (syncTimer) {
        window.clearTimeout(syncTimer);
        syncTimer = null;
    }
    return saveRemoteUserDataNow(projectId);
}

export function formatLocalSavedRemotePending(localAction: string, error: unknown): string {
    const detail = error instanceof Error && error.message.trim() ? error.message.trim() : "未知错误";
    if (error instanceof ApiError && error.status === 401) return `${localAction}，请重新登录后同步。`;
    if (error instanceof ApiError && error.status === 403) return `${localAction}，当前账号没有云端写入权限。`;
    if (error instanceof ApiError && error.reason === "canvas_history_resources_missing") {
        return `${localAction}，云端同步已暂停：${detail}。请修复缺失素材或从有效历史版本恢复。`;
    }
    if (error instanceof ApiError && (error.status === 409 || error.status === 428)) {
        return `${localAction}，云端同步已暂停：${detail}。请保留草稿并加载最新版本。`;
    }
    if (isRetryableRemoteSyncError(error)) return `${localAction}，正在自动同步：${detail}。`;
    return `${localAction}，云端同步已暂停：${detail}。`;
}

/** 本地写已成功、云端同步失败：排队同一幂等重试，并返回可直接展示的 warning。不得回滚本地写，也不得说成已保存到云端。 */
export function localSavedRemotePendingMessage(localAction: string, error: unknown): string {
    scheduleRemoteUserDataSync();
    return formatLocalSavedRemotePending(localAction, error);
}

export async function createCanvasProjectWithRemoteSync(
    title: string,
    projectId?: string,
    initialContent?: Partial<Pick<CanvasProject, "nodes" | "connections" | "viewport" | "chatSessions" | "activeChatId" | "agentDraft" | "starterMode" | "timeline" | "previsScenes">>,
    onLocalCreated?: (id: string) => void,
) {
    const id = useCanvasStore.getState().createProject(title, projectId);
    if (initialContent) useCanvasStore.getState().updateProject(id, initialContent);
    onLocalCreated?.(id);
    if (!activeRemoteUserId) return { id, syncError: new Error("尚未建立云端同步会话") };
    try {
        await saveRemoteUserDataNow(id);
        return { id };
    } catch (syncError) {
        scheduleRemoteUserDataSync();
        return { id, syncError };
    }
}

export async function deleteAssetWithRemoteSync(id: string) {
    return deleteAssetsWithRemoteSync([id]);
}

export async function deleteAssetsWithRemoteSync(ids: string[]) {
    const epoch = sessionEpoch;
    if (!ids.length || ids.length > 1000) throw new Error("每次请选择 1–1000 个素材删除");
    const assetIds = [...new Set(ids.map((id) => id.trim()))];
    if (assetIds.some((id) => !id)) throw new Error("素材 ID 不能为空");
    await withRemoteUserDataSyncExclusive(async () => {
        if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新选择要删除的素材");
        if (activeRemoteUserId) {
            requireRemoteUserDataBaseline();
            await deleteRemoteAssets(assetIds);
            if (epoch !== sessionEpoch) throw new Error("账号已切换，请刷新原账号素材库确认删除结果");
            for (const id of assetIds) acknowledgedAssets.delete(id);
        }
        await useAssetStore.getState().removeAssets(assetIds);
        await flushAssetStorePersistence();
    });
    if (epoch !== sessionEpoch) throw new Error("账号已切换，请刷新原账号素材库确认删除结果");
    // 列表查询也会进入同步队列，必须在退出删除队列后触发，不能在队列内等待刷新。
    // 刷新慢或失败不应阻塞确认弹窗关闭，也不能把已完成的删除报告为失败。
    void Promise.all([appQueryClient.invalidateQueries({ queryKey: ["asset-library"] }, { throwOnError: true }), appQueryClient.invalidateQueries({ queryKey: ["asset-picker"] }, { throwOnError: true })]).catch((error) => {
        console.warn("素材删除后列表刷新失败", error);
    });
}

export async function deleteCanvasProjectsWithRemoteSync(ids: string[]) {
    const epoch = sessionEpoch;
    const requestedIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const draftIds = requestedIds.filter((id) => useCanvasStore.getState().getDraftProject(id));
    if (draftIds.length) useCanvasStore.getState().deleteProjects(draftIds);
    const projectIds = requestedIds.filter((id) => !draftIds.includes(id));
    if (!projectIds.length) return;
    // 删除只依赖画布 ID，跳过编辑加载，避免关联素材的合同校验阻塞删除。
    await withRemoteUserDataSyncExclusive(async () => {
        if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新选择要删除的画布");
        if (activeRemoteUserId) requireRemoteUserDataBaseline();
        const currentProjects = useCanvasStore.getState().projects;
        const projectById = new Map(currentProjects.map((project) => [project.id, project]));
        const deletedProjectIds: string[] = [];
        const deletedProjectObjects: CanvasProject[] = [];
        let deletionError: unknown;
        for (const id of projectIds) {
            try {
                if (activeRemoteUserId) {
                    await deleteRemoteCanvasProject(id);
                    acknowledgedProjects.delete(id);
                }
                useCanvasStore.getState().deleteProjects([id]);
                // 批量删除允许部分成功；每个已成功远端删除的实体都立即落实到本地 durable cache。
                await flushCanvasStorePersistence();
                deletedProjectIds.push(id);
                const project = projectById.get(id);
                if (project) deletedProjectObjects.push(project);
            } catch (error) {
                deletionError = error;
                break;
            }
        }
        if (deletedProjectObjects.length > 0) useCanvasHistoryStore.getState().recordDeletedProjects(deletedProjectObjects);

        if (incrementalSession) {
            void appQueryClient.invalidateQueries({ queryKey: ["canvas-library"] });
            if (deletionError) throw deletionError;
            return;
        }

        // 将属于被删除画布的所有媒体节点安全归档至素材库回收站 (status = "archived")
        const currentAssets = useAssetStore.getState().assets;
        const remainingProjects = useCanvasStore.getState().projects;
        const activeAssetIds = new Set<string>();
        for (const proj of remainingProjects) {
            for (const node of proj.nodes) {
                if (node.metadata?.assetId) activeAssetIds.add(node.metadata.assetId);
            }
            for (const clip of proj.timeline?.clips || []) {
                if (clip.directMedia?.assetId) activeAssetIds.add(clip.directMedia.assetId);
            }
        }
        let assetChanged = false;
        // 1. 已存在的关联素材标记为 archived
        const assetsToArchive = currentAssets.filter((asset) => {
            const canvasId = asset.metadata?.canvasId as string | undefined;
            return canvasId && deletedProjectIds.includes(canvasId) && !activeAssetIds.has(asset.id) && asset.status !== "archived";
        });
        for (const asset of assetsToArchive) {
            useAssetStore.getState().updateAsset(asset.id, { status: "archived" });
            assetChanged = true;
        }

        // 2. 对于画布中尚未入库的媒体节点，直接归档为回收站素材。
        // 素材字段统一交给 canvasNodeToAsset 组装，避免删除路径另起一套尺寸、MIME 和资源定位规则。
        for (const project of deletedProjectObjects) {
            for (const node of project.nodes || []) {
                const isMedia = node.type === "image" || node.type === "video" || node.type === "audio";
                if (!isMedia) continue;

                const existingAsset = node.metadata?.assetId ? currentAssets.find((a) => a.id === node.metadata?.assetId) : undefined;
                if (existingAsset) {
                    const owningCanvasId = existingAsset.metadata?.canvasId as string | undefined;
                    if (owningCanvasId === project.id && !activeAssetIds.has(existingAsset.id) && existingAsset.status !== "archived") {
                        useAssetStore.getState().updateAsset(existingAsset.id, { status: "archived" });
                        assetChanged = true;
                    }
                    continue;
                }

                const archivedAsset = canvasNodeToAsset(node, { canvasId: project.id, source: "canvas-manual" });
                if (!archivedAsset) continue;

                const title = node.title || `${project.title} - ${node.type === "image" ? "图片" : node.type === "video" ? "视频" : "音频"}`;
                const prompt = typeof node.metadata?.prompt === "string" ? node.metadata.prompt : "";
                useAssetStore.getState().addAsset({
                    ...archivedAsset,
                    title,
                    tags: node.type === "audio" ? ["画布音频"] : prompt ? [prompt.slice(0, 16)] : [node.type === "video" ? "画布视频" : "画布生成"],
                    category: "other",
                    status: "archived",
                    source: `已删除画布：${project.title}`,
                    metadata: {
                        ...archivedAsset.metadata,
                        canvasId: project.id,
                        sourceNodeId: node.id,
                    },
                });
                assetChanged = true;
            }
        }

        if (assetChanged) {
            await flushAssetStorePersistence();
            if (activeRemoteUserId) {
                try {
                    await drainRemoteUserDataChanges();
                } catch (syncErr) {
                    scheduleRemoteUserDataSync();
                    console.warn("回收站素材云端同步警告:", syncErr);
                }
            }
        }
        if (deletionError) throw deletionError;
    });
}

/** Persist asset records without replaying unrelated pending canvas edits. */
export function saveRemoteAssetsNow() {
    const epoch = sessionEpoch;
    if (!activeRemoteUserId) throw new Error("云端同步会话尚未建立，当前素材已保留在本地");
    requireRemoteUserDataBaseline();
    return withRemoteUserDataSyncExclusive(async () => {
        requireRemoteUserDataBaseline();
        if (epoch !== sessionEpoch) throw new Error("账号已切换，已停止旧会话保存");
        await saveRemoteUserDataBatch(new Map<string, string>(), { projectIds: [] });
    });
}

/** Explicitly save a selected local-only asset before submitting it for review. */
export function ensureAssetAvailableForRecommendation(assetId: string) {
    const epoch = sessionEpoch;
    if (!activeRemoteUserId) throw new Error("请先登录后再推荐素材");
    requireRemoteUserDataBaseline();
    return withRemoteUserDataSyncExclusive(async () => {
        requireRemoteUserDataBaseline();
        if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新提交推荐");
        try {
            const { asset: remote } = await getRemoteAsset(assetId);
            if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新提交推荐");
            if (remote.status === "archived") throw new Error("素材不存在或已移入回收站，请刷新后重试");
            return;
        } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 404) throw error;
        }
        const asset = useAssetStore.getState().assets.find((item) => item.id === assetId);
        if (!asset || asset.status === "archived") throw new Error("素材不存在或已移入回收站，请刷新后重试");
        const prepared = await ensureRemoteResourceReferences(assetForRemoteSync(asset), new Map<string, string>());
        if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新提交推荐");
        if (useAssetStore.getState().assets.find((item) => item.id === assetId) !== asset) throw new Error("素材正在更新，请稍后重新提交");
        // Check again in case another sync created the record during upload.
        try {
            await getRemoteAsset(assetId);
        } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 404) throw error;
            await upsertRemoteAsset(prepared);
            if (epoch !== sessionEpoch) throw new Error("账号已切换，请重新提交推荐");
            acknowledgedAssets.set(assetId, asset);
            verifiedAssets.add(assetId);
        }
    });
}

export async function saveRemoteUserDataNow(input?: string | readonly string[] | { force?: boolean; repairMissingResources?: boolean }) {
    const key = canonicalize({ epoch: sessionEpoch, scope: getActiveUserScope(), input: input ?? null });
    await waitForCanvasSync(syncSingleFlight(key, () => performRemoteUserDataSave(input)));
}

async function performRemoteUserDataSave(input?: string | readonly string[] | { force?: boolean; repairMissingResources?: boolean }) {
    const projectId = typeof input === "string" || Array.isArray(input) ? (input as string | readonly string[]) : undefined;
    const options = input && typeof input === "object" && !Array.isArray(input) ? (input as { force?: boolean; repairMissingResources?: boolean }) : {};
    const epoch = sessionEpoch;
    if (!activeRemoteUserId) throw new Error("尚未建立云端同步会话，本地内容尚未保存到云端");
    requireRemoteUserDataBaseline();
    const assertNoConflict = () => {
        const ids = projectId === undefined ? useCanvasStore.getState().projects.map((project) => project.id) : typeof projectId === "string" ? [projectId] : projectId;
        if (ids.some((id) => useSyncProgressStore.getState().syncingProjects[id]?.phase === "conflict")) {
            throw new ApiError("云端画布已有更新，请保留本地草稿并加载最新版本", { status: 409 });
        }
    };
    if (projectId !== undefined) assertNoConflict();
    await waitForRemoteProjectLoads(projectId);
    if (syncPromise) {
        try {
            await syncPromise;
        } catch (error) {
            if (projectId === undefined) throw error;
        }
        if (epoch !== sessionEpoch) throw new Error("账号已切换，已停止旧会话保存");
        assertNoConflict();
        return performRemoteUserDataSave(input);
    }
    const saving = withRemoteUserDataSyncExclusive(async () => {
        requireRemoteUserDataBaseline();
        if (epoch !== sessionEpoch) throw new Error("账号已切换，已停止旧会话保存");
        await drainRemoteUserDataChanges({ ...options, projectIds: projectId });
    });
    syncPromise = saving;
    let syncFailed = false;
    let syncError: unknown;
    try {
        await saving;
        if (epoch !== sessionEpoch) throw new Error("账号已切换，已停止旧会话保存");
        assertNoConflict();
        syncRetryAttempt = 0;
    } catch (error) {
        syncFailed = true;
        syncError = error;
    } finally {
        if (syncPromise === saving) syncPromise = null;
        if (epoch === sessionEpoch && (syncQueued || autoSyncQueued)) scheduleRemoteUserDataSync();
    }
    if (syncFailed) {
        if (epoch === sessionEpoch) scheduleRemoteUserDataRetry(syncError);
        throw syncError;
    }
}

/**
 * 修复媒体与素材的绑定，再按素材先于画布的顺序保存。
 * 素材修复可采用远端素材基线；画布始终携带原始 revision，不能绕过版本校验。
 */
export async function forceOverwriteRemoteCanvasSync(): Promise<CanvasAssetRebindResult> {
    const epoch = sessionEpoch;
    if (!activeRemoteUserId) throw new Error("尚未建立云端同步会话，请登录后重试");
    requireRemoteUserDataBaseline();
    await waitForRemoteProjectLoads();
    const rebind = await withRemoteUserDataSyncExclusive(async () => {
        if (epoch !== sessionEpoch) throw new Error("账号已切换，已停止修复保存");
        requireRemoteUserDataBaseline();
        await repairMissingCanvasVideoPreviews();
        if (epoch !== sessionEpoch) throw new Error("账号已切换，已停止修复保存");
        const projects = useCanvasStore.getState().projects;
        // 服务端素材记录是 guard 实际校验的事实；本地缓存可能落后，须先取回再判定绑定一致性。
        const claimedIds = [...collectCanvasMediaAssetIds(projects)];
        const remoteAssets: Asset[] = [];
        for (let offset = 0; offset < claimedIds.length; offset += 100) {
            const { assets } = await getRemoteAssetsByIds(claimedIds.slice(offset, offset + 100));
            remoteAssets.push(...assets);
        }
        if (epoch !== sessionEpoch) throw new Error("账号已切换，已停止修复保存");
        const remoteById = new Map(remoteAssets.map((asset) => [asset.id, asset]));
        const merged = [...remoteAssets, ...useAssetStore.getState().assets.filter((asset) => !remoteById.has(asset.id))];
        const result = rebindInconsistentCanvasAssets(parseAssetRecordList(merged));
        await Promise.all([flushCanvasStorePersistence(), flushAssetStorePersistence()]);
        return result;
    });
    await saveRemoteUserDataNow({ force: true, repairMissingResources: true });
    return rebind;
}

type RemoteSyncOptions = { force?: boolean; repairMissingResources?: boolean; projectIds?: string | readonly string[] };

async function drainRemoteUserDataChanges(options: RemoteSyncOptions = {}) {
    const uploaded = new Map<string, string>();
    do {
        syncQueued = false;
        await saveRemoteUserDataBatch(uploaded, options);
    } while (syncQueued);
}

async function saveRemoteUserDataBatch(uploaded: Map<string, string>, options: RemoteSyncOptions = {}) {
    const epoch = sessionEpoch;
    const scope = getActiveUserScope();
    const assertCurrentSession = () => {
        if (epoch !== sessionEpoch || !activeRemoteUserId || scope !== getActiveUserScope()) throw new Error("账号已切换，已停止旧会话保存");
    };
    await loadPendingCanvasMutations();
    assertCurrentSession();
    // 中央兜底：任何调用方只要把持久媒体写进画布，提交前都会先补齐素材记录与 assetId。
    // 页面级入口仍主动入库，以便立即反馈；这里负责阻止遗漏入口形成远端幽灵资源。
    const selectedIds = options.projectIds === undefined ? undefined : new Set(typeof options.projectIds === "string" ? [options.projectIds] : options.projectIds);
    const changedProjectIds = new Set(
        useCanvasStore
            .getState()
            .projects.filter((project) => (!selectedIds || selectedIds.has(project.id)) && !sameCanvasContent(acknowledgedProjects.get(project.id), project))
            .map((project) => project.id),
    );
    repairMissingCanvasAssets(changedProjectIds, incrementalSession);
    const currentProjects = useCanvasStore.getState().projects;
    const currentAssets = useAssetStore.getState().assets;
    const pendingProjectIds = new Set([...pendingCanvasMutations.values()].map((entry) => entry.projectId));
    const dirtyProjects = currentProjects.filter(
        (project) =>
            (!selectedIds || selectedIds.has(project.id)) && (pendingProjectIds.has(project.id) || !sameCanvasContent(acknowledgedProjects.get(project.id), project)) && useSyncProgressStore.getState().syncingProjects[project.id]?.phase !== "conflict",
    );
    // A rehydrated cache is not proof that an imported asset reached the server.
    // Verify only references needed by pending documents, leaving other cached assets alone.
    const pendingAssetIds = new Set(dirtyProjects.flatMap((project) => [...collectAssetIds(project)]));
    const dirtyAssets = currentAssets.filter(
        (asset) =>
            (!selectedIds?.size || pendingAssetIds.has(asset.id) || (typeof asset.metadata?.canvasId === "string" && selectedIds.has(asset.metadata.canvasId))) &&
            (!sameEntitySnapshot(acknowledgedAssets.get(asset.id), asset) || (pendingAssetIds.has(asset.id) && !verifiedAssets.has(asset.id))),
    );
    if (!dirtyProjects.length && !dirtyAssets.length) return;

    const adoptedAssetIds = new Set<string>();
    const mergedAssets = new Map<string, Asset>();
    const failedAssets = new Map<string, unknown>();
    const assetSyncEpoch = sessionEpoch;
    for (const source of dirtyAssets) {
        try {
            const baseline = acknowledgedAssets.get(source.id);
            if (!baseline) {
                // 空缓存重建后也可能已有用户编辑；用实际生成默认值三方合并，不能整笔覆盖。
                let remote: Asset;
                try {
                    remote = (await getRemoteAsset(source.id)).asset;
                } catch (error) {
                    if (assetSyncEpoch !== sessionEpoch) throw new Error("账号已切换，已停止保存素材");
                    if (error instanceof ApiError && error.status === 404) continue;
                    throw error;
                }
                if (assetSyncEpoch !== sessionEpoch) throw new Error("账号已切换，已停止保存素材");
                const current = useAssetStore.getState().assets.find((asset) => asset.id === source.id);
                if (!sameEntitySnapshot(current, source)) throw new Error("素材仍在编辑，请重新同步");
                const [asset] = parseAssetRecordList([remote]);
                const defaults = getGenerationAssetDefaults(source.id);
                let merged: Asset;
                let edited: boolean;
                try {
                    const contextKeys = ["clientContext", "conversationId", "messageId", "batchIndex"];
                    // 创建/更新时间是各端记账信息，不属于用户编辑的字段。
                    const content = (value: Asset): Asset => {
                        let result = { ...value, createdAt: asset.createdAt, updatedAt: asset.updatedAt };
                        if (!defaults) return result;
                        // 客户端上下文不是素材编辑；保留 projectIds 等业务元数据参与合并。
                        const metadata = { ...result.metadata };
                        for (const key of contextKeys) delete metadata[key];
                        result = { ...result, metadata };
                        if (result.kind === "image" || result.kind === "video" || result.kind === "audio") {
                            const resourceId = resourceIdFromStorageKey(result.data.storageKey);
                            if (resourceId) {
                                // 同一不可变资源的授权/缓存 URL 不代表编辑；独立封面仍参与比较。
                                const url = resourceFileUrl(resourceId);
                                const displayUrl = result.kind === "image" ? result.data.dataUrl : result.data.url;
                                const coverUrl = result.coverUrl === displayUrl ? (result.kind === "image" ? url : "") : result.coverUrl;
                                result =
                                    result.kind === "image"
                                        ? { ...result, coverUrl, data: { ...result.data, dataUrl: url } }
                                        : result.kind === "video"
                                          ? { ...result, coverUrl, data: { ...result.data, url } }
                                          : { ...result, coverUrl, data: { ...result.data, url } };
                            }
                        }
                        return result;
                    };
                    // 无法证明生成默认值时保持保守；刷新后的旧缓存不能充当编辑基线。
                    const remoteContent = content(asset);
                    const mergedContent = mergeThreeWayValue(content(source), defaults ? content(defaults) : undefined, remoteContent) as Asset;
                    edited = canonicalize(remoteContent) !== canonicalize(mergedContent);
                    // 投影只用于判断编辑；未改字段保留远端原值，改动字段取本机真实 payload。
                    const applyEdits = (stored: unknown, local: unknown, before: unknown, after: unknown): unknown => {
                        if (canonicalize(before) === canonicalize(after)) return stored;
                        if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
                            const result = { ...(stored as Record<string, unknown>) };
                            for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
                                const value = applyEdits(result[key], (local as Record<string, unknown>)?.[key], (before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key]);
                                if (value === undefined) delete result[key];
                                else result[key] = value;
                            }
                            return result;
                        }
                        return local;
                    };
                    merged = applyEdits(asset, source, remoteContent, mergedContent) as Asset;
                    if (defaults) {
                        const metadata = { ...merged.metadata };
                        for (const key of contextKeys) {
                            if (metadata[key] === undefined && source.metadata?.[key] !== undefined) metadata[key] = source.metadata[key];
                        }
                        merged = { ...merged, metadata };
                    }
                } catch {
                    throw assetRemoteVersionConflict();
                }
                acknowledgedAssets.set(source.id, edited ? asset : merged);
                verifiedAssets.add(source.id);
                if (!edited) adoptedAssetIds.add(source.id);
                else {
                    merged = { ...merged, updatedAt: source.updatedAt };
                    mergedAssets.set(source.id, merged);
                }
                useAssetStore.setState((state) => ({ assets: state.assets.map((item) => (item.id === source.id ? merged : item)) }));
            }
        } catch (error) {
            assertCurrentSession();
            failedAssets.set(source.id, error);
        }
    }

    if (incrementalSession) {
        for (const source of dirtyAssets) {
            if (failedAssets.has(source.id)) continue;
            try {
                const baseline = acknowledgedAssets.get(source.id);
                if (!baseline || verifiedAssets.has(source.id)) continue;
                let asset: Asset;
                try {
                    ({ asset } = await getRemoteAsset(source.id));
                } catch (error) {
                    assertCurrentSession();
                    const newReference =
                        pendingAssetIds.has(source.id) && dirtyProjects.some((project) => verifiedProjects.has(project.id) && collectAssetIds(project).has(source.id) && !collectAssetIds(acknowledgedProjects.get(project.id)).has(source.id));
                    if (!(error instanceof ApiError) || error.status !== 404 || !newReference) throw error;
                    acknowledgedAssets.delete(source.id);
                    continue;
                }
                assertCurrentSession();
                if (sameEntitySnapshot(source, baseline)) {
                    const [remote] = parseAssetRecordList([asset]);
                    acknowledgedAssets.set(source.id, remote);
                    verifiedAssets.add(source.id);
                    adoptedAssetIds.add(source.id);
                    useAssetStore.setState((state) => ({ assets: state.assets.map((item) => (item === source ? remote : item)) }));
                    continue;
                }
                if (Date.parse(asset.updatedAt) !== Date.parse(baseline.updatedAt)) {
                    if (!options.force) {
                        const current = useAssetStore.getState().assets.find((item) => item.id === source.id);
                        const key = `yingce:canvas-recovery:asset:${source.id}:${newCanvasMutationId()}`;
                        await localForageStorageForScope(getActiveUserScope()).setItem(key, JSON.stringify({ asset: current, savedAt: new Date().toISOString() }));
                        assertCurrentSession();
                        if (useAssetStore.getState().assets.find((item) => item.id === source.id) !== current) throw new CanvasSyncPendingError();
                        const [remote] = parseAssetRecordList([asset]);
                        acknowledgedAssets.set(source.id, remote);
                        verifiedAssets.add(source.id);
                        adoptedAssetIds.add(source.id);
                        useAssetStore.setState((state) => ({ assets: state.assets.map((item) => (item === current ? remote : item)) }));
                        continue;
                    }
                    // 强制覆盖是用户显式指令：采纳远端版本为新基线后继续用本地内容覆盖。
                    acknowledgedAssets.set(source.id, asset);
                }
                verifiedAssets.add(source.id);
            } catch (error) {
                assertCurrentSession();
                failedAssets.set(source.id, error);
            }
        }
    }

    // 转换后的 resource: 引用只属于发往服务端的 payload，不能反写整份实时 store。
    // 已确认快照记录的是本次上传所依据的本地实体；上传期间的新编辑会在下一轮继续提交。
    // 素材先于画布提交。这样画布中的 resource: 引用一旦成为远端事实，
    // 对应 Asset 已经存在，刷新或换设备不会出现只占容量、不见素材的窗口。
    const saveAsset = async (source: Asset) => {
        const remotePayload = await ensureRemoteResourceReferences(assetForRemoteSync(source), uploaded);
        assertCurrentSession();
        for (let attempt = 0; ; attempt++) {
            if (epoch !== sessionEpoch || !activeRemoteUserId) throw new Error("账号已切换，已停止旧会话素材保存");
            try {
                await upsertRemoteAsset(remotePayload);
                assertCurrentSession();
                break;
            } catch (error) {
                if (!(error instanceof ApiError) || !error.retryable || ![429, 502, 503, 504].includes(error.status ?? 0) || attempt >= 3) throw error;
                const waitMs = error.retryAfterMs ?? 60_000;
                if (!Number.isFinite(waitMs) || waitMs > 300_000) throw error;
                // 同一素材 PUT 可在限流或短暂网关断流后继续；画布仍等待全部素材确认。
                await new Promise((resolve) => globalThis.setTimeout(resolve, Math.max(1, waitMs)));
            }
        }
        acknowledgedAssets.set(source.id, source);
        verifiedAssets.add(source.id);
        const current = useAssetStore.getState().assets.find((asset) => asset.id === source.id);
        if (current && !sameEntitySnapshot(source, current)) syncQueued = true;
    };
    // Independent remote URLs need only metadata writes. Keep uploads serial so shared blobs
    // still use the existing upload cache; await every batch before saving dependent canvases.
    let remoteAssets: Asset[] = [];
    const flushRemoteAssets = async () => {
        const batch = remoteAssets;
        remoteAssets = [];
        const results = await Promise.allSettled(batch.map(saveAsset));
        assertCurrentSession();
        results.forEach((result, index) => {
            if (result.status === "rejected") failedAssets.set(batch[index]!.id, result.reason);
        });
    };
    for (const dirty of dirtyAssets) {
        if (adoptedAssetIds.has(dirty.id) || failedAssets.has(dirty.id)) continue;
        const source = mergedAssets.get(dirty.id) ?? dirty;
        if (collectLocalMediaKeys(source).length) {
            await flushRemoteAssets();
            try {
                await saveAsset(source);
            } catch (error) {
                assertCurrentSession();
                failedAssets.set(source.id, error);
            }
        } else {
            remoteAssets.push(source);
            if (remoteAssets.length === 8) await flushRemoteAssets();
        }
    }
    await flushRemoteAssets();
    assertCurrentSession();
    const errors: unknown[] = [...failedAssets.values()];
    for (const source of dirtyProjects) {
        const keysToUpload = collectLocalMediaKeys(source);
        const total = keysToUpload.length;
        useSyncProgressStore.getState().setProjectProgress(source.id, {
            projectId: source.id,
            total,
            completed: 0,
            errorKind: undefined,
            phase: total > 0 ? "uploading" : "saving",
            message: total > 0 ? "正在同步媒体至云端" : "正在保存画布",
        });
        const onMediaUploaded = () => {
            if (total > 0) {
                useSyncProgressStore.getState().incrementProjectCompleted(source.id);
            }
        };
        try {
            const dependencyError = [...collectAssetIds(source)].map((id) => failedAssets.get(id)).find((error) => error !== undefined);
            if (dependencyError) throw dependencyError;
            let candidate = source;
            let entry = [...pendingCanvasMutations.values()].find((pending) => pending.projectId === source.id);
            let rejectedEntry: PendingCanvasMutation | undefined;
            let saved = false;
            let lastError: unknown;
            for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
                const current = useCanvasStore.getState().openProject(source.id);
                if (entry?.rebaseSource && current && entry.localPrepared.remoteContentHash && current.remoteContentHash !== entry.localPrepared.remoteContentHash) {
                    // The journal commits before the projected cache. Recover that
                    // gap once, retaining edits made after the interrupted save.
                    candidate = rebaseCanvasLocalEdits(entry.rebaseSource, entry.localPrepared, current);
                    for (const listener of agentCanvasListeners) listener(candidate, current, "sync");
                    useCanvasStore.setState((state) => ({ projects: state.projects.map((project) => (project === current ? candidate : project)) }));
                    await flushCanvasStorePersistence();
                    assertCurrentSession();
                }
                if (!Number.isSafeInteger(candidate.revision) || candidate.revision! < 0) {
                    throw new ApiError("缺少画布版本，请保留草稿并加载云端最新版本", { status: 428 });
                }
                const hash = await canvasContentHash(candidate);
                assertCurrentSession();
                const remotePayload = await ensureRemoteResourceReferences(candidate, uploaded, onMediaUploaded);
                assertCurrentSession();
                if (total > 0) {
                    useSyncProgressStore.getState().setProjectProgress(source.id, {
                        phase: attempt > 0 ? "reconciling" : "saving",
                        message: attempt > 0 ? "正在自动合并云端与本地修改" : "正在保存画布结构",
                    });
                }
                try {
                    if (options.repairMissingResources && entry) throw new Error("请先确认未完成的画布操作，再执行素材修复");
                    let savedProject: { revision: number };
                    let acknowledged: CanvasProject;
                    let projected: CanvasProject;
                    if (options.repairMissingResources) {
                        ({ project: savedProject } = await upsertRemoteCanvasProject(sanitizeCanvasProjectForRemoteSync(remotePayload), { repairMissingResources: true }));
                        if (savedProject.revision !== candidate.revision! + 1) throw new Error("服务端未返回有效画布版本");
                        acknowledged = { ...candidate, revision: savedProject.revision, remoteContentHash: hash };
                        projected = { ...(useCanvasStore.getState().openProject(source.id) || candidate), revision: savedProject.revision, remoteContentHash: hash };
                    } else {
                        if (!entry) {
                            const baseline = acknowledgedProjects.get(source.id);
                            const prepared = sanitizeCanvasProjectForRemoteSync(remotePayload);
                            const remoteBaseline = baseline ? sanitizeCanvasProjectForRemoteSync(await ensureRemoteResourceReferences(baseline, uploaded)) : undefined;
                            assertCurrentSession();
                            if (candidate.revision !== 0 && !remoteBaseline) throw new Error("缺少已确认的画布基线，请先加载云端画布");
                            const operations = buildCanvasOperations(candidate.revision === 0 ? undefined : remoteBaseline, prepared);
                            if (!operations.length) {
                                const remoteHash = await canvasContentHash(prepared);
                                assertCurrentSession();
                                const current = useCanvasStore.getState().openProject(source.id);
                                if (!current) throw new Error("画布已关闭，停止确认保存");
                                const acknowledged = { ...prepared, remoteContentHash: remoteHash };
                                const projected = rebaseCanvasLocalEdits(candidate, acknowledged, current);
                                for (const listener of agentCanvasListeners) listener(projected, current, "sync");
                                useCanvasStore.setState((state) => ({ projects: state.projects.map((project) => (project === current ? projected : project)) }));
                                try {
                                    await flushCanvasStorePersistence();
                                } catch (error) {
                                    assertCurrentSession();
                                    useSyncProgressStore.getState().setProjectProgress(source.id, { phase: "pending", errorKind: "local", pendingChanges: 1 });
                                    throw error;
                                }
                                assertCurrentSession();
                                if (rejectedEntry) {
                                    await removeCanvasMutation(rejectedEntry);
                                    pendingCanvasMutations.delete(rejectedEntry.journalId);
                                    rejectedEntry = undefined;
                                }
                                acknowledgedProjects.set(source.id, acknowledged);
                                canvasEditLeases.acknowledged(source.id, canvasEditLeases.versions(source.id));
                                await canvasEditLeases.yield(source.id);
                                assertCurrentSession();
                                const pending = !sameCanvasContent(acknowledged, useCanvasStore.getState().openProject(source.id) || undefined);
                                if (pending) syncQueued = true;
                                useSyncProgressStore
                                    .getState()
                                    .setProjectProgress(source.id, { phase: pending ? "pending" : "done", pendingChanges: pending ? 1 : 0, cloudRevision: acknowledged.revision, message: pending ? "有新修改等待保存" : "已保存到云端" });
                                saved = true;
                                continue;
                            }
                            const mutationId = newCanvasMutationId();
                            const ids = new Set(operations.flatMap((operation) => (operation.type === "create_node" ? [operation.node.id] : "id" in operation ? [operation.id] : [])));
                            const editVersions = canvasEditLeases.versions(source.id);
                            const editProofs = candidate.revision === 0 ? undefined : await canvasEditLeases.proofs(source.id, ids);
                            assertCurrentSession();
                            entry = {
                                journalId: mutationId,
                                scope: getActiveUserScope(),
                                projectId: source.id,
                                request: { mutationId, ...(candidate.revision === 0 ? {} : { baseRevision: candidate.revision }), operations, ...(editProofs?.length ? { editProofs } : {}) },
                                baseline: remoteBaseline,
                                localBaseline: baseline,
                                clientId: mutationClientId,
                                editVersions,
                                editSession: canvasEditLeases.session(),
                                prepared,
                                localPrepared: candidate,
                                createdAt: new Date().toISOString(),
                            };
                            await persistCanvasMutation(entry);
                            assertCurrentSession();
                            pendingCanvasMutations.set(entry.journalId, entry);
                            if (rejectedEntry) {
                                await removeCanvasMutation(rejectedEntry);
                                pendingCanvasMutations.delete(rejectedEntry.journalId);
                                rejectedEntry = undefined;
                            }
                        }
                        if (entry.request.operations.length || entry.remainingOperations?.length) {
                            ({ project: savedProject } = await submitPendingCanvasMutation(entry, assertCurrentSession));
                        } else {
                            // A confirmed rebase can remove the last local edit,
                            // for example when its node was deleted remotely.
                            if (!Number.isSafeInteger(entry.request.baseRevision)) throw new Error("缺少已确认的画布版本");
                            savedProject = { revision: entry.request.baseRevision! };
                        }
                        assertCurrentSession();
                        // A receipt summarizes our request. It is not the latest document:
                        // another tab can have committed unrelated fields in the meantime.
                        const { project: remote } = await getRemoteCanvasProject(source.id);
                        assertCurrentSession();
                        if (!Number.isSafeInteger(remote.revision) || remote.revision! < savedProject.revision) {
                            throw new Error("云端画布版本尚未确认，已保留原操作等待重试");
                        }
                        const current = useCanvasStore.getState().openProject(source.id);
                        if (!current) throw new Error("画布已关闭，已确认操作保留至下次恢复");
                        const remoteHash = await canvasContentHash(remote);
                        assertCurrentSession();
                        if (useCanvasStore.getState().openProject(source.id) !== current) throw new Error("画布仍在编辑，正在等待重试确认");
                        // Native journals predate tab identities. Their prepared snapshot
                        // is the local editor's ancestor, including edits already sent.
                        // Identified journals from another tab still use its pre-edit base.
                        const ownJournal = !entry.clientId || entry.clientId === mutationClientId;
                        const editorBaseline = ownJournal ? entry.localPrepared : entry.localBaseline || entry.baseline || entry.localPrepared;
                        projected = sameCanvasContent(current, editorBaseline)
                            ? { ...remote, viewport: current.viewport, remoteContentHash: remoteHash }
                            : {
                                  ...(entry.clientId === mutationClientId ? rebaseCanvasLocalEdits(editorBaseline, remote, current) : mergeAgentCanvasEditor(editorBaseline, remote, current.nodes, current.connections, current)),
                                  viewport: current.viewport,
                                  remoteContentHash: remoteHash,
                              };
                        acknowledged = { ...remote, remoteContentHash: remoteHash };
                    }
                    assertCurrentSession();
                    if (!Number.isSafeInteger(savedProject.revision)) {
                        throw new ApiError("服务端未返回有效画布版本，请加载云端最新版本", { status: 409 });
                    }
                    const current = useCanvasStore.getState().openProject(source.id);
                    if (current) {
                        for (const listener of agentCanvasListeners) listener(projected, current, "sync");
                        useCanvasStore.setState((state) => ({ projects: state.projects.map((project) => (project === current ? projected : project)) }));
                    }
                    await flushCanvasStorePersistence();
                    assertCurrentSession();
                    if (entry) {
                        await removeCanvasMutation(entry);
                        pendingCanvasMutations.delete(entry.journalId);
                        if (entry.editSession === canvasEditLeases.session()) canvasEditLeases.acknowledged(source.id, entry.editVersions || {});
                    }
                    assertCurrentSession();
                    // Hand over after a confirmed save even when this device keeps
                    // typing, so another editor can commit its pending input.
                    await canvasEditLeases.yield(source.id);
                    assertCurrentSession();
                    acknowledgedProjects.set(source.id, acknowledged);
                    verifiedProjects.add(source.id);
                    const pending = [...pendingCanvasMutations.values()].some((pending) => pending.projectId === source.id) || !sameCanvasContent(acknowledged, useCanvasStore.getState().openProject(source.id) || undefined);
                    useSyncProgressStore.getState().setProjectProgress(source.id, { phase: pending ? "pending" : "done", pendingChanges: pending ? 1 : 0, cloudRevision: acknowledged.revision, message: pending ? "有新修改等待保存" : "已保存到云端" });
                    if (pending) syncQueued = true;
                    saved = true;
                    continue;
                } catch (error) {
                    lastError = error;
                    const conflict =
                        error instanceof ApiError &&
                        (options.repairMissingResources
                            ? error.reason !== "canvas_history_resources_missing" && (error.status === 409 || error.status === 428)
                            : (error.status === 409 && ["canvas_field_conflict", "canvas_object_missing", "canvas_mutation_id_reused"].includes(error.reason || "")) || (error.status === 400 && error.reason === "canvas_media_assets_pending"));
                    if (!conflict) throw error;
                    if (entry) {
                        if (error instanceof ApiError && error.reason === "canvas_edit_lease_conflict") canvasEditLeases.invalidate(source.id, new Set(entry.request.editProofs?.map((proof) => proof.nodeId)));
                        entry.rejectedReason = error instanceof ApiError ? error.reason : undefined;
                        await persistCanvasMutation(entry);
                        assertCurrentSession();
                    }
                    if (attempt >= 2) throw new CanvasSyncPendingError("云端仍有并发更新，新修改已保留，稍后自动重试");
                    rejectedEntry = entry;
                    entry = undefined;
                    try {
                        const { project: remote } = await getRemoteCanvasProject(source.id);
                        assertCurrentSession();
                        const current = useCanvasStore.getState().openProject(source.id);
                        if (!current || current !== useCanvasStore.getState().openProject(source.id)) throw error;
                        if (sameCanvasContent(current, remote)) {
                            const remoteHash = await canvasContentHash(remote);
                            assertCurrentSession();
                            const reconciled = { ...remote, viewport: current.viewport, remoteContentHash: remoteHash };
                            acknowledgedProjects.set(source.id, reconciled);
                            verifiedProjects.add(source.id);
                            useCanvasStore.setState((state) => ({ projects: state.projects.map((project) => (project.id === source.id ? reconciled : project)) }));
                            await flushCanvasStorePersistence();
                            assertCurrentSession();
                            if (rejectedEntry) {
                                await removeCanvasMutation(rejectedEntry);
                                pendingCanvasMutations.delete(rejectedEntry.journalId);
                                rejectedEntry = undefined;
                            }
                            useSyncProgressStore.getState().setProjectProgress(source.id, { phase: "done", message: "云端内容一致，已自动校准版本" });
                            saved = true;
                            continue;
                        }
                        const baseline = rejectedEntry?.localBaseline || rejectedEntry?.baseline || acknowledgedProjects.get(source.id);
                        if (!baseline) throw error;
                        let rebased: CanvasProject;
                        try {
                            rebased = rebaseCanvasLocalEdits(baseline, remote, current);
                        } catch (mergeError) {
                            throw new ApiError(mergeError instanceof Error ? mergeError.message : "本地与云端存在同一字段修改", { status: 409 });
                        }
                        const remoteHash = await canvasContentHash(remote);
                        assertCurrentSession();
                        if (useCanvasStore.getState().openProject(source.id) !== current) {
                            throw new ApiError("画布在自动合并期间发生新修改，请重试", { status: 409 });
                        }
                        candidate = { ...rebased, viewport: current.viewport, remoteContentHash: remoteHash };
                        const acknowledged = { ...remote, viewport: current.viewport, remoteContentHash: remoteHash };
                        if (rejectedEntry) {
                            const prepared = sanitizeCanvasProjectForRemoteSync(await ensureRemoteResourceReferences(candidate, uploaded));
                            const remoteBaseline = sanitizeCanvasProjectForRemoteSync(await ensureRemoteResourceReferences(acknowledged, uploaded));
                            assertCurrentSession();
                            const operations = buildCanvasOperations(remoteBaseline, prepared);
                            const ids = new Set(operations.flatMap((operation) => (operation.type === "create_node" ? [operation.node.id] : "id" in operation ? [operation.id] : [])));
                            const editVersions = canvasEditLeases.versions(source.id);
                            const editProofs = await canvasEditLeases.proofs(source.id, ids);
                            assertCurrentSession();
                            const replacement: PendingCanvasMutation = {
                                journalId: rejectedEntry.journalId,
                                journalVersion: rejectedEntry.journalVersion,
                                scope: rejectedEntry.scope,
                                projectId: source.id,
                                request: { mutationId: newCanvasMutationId(), baseRevision: remote.revision!, operations, ...(editProofs.length ? { editProofs } : {}) },
                                baseline: remoteBaseline,
                                localBaseline: acknowledged,
                                rebaseSource: current,
                                clientId: mutationClientId,
                                editVersions,
                                editSession: canvasEditLeases.session(),
                                prepared,
                                localPrepared: candidate,
                                createdAt: new Date().toISOString(),
                            };
                            await persistCanvasMutation(replacement);
                            assertCurrentSession();
                            pendingCanvasMutations.set(replacement.journalId, replacement);
                            entry = replacement;
                            rejectedEntry = undefined;
                            const latest = useCanvasStore.getState().openProject(source.id);
                            if (!latest) throw new Error("画布已关闭，合并操作已保留至下次恢复");
                            if (latest !== current) candidate = rebaseCanvasLocalEdits(current, candidate, latest);
                        }
                        acknowledgedProjects.set(source.id, acknowledged);
                        verifiedProjects.add(source.id);
                        for (const listener of agentCanvasListeners) listener(candidate, current, "sync");
                        useCanvasStore.setState((state) => ({ projects: state.projects.map((project) => (project.id === source.id ? candidate : project)) }));
                        await flushCanvasStorePersistence();
                        assertCurrentSession();
                        useSyncProgressStore.getState().setProjectProgress(source.id, { phase: "reconciling", message: "检测到云端更新，正在自动合并本地修改" });
                    } catch (rebaseError) {
                        lastError = rebaseError;
                        throw rebaseError;
                    }
                }
            }
            if (!saved && lastError) throw lastError;
            assertCurrentSession();
        } catch (error) {
            assertCurrentSession();
            const deletedRemote = error instanceof ApiError && error.status === 404 && [...pendingCanvasMutations.values()].some((entry) => entry.projectId === source.id);
            const conflict = deletedRemote || (error instanceof ApiError && !["canvas_history_resources_missing", "canvas_concurrent_write", "canvas_edit_lease_conflict"].includes(error.reason || "") && (error.status === 409 || error.status === 428));
            const retryable = isRetryableRemoteSyncError(error);
            const localFailure = useSyncProgressStore.getState().syncingProjects[source.id]?.errorKind === "local";
            const leasePending = error instanceof ApiError && error.reason === "canvas_edit_lease_conflict";
            useSyncProgressStore.getState().setProjectProgress(source.id, {
                phase: conflict ? "conflict" : retryable || localFailure ? "pending" : "error",
                errorKind: localFailure ? "local" : conflict ? "conflict" : leasePending ? undefined : "network",
                message: deletedRemote ? "云端画布已删除，本地修改已保留为草稿" : conflict ? "本地与云端存在同一字段修改，请选择保留的版本" : error instanceof Error ? error.message : "云端同步失败，等待重试",
            });
            if (conflict) {
                try {
                    const current = useCanvasStore.getState().openProject(source.id) || source;
                    const draftCount = await preserveCanvasSyncDraft(current);
                    assertCurrentSession();
                    useSyncProgressStore.getState().setProjectProgress(source.id, { draftCount });
                } catch (draftError) {
                    assertCurrentSession();
                    useSyncProgressStore.getState().setProjectProgress(source.id, { message: "本地草稿保存失败，请勿关闭页面；请先下载草稿" });
                    errors.push(draftError);
                }
            }
            errors.push(error);
        }
    }
    if (errors.length) throw errors[0];
    if (dirtyProjects.length) void appQueryClient.invalidateQueries({ queryKey: ["canvas-library"] });
}

function assetRemoteVersionConflict() {
    return new Error("素材远端版本已变化，已停止覆盖，请重新打开素材库");
}

function requireRemoteUserDataBaseline() {
    if (remoteUserDataPhase !== "ready") throw new Error("云端数据基线尚未建立，已停止写入");
}

function sameEntitySnapshot<T>(acknowledged: T | undefined, current: T) {
    return acknowledged !== undefined && (acknowledged === current || JSON.stringify(acknowledged) === JSON.stringify(current));
}

function sanitizeCanvasProjectForRemoteSync<T>(project: T): T {
    if (!project || typeof project !== "object") return project;
    const clone = { ...(project as Record<string, unknown>) };
    if (Array.isArray(clone.chatSessions)) {
        clone.chatSessions = clone.chatSessions.map((session) => {
            if (!session || typeof session !== "object") return session;
            const s = { ...(session as Record<string, unknown>) };
            if (Array.isArray(s.messages)) {
                s.messages = s.messages.map((message) => {
                    if (!message || typeof message !== "object" || !message.detail) return message;
                    const m = { ...(message as Record<string, unknown>) };
                    if (m.detail && typeof m.detail === "object") {
                        const d = { ...(m.detail as Record<string, unknown>) };
                        if (Array.isArray(d.results)) {
                            d.results = d.results.map((r) => {
                                if (!r || typeof r !== "object") return r;
                                const res = { ...(r as Record<string, unknown>) };
                                if (res.result && typeof res.result === "object") {
                                    const inner = { ...(res.result as Record<string, unknown>) };
                                    if (inner.data && typeof inner.data === "object") {
                                        const { snapshot: _s, before: _b, after: _a, ...restData } = inner.data as Record<string, unknown>;
                                        inner.data = restData;
                                    }
                                    res.result = inner;
                                }
                                return res;
                            });
                        }
                        m.detail = d;
                    }
                    return m;
                });
            }
            return s;
        });
    }
    return clone as T;
}

export function remoteUserDataRetryDelay(attempt: number, retryAfterMs = 0) {
    const normalizedAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
    const delay = REMOTE_SYNC_RETRY_DELAYS_MS[Math.min(normalizedAttempt, REMOTE_SYNC_RETRY_DELAYS_MS.length - 1)];
    return Math.max(delay, retryAfterMs);
}

export function repairPendingCanvasMutationRequest(request: CanvasOperationsRequest, baseline?: CanvasProject, prepared?: CanvasProject): CanvasOperationsRequest {
    let changed = false;
    const create = request.operations.find((operation) => operation.type === "create_canvas");
    const createdFields = new Set(create && create.type === "create_canvas" ? Object.keys(create.patch || {}) : []);
    const kept = request.operations.filter((operation) => {
        if (operation.type === "set_field" && operation.field === "projectId" && (operation.value === null || operation.value === undefined) && operation.beforeValue === "") {
            // 空字符串和缺省 projectId 都表示未关联项目。旧版本把这次语义上的 no-op
            // 记录成 set_field，服务端按字面字段比较时会误报冲突；移除它不会丢弃编辑。
            changed = true;
            return false;
        }
        if (!create || operation.type !== "set_field" || !createdFields.has(operation.field)) return true;
        changed = true;
        return false;
    });
    const operations = kept
        .map((operation) => {
            if (operation.type === "patch_node" && (!Object.keys(operation.patch).length || !Object.keys(operation.before || {}).length)) {
                const beforeNode = baseline?.nodes.find((node) => node.id === operation.id);
                const afterNode = prepared?.nodes.find((node) => node.id === operation.id);
                // 空补丁或空基线必然被服务端拒绝且没有成功回执，沿用原 mutationId 安全重试。
                // 缺少原快照时不猜测旧值；有效请求不重新生成，以免改变已确认请求的摘要。
                if (beforeNode && afterNode) {
                    const diff = diffCanvasObject(beforeNode as unknown as Record<string, unknown>, afterNode as unknown as Record<string, unknown>);
                    changed = true;
                    if (!Object.keys(diff.patch).length) return undefined;
                    return { ...operation, patch: diff.patch, before: diff.previous };
                }
            }
            if (operation.type !== "set_field") return operation;
            const hasBefore = Object.prototype.hasOwnProperty.call(operation, "beforeValue") && operation.beforeValue !== undefined;
            const hasValue = Object.prototype.hasOwnProperty.call(operation, "value") && operation.value !== undefined;
            if (hasBefore && hasValue) return operation;
            changed = true;
            return {
                ...operation,
                value: hasValue ? operation.value : canvasOperationValue(prepared?.[operation.field]),
                beforeValue: hasBefore ? operation.beforeValue : canvasOperationValue(baseline?.[operation.field]),
            };
        })
        .filter((operation): operation is CanvasOperation => operation !== undefined);
    return changed ? { ...request, operations } : request;
}

function isGuaranteedServerRejectedRequest(request: CanvasOperationsRequest): boolean {
    const firstOp = request.operations[0];
    const create = firstOp && firstOp.type === "create_canvas" ? firstOp : undefined;
    const simulatedFields: Record<string, unknown> = create?.patch ? { ...create.patch } : {};
    for (let index = 0; index < request.operations.length; index++) {
        const operation = request.operations[index]!;
        if (operation.type === "create_canvas" && index > 0) {
            return true;
        }
        if (operation.type === "patch_node") {
            if (Object.keys(operation.patch || {}).length === 0 || Object.keys(operation.before || {}).length === 0) {
                return true;
            }
            continue;
        }
        if (operation.type === "set_field") {
            const hasBefore = Object.prototype.hasOwnProperty.call(operation, "beforeValue") && operation.beforeValue !== undefined;
            const hasValue = Object.prototype.hasOwnProperty.call(operation, "value") && operation.value !== undefined;
            if ((!hasBefore || !hasValue) && !SERVER_OPTIONAL_OPERATION_FIELDS.has(operation.field)) {
                return true;
            }
            if (create) {
                const exists = Object.prototype.hasOwnProperty.call(simulatedFields, operation.field) && simulatedFields[operation.field] !== undefined;
                const currentVal = exists ? canvasOperationValue(simulatedFields[operation.field]) : null;
                const effectiveBefore = hasBefore ? canvasOperationValue(operation.beforeValue) : null;
                const effectiveValue = hasValue ? canvasOperationValue(operation.value) : null;
                if (!canvasOperationValueEqual(currentVal, effectiveBefore) && !canvasOperationValueEqual(currentVal, effectiveValue)) {
                    return true;
                }
                if (effectiveValue === null) {
                    delete simulatedFields[operation.field];
                } else {
                    simulatedFields[operation.field] = effectiveValue;
                }
            }
        }
    }
    return false;
}

export function prepareJournalRequestForReplay(request: CanvasOperationsRequest, baseline?: CanvasProject, prepared?: CanvasProject): CanvasOperationsRequest {
    const candidate = repairPendingCanvasMutationRequest(request, baseline, prepared);
    if (candidate === request || !candidate.operations.length) return candidate;
    return isGuaranteedServerRejectedRequest(request) ? candidate : request;
}

export function mergeRemoteAssetsWithLocalPending(remoteAssets: Asset[], localAssets: Asset[]) {
    const merged = new Map(remoteAssets.map((asset) => [asset.id, asset]));
    for (const local of localAssets) {
        const remote = merged.get(local.id);
        // A local asset absent from the snapshot is an unacknowledged create.
        // A same-ID difference is an unconfirmed edit. Keep both kinds visible;
        // the normal save path will validate/rebase them against the server.
        if (!remote || !sameEntitySnapshot(remote, local)) merged.set(local.id, local);
    }
    return [...merged.values()];
}

export async function loadPromptMentionedAssets(prompt: string): Promise<Asset[]> {
    const loadedIds = new Set(useAssetStore.getState().assets.map((asset) => asset.id));
    const missingIds = canvasPromptAssetMentionIds(prompt).filter((id) => !loadedIds.has(id));
    if (missingIds.length) await loadAssetsForUse(missingIds);
    return useAssetStore.getState().assets;
}

export function subscribeRemoteUserDataReady(listener: () => void | Promise<void>) {
    remoteUserDataReadyListeners.add(listener);
    if (hasRemoteUserDataSyncSession())
        void Promise.resolve()
            .then(listener)
            .catch((error) => console.warn("云端同步就绪回调失败", error));
    return () => {
        remoteUserDataReadyListeners.delete(listener);
    };
}

function notifyRemoteUserDataReady() {
    for (const listener of remoteUserDataReadyListeners) {
        void Promise.resolve()
            .then(listener)
            .catch((error) => console.warn("云端同步就绪回调失败", error));
    }
}

export async function prepareCanvasForCloudAction(id: string) {
    try {
        useCanvasStore.getState().materializeDraft(id);
        await flushCanvasStorePersistence();
        await saveRemoteUserDataNow(id);
    } catch (error) {
        // Callers retain their input without adding sync errors to task UI.
        throw new CanvasSyncPendingError(error instanceof Error ? error.message : undefined);
    }
}
