import { useRef, useState } from "react";
import { App } from "antd";
import { useLocation, useNavigate } from "react-router";
import { rememberCreationLaunch, type CreationLaunchMode } from "@/lib/creation-launch";
import type { ProductionWorkflow } from "@/lib/production-workflows";
import { addSkill, getSkill } from "@/services/api/skills";
import type { ProductionItem } from "@/services/production-library";
import type { createCanvasProjectWithRemoteSync } from "@/services/user-data-sync";
import { useUserStore } from "@/stores/use-user-store";

export function useProductionLaunch() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const locked = useRef(false);
    const [busy, setBusy] = useState(false);
    const run = async (action: () => Promise<void>) => {
        if (locked.current) return;
        if (!useUserStore.getState().user) { navigate(`/login?next=${encodeURIComponent("/home")}`); return; }
        locked.current = true; setBusy(true);
        try { await action(); }
        catch (error) { message.error(error instanceof Error ? error.message : "创作空间未能打开，请重试。"); }
        finally { locked.current = false; setBusy(false); }
    };
    const useSkill = async (item: ProductionItem) => {
        if (!item.available) throw new Error("这份来源资料没有完整技能正文，暂不能作为技能执行。");
        const { skill } = await getSkill(item.id);
        if (!skill.instruction) throw new Error("技能正文未准备好，请重试。");
        if (!skill.isAdded) await addSkill(skill.skillId);
        return { ...skill, isAdded: true };
    };
    const openCanvas = async (title: string, initial?: Parameters<typeof createCanvasProjectWithRemoteSync>[2], enterImmediately = false, returnState: unknown = location.state) => {
        const userId = useUserStore.getState().user?.id;
        const [{ createCanvasProjectWithRemoteSync }, { useCanvasStore }, { getCanvasNodesBounds, viewportForBounds }] = await Promise.all([
            import("@/services/user-data-sync"), import("@/stores/canvas/use-canvas-store"), import("@/lib/canvas/canvas-viewport"),
        ]);
        if (!userId || useUserStore.getState().user?.id !== userId || !useUserStore.getState().hydrated) throw new Error("账号状态已变化，请重新打开案例后复制。");
        if (!useCanvasStore.getState().hydrated) throw new Error("画布仍在恢复，请稍后重试。");
        const bounds = initial?.nodes?.length ? getCanvasNodesBounds(initial.nodes) : null;
        const viewport = bounds ? viewportForBounds(bounds, { width: window.innerWidth, height: window.innerHeight }, { padding: 100, maxScale: 1 }) : undefined;
        const state = { returnTo: location.pathname + location.search + location.hash, returnState };
        const { id, syncError } = await createCanvasProjectWithRemoteSync(title, undefined, initial ? { ...initial, viewport } : undefined, enterImmediately ? id => navigate(`/canvas/${id}`, { state }) : undefined);
        if (syncError) message.warning(`画布已保存在本地，云端同步未完成：${syncError instanceof Error ? syncError.message : "请检查连接"}`);
        if (!enterImmediately) navigate(`/canvas/${id}`, { state });
    };
    return {
        busy,
        blankCanvas: () => run(() => openCanvas("新的创作")),
        caseProject: (item: Pick<ProductionItem, "id">, returnState?: unknown) => run(async () => {
            const userId = useUserStore.getState().user?.id;
            const { loadProductionCaseProject } = await import("@/services/production-case-project");
            const project = await loadProductionCaseProject(item.id, { mode: "editable" });
            if (!userId || useUserStore.getState().user?.id !== userId || !useUserStore.getState().hydrated) throw new Error("账号状态已变化，请重新打开案例后复制。");
            const { mediaAssets, ...initial } = project;
            await openCanvas(project.title, initial, true, returnState);
        }),
        create: (prompt: string, mode: CreationLaunchMode = "text", item?: ProductionItem) => run(async () => {
            if (!prompt.trim()) throw new Error("先写下想创作的内容。");
            const skill = item ? await useSkill(item) : undefined;
            navigate(rememberCreationLaunch({ mode, prompt: `${skill ? `@[skill:${skill.skillId}]\n` : ""}${prompt}`, ...(skill ? { skillIds: [skill.skillId] } : {}) }));
        }),
        workflow: (workflow: ProductionWorkflow, brief: string, items: ProductionItem[]) => run(async () => {
            const item = items.find(item => item.name === workflow.skill && item.available);
            if (workflow.skill && !item) throw new Error("工作流所需技能还在加载，请稍后重试。");
            const skill = item ? await useSkill(item) : undefined;
            const { buildProductionWorkflow } = await import("@/lib/production-workflows");
            await openCanvas(workflow.title, buildProductionWorkflow(workflow, brief, skill));
        }),
        agent: (item: ProductionItem, brief: string) => run(async () => {
            const skill = await useSkill(item);
            const { buildProductionWorkflow } = await import("@/lib/production-workflows");
            const workflow: ProductionWorkflow = { id: item.id, title: item.name, description: item.description, image: "storyboard", skill: item.name, category: item.category, stages: [{ title: "制作方案", mode: "text", prompt: "按已选择的专业技能与创作简报执行当前阶段，保留制作规范、连续性和审阅步骤。" }] };
            await openCanvas(item.name, buildProductionWorkflow(workflow, brief, skill));
        }),
    };
}
