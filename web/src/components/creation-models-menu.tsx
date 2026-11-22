import { useState } from "react";
import { Popover } from "antd";
import { ChevronDown, Cpu } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import type { AiConfig } from "@/stores/use-config-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import "./creation-models-menu.css";

type CreationModelKind = "text" | "image" | "video";
const modelKinds = [
    { kind: "text", key: "textModel", label: "creationTabText" },
    { kind: "image", key: "imageModel", label: "creationTabImage" },
    { kind: "video", key: "videoModel", label: "creationTabVideo" },
] as const;

export function CreationModelsMenu({ config, onChange, open: controlledOpen, onOpenChange, className = "creation-chat-control" }: {
    config: AiConfig;
    onChange: (kind: CreationModelKind, model: string) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    className?: string;
}) {
    const { t } = useInterfaceTranslation();
    const [localOpen, setLocalOpen] = useState(false);
    const open = controlledOpen ?? localOpen;
    const changeOpen = (value: boolean) => {
        setLocalOpen(value);
        onOpenChange?.(value);
    };
    return <Popover open={open} onOpenChange={changeOpen} trigger="click" placement="top" arrow={false}
        classNames={{ root: "creation-models-popover" }}
        styles={{ container: { background: "var(--popover)", color: "var(--foreground)" } }}
        content={<div className="creation-agent-models" data-canvas-no-zoom onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
            <strong>{t("creationModels")}</strong>
            {modelKinds.map(({ kind, key, label }) => <label key={kind}>
                <span>{t(label)}</span>
                <ModelPicker config={config} capability={kind} value={config[key]} onChange={value => onChange(kind, value)} placeholder={t("composerSelectModel", { mode: t(label) })} fullWidth showSelectedPrice />
            </label>)}
            <small>{t("creationModelsHint")}</small>
        </div>}>
        <button type="button" className={className} aria-expanded={open} aria-label={t("creationModelsChoose")} title={t("creationModelsChoose")}>
            <Cpu className="size-4" /><span>{t("creationModelsShort")}</span><ChevronDown className="size-3" />
        </button>
    </Popover>;
}
