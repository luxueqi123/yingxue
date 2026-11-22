import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, Modal, Spin } from "antd";
import { Copy, Link2, RefreshCw, Share2, Unlink } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { createCanvasShare, deleteCanvasShare, getCanvasShare, type CanvasShareStatus } from "@/services/api/canvas-share";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { Select } from "@/components/ui/base/select";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

export function CanvasShareModal({ projectId, open, onClose, beforeCreate }: { projectId: string; open: boolean; onClose: () => void; beforeCreate: () => Promise<boolean | void> }) {
    const { t } = useInterfaceTranslation();
    const { t: translate } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { message, modal } = App.useApp();
    const theme = canvasThemes[useActiveTheme()];
    const [share, setShare] = useState<CanvasShareStatus>({ enabled: false });
    const [expiresDays, setExpiresDays] = useState(0);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [openingSubmission, setOpeningSubmission] = useState(false);
    const submissionLock = useRef(false);
    const shareUrl = useMemo(() => (share.token ? `${window.location.origin}/share/canvas/${share.token}` : ""), [share.token]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getCanvasShare(projectId);
            setShare(result.share);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取分享状态失败");
        } finally {
            setLoading(false);
        }
    }, [message, projectId]);

    useEffect(() => {
        if (open) void load();
    }, [load, open]);

    const copy = async (value = shareUrl) => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        message.success(t("canvasCompleteUi.shareLinkCopied"));
    };

    const create = async (rotate = false) => {
        setSubmitting(true);
        try {
            const saved = await beforeCreate();
            if (saved === false) return;
            const result = await createCanvasShare(projectId, { expiresDays, rotate });
            setShare(result.share);
            const url = result.share.token ? `${window.location.origin}/share/canvas/${result.share.token}` : "";
            await copy(url);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建分享链接失败");
        } finally {
            setSubmitting(false);
        }
    };

    const revoke = () =>
        modal.confirm({
            title: t("canvasCompleteUi.stopShareConfirm"),
            content: "现有分享链接会立即失效，原画布内容不会被删除。",
            okText: t("canvasCompleteUi.stopSharing"),
            okButtonProps: { danger: true },
            cancelText: t("timelineCancel"),
            onOk: async () => {
                await deleteCanvasShare(projectId);
                setShare({ enabled: false });
                message.success(t("canvasCompleteUi.sharingStopped"));
            },
        });

    const openSubmission = async () => {
        if (submissionLock.current) return;
        submissionLock.current = true;
        setOpeningSubmission(true);
        try {
            if ((await beforeCreate()) === false) return;
            onClose();
            navigate(`/my/works?projectId=${encodeURIComponent(projectId)}`, { state: { returnTo: location.pathname + location.search, returnState: location.state } });
        } catch (error) {
            void message.error(error instanceof Error ? error.message : translate("communityWorks.failed"));
        } finally {
            submissionLock.current = false;
            setOpeningSubmission(false);
        }
    };

    return (
        <Modal
            title={
                <span className="inline-flex items-center gap-2">
                    <Share2 className="size-4" />
                    {t("canvasToolbarShare")}
                </span>
            }
            open={open}
            onCancel={onClose}
            footer={null}
            centered
            width={520}
            destroyOnHidden
        >
            <Spin spinning={loading}>
                <div className="border-t pt-5" style={{ borderColor: theme.node.stroke }}>
                    <p className="mb-4 text-sm leading-6" style={{ color: theme.node.muted }}>
                        {t("canvasCompleteUi.shareHelp")}
                    </p>
                    {share.enabled && shareUrl ? (
                        <div className="space-y-4">
                            <Input value={shareUrl} readOnly suffix={<Button type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<Copy className="size-3.5" />} onClick={() => void copy()} aria-label={t("canvasCompleteUi.copyShareLink")} />} />
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-xs" style={{ color: theme.node.muted }}>
                                    {share.expiresAt ? t("canvasCompleteUi.expires", { value0: new Date(share.expiresAt).toLocaleString("zh-CN") }) : t("canvasCompleteUi.shareIndefinite")}
                                </span>
                                <div className="flex gap-2">
                                    <Button icon={<RefreshCw className="size-3.5" />} loading={submitting} onClick={() => void create(true)}>
                                        {t("canvasCompleteUi.regenerateLink")}
                                    </Button>
                                    <Button danger icon={<Unlink className="size-3.5" />} onClick={revoke}>
                                        {t("canvasCompleteUi.stopSharing")}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Select
                                value={expiresDays}
                                onChange={setExpiresDays}
                                className="min-w-40"
                                options={[
                                    { value: 0, label: t("completeUi.212") },
                                    { value: 7, label: t("completeUi.213") },
                                    { value: 30, label: t("completeUi.214") },
                                ]}
                            />
                            <Button type="primary" icon={<Link2 className="size-4" />} loading={submitting} onClick={() => void create(false)}>
                                {t("canvasCompleteUi.createCopyLink")}
                            </Button>
                        </div>
                    )}
                </div>
            </Spin>
            <Button block className="mt-4" loading={openingSubmission} disabled={submitting} onClick={() => void openSubmission()}>
                {translate("communityWorks.create")}
            </Button>
        </Modal>
    );
}
