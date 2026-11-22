import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { ModelPicker } from "@/components/model-picker";
import { dramaChoiceKey, dramaChoiceKeys, dramaChoiceToModel, modelToDramaChoice } from "@/lib/drama/model-choice";
import { cn } from "@/lib/utils";
import { getDramaModels, type DramaCapability, type DramaModelChoice } from "@/services/api/drama";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function useDramaModelCatalog() {
    return useQuery({ queryKey: ["drama-models"], queryFn: getDramaModels, staleTime: 60_000 });
}

/**
 * 短剧制作用的模型下拉：沿用创作端带品牌图标的通用 ModelPicker，
 * 只有服务端可无人值守执行的平台模型可选，其余模型置灰并显示不能用的具体原因。
 */
export function DramaModelPicker({
    capability,
    value,
    onChange,
    placeholder,
    size = "md",
    showPrice = true,
    className,
}: {
    capability: DramaCapability;
    value?: DramaModelChoice;
    onChange: (choice: DramaModelChoice) => void;
    placeholder?: string;
    size?: "sm" | "md";
    showPrice?: boolean;
    className?: string;
}) {
    const { t } = useInterfaceTranslation();
    const config = useEffectiveConfig();
    const catalogQuery = useDramaModelCatalog();
    const allowed = useMemo(() => {
        const options = catalogQuery.data?.options[capability] || [];
        return new Map(options.map((option) => [dramaChoiceKey(option.choice), option.choice]));
    }, [capability, catalogQuery.data]);
    const blocked = useMemo(() => {
        const items = catalogQuery.data?.unavailable?.[capability] || [];
        return new Map(items.map((item) => [dramaChoiceKey(item.choice), item.reason]));
    }, [capability, catalogQuery.data]);
    // 创作端能选的模型这里都列出；短剧用不了的置灰并写明原因，不再静默隐藏。
    const matchChoice = useCallback((model: string) => dramaChoiceKeys(config, model).find((key) => allowed.has(key)), [allowed, config]);
    const modelDisabledReason = useCallback(
        (model: string) => {
            const keys = dramaChoiceKeys(config, model);
            if (!keys.length) return t("drama.modelPicker.personalChannelKeyUnavailable");
            if (!catalogQuery.data || matchChoice(model)) return "";
            for (const key of keys) {
                const reason = blocked.get(key);
                if (reason) return reason;
            }
            return t("drama.modelPicker.catalogUpdated");
        },
        [blocked, catalogQuery.data, config, matchChoice, t],
    );
    const current = dramaChoiceToModel(config, capability, value);

    return (
        <ModelPicker
            config={config}
            value={current}
            capability={capability}
            variant="creation"
            fullWidth
            showSelectedPrice={showPrice}
            showOptionPrices
            modelDisabledReason={modelDisabledReason}
            className={cn("drama-model-picker", size === "sm" && "is-sm", className)}
            placeholder={current ? placeholder || t("modelUi.selectModel") : value?.label || placeholder || t("modelUi.selectModel")}
            onChange={(model) => {
                const choice = modelToDramaChoice(config, model);
                if (!choice) return;
                // 以后端登记的选择为准，避免提交一个后端不认的键。
                const matched = matchChoice(model);
                const known = matched ? allowed.get(matched) : undefined;
                onChange(known ? { ...known, label: choice.label || known.label } : choice);
            }}
        />
    );
}
