import { lazy, Suspense, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useUserFeedbackEnabled } from "@/lib/plugins/builtin/user-feedback";
const FeedbackModal = lazy(() => import("./feedback-modal").then(module => ({ default: module.FeedbackModal })));

export function TopbarFeedbackButton() {
    const { t } = useTranslation();
    const enabled = useUserFeedbackEnabled();
    const [open, setOpen] = useState(false);
    const [requested, setRequested] = useState(false);

    if (!enabled) return null;

    return (
        <>
            <button type="button" className="app-workspace-topbar-feedback-pill" aria-label={t("account.feedback.buttonLabel")} title={t("account.feedback.buttonTitle")} onClick={() => { setRequested(true); setOpen(true); }}>
                <MessageSquarePlus aria-hidden="true" />
            </button>
            {requested && <Suspense fallback={null}><FeedbackModal open={open} onClose={() => setOpen(false)} /></Suspense>}
        </>
    );
}
