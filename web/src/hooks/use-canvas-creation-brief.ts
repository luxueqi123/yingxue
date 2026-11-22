import { useRef, useState } from "react";
import { App } from "antd";
import { useNavigate } from "react-router";
import { canvasConversationContent, createCanvasCreationBriefLauncher, type CanvasCreationBriefInput } from "@/lib/canvas/canvas-creation-brief";
import { getCanvasNodesBounds, viewportForBounds } from "@/lib/canvas/canvas-viewport";
import { getActiveUserScope } from "@/lib/user-scope";
import { createCanvasProjectWithRemoteSync } from "@/services/user-data-sync";
import { flushCanvasStorePersistence, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { configuredModelMatchesCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function useCanvasCreationBrief(): { busy: boolean; launch: (input: CanvasCreationBriefInput) => Promise<void> } {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const config = useEffectiveConfig();
    const configRef = useRef(config);
    configRef.current = config;
    const [busy, setBusy] = useState(false);
    const launcherRef = useRef<ReturnType<typeof createCanvasCreationBriefLauncher> | null>(null);
    if (!launcherRef.current) launcherRef.current = createCanvasCreationBriefLauncher({
        readSession: () => ({ userId: useUserStore.getState().user?.id, scope: getActiveUserScope(), hydrated: useCanvasStore.getState().hydrated }),
        validateModels: (models, requireTextModel) => {
            if (requireTextModel && !models.text) throw new Error("请先选择映雪已配置的文本模型，再打开画布 Agent。");
            for (const kind of ["text", "image", "video"] as const) {
                if (models[kind] && !configuredModelMatchesCapability(configRef.current, models[kind], kind)) throw new Error("所选模型已不可用，请重新选择映雪已配置的模型。");
            }
        },
        createProject: (brief) => {
            const content = canvasConversationContent(brief, getActiveUserScope());
            const bounds = getCanvasNodesBounds(content.nodes);
            const viewport = bounds ? viewportForBounds(bounds, { width: window.innerWidth, height: window.innerHeight }, { padding: 100, maxScale: 1 }) : undefined;
            return createCanvasProjectWithRemoteSync(brief.title, undefined, { ...content, ...(viewport ? { viewport } : {}) });
        },
        hasProject: (id) => useCanvasStore.getState().projects.some((project) => project.id === id),
        flush: flushCanvasStorePersistence,
        navigate,
        warn: (error) => { message.warning(`画布已保存在本地，云端同步未完成：${error instanceof Error ? error.message : "请检查连接"}`); },
    });
    const launch = async (input: CanvasCreationBriefInput) => {
        setBusy(true);
        try { await launcherRef.current!.launch(input); }
        finally { setBusy(false); }
    };
    return { busy, launch };
}
