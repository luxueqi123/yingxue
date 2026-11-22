import { expect, test } from "bun:test";
import { interfaceLocales, interfaceTranslator, loadInterfaceLocale } from "@/lib/interface-locale";
import { canCancelGenerationTask, formatTaskKind, generationTaskStageLabel, generationTaskStatusLabel, mediaDeliverySummary, operationOptionsForLocale } from "@/lib/generation-task-display";
import type { GenerationTask } from "@/services/api/task-center";

const task: GenerationTask = { id: "display-only", type: "canvas_video", operation: "image_to_video", status: "succeeded", attempts: 1, createdAt: "", updatedAt: "" };

test("task output types and operation choices use the selected language in every shipped locale", async () => {
    for (const locale of interfaceLocales) {
        await loadInterfaceLocale(locale);
        const t = interfaceTranslator(locale);
        const labels = ["canvas_image", "canvas_video", "canvas_audio", "canvas_text"].map(type => formatTaskKind({ ...task, type, operation: undefined }, t));
        expect(labels.every(value => value && !value.includes("tasksUi."))).toBe(true);
        if (!locale.startsWith("zh")) {
            for (const status of ["queued", "running", "succeeded", "failed", "cancelled"] as const) {
                expect(generationTaskStatusLabel({ ...task, status }, t), `${locale}: ${status}`).not.toBe(generationTaskStatusLabel({ ...task, status }));
            }
            expect(generationTaskStatusLabel({ ...task, stage: "submission_unknown" }, t), `${locale}: submission_unknown`).not.toBe("提交结果待确认");
            for (const stage of ["generating", "作品已生成，正在保存", "作品已生成，保存遇到问题，正在自动恢复", "作品已生成，等待保存"]) {
                const target = { ...task, status: "running" as const, stage, ...(stage !== "generating" ? { mediaStage: "upload" as const } : {}) };
                expect(generationTaskStageLabel(target, t), `${locale}: ${stage}`).not.toBe(generationTaskStageLabel(target));
            }
            expect(mediaDeliverySummary("failed", "download", t), `${locale}: delivery`).not.toBe(mediaDeliverySummary("failed", "download"));
            for (const [index, type] of ["canvas_image", "canvas_video", "canvas_audio", "canvas_text"].entries()) {
                expect(labels[index], `${locale}: ${type}`).not.toBe(formatTaskKind({ ...task, type, operation: undefined }));
            }
            for (const item of operationOptionsForLocale(t)) {
                expect(item.label, `${locale}: ${item.value}`).not.toMatch(/文生视频|图生视频|全模态参考|视频续写|视频局部修改|元素替换|镜头\/运镜调整|风格迁移|参考音频生成视频|结果版本对比/);
            }
        }
    }
});

test("translated task display preserves identifiers and the billing-sensitive cancellation boundary", async () => {
    await loadInterfaceLocale("en-US");
    const t = interfaceTranslator("en-US");
    expect(formatTaskKind(task, t)).toBe("Canvas video · Image to video");
    expect(generationTaskStatusLabel(task, t)).toBe("Completed");
    expect(generationTaskStatusLabel({ ...task, status: "running", stage: "submission_unknown" }, t)).toBe("Submission result awaiting confirmation");
    expect(canCancelGenerationTask({ ...task, status: "running", stage: "submission_unknown" })).toBe(false);
    expect(task.operation).toBe("image_to_video");
});

test("global check-in and Agent launcher copy follows all shipped languages without rewriting names", async () => {
    const name = "雪山 {name} <studio>";
    for (const locale of interfaceLocales) {
        await loadInterfaceLocale(locale);
        const t = interfaceTranslator(locale);
        expect(t("agentChromeOpenNamedAgent", { name })).toContain(name);
        expect(t("agentChromeExpandNamedAvatar", { name })).toContain(name);
        expect(t("agentChromeCollapseNamedAvatar", { name })).toContain(name);
        expect(t("layoutExtrasUi.checkinTitle", { brand: name })).toContain(name);
        if (!locale.startsWith("zh")) {
            for (const key of ["agentChromeOpenNamedAgent", "agentChromeExpandAvatar", "agentChromeCollapseAvatar", "agentChromeLauncherOpen", "agentChromeLauncherApprovalPending", "layoutExtrasUi.checkinTitle", "layoutExtrasUi.checkinSummary", "layoutExtrasUi.checkinSuccess", "layoutExtrasUi.checkinFailed"]) {
                expect(t(key), `${locale}: ${key}`).not.toBe(interfaceTranslator("zh-CN")(key));
            }
        }
    }
});
