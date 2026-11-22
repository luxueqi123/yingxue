import { Button, ConfigProvider } from "antd";
import { RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

/** 内容库的浏览控件，不复用后台表格的筛选外框。 */
export function CollectionToolbar({ children, trailing, active, onReset, label }: {
    children: ReactNode;
    trailing?: ReactNode;
    active?: boolean;
    onReset?: () => void;
    label?: string;
}) {
    const [inputModality, setInputModality] = useState<"keyboard" | "pointer">("keyboard");
    const { t } = useInterfaceTranslation();

    return <section
        className="collection-toolbar"
        aria-label={label ?? t("collectionSearchFilters")}
        data-input-modality={inputModality}
        onPointerDownCapture={() => setInputModality("pointer")}
        onKeyDownCapture={(event) => {
            if (!event.altKey && !event.ctrlKey && !event.metaKey) setInputModality("keyboard");
        }}
        onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setInputModality("keyboard");
        }}
    >
        <ConfigProvider select={{ variant: "filled", classNames: { popup: { root: "workspace-quiet-popup" } } }}>
            <div className="collection-toolbar-controls">{children}</div>
        </ConfigProvider>
        <div className="collection-toolbar-actions">
            {active && onReset ? <Button type="text" icon={<RotateCcw />} onClick={onReset}>{t("collectionReset")}</Button> : null}
            {trailing}
        </div>
    </section>;
}
