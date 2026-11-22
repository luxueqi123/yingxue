import type { ReactNode } from "react";
import { Brain, Film, ImageIcon, MessageSquareText } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { CreationMode } from "./creation-types";

export function HomeCreationModeTabs({ mode, onModeChange, agentActive, onAgentSelect }: {
    mode: CreationMode;
    onModeChange: (mode: CreationMode) => void;
    agentActive: boolean;
    onAgentSelect: () => void;
}) {
    const { t } = useInterfaceTranslation();
    const reducedMotion = useReducedMotion();
    const items: Array<{ mode: CreationMode; icon: ReactNode; label: string }> = [
        { mode: "video", icon: <Film />, label: t("creationTabVideo") },
        { mode: "image", icon: <ImageIcon />, label: t("creationTabImage") },
        { mode: "text", icon: <MessageSquareText />, label: t("creationTabText") },
    ];
    const indicator = (pressed: boolean) => pressed ? <motion.span layoutId="home-creation-mode-indicator" className="creation-mode-indicator" aria-hidden transition={reducedMotion ? { duration: 0 } : aceternityMotion.spring.dock} /> : null;
    return <LayoutGroup id="home-creation-mode-tabs">
        <div className="creation-mode-tabs" role="group" aria-label={t("creationModes")} data-active-mode={agentActive ? "agent" : mode} data-orientation="horizontal" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {items.map(item => <button key={item.mode} type="button" className="creation-mode-button" data-mode={item.mode} aria-pressed={!agentActive && item.mode === mode} aria-label={t("creationGenerate", { mode: item.label })} onClick={() => onModeChange(item.mode)}>
                {indicator(!agentActive && item.mode === mode)}{item.icon}<span>{item.label}</span>
            </button>)}
            <button type="button" className="creation-mode-button" data-mode="agent" aria-pressed={agentActive} onClick={onAgentSelect}>{indicator(agentActive)}<Brain /><span>Agent</span><i className="creation-mode-spark" aria-hidden /></button>
        </div>
    </LayoutGroup>;
}
