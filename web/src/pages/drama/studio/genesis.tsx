import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { CheckCircle2, Circle, Loader2, PauseCircle } from "lucide-react";

import type { DramaSummary } from "@/services/api/drama";

import { formatCount } from "../drama-shared";

/** 全剧第一集出现前的状态：让用户知道流水线在做什么，而不是面对空白页。 */
export function StudioGenesis({ summary }: { summary: DramaSummary }) {
    const { t } = useInterfaceTranslation();
    const { production } = summary;
    const bibleDone = production.stage !== "bible";
    const paused = production.status !== "running";
    const steps = [
        { label: t("coverageUi.134", { value0: formatCount(production.chapterCount), value1: formatCount(production.wordCount) }), done: true },
        { label: t("coverageUi.135"), done: bibleDone, active: !bibleDone },
        { label: t("coverageUi.136"), done: summary.episodes.length > 0, active: bibleDone && !summary.episodes.length },
        { label: t("coverageUi.137"), done: false, active: false },
    ];
    return (
        <div className="drama-genesis">
            <div className="drama-genesis-card">
                {paused ? <PauseCircle className="mx-auto mb-5 size-16 text-[var(--status-warning)]" /> : <div className="drama-genesis-orb" aria-hidden />}
                <h2>{paused ? (production.status === "draft" ? t("coverageUi.138") : t("coverageUi.035")) : t("coverageUi.139")}</h2>
                <p>{paused ? t("coverageUi.140", { value0: production.pauseReason || t("coverageUi.141"), value1: production.status === "draft" ? t("coverageUi.027") : t("projectUi.actionContinueProduction") }) : t("coverageUi.142")}</p>
                <div className="drama-genesis-steps">
                    {steps.map((step) => (
                        <div key={step.label} className={`drama-genesis-step ${step.done ? "is-done" : step.active && !paused ? "is-active" : ""}`}>
                            {step.done ? <CheckCircle2 className="size-4 text-[var(--status-success)]" /> : step.active && !paused ? <Loader2 className="size-4 animate-spin text-[var(--workspace-accent)]" /> : <Circle className="size-4 opacity-35" />}
                            {step.label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
