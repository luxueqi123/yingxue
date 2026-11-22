import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function AgentSkillCatalogStatus({ created, error, refreshing, onRetry }: { created: boolean; error: unknown; refreshing: boolean; onRetry: () => void }) {
    const { t } = useInterfaceTranslation();
    if (!error) return null;
    return (
        <div className="agent-skill-catalog-status" role="status">
            <div>
                <strong>{t(created ? "agentUiCreatedSkillsLoadFailed" : "agentUiSkillsLoadFailed")}</strong>
                {error instanceof Error ? <span>{error.message}</span> : null}
            </div>
            <button type="button" disabled={refreshing} onClick={onRetry}>{t("skillsUi.retry")}</button>
        </div>
    );
}
