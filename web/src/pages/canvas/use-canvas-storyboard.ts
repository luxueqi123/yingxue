import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { backendProviderConfig, buildGenerationConfig, generationTaskMetadata, resetGenerationTaskMetadata, logicalModelIDForConfig, assertCanvasGenerationRequirements } from "@/lib/canvas/canvas-project-generation";
import { cinematicStoryboardColumns, createCanvasNode, createStoryboardRow, expandStoryboardTextMentions, storyboardRowVideoPrompt, storyboardRowsFromTask, storyboardPromptTemplateMetadata, stripProjectStyleExecutionBlocks, syncStoryboardVideoNode, withStoryboardOutputContract } from "@/lib/canvas/canvas-project-domain";
import { buildNodeGenerationContext } from "@/components/canvas/canvas-node-generation";
import { buildNodeMentionReferences } from "@/lib/canvas/canvas-resource-references";
import { buildStoryboardAssetCatalog } from "@/lib/canvas/canvas-storyboard-assets";
import { storyboardRowImageOutputs } from "@/lib/canvas/canvas-storyboard-outputs";
import { bindLtvCurrentReferences, orderLtvReferenceConnections } from "@/lib/canvas/ltv-runtime-references";
import { resolveStoryboardGenerationContext } from "@/lib/canvas/canvas-storyboard-context";
import { reconcileStoryboardTargetConnections, storyboardComposerContent, storyboardRowReferenceNodeIds, synchronizeStoryboardReferencePlan } from "@/lib/canvas/canvas-storyboard-materializer";
import { generationErrorMessage } from "@/lib/generation-error";
import { navigateToSettings } from "@/lib/settings-navigation";
import type { Skill } from "@/services/api/skills";
import { createGenerationTask, waitForGenerationTask } from "@/services/api/task-center";
import { skillRuntime } from "@/services/skill-runtime";
import { submitStoryboardTask } from "@/services/storyboard-submission";
import { restoreStoryboardTaskResult } from "@/services/storyboard-task-result";
import { storyboardRowPrompt } from "@/lib/canvas/storyboard-character-context";
import { prepareGenerationReferences } from "@/services/api/generation-task";
import { ltvStoryboardSourceColumns } from "@/lib/canvas/ltv-storyboard";
import { getActiveUserScope } from "@/lib/user-scope";
import { modelDisplayName, resolveModelRequestConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasGenerationBatchMode, type CanvasNodeData, type StoryboardRow } from "@/types/canvas";

type UseCanvasStoryboardOptions = {
    projectId: string;
    addedSkills: Skill[];
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    enqueueGenerationBatch: (sourceNodeId: string, mode: CanvasGenerationBatchMode, targets: Array<{ rowId: string; nodeId: string }>) => string | undefined;
};

const NODE_STATUS_IDLE = "idle" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;

export function useCanvasStoryboard({ projectId, addedSkills, nodesRef, connectionsRef, setNodes, setConnections, setSelectedNodeIds, enqueueGenerationBatch }: UseCanvasStoryboardOptions) {
    const { message, modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const storyboardRequests = useRef(new Set<string>());
    const storyboardLifetime = useRef(new AbortController());
    useEffect(() => {
        const controller = new AbortController();
        storyboardLifetime.current = controller;
        return () => controller.abort();
    }, [projectId]);

    const confirmGenerationSubmission = useCallback(
        (count: number, model: string, taskLabel: string) =>
            new Promise<boolean>((resolve) => {
                if (!count) return resolve(false);
                modal.confirm({
                    title: `确认提交 ${count} 个${taskLabel}任务`,
                    content: `任务数：${count}；模型：${modelDisplayName(effectiveConfig, model)}。当前没有可用价格数据，将提交 ${count} 个外部模型任务。`,
                    okText: "确认生成",
                    cancelText: "取消",
                    centered: true,
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                });
            }),
        [effectiveConfig, modal],
    );

    const confirmStoryboardTargets = useCallback(
        async (targets: CanvasNodeData[], mode: "image" | "video") => {
            const scope = getActiveUserScope();
            const snapshot = JSON.stringify(targets);
            const groups = new Map<string, number>();
            try {
                for (const node of targets) {
                    const config = buildGenerationConfig(effectiveConfig, node, mode);
                    const prompt = node.metadata?.composerContent || node.metadata?.prompt || "";
                    const context = buildNodeGenerationContext(node.id, nodesRef.current, connectionsRef.current, prompt, []);
                    assertCanvasGenerationRequirements(config, node, mode, context.prompt);
                    if (!isAiConfigReady(config, config.model)) throw new Error(`请先为「${node.title}」选择并配置可用模型。`);
                    groups.set(config.model, (groups.get(config.model) || 0) + 1);
                }
                for (const [model, count] of groups) {
                    if (!(await confirmGenerationSubmission(count, model, mode === "image" ? "图片生成" : "视频生成"))) return false;
                }
                const current = targets.map((target) => nodesRef.current.find((node) => node.id === target.id));
                if (scope !== getActiveUserScope() || JSON.stringify(current) !== snapshot) throw new Error("模型确认期间镜头或账号已变化，请重新提交。");
                return targets.length > 0;
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "分镜制作参数不完整，未提交任务。");
                return false;
            }
        },
        [connectionsRef, nodesRef, effectiveConfig, isAiConfigReady, confirmGenerationSubmission, message],
    );

    const updateScriptRows = useCallback(
        (nodeId: string, updater: (rows: StoryboardRow[]) => StoryboardRow[]) => {
            setNodes((current) =>
                current.map((node) =>
                    node.id === nodeId && !node.metadata?.ltvStoryboardSource?.videoStory
                        ? {
                              ...node,
                              metadata: {
                                  ...node.metadata,
                                  storyboard: {
                                      rows: updater(node.metadata?.storyboard?.rows || []),
                                      visibleColumns: node.metadata?.storyboard?.visibleColumns || ["shotNumber", "durationSeconds", "videoMotionPrompt", "dialogue", "assets"],
                                      referenceNodeIds: node.metadata?.storyboard?.referenceNodeIds || [],
                                  },
                              },
                          }
                        : node,
                ),
            );
        },
        [setNodes],
    );

    const replaceScriptRows = useCallback(
        (nodeId: string, rows: StoryboardRow[]) => {
            if (nodesRef.current.find((node) => node.id === nodeId)?.metadata?.ltvStoryboardSource?.videoStory) return;
            const rowIds = new Set(rows.map((row) => `row:${row.id}`));
            const storyboardRowIds = new Set(rows.map((row) => row.id));
            const previousRows = new Map((nodesRef.current.find((node) => node.id === nodeId)?.metadata?.storyboard?.rows || []).map((row) => [row.id, row]));
            const nextRows = rows.map((row) => invalidateEditedPromptVariables(previousRows.get(row.id), row));
            setConnections((current) =>
                current
                    .filter((connection) => (connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId) || !connection.storyboardRowId || storyboardRowIds.has(connection.storyboardRowId))
                    .filter((connection) => connection.fromNodeId !== nodeId || !connection.fromHandleId?.startsWith("row:") || rowIds.has(connection.fromHandleId))
                    .filter((connection) => connection.toNodeId !== nodeId || !connection.toHandleId?.startsWith("row:") || rowIds.has(connection.toHandleId)),
            );
            updateScriptRows(nodeId, () => nextRows);
        },
        [nodesRef, setConnections, updateScriptRows],
    );

    const addScriptRow = useCallback(
        (nodeId: string) => {
            updateScriptRows(nodeId, (rows) => [...rows, createStoryboardRow(rows.length + 1)]);
        },
        [updateScriptRows],
    );

    const updateScriptRow = useCallback(
        (nodeId: string, rowId: string, patch: Partial<StoryboardRow>) => {
            updateScriptRows(nodeId, (rows) => rows.map((row) => (row.id === rowId ? invalidateEditedPromptVariables(row, { ...row, ...patch }) : row)));
        },
        [updateScriptRows],
    );

    const removeScriptRow = useCallback(
        (nodeId: string, rowId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            const rows = (node?.metadata?.storyboard?.rows || []).filter((row) => row.id !== rowId).map((row, index) => ({ ...row, shotNumber: index + 1 }));
            replaceScriptRows(nodeId, rows);
        },
        [nodesRef, replaceScriptRows],
    );

    const generateScriptRows = useCallback(
        async (nodeId: string, prompt: string, callerSignal?: AbortSignal) => {
            const scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            const cleanedPrompt = stripProjectStyleExecutionBlocks(prompt);
            if (!scriptNode || !cleanedPrompt) return;
            if (scriptNode.metadata?.ltvStoryboardSource?.videoStory) {
                message.warning("视频故事为原片解析资源，请使用原片重新解析获取新分镜");
                return false;
            }
            if (storyboardRequests.current.has(nodeId) || scriptNode.metadata?.status === NODE_STATUS_LOADING) {
                message.warning("当前分镜正在处理，请等待原任务完成");
                return false;
            }
            const lifetimeSignal = storyboardLifetime.current.signal;
            const signal = callerSignal ? AbortSignal.any([lifetimeSignal, callerSignal]) : lifetimeSignal;
            const scope = getActiveUserScope();
            const originalRows = JSON.stringify(scriptNode.metadata?.storyboard?.rows || []);
            const assertCurrent = () => {
                signal.throwIfAborted();
                const current = nodesRef.current.find((node) => node.id === nodeId);
                if (getActiveUserScope() !== scope || !current || JSON.stringify(current.metadata?.storyboard?.rows || []) !== originalRows) throw new Error("画布、账号或分镜内容已变化，未覆盖现有镜头，请重新读取后处理");
            };
            let storyboardContext: ReturnType<typeof resolveStoryboardGenerationContext>;
            let importedOptions: { importedStoryboard: true; shotLimit: number; sourceColumns: ReturnType<typeof ltvStoryboardSourceColumns> } | undefined;
            try {
                storyboardContext = resolveStoryboardGenerationContext(nodesRef.current, { allowUnspecifiedStyle: Boolean(scriptNode.metadata?.ltvStoryboardSource) });
                if (scriptNode.metadata?.ltvStoryboardSource) {
                    const selectedCount = Number(scriptNode.metadata.storyboardShotCount);
                    const shotLimit = Math.max(12, scriptNode.metadata.storyboard?.rows.length || 0, Number.isSafeInteger(selectedCount) ? selectedCount : 0);
                    if (shotLimit > 512) throw new Error("当前分镜超过单任务容量，需要分段制作，原镜头不会被截断");
                    importedOptions = { importedStoryboard: true, shotLimit, sourceColumns: ltvStoryboardSourceColumns(scriptNode.metadata.ltvStoryboardSource.columns) };
                }
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "分镜上下文不完整");
                return;
            }
            const shotDuration = scriptNode.metadata?.storyboardShotDuration || "auto";
            const shotDurationSeconds = shotDuration === "auto" ? 0 : Number(shotDuration);
            const shotCount = scriptNode.metadata?.storyboardShotCount || "auto";
            const requestedShotCount = shotCount === "auto" ? 0 : Number(shotCount);
            let generationContext: ReturnType<typeof buildNodeGenerationContext>;
            try {
                generationContext = buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current, cleanedPrompt, []);
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "分镜参考输入不完整");
                return false;
            }
            const expandedPrompt = scriptNode.metadata?.ltvReferencePlan ? generationContext.prompt : expandStoryboardTextMentions(cleanedPrompt, buildNodeMentionReferences(scriptNode, nodesRef.current, connectionsRef.current));
            if (generationContext.referenceAudios.length) {
                message.warning("当前分镜文本协议尚未接入音频参考，请先转写为文本；尚未提交任务。");
                return false;
            }
            const generationConfig = buildGenerationConfig(effectiveConfig, scriptNode, "text");
            try {
                assertCanvasGenerationRequirements(generationConfig, scriptNode, "text", expandedPrompt);
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "分镜生成参数不完整");
                return false;
            }
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                navigateToSettings({ continueCreation: true });
                return;
            }
            storyboardRequests.current.add(nodeId);
            try {
                const skillExecution = await skillRuntime.prepare({
                    profile: "shortDrama",
                    prompt: expandedPrompt,
                    skills: addedSkills,
                });
                const preparedReferences = await prepareGenerationReferences({
                    config: generationConfig,
                    mode: "text",
                    referenceImages: generationContext.referenceImages,
                    referenceVideos: generationContext.referenceVideos,
                    referenceAudios: generationContext.referenceAudios,
                });
                assertCurrent();
                setNodes((current) =>
                    current.map((node) =>
                        node.id === nodeId ? { ...node, metadata: { ...node.metadata, composerContent: prompt, status: NODE_STATUS_LOADING, taskStage: "正在创建任务", taskProgress: 0, errorDetails: undefined, ...skillExecution.metadata } } : node,
                    ),
                );
                assertCurrent();
                // 输入框内容只是剧情，拆镜要求与镜头数、每镜时长都必须随契约一起发出去。
                const storyboardPrompt = withStoryboardOutputContract(skillExecution.prompt, { shotCount: requestedShotCount, shotDurationSeconds, importedStoryboard: Boolean(importedOptions) });
                const request = {
                    projectId,
                    type: "canvas_text",
                    operation: "storyboard",
                    prompt: storyboardPrompt,
                    model: generationConfig.model,
                    ...(logicalModelIDForConfig(generationConfig) ? { logicalModelId: logicalModelIDForConfig(generationConfig) } : {}),
                    input: {
                        ...importedOptions,
                        ...preparedReferences,
                        mode: "text",
                        prompt: storyboardPrompt,
                        canvasAssets: buildStoryboardAssetCatalog(nodesRef.current),
                        requirements: "输出可直接编辑并用于批量生成图片和视频的分镜表。",
                        projectStyle: storyboardContext.projectStyle,
                        characters: storyboardContext.characters,
                        shotDurationSeconds,
                        shotCount: requestedShotCount,
                        config: backendProviderConfig(generationConfig, "text"),
                        metadata: { nodeId, ...skillExecution.metadata },
                    },
                };
                const managed = Boolean(logicalModelIDForConfig(generationConfig) || resolveModelRequestConfig(generationConfig, generationConfig.model).channelId);
                const task = managed
                    ? await submitStoryboardTask(request, {
                          signal,
                          assertCurrent,
                          confirm: (submission) =>
                              new Promise<boolean>((resolve) => {
                                  const quote = submission.quote;
                                  const dialog = modal.confirm({
                                      title: "确认生成分镜",
                                      content: `使用 ${modelDisplayName(effectiveConfig, quote.model)} 拆分镜头。${quote.estimated ? "预计" : ""}平台费用 ${quote.amountMicrocredits / 1_000_000} 积分；自定义渠道费用由渠道另计，按用量计费以实际结算为准。${(scriptNode.metadata?.storyboard?.rows || []).length ? "本次将替换现有分镜行，原图片视频保留，镜头关联需要重新核对。" : "确认后生成可编辑的分镜表。"}`,
                                      okText: "确认生成",
                                      cancelText: "取消",
                                      centered: true,
                                      onOk: () => resolve(true),
                                      onCancel: () => resolve(false),
                                      afterClose: () => signal.removeEventListener("abort", cancel),
                                  });
                                  const cancel = () => {
                                      dialog.destroy();
                                      resolve(false);
                                  };
                                  signal.addEventListener("abort", cancel, { once: true });
                                  if (signal.aborted) cancel();
                              }),
                      })
                    : await (async () => {
                          const confirmed = await confirmGenerationSubmission(1, generationConfig.model, `专业拆镜${(scriptNode.metadata?.storyboard?.rows || []).length ? "（替换现有镜头，保留原媒体）" : ""}`);
                          if (!confirmed) return undefined;
                          assertCurrent();
                          return createGenerationTask(request);
                      })();
                if (!task) {
                    if (!signal.aborted && scope === getActiveUserScope())
                        setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: scriptNode.metadata?.status || NODE_STATUS_IDLE, taskStage: undefined } } : node)));
                    return false;
                }
                assertCurrent();
                setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...generationTaskMetadata(task), status: NODE_STATUS_LOADING } } : node)));
                const completed = await waitForGenerationTask(task.id, {
                    initialTask: task,
                    signal,
                    useTextEvents: true,
                    onTaskUpdate: (next) => {
                        if (!signal.aborted && scope === getActiveUserScope())
                            setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...generationTaskMetadata(next), status: NODE_STATUS_LOADING } } : node)));
                    },
                });
                const result = await restoreStoryboardTaskResult(completed, assertCurrent);
                assertCurrent();
                replaceScriptRows(nodeId, result.rows);
                setNodes((current) =>
                    current.map((node) =>
                        node.id === nodeId
                            ? {
                                  ...node,
                                  title: result.title || node.title,
                                  metadata: {
                                      ...node.metadata,
                                      status: NODE_STATUS_SUCCESS,
                                      errorDetails: undefined,
                                      ...generationTaskMetadata(completed),
                                      storyboard: {
                                          rows: result.rows,
                                          visibleColumns: cinematicStoryboardColumns(node.metadata?.storyboard?.visibleColumns),
                                          referenceNodeIds: node.metadata?.storyboard?.referenceNodeIds || [],
                                      },
                                  },
                              }
                            : node,
                    ),
                );
                message.success(`已生成 ${result.rows.length} 个镜头`);
                return true;
            } catch (error) {
                if (signal.aborted || scope !== getActiveUserScope()) return false;
                const details = generationErrorMessage(error);
                setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: details } } : node)));
                message.error(details);
                return false;
            } finally {
                if (signal.aborted && !lifetimeSignal.aborted && scope === getActiveUserScope())
                    setNodes((current) =>
                        current.map((node) => {
                            if (node.id !== nodeId) return node;
                            const active = node.metadata?.taskStatus === "queued" || node.metadata?.taskStatus === "running";
                            return { ...node, metadata: { ...node.metadata, status: active ? NODE_STATUS_LOADING : NODE_STATUS_IDLE, taskStage: active ? "已提交后台任务，等待结果" : undefined } };
                        }),
                    );
                storyboardRequests.current.delete(nodeId);
            }
        },
        [addedSkills, confirmGenerationSubmission, connectionsRef, effectiveConfig, isAiConfigReady, message, modal, nodesRef, projectId, replaceScriptRows, setNodes],
    );

    const ensureScriptImageNodes = useCallback(
        (nodeId: string, rowIds: string[]) => {
            const scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            const rows = (scriptNode?.metadata?.storyboard?.rows || []).filter((row) => rowIds.includes(row.id));
            if (!scriptNode || !rows.length) return [];
            const defaults = scriptNode.metadata?.storyboardImageDefaults;
            if (scriptNode.metadata?.ltvStoryboardSource && !defaults && rows.some((row) => !storyboardRowImageOutputs(nodeId, row, nodesRef.current, connectionsRef.current).length)) {
                message.warning("原分镜图像配置还没有完整映射，不能用全局默认参数替代。");
                return [];
            }
            const imageSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const startX = scriptNode.position.x + scriptNode.width + 120;
            const nextNodes = [...nodesRef.current];
            let nextConnections = [...connectionsRef.current];
            const targets: Array<{ row: StoryboardRow; node: CanvasNodeData; prompt: string }> = [];
            const activeNodeIds = activeGenerationBatchNodeIds(scriptNode, "storyboard_image");
            try {
                rows.forEach((row, index) => {
                    const prompt = storyboardRowPrompt(row, "image");
                    const outputs = storyboardRowImageOutputs(nodeId, row, nextNodes, nextConnections);
                    const existingOutputs: Array<CanvasNodeData | undefined> = outputs.length ? outputs : [undefined];
                    existingOutputs.forEach((existing) => {
                        // A sibling output may still own an in-flight task while this row is edited or retried.
                        if (existing && isStoryboardImageActive(existing, activeNodeIds)) {
                            targets.push({ row, node: existing, prompt });
                            return;
                        }
                        const existingMetadata = existing?.metadata?.content ? existing.metadata : resetGenerationTaskMetadata(existing?.metadata);
                        const referenceIds = storyboardRowReferenceNodeIds(scriptNode, row, nextNodes, nextConnections, false, existing?.id);
                        const composerContent = storyboardComposerContent(prompt, referenceIds, nextNodes);
                        const defaultReferencePlan = !existing && scriptNode.metadata?.ltvStoryboardSource ? bindLtvCurrentReferences(prompt, referenceIds, nextNodes) : undefined;
                        const imageNode = existing
                            ? {
                                  ...existing,
                                  metadata: {
                                      ...existingMetadata,
                                      ...synchronizeStoryboardReferencePlan(existingMetadata, prompt, referenceIds, nextNodes),
                                      prompt,
                                      composerContent,
                                      ...storyboardPromptTemplateMetadata(row, "image"),
                                      workflowKind: "shot" as const,
                                      workflowTitle: `镜头 ${row.shotNumber} 分镜图`,
                                      shotIndex: row.shotNumber,
                                  },
                              }
                            : createCanvasNode(
                                  CanvasNodeType.Image,
                                  { x: startX + imageSpec.width / 2, y: scriptNode.position.y + index * (imageSpec.height + 36) + imageSpec.height / 2 },
                                  {
                                      ...defaults,
                                      ltvReferencePlan: defaultReferencePlan,
                                      storyboardManagedReferenceNodeIds: defaultReferencePlan ? referenceIds : undefined,
                                      generationMode: "image",
                                      prompt,
                                      composerContent,
                                      ...storyboardPromptTemplateMetadata(row, "image"),
                                      workflowKind: "shot",
                                      workflowTitle: `镜头 ${row.shotNumber} 分镜图`,
                                      shotIndex: row.shotNumber,
                                      status: NODE_STATUS_IDLE,
                                  },
                              );
                        if (!existing) {
                            imageNode.title = `镜头 ${row.shotNumber} · 分镜图`;
                            nextNodes.push(imageNode);
                        } else {
                            const existingIndex = nextNodes.findIndex((node) => node.id === existing.id);
                            nextNodes[existingIndex] = imageNode;
                        }
                        nextConnections = reconcileStoryboardTargetConnections(nextConnections, scriptNode, row, imageNode.id, referenceIds);
                        targets.push({ row, node: imageNode, prompt });
                    });
                });
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "分镜图引用不完整，未创建节点。");
                return [];
            }
            nextConnections = orderLtvReferenceConnections(nextNodes, nextConnections);
            const imageNodeByRowId = new Map<string, string>();
            for (const target of targets) {
                if (!imageNodeByRowId.has(target.row.id)) imageNodeByRowId.set(target.row.id, target.node.id);
            }
            const scriptIndex = nextNodes.findIndex((node) => node.id === scriptNode.id);
            nextNodes[scriptIndex] = {
                ...scriptNode,
                metadata: {
                    ...scriptNode.metadata,
                    storyboard: {
                        rows: (scriptNode.metadata?.storyboard?.rows || []).map((row) => ({ ...row, imageNodeId: imageNodeByRowId.get(row.id) || row.imageNodeId })),
                        visibleColumns: scriptNode.metadata?.storyboard?.visibleColumns || ["shotNumber", "durationSeconds", "videoMotionPrompt", "dialogue", "assets"],
                        referenceNodeIds: scriptNode.metadata?.storyboard?.referenceNodeIds || [],
                    },
                },
            };
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            return targets;
        },
        [connectionsRef, nodesRef, setConnections, setNodes, message],
    );

    const createScriptImageNodes = useCallback(
        (nodeId: string, rowIds?: string[]) => {
            const scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            const rows = scriptNode?.metadata?.storyboard?.rows || [];
            const selectedRows = rowIds?.length ? rows.filter((row) => rowIds.includes(row.id)) : rows;
            if (!scriptNode || !selectedRows.length) return;
            const missing = selectedRows.filter((row) => !(row.imageGenerationPrompt || row.plotDescription).trim());
            if (missing.length) return message.warning(`有 ${missing.length} 个镜头缺少画面描述或图片提示词`);
            const createdCount = selectedRows.filter((row) => !storyboardRowImageOutputs(nodeId, row, nodesRef.current, connectionsRef.current).length).length;
            if (
                !ensureScriptImageNodes(
                    nodeId,
                    selectedRows.map((row) => row.id),
                ).length
            )
                return;
            message.success(createdCount ? `已创建 ${createdCount} 个图片节点` : "已同步现有图片节点的提示词");
        },
        [connectionsRef, ensureScriptImageNodes, message, nodesRef],
    );

    const generateScriptImages = useCallback(
        async (nodeId: string, rowIds: string[]) => {
            const scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            const rows = (scriptNode?.metadata?.storyboard?.rows || []).filter((row) => rowIds.includes(row.id));
            if (!scriptNode || !rows.length) return;
            const missing = rows.filter((row) => !(row.imageGenerationPrompt || row.plotDescription).trim());
            if (missing.length) return message.warning(`有 ${missing.length} 个镜头缺少画面描述或图片提示词`);
            const activeNodeIds = activeGenerationBatchNodeIds(scriptNode, "storyboard_image");
            const isPending = (node: CanvasNodeData) => !node.metadata?.content && !isStoryboardImageActive(node, activeNodeIds);
            const targetRows = rows.filter((row) => {
                const outputs = storyboardRowImageOutputs(nodeId, row, nodesRef.current, connectionsRef.current);
                return !outputs.length || outputs.some(isPending);
            });
            if (!targetRows.length) return message.info("所选分镜图已生成或正在生成");
            const targets = ensureScriptImageNodes(
                nodeId,
                targetRows.map((row) => row.id),
            ).filter((target) => isPending(target.node));
            if (
                !(await confirmStoryboardTargets(
                    targets.map((target) => target.node),
                    "image",
                ))
            )
                return;
            if (
                enqueueGenerationBatch(
                    nodeId,
                    "storyboard_image",
                    targets.map((target) => ({ rowId: target.row.id, nodeId: target.node.id })),
                )
            )
                message.success("分镜图已加入生成队列");
        },
        [connectionsRef, enqueueGenerationBatch, ensureScriptImageNodes, confirmStoryboardTargets, message, nodesRef],
    );

    const createScriptVideoNodes = useCallback(
        (nodeId: string, silent = false, rowIds?: string[]) => {
            const scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            const allRows = scriptNode?.metadata?.storyboard?.rows || [];
            const rows = rowIds?.length ? allRows.filter((row) => rowIds.includes(row.id)) : allRows;
            if (!scriptNode || !rows.length) return false;
            const videoSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
            const startLeft = scriptNode.position.x + scriptNode.width + 120;
            const videoModel = buildGenerationConfig(effectiveConfig, undefined, "video").model;
            const nextNodes = [...nodesRef.current];
            let nextConnections = [...connectionsRef.current];
            const videoNodeByRowId = new Map<string, string>();
            let createdCount = 0;
            try {
                rows.forEach((row, index) => {
                    const prompt = storyboardRowPrompt(row, "video");
                    const existingIndex = row.videoNodeId ? nextNodes.findIndex((node) => node.id === row.videoNodeId && node.type === CanvasNodeType.Video) : -1;
                    const existing = existingIndex >= 0 ? nextNodes[existingIndex] : undefined;
                    const referenceIds = storyboardRowReferenceNodeIds(scriptNode, row, nextNodes, nextConnections, false, existing?.id, "video");
                    const composerContent = storyboardComposerContent(prompt, referenceIds, nextNodes);
                    if (existingIndex >= 0) {
                        const existing = nextNodes[existingIndex];
                        const existingMetadata = existing.metadata?.content ? existing.metadata : resetGenerationTaskMetadata(existing.metadata);
                        nextNodes[existingIndex] = syncStoryboardVideoNode(existing, {
                                ...existingMetadata,
                                ...synchronizeStoryboardReferencePlan(existingMetadata, prompt, referenceIds, nextNodes),
                                prompt,
                                composerContent,
                                model: existingMetadata.model ?? videoModel,
                                ...storyboardPromptTemplateMetadata(row, "video"),
                                seconds: existingMetadata.seconds ?? String(row.durationSeconds),
                                shotIndex: row.shotNumber,
                                workflowKind: "shot",
                                workflowTitle: `镜头 ${row.shotNumber} 视频`,
                                generationMode: "video",
                                videoEditOperation: existing.metadata?.videoEditOperation || "text_to_video",
                            });
                        nextConnections = reconcileStoryboardTargetConnections(nextConnections, scriptNode, row, existing.id, referenceIds);
                        videoNodeByRowId.set(row.id, existing.id);
                        return;
                    }
                    const videoNode = createCanvasNode(
                        CanvasNodeType.Video,
                        { x: startLeft + videoSpec.width / 2, y: scriptNode.position.y + index * (videoSpec.height + 36) + videoSpec.height / 2 },
                        {
                            prompt,
                            composerContent,
                            model: videoModel,
                            ...storyboardPromptTemplateMetadata(row, "video"),
                            workflowKind: "shot",
                            workflowTitle: `镜头 ${row.shotNumber} 视频`,
                            shotIndex: row.shotNumber,
                            generationMode: "video",
                            videoEditOperation: "text_to_video",
                            status: NODE_STATUS_IDLE,
                            seconds: String(row.durationSeconds),
                        },
                    );
                    videoNode.title = `镜头 ${row.shotNumber} · 视频`;
                    nextNodes.push(videoNode);
                    nextConnections = reconcileStoryboardTargetConnections(nextConnections, scriptNode, row, videoNode.id, referenceIds);
                    videoNodeByRowId.set(row.id, videoNode.id);
                    createdCount += 1;
                });
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "视频引用不完整，未创建或提交节点");
                return false;
            }
            const scriptIndex = nextNodes.findIndex((node) => node.id === scriptNode.id);
            nextNodes[scriptIndex] = {
                ...scriptNode,
                metadata: {
                    ...scriptNode.metadata,
                    storyboard: {
                        rows: allRows.map((row) => ({ ...row, videoNodeId: videoNodeByRowId.get(row.id) || row.videoNodeId })),
                        visibleColumns: scriptNode.metadata?.storyboard?.visibleColumns || ["shotNumber", "durationSeconds", "videoMotionPrompt", "dialogue", "assets"],
                        referenceNodeIds: scriptNode.metadata?.storyboard?.referenceNodeIds || [],
                    },
                },
            };
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            if (!silent) message.success(createdCount ? `已创建 ${createdCount} 个视频节点` : "已同步现有视频节点的提示词");
            return true;
        },
        [connectionsRef, effectiveConfig, message, nodesRef, setConnections, setNodes],
    );

    const createAndGenerateScriptVideos = useCallback(
        async (nodeId: string, rowIds?: string[]) => {
            let scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            const allRows = scriptNode?.metadata?.storyboard?.rows || [];
            const rows = rowIds?.length ? allRows.filter((row) => rowIds.includes(row.id)) : allRows;
            const describedRows = rows.filter((row) => Boolean(storyboardRowVideoPrompt(row)));
            const activeNodeIds = scriptNode ? activeGenerationBatchNodeIds(scriptNode, "storyboard_video") : new Set<string>();
            const targetRows = describedRows.filter((row) => {
                const videoNode = row.videoNodeId ? nodesRef.current.find((node) => node.id === row.videoNodeId && node.type === CanvasNodeType.Video) : undefined;
                return !videoNode?.metadata?.content && (!videoNode || !activeNodeIds.has(videoNode.id));
            });
            if (!targetRows.length) {
                if (describedRows.some((row) => row.videoNodeId && nodesRef.current.some((node) => node.id === row.videoNodeId && Boolean(node.metadata?.content)))) message.info("镜头视频已存在");
                else message.warning("请先补充镜头画面描述");
                return;
            }
            if (
                !createScriptVideoNodes(
                    nodeId,
                    true,
                    targetRows.map((row) => row.id),
                )
            )
                return;
            scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            const targetRowIds = new Set(targetRows.map((row) => row.id));
            const targets = rows.flatMap((row) => {
                if (!targetRowIds.has(row.id)) return [];
                const currentRow = scriptNode?.metadata?.storyboard?.rows.find((item) => item.id === row.id) || row;
                const videoNode = currentRow.videoNodeId ? nodesRef.current.find((node) => node.id === currentRow.videoNodeId && node.type === CanvasNodeType.Video) : undefined;
                if (!videoNode || videoNode.metadata?.content) return [];
                const prompt = storyboardRowPrompt(currentRow, "video");
                if (!prompt) return [];
                return [{ row: currentRow, videoNode, prompt }];
            });
            const targetById = new Map(targets.map((target) => [target.videoNode.id, target]));
            const nextNodes = nodesRef.current.map((node) => {
                const target = targetById.get(node.id);
                return target
                    ? syncStoryboardVideoNode(node, {
                          ...node.metadata,
                          prompt: target.prompt,
                          composerContent: target.videoNode.metadata?.composerContent || target.prompt,
                          model: node.metadata?.model ?? target.videoNode.metadata?.model,
                          ...storyboardPromptTemplateMetadata(target.row, "video"),
                          generationMode: "video" as const,
                          videoEditOperation: "text_to_video" as const,
                          videoStartFrameNodeId: undefined,
                      })
                    : node;
            });
            const nextConnections = connectionsRef.current;
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set(targets.map((target) => target.videoNode.id)));
            if (
                !(await confirmStoryboardTargets(
                    nextNodes.filter((node) => targetById.has(node.id)),
                    "video",
                ))
            )
                return;
            if (
                enqueueGenerationBatch(
                    nodeId,
                    "storyboard_video",
                    targets.map((target) => ({ rowId: target.row.id, nodeId: target.videoNode.id })),
                )
            )
                message.success("镜头视频已加入生成队列");
        },
        [connectionsRef, confirmStoryboardTargets, createScriptVideoNodes, enqueueGenerationBatch, message, nodesRef, setConnections, setNodes, setSelectedNodeIds],
    );

    const createScriptActionBoards = useCallback(
        async (nodeId: string) => {
            const scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            const rows = scriptNode?.metadata?.storyboard?.rows || [];
            if (!scriptNode || !rows.length) return;
            const imageModel = effectiveConfig.imageModel || effectiveConfig.model;
            if (!isAiConfigReady(effectiveConfig, imageModel)) {
                navigateToSettings({ continueCreation: true });
                return;
            }
            const actionBoardRows = rows.filter(
                (row) => !nodesRef.current.some((node) => node.type === CanvasNodeType.Image && node.metadata?.workflowKind === "action_board" && node.metadata.shotIndex === row.shotNumber && Boolean(node.metadata.content)),
            );
            if (!actionBoardRows.length) {
                message.info("动作拆分板已存在");
                return;
            }
            if (!(await confirmGenerationSubmission(actionBoardRows.length, imageModel, "动作板生成"))) return;
            const imageSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const startX = scriptNode.position.x + scriptNode.width + 120;
            const nextNodes = [...nodesRef.current];
            const nextConnections = [...connectionsRef.current];
            const targets: Array<{ row: StoryboardRow; node: CanvasNodeData; prompt: string }> = [];
            actionBoardRows.forEach((row, index) => {
                const prompt = [
                    "生成一张电影动作拆分 12 宫格参考图，严格 3 列 4 行，12 个格子清晰分隔，保持同一角色、服装、场景和光线连续。",
                    `镜头 ${row.shotNumber}：${row.plotDescription || row.videoMotionPrompt || "根据镜头剧情补全动作"}`,
                    row.characters.length ? `角色：${row.characters.map((item) => item.characterName).join("、")}` : "",
                    "按时间顺序展示动作起势、推进、转折、落点和结束姿态，不要添加文字、边框标题或额外画面。",
                ]
                    .filter(Boolean)
                    .join("\n");
                const existingIndex = nextNodes.findIndex((node) => node.type === CanvasNodeType.Image && node.metadata?.workflowKind === "action_board" && node.metadata.shotIndex === row.shotNumber);
                if (existingIndex >= 0 && nextNodes[existingIndex].metadata?.content) return;
                const imageNode =
                    existingIndex >= 0
                        ? { ...nextNodes[existingIndex], metadata: { ...resetGenerationTaskMetadata(nextNodes[existingIndex].metadata), prompt } }
                        : createCanvasNode(
                              CanvasNodeType.Image,
                              { x: startX + imageSpec.width / 2, y: scriptNode.position.y + index * (imageSpec.height + 36) + imageSpec.height / 2 },
                              { prompt, workflowKind: "action_board", workflowTitle: `镜头 ${row.shotNumber} 动作板`, shotIndex: row.shotNumber, actionBoardRows: 4, actionBoardColumns: 3, status: NODE_STATUS_IDLE },
                          );
                imageNode.title = `镜头 ${row.shotNumber} · 动作板`;
                if (existingIndex >= 0) nextNodes[existingIndex] = imageNode;
                else {
                    nextNodes.push(imageNode);
                    nextConnections.push({ id: nanoid(), fromNodeId: scriptNode.id, toNodeId: imageNode.id, fromHandleId: `row:${row.id}` });
                }
                targets.push({ row, node: imageNode, prompt });
            });
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            if (
                enqueueGenerationBatch(
                    nodeId,
                    "action_board",
                    targets.map((target) => ({ rowId: target.row.id, nodeId: target.node.id })),
                )
            )
                message.success("动作拆分板已加入生成队列");
        },
        [connectionsRef, confirmGenerationSubmission, effectiveConfig, enqueueGenerationBatch, isAiConfigReady, message, nodesRef, setConnections, setNodes],
    );

    const generateScriptVideos = useCallback(
        async (nodeId: string, rowIds: string[]) => {
            let scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            const rows = (scriptNode?.metadata?.storyboard?.rows || []).filter((row) => rowIds.includes(row.id));
            if (!scriptNode || !rows.length) return;
            const readyRows = rows.filter((row) => row.imageNodeId && nodesRef.current.some((node) => node.id === row.imageNodeId && node.type === CanvasNodeType.Image && node.metadata?.content));
            if (!readyRows.length) return message.warning("请先生成并检查选中镜头的首帧");
            if (readyRows.length !== rows.length) return message.warning(`${rows.length - readyRows.length} 个选中镜头还没有可用首帧，请全部生成并检查后再确认`);
            const videoModel = effectiveConfig.videoModel || effectiveConfig.model;
            const activeNodeIds = activeGenerationBatchNodeIds(scriptNode, "storyboard_video");
            const targetRows = readyRows.filter((row) => {
                const videoNode = row.videoNodeId ? nodesRef.current.find((node) => node.id === row.videoNodeId && node.type === CanvasNodeType.Video) : undefined;
                return !videoNode?.metadata?.content && (!videoNode || !activeNodeIds.has(videoNode.id));
            });
            if (!targetRows.length) return message.info("所选镜头视频已生成或正在生成");
            createScriptVideoNodes(
                nodeId,
                true,
                targetRows.map((row) => row.id),
            );
            scriptNode = nodesRef.current.find((node) => node.id === nodeId && node.type === CanvasNodeType.Script);
            if (!scriptNode) return;
            const currentScriptNode = scriptNode;
            const videoSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
            const currentRows = targetRows.map((row) => currentScriptNode.metadata?.storyboard?.rows.find((item) => item.id === row.id) || row);
            const startX = Math.max(...currentRows.map((row) => nodesRef.current.find((node) => node.id === row.imageNodeId)?.position.x || currentScriptNode.position.x + currentScriptNode.width)) + videoSpec.width + 120;
            const nextNodes = [...nodesRef.current];
            let nextConnections = [...connectionsRef.current];
            const targets: Array<{ row: StoryboardRow; node: CanvasNodeData; prompt: string }> = [];
            try {
                currentRows.forEach((row, index) => {
                    const prompt = storyboardRowPrompt(row, "video");
                    const existing = row.videoNodeId ? nextNodes.find((node) => node.id === row.videoNodeId && node.type === CanvasNodeType.Video) : undefined;
                    const referenceIds = storyboardRowReferenceNodeIds(currentScriptNode, row, nextNodes, nextConnections, true, existing?.id);
                    const composerContent = storyboardComposerContent(prompt, referenceIds, nextNodes);
                    const existingMetadata = existing?.metadata?.content ? existing.metadata : resetGenerationTaskMetadata(existing?.metadata);
                    // This path is the explicit "confirm first frame" command. Preserve source slot
                    // order and add the chosen frame to the executable reference plan as well as the UI.
                    const referencePatch = synchronizeStoryboardReferencePlan(existingMetadata, prompt, referenceIds, nextNodes);
                    const videoNode = existing
                        ? syncStoryboardVideoNode(existing, {
                                  ...existingMetadata,
                                  ...referencePatch,
                                  prompt,
                                  composerContent,
                                  model: existingMetadata.model ?? videoModel,
                                  ...storyboardPromptTemplateMetadata(row, "video"),
                                  workflowKind: "shot" as const,
                                  workflowTitle: `镜头 ${row.shotNumber} 视频`,
                                  shotIndex: row.shotNumber,
                                  generationMode: "video" as const,
                                  videoEditOperation: "image_to_video" as const,
                                  videoStartFrameNodeId: row.imageNodeId,
                                  seconds: existingMetadata.seconds ?? String(row.durationSeconds),
                              })
                        : createCanvasNode(
                              CanvasNodeType.Video,
                              { x: startX, y: currentScriptNode.position.y + index * (videoSpec.height + 36) + videoSpec.height / 2 },
                              {
                                  prompt,
                                  composerContent,
                                  model: videoModel,
                                  ...storyboardPromptTemplateMetadata(row, "video"),
                                  workflowKind: "shot",
                                  workflowTitle: `镜头 ${row.shotNumber} 视频`,
                                  shotIndex: row.shotNumber,
                                  generationMode: "video",
                                  videoEditOperation: "image_to_video",
                                  videoStartFrameNodeId: row.imageNodeId,
                                  status: NODE_STATUS_IDLE,
                                  seconds: String(row.durationSeconds),
                              },
                          );
                    if (!existing) {
                        videoNode.title = `镜头 ${row.shotNumber} · 视频`;
                        nextNodes.push(videoNode);
                    } else {
                        const existingIndex = nextNodes.findIndex((node) => node.id === existing.id);
                        nextNodes[existingIndex] = videoNode;
                    }
                    nextConnections = reconcileStoryboardTargetConnections(nextConnections, currentScriptNode, row, videoNode.id, referenceIds);
                    targets.push({ row, node: videoNode, prompt });
                });
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "首帧引用未准备好，未提交任务。");
                return;
            }
            nextConnections = orderLtvReferenceConnections(nextNodes, nextConnections);
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            if (
                !(await confirmStoryboardTargets(
                    targets.map((target) => target.node),
                    "video",
                ))
            )
                return;
            if (
                enqueueGenerationBatch(
                    nodeId,
                    "storyboard_video",
                    targets.map((target) => ({ rowId: target.row.id, nodeId: target.node.id })),
                )
            )
                message.success("镜头视频已加入生成队列");
        },
        [connectionsRef, confirmStoryboardTargets, createScriptVideoNodes, effectiveConfig, enqueueGenerationBatch, message, nodesRef, setConnections, setNodes],
    );

    return {
        addScriptRow,
        createAndGenerateScriptVideos,
        createScriptActionBoards,
        createScriptImageNodes,
        createScriptVideoNodes,
        generateScriptImages,
        generateScriptRows,
        generateScriptVideos,
        removeScriptRow,
        replaceScriptRows,
        updateScriptRow,
        updateScriptRows,
    };
}

function invalidateEditedPromptVariables(previous: StoryboardRow | undefined, next: StoryboardRow) {
    if (!previous) return next;
    return {
        ...next,
        imagePromptTemplateVariables: next.imageGenerationPrompt === previous.imageGenerationPrompt ? next.imagePromptTemplateVariables : undefined,
        videoPromptTemplateVariables: next.videoMotionPrompt === previous.videoMotionPrompt && next.dialogue === previous.dialogue && next.audioEffects === previous.audioEffects ? next.videoPromptTemplateVariables : undefined,
    };
}

function isStoryboardImageActive(node: CanvasNodeData, activeNodeIds: ReadonlySet<string>) {
    return activeNodeIds.has(node.id) || node.metadata?.status === NODE_STATUS_LOADING || node.metadata?.taskStatus === "queued" || node.metadata?.taskStatus === "running";
}

function activeGenerationBatchNodeIds(node: CanvasNodeData, mode: CanvasGenerationBatchMode) {
    return new Set(
        (node.metadata?.generationBatches || [])
            .filter((batch) => batch.mode === mode)
            .flatMap((batch) => batch.items.filter((item) => item.status === "waiting" || item.status === "submitting" || item.status === "queued" || item.status === "running").map((item) => item.nodeId)),
    );
}
