import type { InterfaceMessageKey } from "@/lib/interface-locale";
import type { InterfaceTranslate } from "@/lib/interface-locale";
import { useEffect, useState } from "react";
import { Dropdown, Input, InputNumber } from "antd";
import { ChevronDown, Film, TriangleAlert } from "lucide-react";

import {
    averageShotSeconds,
    clampEpisodeSeconds,
    EPISODE_PRESETS,
    formatEpisodeSeconds,
    lineTarget,
    MAX_EPISODE_SECONDS,
    MAX_SEGMENT_SECONDS,
    MIN_EPISODE_SECONDS,
    MIN_SEGMENT_SECONDS,
    normalizeStoryboard,
    parseEpisodeSeconds,
    segmentLimits,
    segmentTargetSeconds,
    shotTarget,
    TRANSITION_LABEL,
    type SegmentLimits,
} from "@/lib/drama/storyboard";
import type { DramaSegmentMode, DramaStoryboardSettings } from "@/services/api/drama";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

/** 单集时长：可直接输入“5分钟 / 300 / 2:30”，也可点右侧从常用时长里选。 */
export function EpisodeDurationInput({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
    const { t } = useInterfaceTranslation();
    const [text, setText] = useState(formatEpisodeSeconds(value));
    const [error, setError] = useState("");
    const [open, setOpen] = useState(false);
    useEffect(() => setText(formatEpisodeSeconds(value)), [value]);
    const commit = (raw: string) => {
        const parsed = parseEpisodeSeconds(raw);
        if (parsed === null) {
            setError(t("drama.storyboardRules.durationInvalid"));
            setText(formatEpisodeSeconds(value));
            return;
        }
        const seconds = clampEpisodeSeconds(parsed);
        setError(seconds !== parsed ? t("drama.storyboardRules.durationAdjusted", { min: formatEpisodeSeconds(MIN_EPISODE_SECONDS), max: formatEpisodeSeconds(MAX_EPISODE_SECONDS) }) : "");
        onChange(seconds);
        setText(formatEpisodeSeconds(seconds));
    };
    return (
        <div className="drama-field">
            <Dropdown
                open={open}
                onOpenChange={setOpen}
                trigger={["click"]}
                placement="bottomLeft"
                menu={{
                    selectable: true,
                    selectedKeys: [String(value)],
                    items: EPISODE_PRESETS.map((seconds) => ({
                        key: String(seconds),
                        label: (
                            <span className="drama-duration-option">
                                <span>{formatEpisodeSeconds(seconds)}</span>
                                <small>{t("assetsUi.durationSeconds", { seconds })}</small>
                            </span>
                        ),
                    })),
                    onClick: ({ key }) => {
                        setOpen(false);
                        setError("");
                        onChange(Number(key));
                    },
                }}
            >
                <Input
                    value={text}
                    placeholder={t("coverageUi.081")}
                    aria-label={t("drama.create.singleEpisodeDuration")}
                    onChange={(event) => {
                        setText(event.target.value);
                        setError("");
                    }}
                    onBlur={() => commit(text)}
                    onPressEnter={(event) => {
                        commit(text);
                        setOpen(false);
                        (event.target as HTMLInputElement).blur();
                    }}
                    suffix={<ChevronDown className={`size-3.5 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />}
                />
            </Dropdown>
            {error ? <small className="drama-field-error">{error}</small> : <small className="drama-field-hint">{t("drama.storyboardRules.durationEstimate", { minutes: Math.round((value / 60) * 10) / 10 })}</small>}
        </div>
    );
}

/** 剧情段切法的一句话说明，分镜规则卡与剧本页共用。 */
export function segmentRuleLabel(limits: SegmentLimits, t: InterfaceTranslate) {
    if (limits.mode === "fixed") return t("dramaUi.segmentFixed", { seconds: limits.max });
    if (limits.mode === "range") return t("dramaUi.segmentRange", { min: limits.min, max: limits.max });
    return limits.max ? t("dramaUi.segmentAutoMax", { seconds: limits.max }) : t("dramaUi.segmentAuto");
}
const PACING: Array<{ value: DramaStoryboardSettings["pacing"]; label: InterfaceMessageKey; detail: InterfaceMessageKey }> = [
    { value: "fast", label: "drama.storyboardRules.pacingFast", detail: "dramaUi.pacingFastDetail" },
    { value: "standard", label: "assetsUi.densityStandard", detail: "dramaUi.pacingStandardDetail" },
    { value: "slow", label: "drama.storyboardRules.pacingSlow", detail: "dramaUi.pacingSlowDetail" },
];
const DIALOGUE: Array<{ value: DramaStoryboardSettings["dialogue"]; label: InterfaceMessageKey; detail: InterfaceMessageKey }> = [
    { value: "dense", label: "coverageUi.082", detail: "dramaUi.dialogueDenseDetail" },
    { value: "standard", label: "assetsUi.densityStandard", detail: "dramaUi.dialogueStandardDetail" },
    { value: "sparse", label: "coverageUi.083", detail: "dramaUi.dialogueSparseDetail" },
];
const TRANSITIONS: Array<{ value: DramaStoryboardSettings["transition"]; label: InterfaceMessageKey; detail: InterfaceMessageKey }> = [
    { value: "auto", label: "drama.storyboardRules.segmentAutoLabel", detail: "dramaUi.transitionAutoDetail" },
    { value: "cut", label: "dramaUi.transitionCut", detail: "dramaUi.transitionCutDetail" },
    { value: "fadeblack", label: "dramaUi.transitionBlack", detail: "dramaUi.transitionBlackDetail" },
    { value: "fadewhite", label: "dramaUi.transitionWhite", detail: "dramaUi.transitionWhiteDetail" },
];

function Segmented<V extends string | number>({ label, value, options, onChange }: { label: string; value: V; options: Array<{ value: V; label: string; detail?: string }>; onChange: (value: V) => void }) {
    return (
        <div className="drama-tabs is-block" role="radiogroup" aria-label={label}>
            {options.map((item) => (
                <button key={String(item.value)} type="button" role="radio" className="drama-tab" aria-checked={value === item.value} title={item.detail} onClick={() => onChange(item.value)}>
                    {item.label}
                </button>
            ))}
        </div>
    );
}

/**
 * 分镜规则：决定剧情段多长、段内镜头节奏、台词密度与转场。改编剧本前设置，之后修改对新改编的集生效。
 * onEpisodeSecondsChange 有值时把“单集时长”作为第一行放进来；bare 用于已有外框的卡片内。
 */
export function StoryboardRules({
    value,
    onChange,
    episodeSeconds,
    onEpisodeSecondsChange,
    maxVideoSeconds,
    videoModelLabel,
    bare,
}: {
    value?: DramaStoryboardSettings;
    onChange: (value: DramaStoryboardSettings) => void;
    episodeSeconds: number;
    onEpisodeSecondsChange?: (seconds: number) => void;
    maxVideoSeconds?: number;
    videoModelLabel?: string;
    bare?: boolean;
}) {
    const { t } = useInterfaceTranslation();
    const rules = normalizeStoryboard(value);
    const set = (patch: Partial<DramaStoryboardSettings>) => onChange(normalizeStoryboard({ ...rules, ...patch }));
    const limits = segmentLimits(rules, maxVideoSeconds);
    const target = segmentTargetSeconds(limits);
    const modelName = videoModelLabel || t("coverageUi.296");
    // 用户填的秒数超过模型单次上限时按上限执行，明确告诉用户而不是静默改值。
    const requested = rules.segmentMode === "fixed" ? rules.segmentSeconds : rules.segmentMode === "range" ? rules.segmentMaxSeconds : 0;
    const capped = Boolean(maxVideoSeconds && requested > maxVideoSeconds);
    const segmentModes: Array<{ value: DramaSegmentMode; label: string; detail: string }> = [
        { value: "auto", label: t("drama.storyboardRules.segmentAutoLabel"), detail: t("drama.storyboardRules.segmentAutoDetail") },
        { value: "fixed", label: t("drama.storyboardRules.segmentFixedLabel"), detail: t("drama.storyboardRules.segmentFixedDetail") },
        { value: "range", label: t("drama.storyboardRules.segmentRangeLabel"), detail: t("drama.storyboardRules.segmentRangeDetail") },
    ];
    const pacingOptions = PACING.map((option) => ({ ...option, label: t(option.label), detail: t(option.detail) }));
    const number = (value: number, onValue: (seconds: number) => void, label: string, bounds: { min: number; max: number }) => (
        <InputNumber
            className="drama-sbrules-number"
            size="small"
            min={bounds.min}
            max={bounds.max}
            precision={0}
            value={value}
            suffix={t("createUiSecondUnit")}
            aria-label={label}
            onChange={(next) => {
                if (typeof next === "number") onValue(next);
            }}
        />
    );
    return (
        <div className={`drama-sbrules ${bare ? "is-bare" : ""}`}>
            {onEpisodeSecondsChange ? (
                <div className="drama-sbrules-row">
                    <span className="drama-sbrules-label">{t("drama.create.singleEpisodeDuration")}</span>
                    <div className="drama-sbrules-duration">
                        <EpisodeDurationInput value={episodeSeconds} onChange={onEpisodeSecondsChange} />
                    </div>
                </div>
            ) : null}
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{t("drama.storyboardRules.segmentSection")}</span>
                <div className="drama-sbrules-segment">
                    <Segmented label={t("drama.storyboardRules.segmentSplitAria")} value={rules.segmentMode} options={segmentModes} onChange={(segmentMode) => set({ segmentMode })} />
                    {rules.segmentMode === "fixed" ? number(rules.segmentSeconds, (segmentSeconds) => set({ segmentSeconds }), t("drama.storyboardRules.segmentDuration"), { min: MIN_SEGMENT_SECONDS, max: MAX_SEGMENT_SECONDS }) : null}
                    {rules.segmentMode === "range" ? (
                        <>
                            {number(rules.segmentMinSeconds, (segmentMinSeconds) => set({ segmentMinSeconds }), t("drama.storyboardRules.segmentMin"), { min: MIN_SEGMENT_SECONDS, max: rules.segmentMaxSeconds })}
                            <span className="drama-sbrules-dash">{t("drama.storyboardRules.rangeTo")}</span>
                            {number(rules.segmentMaxSeconds, (segmentMaxSeconds) => set({ segmentMaxSeconds }), t("drama.storyboardRules.segmentMax"), { min: rules.segmentMinSeconds, max: MAX_SEGMENT_SECONDS })}
                        </>
                    ) : null}
                    <span className="drama-sbrules-hint">
                        {rules.segmentMode === "auto"
                            ? maxVideoSeconds
                                ? t("drama.storyboardRules.segmentAutoHintWithLimit", { maxVideoSeconds, modelName })
                                : t("drama.storyboardRules.segmentAutoHintGeneric")
                            : segmentModes.find((item) => item.value === rules.segmentMode)?.detail}
                    </span>
                </div>
            </div>
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{t("drama.storyboardRules.pacingSection")}</span>
                <Segmented label={t("drama.storyboardRules.pacingSection")} value={rules.pacing} options={pacingOptions} onChange={(pacing) => set({ pacing })} />
            </div>
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{t("coverageUi.084")}</span>
                <Segmented label={t("coverageUi.084")} value={rules.dialogue} options={DIALOGUE.map((option) => ({ ...option, label: t(option.label), detail: t(option.detail) }))} onChange={(dialogue) => set({ dialogue })} />
            </div>
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{t("coverageUi.085")}</span>
                <Segmented label={t("coverageUi.086")} value={rules.transition} options={TRANSITIONS.map((option) => ({ ...option, label: t(option.label), detail: t(option.detail) }))} onChange={(transition) => set({ transition })} />
            </div>
            {rules.transition !== "cut" ? (
                <div className="drama-sbrules-row">
                    <span className="drama-sbrules-label">{t("coverageUi.087")}</span>
                    <InputNumber className="drama-sbrules-number" min={150} max={1500} step={50} value={rules.transitionMs} onChange={(next) => set({ transitionMs: next || 400 })} suffix={t("timelineMilliseconds")} aria-label={t("coverageUi.087")} />
                    <span className="drama-sbrules-hint">{t(TRANSITIONS.find((item) => item.value === rules.transition)!.detail)}</span>
                </div>
            ) : null}
            <div className="drama-sbrules-summary">
                <Film className="size-3.5" />
                <span>
                    {t("dramaUi.shotSummary", { shots: shotTarget(rules, episodeSeconds), lines: lineTarget(rules, episodeSeconds) })}
                    {target ? (
                        <>
                            {" "}
                            · {t("dramaUi.segmentSummary", { rule: segmentRuleLabel(limits, t), count: Math.max(1, Math.ceil(episodeSeconds / target)), shots: Math.max(1, Math.round(target / averageShotSeconds(rules))) })}
                        </>
                    ) : null}
                </span>
            </div>
            {capped ? (
                <p className="drama-sbrules-warn">
                    <TriangleAlert className="size-3.5 shrink-0" />
                    {t("dramaUi.segmentLimit", { model: modelName, seconds: maxVideoSeconds || 0 })}
                </p>
            ) : null}
        </div>
    );
}
