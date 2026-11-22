import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { Button } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { lazy, Suspense, useEffect, useState } from "react";

import { Mic } from "lucide-react";

import { cn } from "@/lib/utils";
const VoiceRecordingInline = lazy(() => import("./voice-recording-inline").then((module) => ({ default: module.VoiceRecordingInline })));
import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";

type VoiceRecordingButtonProps = {
    onRequireLogin?: () => void;
    /** 转写完成回调，返回转写文本 */
    onTranscribed: (text: string) => void;
    /** 是否禁用（如发送中或未连接） */
    disabled?: boolean;
    className?: string;
};

/**
 * 语音输入按钮：点击后在输入行内展开波形录制条，录制完成自动 STT 转写
 * 使用局部状态，多个输入行可独立使用
 */
export function VoiceRecordingButton({ onTranscribed, disabled, className, onRequireLogin }: VoiceRecordingButtonProps) {
    const { t } = useInterfaceTranslation();
    const theme = canvasThemes[useActiveTheme()];
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    return (
        <>
            <Tooltip title={t("sharedDialogsUi.voiceLive")}>
                <Button
                    type="text"
                    shape="circle"
                    className={cn("!h-8 !w-8 !min-w-8", className)}
                    disabled={disabled}
                    style={className ? undefined : { color: theme.node.muted }}
                    icon={<Mic className="size-4" />}
                    onClick={() => onRequireLogin ? onRequireLogin() : setOpen(true)}
                    aria-label={t("sharedDialogsUi.voiceLive")}
                />
            </Tooltip>
            {open && !disabled ? (
                <Suspense fallback={<span role="status">正在打开语音输入…</span>}>
                    <VoiceRecordingInline
                        onTranscribed={(text) => {
                            setOpen(false);
                            onTranscribed(text);
                        }}
                        onCancel={() => setOpen(false)}
                    />
                </Suspense>
            ) : null}
        </>
    );
}
