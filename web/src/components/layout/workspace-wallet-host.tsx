import { lazy, Suspense, useEffect, useState } from "react";
import { Skeleton } from "antd";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { AppModal } from "@/components/ui/product/app-modal";
import { openWorkspaceWallet, WORKSPACE_WALLET_OPEN_EVENT, type WorkspaceWalletOpenDetail } from "@/lib/workspace-wallet";
import { useUserStore } from "@/stores/use-user-store";

const WorkspaceWalletModal = lazy(() => import("./workspace-wallet-modal").then(module => ({ default: module.WorkspaceWalletModal })));

export function WorkspaceWalletHost() {
    const creditsEnabled = useUserStore(state => state.features.creditsEnabled);
    const loggedIn = useUserStore(state => Boolean(state.user));
    const { t } = useTranslation();
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [requested, setRequested] = useState(false);
    const [openDetail, setOpenDetail] = useState<WorkspaceWalletOpenDetail>({});

    useEffect(() => {
        const handleOpen = (raw: Event) => {
            setOpenDetail((raw as CustomEvent<WorkspaceWalletOpenDetail>).detail || {});
            setRequested(true); setOpen(true);
        };
        window.addEventListener(WORKSPACE_WALLET_OPEN_EVENT, handleOpen);
        return () => window.removeEventListener(WORKSPACE_WALLET_OPEN_EVENT, handleOpen);
    }, []);
    useEffect(() => {
        if (pathname !== "/wallet") return;
        const params = new URLSearchParams(search);
        const paymentOrderId = params.get("paymentOrder") || undefined;
        openWorkspaceWallet({ tab: paymentOrderId ? "orders" : undefined, paymentOrderId, paymentInvalid: params.get("payment") === "invalid" });
        navigate("/", { replace: true });
    }, [navigate, pathname, search]);

    if (!loggedIn || !requested) return null;
    const close = () => { setOpen(false); setOpenDetail({}); };
    return <Suspense fallback={open ? (
        <AppModal
            open centered title={t(creditsEnabled ? "account.wallet.shop.title" : "account.wallet.titleStorage")}
            width="min(920px, calc(100vw - 28px))" footer={null} onCancel={close}
            getContainer={() => document.body}
        >
            <Skeleton active paragraph={{ rows: 4 }} />
        </AppModal>
    ) : null}><WorkspaceWalletModal open={open} creditsEnabled={creditsEnabled}
        initialTab={openDetail.tab}
        pendingPaymentOrderId={openDetail.paymentOrderId} paymentInvalid={openDetail.paymentInvalid}
        onClose={close} /></Suspense>;
}
