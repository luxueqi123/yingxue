import { useState } from "react";
import { ArrowUpRight, AudioLines, Bot, FileText, Sparkles } from "lucide-react";
import type { ProductionItem } from "@/services/production-library";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function ResourceCard({ item, onOpen }: { item: ProductionItem; onOpen: () => void }) {
    const { t } = useInterfaceTranslation();
    const [failed, setFailed] = useState(false);
    const Icon = item.kind === "agent" ? Bot : item.kind === "voice" ? AudioLines : item.available ? Sparkles : FileText;
    return <button type="button" className={`studio-resource is-${item.kind}`} onClick={onOpen}>
        <span className="studio-resource-art">
            {!failed && item.cover ? <img src={item.cover} alt={item.name} loading="lazy" onError={() => setFailed(true)} /> : <span className="inspiration-template-cover"><Icon size={26} /><strong>{item.name}</strong><small>{t("studioUi.coverPending")}</small></span>}
            <span className="studio-resource-type"><Icon size={12} />{item.kind === "agent" ? t("agents") : item.kind === "case" ? t("studioUi.resourceCaseType") : item.kind === "voice" ? t("studioUi.resourceVoiceType") : item.available ? t("studioUi.resourceSkillType") : t("studioUi.resourceReferenceType")}</span>
            <span className="studio-resource-open"><ArrowUpRight size={18} /></span>
        </span>
        <span className="studio-resource-copy"><strong>{item.name}</strong><span>{item.description}</span></span>
    </button>;
}
