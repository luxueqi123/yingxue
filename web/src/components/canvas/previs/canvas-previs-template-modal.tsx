import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useTranslation } from "react-i18next";
import { Modal } from "antd";
import type { InterfaceMessageKey } from "@/lib/interface-locale";

import { PREVIS_TEMPLATES, type PrevisTemplateId } from "@/lib/canvas/previs/previs-templates";

const templateMessageKeys: Record<PrevisTemplateId, { name: InterfaceMessageKey; summary: InterfaceMessageKey; description: InterfaceMessageKey }> = {
    empty: { name: "canvasPrevisTemplateEmptyName", summary: "canvasPrevisTemplateEmptySummary", description: "canvasPrevisTemplateEmptyDescription" },
    monologue: { name: "canvasPrevisTemplateMonologueName", summary: "canvasPrevisTemplateMonologueSummary", description: "canvasPrevisTemplateMonologueDescription" },
    dialogue: { name: "canvasPrevisTemplateDialogueName", summary: "canvasPrevisTemplateDialogueSummary", description: "canvasPrevisTemplateDialogueDescription" },
    blocking: { name: "canvasPrevisTemplateBlockingName", summary: "canvasPrevisTemplateBlockingSummary", description: "canvasPrevisTemplateBlockingDescription" },
    product: { name: "canvasPrevisTemplateProductName", summary: "canvasPrevisTemplateProductSummary", description: "canvasPrevisTemplateProductDescription" },
    "threebox-wooden-stage-static": { name: "canvasPrevisTemplateWoodenStageName", summary: "canvasPrevisTemplateWoodenStageSummary", description: "canvasPrevisTemplateWoodenStageDescription" },
    "threebox-ancient-street-static": { name: "canvasPrevisTemplateAncientStreetName", summary: "canvasPrevisTemplateAncientStreetSummary", description: "canvasPrevisTemplateAncientStreetDescription" },
};

/**
 * 新建预演台镜头前的模板选择。
 *
 * 为什么必须显式选：过去新建场景无条件塞一个默认演员，
 * 产品镜头和空场景用户第一件事就是把它删掉。这里让开局内容由用户决定。
 * 没有「默认」按钮 —— 空场景本身就是那个选项，且它真的没有演员。
 */
export function CanvasPrevisTemplateModal({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (templateId: PrevisTemplateId) => void }) {
    const { t } = useTranslation();
    return (
        <Modal open={open} onCancel={onClose} footer={null} width={560} title={t("canvasC.previsTemplate.title")} destroyOnHidden>
            <div className="previs-template-grid">
                {PREVIS_TEMPLATES.map((template) => (
                    <button
                        key={template.id}
                        type="button"
                        className="previs-template-card"
                        onClick={() => {
                            onSelect(template.id);
                            onClose();
                        }}
                    >
                        <span className="previs-template-card-name">{t(templateMessageKeys[template.id].name)}</span>
                        <span className="previs-template-card-summary">{t(templateMessageKeys[template.id].summary)}</span>
                        <span className="previs-template-card-description">{t(templateMessageKeys[template.id].description)}</span>
                    </button>
                ))}
            </div>
        </Modal>
    );
}
