import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ChevronDown, Coins } from "lucide-react";
import { Popover } from "antd";
import { usePopoverAnchorAlign } from "@/hooks/use-popover-anchor-align";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { modelCapabilityConfigFor, videoDurationOptions } from "@/lib/model-capabilities";
import { formatPriceRange, modelQuoteDescription, modelQuoteRequest, normalizeTierResolution, priceTierSummaryLabel, priceTiersForCurrentSelection, referenceVideoBillingLabel, tokenPriceRuleDescription } from "@/lib/model-pricing";
import { compatibleModelInGroup, configuredModelDisplayName, modelCompatibilityError, resolveCompatibleModel, type ModelRequirements } from "@/lib/model-selection";
import { groupModelsForPicker, isDirectSystemModel, modelChannelLabel, type ModelPickerGroup } from "@/lib/model-picker-groups";
import { cn } from "@/lib/utils";
import { modelDisplayName, modelIcon, modelOptionName, resolveModelChannel, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { useModelCatalogStore } from "@/stores/use-model-catalog-store";
import { ModelLogo } from "@/components/model-logo";
import { ModelTags } from "@/components/model-tags";
import { referenceCapabilityTag } from "@/lib/model-tags";
import { quoteModel, type LogicalModelQuote, type PublicChannelModelAvailability } from "@/services/api/logical-models";
import type { InterfaceLocale, InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    popoverClassName?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
    showSelectedPrice?: boolean;
    showOptionPrices?: boolean;
    variant?: "default" | "creation";
    requirements?: ModelRequirements;
    showConfiguredModelName?: boolean;
    preserveSelection?: boolean;
    allowedProtocols?: readonly string[];
    modelFilter?: (model: string) => boolean;
    /** 独立编辑或预览配置不读取当前会话的系统目录状态。 */
    catalogSource?: "session" | "provided";
    /** 调用方额外的不可选原因（例如短剧只能用平台模型）；返回非空串时选项置灰并显示原因。 */
    modelDisabledReason?: (model: string) => string;
};

export function ModelPicker({
    config,
    value,
    onChange,
    capability,
    className,
    popoverClassName,
    fullWidth = false,
    placeholder,
    onMissingConfig,
    showSelectedPrice = true,
    showOptionPrices = showSelectedPrice,
    variant = "creation",
    requirements,
    showConfiguredModelName = false,
    preserveSelection = false,
    allowedProtocols,
    modelFilter,
    catalogSource = "session",
    modelDisabledReason,
}: ModelPickerProps) {
    const { locale, t } = useInterfaceTranslation();
    const menuPlaceholder = placeholder ?? t("modelUi.selectModel");
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const userId = useUserStore((state) => state.user?.id);
    const catalogStatus = useModelCatalogStore((state) => state.status);
    const pickerId = useId();
    // 双保险：即使 store merge 写出非法 theme，这里也兜底到 dark，避免 "reading 'node'" 崩溃
    const rawTheme = useActiveTheme();
    const theme = (canvasThemes[rawTheme as keyof typeof canvasThemes] ?? canvasThemes.dark) as CanvasTheme;
    const [open, setOpen] = useState(false);
    const popoverRef = usePopoverAnchorAlign(open);
    const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [availableHeight, setAvailableHeight] = useState(420);
    useLayoutEffect(() => {
        if (!open) return;
        const measure = () => {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const viewport = window.visualViewport;
            const top = viewport?.offsetTop ?? 0;
            const bottom = top + (viewport?.height ?? window.innerHeight);
            setAvailableHeight(Math.min(420, Math.max(0, rect.top - top - 24, bottom - rect.bottom - 24)));
        };
        measure();
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        window.visualViewport?.addEventListener("resize", measure);
        return () => {
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
            window.visualViewport?.removeEventListener("resize", measure);
        };
    }, [open]);
    const options = useMemo(() => Array.from(new Set(selectableModelsByCapability(config, capability).filter((model) => Boolean(model) && (!modelFilter || modelFilter(model))))), [capability, config, modelFilter]);
    const usesSystemCatalog = catalogSource === "session" && (!config.channels.length || config.channels.some((channel) => channel.scope === "system"));
    const catalogRelevant = usesSystemCatalog && (!options.length || options.some((model) => resolveModelChannel(config, model).scope === "system"));
    const catalogPending = catalogRelevant && Boolean(userId) && catalogStatus !== "ready";
    const catalogMessage = catalogStatus === "loading" ? "正在加载模型…" : catalogStatus === "error" ? (options.length ? "模型列表刷新失败，仍可选择已加载模型。" : "模型列表加载失败，请重试。") : "模型列表尚未加载，请重试。";
    const retryCatalog = () => {
        // 按需加载，避免静态模型展示也初始化整个用户会话模块。
        void import("@/lib/user-session").then(({ refreshSystemChannels }) => refreshSystemChannels()).catch(() => {});
    };
    const optionGroups = useMemo(() => groupModelsForPicker(config, options), [config, options]);
    const storedCurrent = value?.trim() || "";
    // 参数档位会在选中模型后由调用方归一到其能力配置，不能因为旧模型留下的参数而禁止切换。
    const selectionRequirements = requirements ? { ...requirements, videoSeconds: undefined, imageSize: undefined, options: undefined } : undefined;
    // 保留显式选择（图生视频参考素材等调用方）优先；系统直连模型不参与兼容重算。
    const resolvedCurrent = preserveSelection || isDirectSystemModel(config, storedCurrent) ? storedCurrent : resolveCompatibleModel(config, storedCurrent, selectionRequirements) || storedCurrent;
    // 旧画布可能保存过已下架或前端历史内置模型；它们不能重新进入当前可选目录。
    const current = options.includes(resolvedCurrent) ? resolvedCurrent : "";
    const currentPrice = modelMenuPrice(config, current, capability, false, requirements, t, locale);
    const quoteRequest = useMemo(() => modelQuoteRequest(config, current, capability, requirements), [capability, config, current, requirements]);
    const [routeQuote, setRouteQuote] = useState<LogicalModelQuote | undefined>();
    const creationVariant = variant === "creation";
    const currentChannel = current ? resolveModelChannel(config, current) : undefined;
    const isCurrentCustomChannel = Boolean(current && currentChannel && currentChannel.scope !== "system");

    useLayoutEffect(() => {
        if (!open) return;
        const updateAvailableHeight = () => {
            const { top, bottom } = triggerRef.current!.getBoundingClientRect();
            setAvailableHeight(Math.max(top, window.innerHeight - bottom));
        };
        updateAvailableHeight();
        window.addEventListener("resize", updateAvailableHeight);
        window.addEventListener("scroll", updateAvailableHeight, true);
        return () => {
            window.removeEventListener("resize", updateAvailableHeight);
            window.removeEventListener("scroll", updateAvailableHeight, true);
        };
    }, [open]);

    useEffect(() => {
        if (!userId || !showSelectedPrice || !creditsEnabled || !quoteRequest) {
            setRouteQuote(undefined);
            return;
        }
        const controller = new AbortController();
        setRouteQuote(undefined);
        quoteModel(quoteRequest, controller.signal)
            .then((payload) => setRouteQuote(payload.quote))
            .catch(() => {
                if (!controller.signal.aborted) setRouteQuote(undefined);
            });
        return () => controller.abort();
    }, [creditsEnabled, quoteRequest, showSelectedPrice, userId]);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    useEffect(() => {
        if (!open) return;
        // 画布拖拽从 pointerdown 开始，须在捕获阶段关闭 Portal 菜单，避免菜单与触发器分离。
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    }, [open]);

    const setPickerOpen = (nextOpen: boolean) => {
        if (nextOpen && !options.length && !catalogPending) onMissingConfig?.();
        if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
        if (nextOpen) {
            setActiveGroupKey(optionGroups.find((group) => group.models.some((item) => item.models.includes(current)))?.key ?? null);
        }
        setOpen(nextOpen);
    };
    const focusMenuOption = (last = false) => {
        window.requestAnimationFrame(() => {
            const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>("[data-model-picker-item]:not(:disabled)");
            const target = last ? buttons?.item((buttons?.length || 1) - 1) : buttons?.item(0);
            target?.focus();
        });
    };
    const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        setPickerOpen(true);
        focusMenuOption(event.key === "ArrowUp");
    };
    const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
            return;
        }
        if (event.key === "ArrowLeft" && activeGroupKey !== null) {
            event.preventDefault();
            setActiveGroupKey(null);
            focusMenuOption();
            return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-model-picker-item]:not(:disabled)"));
        if (!buttons.length) return;
        event.preventDefault();
        const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowUp" ? Math.max(0, activeIndex - 1) : Math.min(buttons.length - 1, activeIndex + 1);
        buttons[nextIndex]?.focus();
    };
    const content = (
        <div
            ref={menuRef}
            data-canvas-no-zoom
            className={cn("canvas-model-picker-menu creation-model-picker-menu max-w-[calc(100vw-24px)]", activeGroupKey === null ? "is-brand-list" : "is-model-list")}
            style={{ background: theme.node.panel, color: theme.node.text, "--canvas-model-picker-available-height": `${availableHeight}px` } as CSSProperties}
            role="listbox"
            aria-label={menuPlaceholder}
            onKeyDown={handleMenuKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {options.length > 0 && catalogPending ? (
                <div className="canvas-model-picker-status" role="status">
                    <span>{catalogMessage}</span>
                    {catalogStatus !== "loading" ? (
                        <button type="button" onClick={retryCatalog}>
                            重新加载
                        </button>
                    ) : null}
                </div>
            ) : null}
            {optionGroups.length ? (
                activeGroupKey === null ? (
                    <div className="canvas-model-picker-brands" aria-label={t("modelUi.selectProductModel")}>
                        {optionGroups.map((group) => {
                            const groupCurrent = group.models.find((item) => item.models.includes(current));
                            return (
                                <button
                                    key={group.key}
                                    type="button"
                                    data-model-picker-item
                                    className={cn("canvas-model-picker-brand", groupCurrent && "is-active")}
                                    aria-pressed={Boolean(groupCurrent)}
                                    onClick={() => {
                                        setActiveGroupKey(group.key);
                                        focusMenuOption();
                                    }}
                                >
                                    <span className="canvas-model-picker-brand-icon">
                                        <ModelLogo icon={group.icon} size={22} />
                                    </span>
                                    <span className="canvas-model-picker-brand-copy">
                                        <strong>{group.label}</strong>
                                        <small>
                                            <span className="canvas-model-picker-brand-subtext">
                                            {t(group.kind === "product" ? "modelUi.channelCount" : "modelUi.modelCount", { count: group.models.length })}
                                            {group.scope ? ` · ${group.scope}` : ""}
                                            </span>
                                            <ModelRecentHealthTrack availability={groupAvailability(config, group)} />
                                        </small>
                                    </span>
                                    <ChevronDown className="canvas-model-picker-brand-arrow" aria-hidden="true" />
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="canvas-model-picker-two-pane">
                        <div className="canvas-model-picker-brand-rail" aria-label={t("modelUi.productModels")}>
                            {optionGroups.map((group) => {
                                return (
                                    <button key={group.key} type="button" className={cn("canvas-model-picker-brand", activeGroupKey === group.key && "is-active")} aria-pressed={activeGroupKey === group.key} onClick={() => setActiveGroupKey(group.key)}>
                                        <span className="canvas-model-picker-brand-icon">
                                            <ModelLogo icon={group.icon} size={22} />
                                        </span>
                                        <span className="canvas-model-picker-brand-copy">
                                            <strong>{group.label}</strong>
                                            <small>
                                                <span className="canvas-model-picker-brand-subtext">
                                                {t(group.kind === "product" ? "modelUi.channelCount" : "modelUi.modelCount", { count: group.models.length })}
                                                {group.scope ? ` · ${group.scope}` : ""}
                                                </span>
                                                <ModelRecentHealthTrack availability={groupAvailability(config, group)} />
                                            </small>
                                        </span>
                                        <ChevronDown className="canvas-model-picker-brand-arrow" aria-hidden="true" />
                                    </button>
                                );
                            })}
                        </div>
                        {optionGroups
                            .filter((group) => group.key === activeGroupKey)
                            .map((group) => (
                                <section key={group.key} className="canvas-model-picker-group canvas-model-picker-model-pane min-w-0 overflow-hidden">
                                    <div className="grid min-w-0 gap-1">
                                        {group.models.map((modelGroup) => {
                                            const selected = modelGroup.models.includes(current);
                                            const selectable = modelDisabledReason ? modelGroup.models.filter((item) => !modelDisabledReason(item)) : modelGroup.models;
                                            const model = compatibleModelInGroup(config, selectable, selectionRequirements, selected ? current : undefined);
                                            const displayModel = model || (selected ? current : modelGroup.models[0]);
                                            const disabledReason = model ? "" : modelDisabledReason?.(displayModel) || modelCompatibilityError(config, displayModel, selectionRequirements) || t("modelUi.inputIncompatible");
                                            return (
                                                <button
                                                    key={modelGroup.key}
                                                    type="button"
                                                    data-model-picker-item
                                                    role="option"
                                                    aria-selected={selected}
                                                    aria-disabled={Boolean(disabledReason)}
                                                    disabled={Boolean(disabledReason)}
                                                    className="canvas-model-picker-option disabled:cursor-not-allowed disabled:opacity-45"
                                                    style={{ background: selected ? theme.toolbar.activeBg : "transparent", color: theme.node.text }}
                                                    onClick={() => {
                                                        if (!model) return;
                                                        onChange(model);
                                                        setOpen(false);
                                                        window.requestAnimationFrame(() => triggerRef.current?.focus());
                                                    }}
                                                >
                                                    <ModelLabel
                                                        config={config}
                                                        model={displayModel}
                                                        capability={capability}
                                                        theme={theme}
                                                        creationVariant
                                                        showConfiguredModelName={showConfiguredModelName}
                                                        label={group.kind === "product" ? modelGroup.label : undefined}
                                                        requirements={requirements}
                                                        showPrice={showOptionPrices && creditsEnabled}
                                                        disabledReason={disabledReason}
                                                        showDescription
                                                    />
                                                    <span className="canvas-model-picker-option-check ml-1 shrink-0" aria-hidden="true">
                                                        {selected ? <Check className="size-full" style={{ color: theme.node.activeStroke }} /> : null}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                    </div>
                )
            ) : (
                <div className="canvas-model-picker-empty" style={{ color: theme.node.muted }}>
                    <span role={catalogPending ? "status" : undefined}>{catalogPending ? catalogMessage : emptyModelLabel(config, capability, t)}</span>
                    {catalogPending && catalogStatus !== "loading" ? (
                        <button type="button" className="canvas-model-picker-recovery" onClick={retryCatalog}>
                            重新加载
                        </button>
                    ) : null}
                </div>
            )}
        </div>
    );

    return (
        <div className={cn(fullWidth ? "w-full min-w-0" : "w-fit max-w-full")} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <Popover
                ref={popoverRef}
                open={open}
                onOpenChange={setPickerOpen}
                trigger="click"
                placement="bottomLeft"
                arrow={false}
                content={content}
                classNames={{
                    root: cn("canvas-model-picker-popover", "creation-model-picker-popover", popoverClassName),
                    container: cn("canvas-composer-popover-surface", "creation-model-picker-surface"),
                    content: "canvas-composer-popover-content",
                }}
            >
                <button
                    ref={triggerRef}
                    type="button"
                    className={cn("canvas-composer-model-picker", fullWidth ? "w-full" : "min-w-36 max-w-full", className)}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={menuPlaceholder}
                    title={current ? pickerModelOptionLabel(config, current, showConfiguredModelName) : menuPlaceholder}
                    onKeyDown={handleTriggerKeyDown}
                >
                    <span className="canvas-model-picker-label flex min-w-0 items-center gap-1.5">
                        <span className="canvas-model-picker-trigger-icon" style={{ background: theme.toolbar.itemHover }}>
                            <ModelIcon config={config} model={current} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{current ? (creationVariant ? pickerModelDisplayName(config, current, showConfiguredModelName) : pickerModelOptionLabel(config, current, showConfiguredModelName)) : menuPlaceholder}</span>
                        {isCurrentCustomChannel ? <span className="shrink-0 rounded px-2 py-0.5 text-[var(--fs-label)] font-medium leading-none bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">个人</span> : null}
                        {showSelectedPrice && creditsEnabled ? <ModelPrice price={currentPrice} quote={routeQuote} compact /> : null}
                    </span>
                    <ChevronDown className={cn("canvas-model-picker-chevron", open && "is-open")} aria-hidden="true" />
                </button>
            </Popover>
        </div>
    );
}

function emptyModelLabel(config: AiConfig, capability: ModelCapability | undefined, t: InterfaceTranslate) {
    const typeKeys: Record<ModelCapability, InterfaceMessageKey> = {
        image: "modelPickerUi.capabilityImage" as InterfaceMessageKey,
        video: "modelPickerUi.capabilityVideo" as InterfaceMessageKey,
        text: "modelPickerUi.capabilityText" as InterfaceMessageKey,
        audio: "modelPickerUi.capabilityAudio" as InterfaceMessageKey,
    };
    const type = capability ? t(typeKeys[capability]) : "";
    if (capability && config.models.length) return t("modelUi.noCompatibleModel", { type });
    if (!config.models.length) return t("modelUi.noModels");
    return capability ? t("modelUi.noMatchingModel", { type }) : t("modelPickerUi.noMatchingAnyModel" as InterfaceMessageKey);
}

export function ModelLabel({
    config,
    model,
    capability,
    theme,
    creationVariant,
    showConfiguredModelName,
    label,
    requirements,
    showPrice,
    disabledReason,
    showDescription,
}: {
    config: AiConfig;
    model: string;
    capability?: ModelCapability;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    creationVariant: boolean;
    showConfiguredModelName: boolean;
    label?: string;
    requirements?: ModelRequirements;
    showPrice: boolean;
    disabledReason?: string;
    showDescription: boolean;
}) {
    const { locale, t } = useInterfaceTranslation();
    const meta = modelMenuMeta(model, capability, t);
    const channel = resolveModelChannel(config, model);
    const logicalCost = channel.modelCosts?.find((item) => item.model === modelOptionName(model));
    const logicalSpec = logicalCost?.logicalCapabilitySpec;
    const videoProfile = capability === "video" ? modelCapabilityConfigFor(config, model).video : undefined;
    const videoSummary = videoProfile ? [videoProfile.durationSupported === false ? "" : formatDurationSummary(videoProfile), videoProfile.resolutions.map((item) => item.toUpperCase()).join("/")].filter(Boolean).join(" · ") : "";
    // 文本模型同样标出能识别几张图、几个视频；未开启识图 / 视频识别时上限为 0，不出标签。
    const textReferences = capability === "text" ? modelCapabilityConfigFor(config, model).text?.references : undefined;
    const capabilityTag = referenceCapabilityTag(videoProfile?.references ?? textReferences);
    const modelTags = capabilityTag ? [capabilityTag, ...(logicalCost?.tags || [])] : logicalCost?.tags;
    // 只给能挂参考视频的视频模型标注；不收参考视频的模型写“参考视频不计费”会误导。
    const referenceLabel = channel.scope === "system" && (videoProfile?.references?.maxVideos ?? 0) > 0 ? referenceVideoBillingLabel(logicalCost) : "";
    const capabilitySummary = disabledReason || logicalCost?.description?.trim() || (isDirectSystemModel(config, model) ? "" : logicalSpec ? logicalCapabilitySummary(logicalSpec, t) : videoProfile ? videoSummary : meta.description);
    return (
        <span className="flex w-full min-w-0 items-center gap-1.5 overflow-hidden py-0">
            <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover }}>
                <ModelIcon config={config} model={model} />
            </span>
            <span className="min-w-0 flex-1 overflow-hidden">
                <span className="canvas-model-picker-option-heading">
                    <span className="canvas-model-picker-option-title flex min-w-0 items-center gap-2 overflow-hidden">
                        <span className="canvas-model-picker-option-name text-[var(--fs-label)] font-medium leading-none truncate !flex-initial max-w-full" title={label || pickerModelDisplayName(config, model, showConfiguredModelName)}>
                            {label || pickerModelDisplayName(config, model, showConfiguredModelName)}
                        </span>
                        {channel.scope !== "system" ? <span className="shrink-0 rounded px-2 py-0.5 text-[var(--fs-label)] font-medium leading-none bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">个人</span> : null}
                        {showPrice ? (
                            <span className="canvas-model-picker-option-price">
                                {/* 候选模型展示自身价目；当前参数的精确报价只在选中后的触发器显示。 */}
                                <ModelPrice price={modelMenuPrice(config, model, capability, true, requirements, t, locale)} />
                            </span>
                        ) : null}
                    </span>
                    <ModelAvailabilityBadge availability={modelAvailability(config, model)} available={logicalCost?.available ?? true} showAvailability={channel.scope === "system"} />
                </span>
                <span className={cn("canvas-model-picker-description mt-1 block", showDescription && "is-visible")} style={{ color: theme.node.muted }}>
                    {capabilitySummary}
                </span>
                <ModelTags tags={modelTags} />
            </span>
            {!creationVariant && meta.time ? (
                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[var(--fs-tiny)] tabular-nums" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}>
                    {meta.time}
                </span>
            ) : null}
        </span>
    );
}

function logicalCapabilitySummary(spec: NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalCapabilitySpec"]>, t: InterfaceTranslate) {
    const operationLabels: Record<string, InterfaceMessageKey> = {
        text_to_image: "modelUi.textToImage",
        image_to_image: "modelUi.imageToImage",
        text_to_video: "modelUi.textToVideo",
        image_to_video: "modelUi.imageToVideo",
        video_to_video: "modelUi.videoToVideo",
        reference_to_video: "modelUi.allModalReference",
        audio_to_video: "modelUi.audioToVideo",
        extend: "modelUi.extendVideo",
        inpaint: "modelUi.inpaint",
        replace_element: "modelUi.replaceElement",
        camera_motion: "modelUi.cameraMotion",
        style_transfer: "modelUi.styleTransfer",
    };
    const inputLabels: Record<string, { label: string; unit: string }> = {
        image: { label: t(spec.capability === "text" ? "modelUi.imageUnderstanding" : "modelUi.referencePicture"), unit: t("modelUi.imageUnit") },
        video: { label: t(spec.capability === "text" ? "modelUi.videoUnderstanding" : "modelUi.videoReferences"), unit: t("modelUi.itemUnit") },
        audio: { label: t("modelUi.audioReferences"), unit: t("modelUi.itemUnit") },
        mask: { label: t("modelUi.maskEditing"), unit: t("modelUi.imageUnit") },
    };
    const optionLabels: Record<string, string> = {
        size: t("modelUi.ratio"),
        aspectRatio: t("modelUi.ratio"),
        quality: t("modelUi.qualityValues"),
        count: t("modelUi.outputCount"),
        videoSeconds: t("modelUi.outputDuration"),
        duration: t("modelUi.outputDuration"),
        vquality: t("modelUi.outputResolution"),
        resolution: t("modelUi.outputResolution"),
        audioVoice: t("modelUi.currentVoice"),
        audioFormat: t("modelPickerUi.audioFormat" as InterfaceMessageKey),
        audioSpeed: t("modelPickerUi.audioSpeed" as InterfaceMessageKey),
    };
    const values: string[] = [];
    values.push(...(spec.operations || []).map((operation) => (operationLabels[operation] ? t(operationLabels[operation]) : operation)));
    for (const [name, constraint] of Object.entries(spec.inputs || {})) {
        if (constraint.max <= 0) continue;
        const definition = inputLabels[name];
        if (!definition) continue;
        values.push(spec.capability === "text" ? t("modelUi.supportsInput", { label: definition.label }) : t("modelUi.maxInput", { label: definition.label, count: constraint.max, unit: definition.unit }));
    }
    for (const [name, constraint] of Object.entries(spec.options || {})) {
        const label = optionLabels[name];
        if (!label) continue;
        if (constraint.values?.length) values.push(`${label} ${constraint.values.map((value) => publicScalarLabel(value, t)).join("/")}`);
        else if (constraint.min !== undefined && constraint.max !== undefined) values.push(`${label} ${constraint.min}-${constraint.max}`);
    }
    return values.slice(0, 2).join(" · ") || t("modelUi.autoMatch");
}

function publicScalarLabel(value: unknown, t: InterfaceTranslate) {
    if (value === true) return t("modelUi.supported");
    if (value === false) return t("modelPickerUi.disabled" as InterfaceMessageKey);
    return String(value);
}

function formatDurationSummary(profile: NonNullable<ReturnType<typeof modelCapabilityConfigFor>["video"]>) {
    const values = videoDurationOptions(profile);
    if (profile.duration.selection === "enum") return values.map((item) => `${item}s`).join("/");
    return `${profile.duration.min || values[0]}-${profile.duration.max || values[values.length - 1]}s`;
}

type ModelMenuPrice = { kind: "tiers"; label: string; compactLabel: string; title: string } | { kind: "estimate"; label?: string; title?: string } | { kind: "fixed"; value: number; unit: "request" | "second" };

function modelMenuPrice(config: AiConfig, model: string, capability: ModelCapability | undefined, summary: boolean, requirements: ModelRequirements | undefined, t: InterfaceTranslate, locale: InterfaceLocale): ModelMenuPrice | null | undefined {
    if (!model) return undefined;
    const channel = resolveModelChannel(config, model);
    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(model));
    if (!cost) return channel.scope === "system" ? null : undefined;
    if (cost.pricePolicy === "channel") {
        const tiers = cost.logicalPriceTiers || [];
        if (!tiers.length) return null;
        const matched = summary ? tiers : priceTiersForCurrentSelection(tiers, capability, config, requirements);
        if (!summary && !matched.length) return { kind: "tiers", label: t("modelUi.noQuote"), compactLabel: t("modelUi.noQuote"), title: t("modelUi.adjustQuote") };
        return channelTierPriceSummary(matched.length ? matched : tiers, tiers, capability, t, locale);
    }
    if (cost.billingMode === "token") {
        const rate = cost.outputTokenPriceMicrocredits;
        return capability === "video" && typeof rate === "number" && Number.isFinite(rate) && rate >= 0
            ? { kind: "estimate", label: formatPriceRange([rate / 1_000_000], "/M Token", locale), title: t("modelUi.videoTokenEstimateHint") }
            : { kind: "estimate" };
    }
    return { kind: "fixed", value: cost.unitPriceMicrocredits / 1_000_000, unit: cost.billingMode === "per_second" ? "second" : "request" };
}

function pickerModelDisplayName(config: AiConfig, model: string, showConfiguredModelName: boolean) {
    const name = showConfiguredModelName ? configuredModelDisplayName(config, model) : modelDisplayName(config, model);
    return isDirectSystemModel(config, model) ? `${name} · ${modelChannelLabel(config, model)}` : name;
}

function pickerModelOptionLabel(config: AiConfig, model: string, showConfiguredModelName: boolean) {
    const displayName = showConfiguredModelName ? configuredModelDisplayName(config, model) : modelDisplayName(config, model);
    const channel = resolveModelChannel(config, model);
    return channel.scope === "system" ? pickerModelDisplayName(config, model, showConfiguredModelName) : `${displayName}（${channel.name}）`;
}

function channelTierPriceSummary(
    visibleTiers: NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalPriceTiers"]>,
    allTiers: NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalPriceTiers"]>,
    capability: ModelCapability | undefined,
    t: InterfaceTranslate,
    locale: InterfaceLocale,
): Extract<ModelMenuPrice, { kind: "tiers" }> {
    const label = priceTierSummaryLabel(visibleTiers, capability, t, locale, true);
    const ruleNotes = allTiers.flatMap((tier) => tier.tokenPriceRules || []).map(tokenPriceRuleDescription);
    return {
        kind: "tiers",
        label,
        compactLabel: label,
        title: `${t("modelUi.specificationPrices")}: ${allTiers.map((tier) => `${tierSpecificationLabel(tier, t)} ${priceTierSummaryLabel([tier], capability, t, locale)}`).join("; ")}${allTiers.some((tier) => tier.billingMode === "token") ? (capability === "video" ? t("modelUi.videoUsageHint") : t("modelUi.tokenUsageHint")) : ""}${ruleNotes.length ? `；${ruleNotes.join("；")}` : ""}`,
    };
}

function tierResolutionLabel(value: string, t: InterfaceTranslate) {
    const normalized = normalizeTierResolution(value);
    return normalized === "*" ? t("modelUi.allResolutions") : normalized.toUpperCase();
}

function tierDurationLabel(seconds: number, t: InterfaceTranslate) {
    return seconds > 0 ? t("modelUi.durationSeconds", { count: seconds }) : t("modelUi.allDurations");
}

function tierSpecificationLabel(tier: NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalPriceTiers"]>[number], t: InterfaceTranslate) {
    const selector = tier.selector || {};
    const operationLabels: Record<string, InterfaceMessageKey> = {
        text_to_image: "modelUi.textToImage",
        image_to_image: "modelUi.imageToImage",
        text_to_video: "modelUi.textToVideo",
        image_to_video: "modelUi.imageToVideo",
        video_to_video: "modelUi.videoToVideo",
    };
    const operation = selector.operation && selector.operation !== "*" ? (operationLabels[selector.operation] ? t(operationLabels[selector.operation]) : selector.operation) : "";
    const details = [
        operation,
        selector.quality && selector.quality !== "*" ? selector.quality.toUpperCase() : "",
        selector.size && selector.size !== "*" ? selector.size : "",
        tier.resolution !== "*" ? tierResolutionLabel(tier.resolution, t) : "",
        tier.videoSeconds ? tierDurationLabel(tier.videoSeconds, t) : "",
        selector.imageCount && selector.imageCount !== "*" ? t("modelUi.referenceImageCount", { count: selector.imageCount }) : "",
        selector.videoGenerateAudio === "true" ? t("modelUi.withAudio") : selector.videoGenerateAudio === "false" ? t("modelUi.withoutAudio") : "",
    ].filter(Boolean);
    return details.length ? details.join(" / ") : t("modelUi.defaultSpec");
}

function ModelPrice({ price, quote, compact = false }: { price: ModelMenuPrice | null | undefined; quote?: LogicalModelQuote; compact?: boolean }) {
    const { locale, t } = useInterfaceTranslation();
    if (quote) {
        const amount = (quote.amountMicrocredits / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 6 });
        const label = quote.estimated ? t("modelUi.estimatedAmount", { amount }) : amount;
        const fullLabel = quote.estimated ? `${label} ${t("modelUi.credits")}` : t("modelUi.creditsAmount", { amount });
        const description = modelQuoteAccessibleDescription(quote, t, locale);
        return (
            <span className="model-picker-price inline-flex shrink-0 items-center gap-1 text-[var(--fs-tiny)] font-bold tabular-nums" aria-label={description}>
                <Coins className="model-picker-price-icon" aria-hidden="true" />
                {compact ? label : fullLabel}
            </span>
        );
    }
    if (price === undefined) return null;
    if (price === null) return compact ? null : <span className="shrink-0 text-[var(--fs-tiny)] text-foreground/40">{t("modelUi.notConfigured")}</span>;
    if (price.kind === "tiers") {
        return (
            <span className="model-picker-price inline-flex shrink-0 items-center gap-1 text-[var(--fs-tiny)] font-bold tabular-nums" title={price.title} aria-label={price.title}>
                <Coins className="model-picker-price-icon" aria-hidden="true" />
                {compact ? price.compactLabel : price.label}
            </span>
        );
    }
    if (price.kind === "estimate") {
        return (
            <span className="model-picker-price inline-flex shrink-0 items-center text-[var(--fs-tiny)] font-semibold" title={price.title} aria-label={price.title}>
                <Coins className="model-picker-price-icon" aria-hidden="true" />
                {price.label || t("modelUi.usageEstimate")}
            </span>
        );
    }
    return (
        <span className="model-picker-price inline-flex shrink-0 items-center gap-1 text-[var(--fs-tiny)] font-bold tabular-nums">
            <Coins className="model-picker-price-icon" aria-hidden="true" />
            {price.value.toLocaleString(locale, { maximumFractionDigits: compact ? 3 : 6 })}
            {compact
                ? `/${t(price.unit === "second" ? ("modelPickerUi.secondUnitShort" as InterfaceMessageKey) : ("modelPickerUi.requestUnitShort" as InterfaceMessageKey))}`
                : ` ${price.unit === "second" ? t("modelUi.creditsSecond") : `${t("modelUi.credits")}/${t("modelPickerUi.requestUnit" as InterfaceMessageKey)}`}`}
        </span>
    );
}

function modelQuoteAccessibleDescription(quote: LogicalModelQuote, t: InterfaceTranslate, locale: InterfaceLocale) {
    const amount = (quote.amountMicrocredits / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 6 });
    const descriptions = [t(quote.estimated ? "modelUi.estimatedConsumption" : "modelUi.currentConsumption", { amount })];
    const estimate = quote.videoTokenEstimate;
    if (estimate) {
        descriptions.push(
            t("modelUi.formulaEstimate", {
                tokens: estimate.formulaTokens.toLocaleString(locale),
                margin: estimate.reservationMarginPercent,
                reserved: estimate.reservedTokens.toLocaleString(locale),
            }),
        );
        if (estimate.referenceDurationEstimated) descriptions.push(t("modelUi.referenceDurationEstimate"));
        if (estimate.dimensionsEstimated) descriptions.push(t("modelUi.dimensionsEstimate"));
    }
    if (quote.billingMode === "token") descriptions.push(t(estimate ? "modelUi.videoSettlementHint" : "modelUi.tokenSettlementHint"));
    return descriptions.join(" · ");
}

function modelAvailability(config: AiConfig, model: string): PublicChannelModelAvailability | undefined {
    if (!model) return undefined;
    const channel = resolveModelChannel(config, model);
    return channel.modelCosts?.find((item) => item.model === modelOptionName(model))?.availability;
}

function groupAvailability(config: AiConfig, group: ModelPickerGroup): PublicChannelModelAvailability | undefined {
    for (const modelGroup of group.models) {
        for (const model of modelGroup.models) {
            const availability = modelAvailability(config, model);
            if (availability) return availability;
        }
    }
    return undefined;
}

export function ModelRecentHealthTrack({ availability, inPopover = false }: { availability?: PublicChannelModelAvailability; inPopover?: boolean }) {
    const { t } = useInterfaceTranslation();
    const recentResults = availability?.recentResults ?? [];
    const success = recentResults.filter(Boolean).length;
    const title = recentResults.length ? t("nativeControls.recentCalls", { count: recentResults.length, success, failed: recentResults.length - success }) : t("nativeControls.noRecentCalls");
    return (
        <span className={cn("model-picker-availability-track", inPopover && "in-popover")} title={title} aria-label={title}>
            {Array.from({ length: 10 }, (_, index) => {
                const result = index < recentResults.length ? recentResults[index] : null;
                const state = result === true ? "is-success" : result === false ? "is-failed" : "is-empty";
                return <span key={index} className={cn("model-picker-availability-pill", inPopover && "in-popover", state)} title={inPopover ? `#${index + 1} ${result === true ? "✓" : result === false ? "×" : "–"}` : undefined} />;
            })}
        </span>
    );
}

function ModelAvailabilityBadge({ availability, available, showAvailability }: { availability?: PublicChannelModelAvailability; available: boolean; showAvailability: boolean }) {
    const { t } = useInterfaceTranslation();
    const [open, setOpen] = useState(false);
    const popoverRef = usePopoverAnchorAlign(open);
    if (!showAvailability) return null;
    const label = availability?.dataState === "ready" && availability.rate24h !== null ? `${Math.round(availability.rate24h * 100)}%` : availability?.dataState === "insufficient" ? t("modelUi.insufficientData") : t("modelUi.noData");
    const trend = availability?.trend7d || [];
    const trendSamples = trend.reduce((total, item) => total + item.sampleCount, 0);
    const state = available ? t("settingsUi.available") : t("modelUi.unavailable");
    const summary = availability ? t("modelUi.availabilitySummary", { state, rate: label, count: availability.sampleCount24h }) : t("modelUi.availabilityNoHistory", { state });
    const content = availability ? (
        <div className="model-picker-availability-popover">
            <ModelRecentHealthTrack availability={availability} inPopover />
            <div className="model-picker-availability-popover-head">
                <strong>{t("modelUi.success24h")}</strong>
                <span>{label}</span>
            </div>
            <div className="model-picker-availability-popover-meta">{t("modelUi.availabilitySamples", { attempts: availability.sampleCount24h, samples: trendSamples })}</div>
            <div className="model-picker-availability-trend" aria-label={t("modelUi.success7dTrend")}>
                {trend.map((item) => {
                    const dayLabel = item.rate === null ? t("modelUi.noData") : `${Math.round(item.rate * 100)}%`;
                    return (
                        <span
                            key={item.day}
                            className={`model-picker-availability-segment is-${item.dataState}`}
                            title={t("modelUi.daySamples", { day: item.day, rate: dayLabel, count: item.sampleCount })}
                            style={item.rate === null ? undefined : { opacity: 0.35 + item.rate * 0.65 }}
                        />
                    );
                })}
            </div>
            <div className="model-picker-availability-popover-foot">{t("modelUi.trendHint")}</div>
        </div>
    ) : null;
    return (
        <Popover ref={popoverRef} open={open} onOpenChange={setOpen} content={content} trigger={["hover", "focus"]} placement="topRight" arrow={false}>
            <span
                className={`model-picker-availability is-${availability?.dataState || "unavailable"}`}
                role="img"
                tabIndex={0}
                aria-label={summary}
                title={summary}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <ModelRecentHealthTrack availability={availability} />
                <span className="model-picker-availability-label">
                    {t("modelUi.last24h")} {label}
                </span>
            </span>
        </Popover>
    );
}
function modelMenuMeta(model: string, capability: ModelCapability | undefined, t: InterfaceTranslate): { description: string; time?: string } {
    const name = modelOptionName(model).toLowerCase();
    if (capability === "image") {
        if (name.includes("nano banana") || name.includes("nanobanana") || name.includes("imagen")) return { description: t("modelUi.geminiImageDescription") };
        if (name.includes("nano") || name.includes("pro")) return { description: t("modelUi.qualityImageDescription") };
        if (name.includes("seedream")) return { description: t("modelUi.fastImageDescription") };
        if (name.includes("gpt") || name.includes("image")) return { description: t("modelUi.generalImageDescription") };
        return { description: t("modelUi.imageModelDescription") };
    }
    if (capability === "video") {
        if (name.includes("veo") || name.includes("omni flash") || name.includes("omni-flash")) return { description: t("modelUi.geminiVideoDescription"), time: "3m" };
        if (name.includes("seedance") || name.includes("sora")) return { description: t("modelUi.videoShotDescription"), time: "3m" };
        return { description: t("modelUi.videoModelDescription"), time: "3m" };
    }
    if (capability === "audio") return { description: t("modelUi.audioModelDescription"), time: "20s" };
    if (name.includes("claude")) return { description: t("modelUi.writingModelDescription"), time: "10s" };
    if (name.includes("gemini")) return { description: t("modelUi.multimodalDescription"), time: "10s" };
    if (name.includes("deepseek")) return { description: t("modelUi.reasoningDescription"), time: "10s" };
    return { description: capability === "text" ? t("modelPickerUi.textModelDescription" as InterfaceMessageKey) : t("modelPickerUi.currentModelDescription" as InterfaceMessageKey), time: "10s" };
}

export function ModelIcon({ config, model, icon }: { config?: AiConfig; model?: string; icon?: string }) {
    return <ModelLogo icon={icon || (config && model ? modelIcon(config, model) : "")} size={14} />;
}
