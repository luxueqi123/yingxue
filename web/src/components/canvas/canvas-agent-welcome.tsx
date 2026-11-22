import { ArrowUpRight, Clapperboard, Layers3, Orbit, Sparkles } from "lucide-react";
import { agentCopy, localizeCanvasAgentAppearance, type CanvasAppearance } from "@/lib/canvas/agent-appearance";
import { type InterfaceMessageKey } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useSkillLibraryAccess } from "@/lib/skill-access";

type AgentWelcomeProps = {
    appearance: CanvasAppearance;
    /** null 表示当前不在画布中。 */
    nodeCount: number | null;
    installedSkillCount?: number | null;
    onChooseSkill: () => void;
    onOpenSkillRecommendations?: () => void;
    onDraftPrompt: (prompt: string) => void;
};

export function AgentWelcome({ appearance, nodeCount, installedSkillCount = null, onChooseSkill, onOpenSkillRecommendations, onDraftPrompt }: AgentWelcomeProps) {
    const { t } = useInterfaceTranslation();
    const localizedAppearance = localizeCanvasAgentAppearance(appearance, t);
    const canUseSkills = useSkillLibraryAccess();
    const suggestRecommendations = Boolean(onOpenSkillRecommendations) && installedSkillCount !== null && installedSkillCount < 3;
    return (
        <section className="agent-welcome" aria-label={t("agentUiStartCreatingWithAgent" as InterfaceMessageKey)}>
            <div className="agent-welcome-intro">
                <span className="agent-welcome-orb" aria-hidden="true" />
                <h2>{agentCopy(localizedAppearance.welcomeTitle, appearance.agentName)}</h2>
                <p>{agentCopy(localizedAppearance.welcomeDescription, appearance.agentName)}</p>
            </div>
            <div className="agent-welcome-actions">
                {suggestRecommendations ? (
                    <button type="button" onClick={onOpenSkillRecommendations}>
                        <Sparkles aria-hidden="true" />
                        <span>
                            <strong>{t("canvasA.welcome.recommendTitle")}</strong>
                            <small>{installedSkillCount ? t("canvasA.welcome.recommendInstalled", { count: installedSkillCount }) : t("canvasA.welcome.recommendHint")}</small>
                        </span>
                        <ArrowUpRight className="agent-welcome-arrow" aria-hidden="true" />
                    </button>
                ) : null}
                {canUseSkills && (
                    <button type="button" onClick={onChooseSkill}>
                        <Orbit aria-hidden="true" />
                        <span>
                            <strong>{t("canvasA.welcome.chooseSkillTitle")}</strong>
                            <small>{t("canvasA.welcome.chooseSkillHint")}</small>
                        </span>
                        <ArrowUpRight className="agent-welcome-arrow" aria-hidden="true" />
                    </button>
                )}
                <button type="button" onClick={() => onDraftPrompt("我想创作一段短片，请先和我一起梳理故事方向。先询问我的想法，不要直接生成。")}>
                    <Clapperboard aria-hidden="true" />
                    <span>
                        <strong>{t("canvasA.welcome.storyTitle")}</strong>
                        <small>{t("canvasA.welcome.storyHint")}</small>
                    </span>
                    <ArrowUpRight className="agent-welcome-arrow" aria-hidden="true" />
                </button>
                <button type="button" disabled={!nodeCount} onClick={() => onDraftPrompt(t("agentUiWelcomePromptCanvasReview" as InterfaceMessageKey))}>
                    <Layers3 aria-hidden="true" />
                    <span>
                        <strong>{t("canvasA.welcome.reviewTitle")}</strong>
                        <small>{nodeCount === null ? t("canvasA.welcome.reviewNoCanvas") : nodeCount > 0 ? t("canvasA.welcome.reviewNodes", { count: nodeCount }) : t("canvasA.welcome.reviewEmpty")}</small>
                    </span>
                    <ArrowUpRight className="agent-welcome-arrow" aria-hidden="true" />
                </button>
            </div>
            <p className="agent-welcome-footnote">{t("canvasA.welcome.footnote")}</p>
        </section>
    );
}
