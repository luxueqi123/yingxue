import { Coins, FileText, Image as ImageIcon, Video, type LucideIcon } from "lucide-react";

import { CONTENT_MODERATION_ERROR_CODE, generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import { taskBillingDisplay, taskBillingLabel } from "@/lib/generation-task-billing";
import { generationTaskStatusLabel, isGenerationTaskSubmissionUncertain, mediaDeliverySummary } from "@/lib/generation-task-display";
import { type GenerationTask, type TaskStatus } from "@/services/api/task-center";
import { type InterfaceTranslate } from "@/lib/interface-locale";
import { modelDisplayName, type AiConfig } from "@/stores/use-config-store";
import { RelativeTime } from "@/components/ui/product/relative-time";
import { translate } from "@/i18n";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function getTaskCanvasContext(task: GenerationTask, canvasById: Map<string, { title: string; projectId?: string }>, projectNameById: Map<string, string>, t?: InterfaceTranslate) {
    if (!task.projectId) return { canvasName: t ? t("tasksUi.canvasUnbound") : translate("library.tasks.shared.unboundCanvas"), projectName: "" };
    const canvas = canvasById.get(task.projectId);
    if (canvas) return { canvasName: canvas.title || (t ? t("canvasHistoryUntitled") : translate("library.tasks.shared.untitledCanvas")), projectName: canvas.projectId ? projectNameById.get(canvas.projectId) || "" : "" };
    const projectName = projectNameById.get(task.projectId);
    return projectName
        ? { canvasName: t ? t("tasksUi.canvasProjectLevel") : translate("library.tasks.shared.projectTask"), projectName }
        : { canvasName: t ? t("tasksUi.canvasRemoved") : translate("library.tasks.shared.canvasRemoved"), projectName: "" };
}

export function isTaskFailed(task: GenerationTask) {
    return task.status === "failed" || task.status === "cancelled";
}

export function taskAttentionReason(task: GenerationTask, t?: InterfaceTranslate) {
    if (task.status === "cancelled") return providerCancelStatusLabel(task, t);
    if (task.mediaStage) return mediaDeliverySummary(task.status, task.mediaStage, t);
    if (task.errorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(task.error)) return t ? t("tasksUi.contentModerationReason") : "内容审核未通过，请修改输入后新建任务";
    if (task.error) return generationErrorMessage(task.error);
    return task.stage || (t ? t("tasksUi.genericFailureReason") : "生成失败，打开详情查看原因");
}

export function providerCancelStatusLabel(task: GenerationTask, t?: InterfaceTranslate) {
    if (task.providerCancelStatus === "requested") return t ? t("tasksUi.cancelRequestedWaitingConfirmation") : "已请求上游取消，正在等待确认";
    if (task.providerCancelStatus === "confirmed") return t ? t("tasksUi.cancelConfirmedCreditsRefunded") : "上游已确认取消，积分已退回";
    if (task.providerCancelStatus === "uncertain") {
        if (task.billing?.status === "settled") return t ? t("tasksUi.cancelFailedSettled") : "上游未能取消，费用已结算";
        if (task.billing?.status === "refunded") return t ? t("tasksUi.cancelUncertainRefunded") : "上游取消结果未确认，积分已退回";
        return task.providerCancelError || (t ? t("tasksUi.cancelUnableConfirmPendingReview") : "上游无法确认取消，费用待核对");
    }
    return task.billing?.status === "refunded"
        ? t ? t("tasksUi.cancelledBeforeUpstreamCreditsRefunded") : "任务在调用上游前取消，积分已退回"
        : t ? t("tasksUi.cancelledCanResubmit") : "任务已取消，可按原输入重新提交";
}

export function isTaskActive(task: GenerationTask) {
    return task.status === "queued" || task.status === "running";
}

/** 内容审核失败的任务按原输入重试仍会失败，界面上不提供自动重试。 */
export function isTaskRetryBlocked(task: GenerationTask) {
    return isGenerationTaskSubmissionUncertain(task) || task.errorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(task.error);
}

export type TaskTone = "running" | "queued" | "success" | "failed" | "cancelled";

export function taskTone(task: GenerationTask): TaskTone {
    if (task.status === "running") return "running";
    if (task.status === "queued") return "queued";
    if (task.status === "succeeded") return "success";
    if (task.status === "cancelled") return "cancelled";
    return "failed";
}

/** 状态胶囊：圆点 + 文案，颜色由 data-tone 决定，运行中圆点会呼吸。 */
export function TaskStatusPill({ task, className = "" }: { task: GenerationTask; className?: string }) {
    const { t } = useInterfaceTranslation();
    return (
        <span className={`task-center-status ${className}`} data-tone={taskTone(task)}>
            <i aria-hidden="true" />
            {generationTaskStatusLabel(task, t)}
        </span>
    );
}

export function taskMediaKind(task: GenerationTask): "text" | "image" | "video" {
    const value = `${task.type} ${task.operation || ""}`.toLowerCase();
    if (value.includes("video") || value.includes("视频")) return "video";
    if (value.includes("image") || value.includes("图片") || value.includes("画面")) return "image";
    return "text";
}

export function taskKindIcon(task: GenerationTask): LucideIcon {
    const kind = taskMediaKind(task);
    return kind === "video" ? Video : kind === "image" ? ImageIcon : FileText;
}

export function TaskDate({ value }: { value?: string }) {
    if (!value || !Number.isFinite(Date.parse(value))) return <span className="task-center-muted">-</span>;
    return <RelativeTime value={value} />;
}

export function TaskBilling({ billing }: { billing?: GenerationTask["billing"] }) {
    if (!billing) return <span className="task-center-muted">-</span>;
    const display = taskBillingDisplay(billing);
    return (
        <span className="task-center-billing" data-tone={display.tone} title={taskBillingLabel(billing)}>
            <Coins aria-hidden="true" />
            <span>
                <strong>{display.amount}</strong>
                <small>{display.refundNote ? `${display.note} · ${display.refundNote}` : display.note}</small>
            </span>
        </span>
    );
}

export function formatModelName(config: AiConfig, task: GenerationTask, t?: InterfaceTranslate) {
    const raw = (task.model || task.provider || "").trim();
    const model = raw.includes("::") ? raw.split("::").pop()?.trim() || raw : raw;

    // 工作流名称是任务快照，不属于模型渠道，不能交给模型展示名解析器再次映射成“系统模型”。
    if (task.provider === "runninghub") return raw || (t ? t("tasksUi.workflow") : translate("library.tasks.model.workflow"));
    if (!model) return t ? t("tasksUi.workflow") : translate("library.tasks.model.workflow");
    if (model === "version-router") return t ? t("tasksUi.versionComparisonWorkflow") : translate("library.tasks.model.versionRouter");
    if (model === "workflow-router") return t ? t("tasksUi.workflowRouter") : translate("library.tasks.model.workflowRouter");
    if (model === "internal-agent") return t ? t("tasksUi.builtInWorkflow") : translate("library.tasks.model.internalAgent");
    if (model === "openai-compatible") return t ? t("tasksUi.openAiCompatibleApi") : translate("library.tasks.model.openaiCompatible");
    return modelDisplayName(config, raw);
}
