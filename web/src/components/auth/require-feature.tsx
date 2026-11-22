import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "antd";
import { useNavigate } from "react-router";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState, WorkspaceState } from "@/components/layout/workspace-state";
import { useUserStore } from "@/stores/use-user-store";
import { recordDiagnosticEvent } from "@/services/diagnostics/client-diagnostics";

type FeatureKey = "shortDramaEnabled" | "taskCenterEnabled" | "creditsEnabled" | "teamsEnabled" | "frontendModelsEnabled" | "pluginCenterEnabled" | "imageWorkbenchEnabled" | "videoWorkbenchEnabled";

const featureNames: Record<FeatureKey, InterfaceMessageKey | "团队空间"> = {
    shortDramaEnabled: "projects",
    taskCenterEnabled: "uiCompletion.taskCenter",
    creditsEnabled: "wallet",
    teamsEnabled: "团队空间",
    frontendModelsEnabled: "uiCompletion.frontendModels",
    pluginCenterEnabled: "plugins",
    imageWorkbenchEnabled: "canvasUi.generateImageShort",
    videoWorkbenchEnabled: "createVideo",
};

export function RequireFeature({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
    const { t } = useInterfaceTranslation();
    const navigate = useNavigate();
    const user = useUserStore((state) => state.user);
    const features = useUserStore((state) => state.features);
    const [checking, setChecking] = useState(() => {
        const state = useUserStore.getState();
        return !state.hydrated || !state.features[feature];
    });
    const [error, setError] = useState<string | null>("");

    useEffect(() => {
        let cancelled = false;
        setError("");
        import("@/lib/user-session").then(module => module.refreshFeatureAvailability())
            .catch((reason) => {
                if (cancelled) return;
                const state = useUserStore.getState();
                if (state.hydrated && state.user?.id === user?.id && state.features[feature]) {
                    // The authenticated session already confirmed this feature. A
                    // failed refresh must not discard the open editor or its draft;
                    // every write still passes the server's current feature policy.
                    recordDiagnosticEvent({ level: "warning", category: "request",
                        code: "feature_refresh_deferred", message: `功能状态刷新失败，保留已确认的页面：${feature}` });
                } else {
                    setError(reason instanceof Error ? reason.message : null);
                }
            })
            .finally(() => {
                if (!cancelled) setChecking(false);
            });
        return () => {
            cancelled = true;
        };
    }, [feature, user?.id]);

    if (checking) return <WorkspacePage><WorkspaceLoadingState label={t("sharedDialogsUi.checkingFeature")} detail={t(featureNames[feature])} rows={3} /></WorkspacePage>;
    if (error !== "") return <WorkspacePage><WorkspaceErrorState title={t("sharedDialogsUi.featureCheckFailed")} description={error ?? t("sharedDialogsUi.featureCheckFailed")} actionLabel={t("uiCompletion.backWorkbench")} onRetry={() => navigate("/home", { replace: true })} /></WorkspacePage>;
    if (!features[feature]) {
        // 管理员页面返回到管理后台首页，用户页面返回到创作台
        const isAdminFeature = feature === "frontendModelsEnabled";
        const backPath = isAdminFeature ? "/admin" : "/home";
        const backLabel = t(isAdminFeature ? "uiCompletion.backAdmin" : "uiCompletion.backWorkbench");

        return (
            <WorkspacePage>
                <WorkspaceState icon="empty" title={t("uiCompletion.featureUnavailable", { feature: t(featureNames[feature]) })} description={t("sharedDialogsUi.featureDisabled")} action={<Button type="primary" onClick={() => navigate(backPath, { replace: true })}>{backLabel}</Button>} />
            </WorkspacePage>
        );
    }
    return children;
}
