import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { InputNumber, Select } from "antd";
import { useState } from "react";
import { editLtvPrevisCameraMotion, type LtvPrevisCameraMotionEdit } from "@/lib/canvas/previs/ltv-director-camera-motion";
import type { PrevisLtvCameraMotion, PrevisVec3 } from "@/types/previs";

export function PrevisLtvCameraMotionEditor({ motion, onChange }: { motion: PrevisLtvCameraMotion; onChange: (motion: PrevisLtvCameraMotion) => void }) {
    const { t } = useInterfaceTranslation();
    const [selected, setSelected] = useState(0);
    const [error, setError] = useState("");
    const index = Math.min(selected, motion.path.bezierPoints.length - 1);
    const point = motion.path.bezierPoints[index];
    const apply = (edit: LtvPrevisCameraMotionEdit) => {
        try { const next = editLtvPrevisCameraMotion(motion, edit); onChange(next); setError(""); }
        catch (failure) { setError(failure instanceof Error ? failure.message : t("canvasPrevisMotionPathEditFailed")); }
    };
    return <section className="space-y-3" aria-label={t("canvasPrevisUi170")}>
        <p className="text-xs opacity-70">{t("canvasPrevisUi171")}</p>
        <label className="block space-y-1 text-xs">{t("canvasPrevisUi172")}
            <InputNumber aria-label={t("canvasPrevisUi173")} className="w-full" min={0.001} max={motion.duration} step={0.1} value={motion.path.end} onChange={value => { if (value !== null) apply({ kind: "end", value }); }} />
        </label>
        <label className="block space-y-1 text-xs">{t("canvasPrevisUi174")}
            <Select aria-label={t("canvasPrevisUi174")} className="w-full" value={index} options={motion.path.bezierPoints.map((_, value) => ({ value, label: t("canvasPrevisDyn016", { index: value + 1 }) }))} onChange={setSelected} />
        </label>
        <MotionVectorField label={t("canvasPrevisUi175")} value={point.anchor} onChange={value => apply({ kind: "anchor", index, value })} />
        {point.in ? <MotionVectorField label={t("canvasPrevisUi176")} value={point.in} onChange={value => apply({ kind: "in", index, value })} /> : null}
        {point.out ? <MotionVectorField label={t("canvasPrevisUi177")} value={point.out} onChange={value => apply({ kind: "out", index, value })} /> : null}
        <MotionVectorField label={t("canvasPrevisUi178")} value={motion.path.offset} onChange={value => apply({ kind: "offset", value })} />
        {error ? <p role="alert" className="text-xs">{error}</p> : null}
    </section>;
}

function MotionVectorField({ label, value, onChange }: { label: string; value: PrevisVec3; onChange: (value: PrevisVec3) => void }) {
    return <fieldset className="space-y-1"><legend className="text-xs">{label}</legend><div className="grid grid-cols-3 gap-1">
        {(["X", "Y", "Z"] as const).map((axis, index) => <InputNumber key={axis} aria-label={`${label} ${axis}`} className="w-full" step={0.1} value={value[index]} onChange={next => {
            if (next === null || !Number.isFinite(next)) return;
            const vector = [...value] as PrevisVec3; vector[index] = next; onChange(vector);
        }} />)}
    </div></fieldset>;
}
