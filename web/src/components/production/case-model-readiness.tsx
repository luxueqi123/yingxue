import { useEffect, useMemo, useState } from "react";
import { Button } from "antd";
import { assessCaseModels } from "@/lib/canvas/production-case-model-readiness";
import { systemChannelModelChannels } from "@/lib/user-session";
import { getModelCatalog } from "@/services/api/logical-models";
import { useEffectiveConfig, type ModelChannel } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

export function CaseModelReadiness({ nodes, connections = [], onChecked }: { nodes: CanvasNodeData[]; connections?: CanvasConnection[]; onChecked: (ready: boolean) => void }) {
    const { t } = useInterfaceTranslation();
    const config = useEffectiveConfig();
    const hydrated = useUserStore(state => state.hydrated);
    const userId = useUserStore(state => state.user?.id);
    const [channels, setChannels] = useState<ModelChannel[]>([]);
    const [state, setState] = useState<"loading" | "ready" | "error">("loading");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        setState("loading");
        onChecked(false);
        void getModelCatalog().then(catalog => {
            if (catalog.source !== "system" || !Array.isArray(catalog.channels)) throw new Error("模型目录来源无效");
            if (active) { setChannels(systemChannelModelChannels(catalog.channels)); setState("ready"); }
        }).catch(() => { if (active) setState("error"); });
        return () => { active = false; };
    }, [attempt, onChecked, userId]);
    useEffect(() => { onChecked(state === "ready" && hydrated); }, [state, hydrated, onChecked]);
    const report = useMemo(() => state === "ready" && hydrated ? assessCaseModels(nodes, { ...config, channels: [...channels, ...config.channels.filter(channel => channel.scope !== "system")] }, connections) : [], [nodes, connections, config, channels, state, hydrated]);
    if (state === "loading" || !hydrated) return <p role="status">{t("caseModelLoading")}</p>;
    if (state === "error") return <div role="alert"><p>{t("caseModelError")}</p><Button onClick={() => setAttempt(value => value + 1)}>{t("caseModelRetry")}</Button></div>;
    const labels = { ready: t("caseModelReady"), mismatch: t("caseModelMismatch"), unconnected: t("caseModelUnconfigured") };
    return <div className="case-model-readiness">
        <p>{t("caseModelCopyNotice")}</p>
        <p role="status">{t("caseModelCounts", { ready: report.filter(item => item.status === "ready").length, mismatch: report.filter(item => item.status === "mismatch").length, unconfigured: report.filter(item => item.status === "unconnected").length })}</p>
        <div style={{ maxHeight: "45vh", overflowY: "auto" }}>
            {report.map(item => <section key={item.nodeId} className="inspiration-detail-notice">
                <strong>{item.title}</strong> · {labels[item.status]}<div>{t("caseModelProtocol", { value: item.protocol })}</div>
                {item.provenance ? <div>
                    <div>{t("caseModelSource", { value: item.provenance.sourceModel || t("caseModelUnknown") })}</div>
                    <div>{t("caseModelConverted", { value: item.provenance.convertedModel || t("caseModelUnbound") })}</div>
                    <div>{t("caseModelOperation", { value: item.provenance.operation || t("caseModelUnknown") })}</div>
                    <small>{t("caseModelEquivalence")}</small>
                </div> : null}
                {item.models.length ? <div>{t("caseModelOptions", { value: item.models.join(" / ") })}</div> : null}<p>{item.status === "ready" ? t("caseModelReadyReason") : item.status === "unconnected" ? t("caseModelMissingReason") : item.reason}</p>
            </section>)}
            {!report.length ? <p>{t("caseModelEmpty")}</p> : null}
        </div>
        <small>{t("caseModelBoundary")}</small>
    </div>;
}
