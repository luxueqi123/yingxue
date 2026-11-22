import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { Popover } from "antd";
import { Bot, ChevronDown } from "lucide-react";

export function AgentExecutionMenu({ confirmTools, onChange, disabled = false }: { confirmTools: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
    const { t } = useInterfaceTranslation();
    return <Popover trigger="click" placement="topLeft" arrow={false} content={
        <div className="creation-agent-mode-menu" role="group" aria-label={t("composerAgentExecution")}>
            <button type="button" aria-pressed={confirmTools} onClick={() => onChange(true)}><strong>{t("composerConfirm")}</strong><small>{t("sharedDialogsUi.confirmBeforeTools")}</small></button>
            <button type="button" aria-pressed={!confirmTools} onClick={() => onChange(false)}><strong>{t("composerAuto")}</strong><small>{t("composerAutoHint")}</small></button>
        </div>
    }>
        <button type="button" disabled={disabled} className="creation-chat-control" aria-label={t("uiCompletion.agentMode", { mode: confirmTools ? t("composerConfirm") : t("composerAuto") })}><Bot size={15} /><span>{confirmTools ? t("composerConfirm") : t("composerAuto")}</span><ChevronDown size={12} /></button>
    </Popover>;
}
