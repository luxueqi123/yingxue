import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { App, Button, Image, InputNumber, Popover, Select } from "antd";
import { useEffect, useRef, useState } from "react";
import type { CanvasNodeData, StoryboardRow } from "@/types/canvas";
import { getActiveUserScope } from "@/lib/user-scope";
import { captureStoryboardReference, saveStoryboardReferenceImage } from "@/services/storyboard-reference";

type Reference = NonNullable<StoryboardRow["videoReference"]>;
export function StoryboardReferenceCell({ value, nodes, onChange }: { value?: Reference; nodes: CanvasNodeData[]; onChange: (value: Reference | undefined) => void }) {
    const { t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const [busy, setBusy] = useState(false);
    const [videoId, setVideoId] = useState<string>();
    const fileInput = useRef<HTMLInputElement>(null);
    const current = useRef({ value, onChange });
    current.current = { value, onChange };
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const reference = value || { startTime: 0, endTime: 0, referenceFrameImage: "" };
    const run = async (operation: (assertCurrent: () => void) => Promise<Reference>) => {
        if (busy) return;
        const scope = getActiveUserScope(), original = JSON.stringify(value);
        const assertCurrent = () => {
            if (!mounted.current || getActiveUserScope() !== scope || JSON.stringify(current.current.value) !== original) throw new Error("账号或参考内容已变化，未覆盖原参考帧");
        };
        setBusy(true);
        try {
            const next = await operation(assertCurrent);
            assertCurrent();
            current.current.onChange(next);
        } catch (error) {
            if (mounted.current) message.error(error instanceof Error ? error.message : "参考帧处理失败");
        } finally { if (mounted.current) setBusy(false); }
    };
    return <div className="flex flex-col gap-1">
        {reference.referenceFrameImage && <Image width={140} src={reference.referenceFrameImage} alt={t("canvasCompleteUi.sourceReferenceFrame")} loading="lazy" />}
        <span>{reference.endTime > reference.startTime ? `${reference.startTime}–${reference.endTime} s` : reference.referenceFrameImage ? t("modelUi.referencePicture") : t("completeUi.259")}</span>
        <Popover trigger="click" content={<div className="flex w-64 flex-col gap-2" data-canvas-no-zoom>
            <label>{t("canvasCompleteUi.startSeconds")}<InputNumber className="w-full" min={0} value={reference.startTime} disabled={busy} onChange={time => {
                if (typeof time === "number" && Number.isFinite(time)) onChange({ ...reference, startTime: time, endTime: Math.max(time, reference.endTime) });
            }} /></label>
            <label>{t("canvasCompleteUi.endSeconds")}<InputNumber className="w-full" min={reference.startTime} value={reference.endTime} disabled={busy} onChange={time => {
                if (typeof time === "number" && Number.isFinite(time) && time >= reference.startTime) onChange({ ...reference, endTime: time });
            }} /></label>
            <Select aria-label={t("canvasCompleteUi.sourceVideo")} placeholder={t("canvasCompleteUi.chooseSourceVideo")} value={videoId} disabled={busy} onChange={setVideoId} options={nodes.filter(node => node.type === "video" && (node.metadata?.content || node.metadata?.storageKey)).map(node => ({ value: node.id, label: node.title }))} />
            <Button loading={busy} disabled={!videoId} onClick={() => void run(async assertCurrent => {
                const video = nodes.find(node => node.id === videoId);
                if (!video) throw new Error("原片已移除，请重新选择");
                return captureStoryboardReference(video, reference, assertCurrent);
            })}>{t("canvasCompleteUi.extractStartFrame")}</Button>
            <Button disabled={busy} onClick={() => fileInput.current?.click()}>{t("agentLocalUiUploadReferenceImage")}</Button>
            <Button disabled={busy || !value} onClick={() => onChange(undefined)}>{t("canvasCompleteUi.clearReference")}</Button>
        </div>}><Button size="small" type="text" loading={busy}>{t("canvasCompleteUi.editReference")}</Button></Popover>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={event => {
            const file = event.target.files?.[0]; event.target.value = "";
            if (file) void run(async assertCurrent => ({ ...reference, referenceFrameImage: await saveStoryboardReferenceImage(file, assertCurrent) }));
        }} />
    </div>;
}
