import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { readKlingCustomShots } from "@/lib/canvas/ltv-kling-options";
import type { CanvasNodeMetadata } from "@/types/canvas";

type KlingOptions = NonNullable<CanvasNodeMetadata["videoKling"]>;

export function CanvasKlingStoryboardSettings({ value, duration, onChange }: {
    value: KlingOptions;
    duration: number;
    onChange?: (value: KlingOptions) => void;
}) {
    const { t } = useInterfaceTranslation();
    const shots = value.multiPrompt ?? [];
    let error = "";
    try { readKlingCustomShots(shots, value.multiShot, duration); }
    catch (cause) { error = cause instanceof Error ? cause.message : "请检查分镜参数。"; }
    const update = (next: NonNullable<KlingOptions["multiPrompt"]>) => onChange?.({ ...value, multiShot: true, multiPrompt: next.map((shot, index) => ({ ...shot, index: index + 1 })) });
    return <fieldset className="space-y-2" disabled={!onChange}>
        <legend className="text-xs font-medium">{t("canvasCompleteUi.shotArrangement")}</legend>
        <label className="flex items-center gap-2">
            <input type="checkbox" aria-label={t("canvasCompleteUi.klingMultishot")} checked={value.multiShot} disabled={shots.length > 0} onChange={event => onChange?.({ ...value, multiShot: event.target.checked })} />
            {shots.length ? t("canvasCompleteUi.customMultishot") : t("canvasCompleteUi.smartStoryboard")}
        </label>
        {shots.length > 0 ? <p className="text-xs opacity-70">{t("canvasCompleteUi.multishotDurationHelp", { duration })}</p> : null}
        {shots.map((shot, index) => <div key={index} className="space-y-1 rounded border border-current/15 p-2">
            <label className="block text-xs">{t("creationPageShot")} {index + 1}
                <textarea aria-label={t("canvasCompleteUi.shotBody", { value0: index + 1 })} rows={2} maxLength={2500} className="mt-1 block w-full resize-y rounded border border-current/20 bg-transparent p-1 text-sm" value={shot.prompt} onChange={event => update(shots.map((item, i) => i === index ? { ...item, prompt: event.target.value } : item))} />
            </label>
            <div className="flex items-center justify-between gap-2 text-xs">
                <label>{t("canvasCompleteUi.durationSeconds")} <input aria-label={t("canvasCompleteUi.shotDuration", { value0: index + 1 })} type="number" min={1} max={15} step={1} className="w-14 rounded border border-current/20 bg-transparent px-1" value={shot.duration} onChange={event => update(shots.map((item, i) => i === index ? { ...item, duration: event.target.value } : item))} /></label>
                <button type="button" aria-label={t("canvasCompleteUi.deleteShot", { value0: index + 1 })} onClick={() => update(shots.filter((_, i) => i !== index))}>{t("canvasLibraryDelete")}</button>
            </div>
        </div>)}
        <button type="button" className="text-xs underline underline-offset-2 disabled:opacity-40" disabled={!onChange || shots.length >= 6} onClick={() => update([...shots, { index: shots.length + 1, prompt: "", duration: String(Math.max(1, duration - shots.reduce((sum, shot) => sum + Number(shot.duration || 0), 0))) }])}>{t("canvasCompleteUi.addCustomShot")}</button>
        {error ? <p role="alert" className="text-xs">{error}</p> : null}
    </fieldset>;
}
