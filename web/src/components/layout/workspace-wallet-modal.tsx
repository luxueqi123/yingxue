import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Input, Skeleton } from "antd";
import { ChevronLeft, ChevronRight, CircleAlert, HardDrive, History, Infinity, RefreshCw, TicketCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { WalletTopupPanel } from "@/components/layout/workspace-wallet-topup";
import { WalletHistoryRow } from "@/components/layout/workspace-wallet-history-row";
import { WalletMembershipPanel } from "@/components/layout/workspace-wallet-membership";
import { usePaymentOrderFlow } from "@/components/payment/use-payment-order-flow";
import { PaymentOrdersPanel, paymentOrdersQueryKey } from "@/components/payment/payment-orders-panel";
import { AppModal } from "@/components/ui/product/app-modal";
import { formatCredits } from "@/constant/credits";
import { useAccountFileStorageUsage } from "@/hooks/use-account-file-storage-usage";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { accountFileStorageUsageQueryKey, accountStorageMeter } from "@/lib/account-storage-usage";
import { estimatePaymentCharge, paymentOptionsFromProviders, type PaymentOption } from "@/lib/payment-options";
import { getPaymentSettings, listPaymentProviders, listTopupProducts, type PaymentOrder, type TopupProduct } from "@/services/api/payments";
import { listMyStorageGrants } from "@/services/api/storage-grants";
import { getWallet, redeemCredits, type CreditLedgerEntry, type WalletHistoryType, type WalletSummary } from "@/services/api/wallet";
import { cn } from "@/lib/utils";
import type { WorkspaceWalletOpenDetail } from "@/lib/workspace-wallet";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { useUserStore } from "@/stores/use-user-store";

type WalletModalTab = NonNullable<WorkspaceWalletOpenDetail["tab"]>;
const shopSections = ["membership", "unlimited", "topup"] as const;

const storageGrantsQueryKey = ["account-storage-grants"] as const;
const emptyProducts: TopupProduct[] = [];
const emptyPaymentOptions: PaymentOption[] = [];

export function WorkspaceWalletModal({
    open,
    onClose,
    creditsEnabled = true,
    initialTab,
    pendingPaymentOrderId,
    paymentInvalid,
    preview,
}: {
    open: boolean;
    onClose: () => void;
    creditsEnabled?: boolean;
    initialTab?: WalletModalTab;
    pendingPaymentOrderId?: string;
    paymentInvalid?: boolean;
    preview?: { membership: ReactNode; creditProducts: TopupProduct[]; creditsPerYuan: number };
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const userId = useUserStore((state) => state.user?.id);
    const redeemPurchaseUrl = useAppearanceStore((state) => state.appearance.redeemPurchaseUrl);
    const [tab, setTab] = useState<WalletModalTab>(initialTab ?? "membership");
    const [walletResult, setWalletResult] = useState<{ type: WalletHistoryType; data: WalletSummary } | null>(null);
    const [walletLoading, setWalletLoading] = useState(false);
    const [walletError, setWalletError] = useState("");
    const [page, setPage] = useState(1);
    const [selectedProductId, setSelectedProductId] = useState("");
    const [selectedOptionKey, setSelectedOptionKey] = useState("");
    const [code, setCode] = useState("");
    const [redeeming, setRedeeming] = useState(false);
    const requestSequence = useRef(0);
    const historyAbort = useRef<AbortController | null>(null);
    const activeTab: WalletModalTab = creditsEnabled || tab === "orders" ? tab : "storage";
    const realView = open && !preview;
    const storageView = realView && activeTab === "storage";
    const balance = useWalletBalance(userId, realView && creditsEnabled);
    const storageQuery = useAccountFileStorageUsage(storageView);
    const grantsQuery = useQuery({ queryKey: storageGrantsQueryKey, queryFn: listMyStorageGrants, enabled: storageView });
    const storageMeter = accountStorageMeter(storageQuery.data);

    const productsView = realView && (activeTab === "topup" || activeTab === "storage");
    const productQueryKey = ["wallet-shop-products", userId] as const;
    const productQuery = useQuery({ queryKey: productQueryKey, queryFn: ({ signal }) => listTopupProducts(signal), enabled: productsView });
    const productKind = activeTab === "storage" ? "storage" : "credits";
    const catalog = preview?.creditProducts ?? productQuery.data?.products ?? emptyProducts;
    const categoryProducts = useMemo(() => catalog.filter((item) => item.enabled && item.kind === productKind), [catalog, productKind]);
    const selectedProduct = categoryProducts.find((item) => item.id === selectedProductId) ?? categoryProducts.find((item) => item.canPurchase);
    const checkoutEnabled = productsView && (!productQuery.data || categoryProducts.some((item) => item.canPurchase));
    const checkout = useQuery({
        queryKey: ["wallet-shop-checkout", userId],
        enabled: checkoutEnabled,
        queryFn: async ({ signal }) => {
            const [providers, settings] = await Promise.all([listPaymentProviders(signal), getPaymentSettings(signal)]);
            const usable = providers.providers.filter((item) => item.enabled && item.pluginEnabled && item.configured);
            return { options: paymentOptionsFromProviders(usable), usdCnyRate: settings.settings.usdCnyRate };
        },
    });
    const paymentOptions = checkout.data?.options ?? emptyPaymentOptions;
    const usdCnyRate = checkout.data?.usdCnyRate ?? "";
    const selectedOption = useMemo(() => paymentOptions.find((item) => item.key === selectedOptionKey), [paymentOptions, selectedOptionKey]);
    const historyType = activeTab === "income" ? "income" : "expenses";
    const wallet = walletResult?.data;
    const historyWallet = walletResult?.type === historyType ? wallet : undefined;

    const reloadWallet = async (targetPage = page, targetType: WalletHistoryType = historyType) => {
        if (!creditsEnabled || preview) return;
        const sequence = ++requestSequence.current;
        historyAbort.current?.abort();
        const controller = new AbortController();
        historyAbort.current = controller;
        setWalletLoading(true);
        setWalletError("");
        try {
            const result = await getWallet(targetPage, 20, targetType, controller.signal);
            if (sequence === requestSequence.current) setWalletResult({ type: targetType, data: result });
        } catch (error) {
            if (sequence === requestSequence.current) setWalletError(error instanceof Error ? error.message : t("account.wallet.loadFailed"));
        } finally {
            if (sequence === requestSequence.current) setWalletLoading(false);
        }
    };

    const openHistory = (nextTab: "income" | "history") => {
        setTab(nextTab);
        setPage(1);
        void reloadWallet(1, nextTab === "income" ? "income" : "expenses");
    };

    useEffect(() => {
        setTab(initialTab ?? "membership");
        setPage(1);
        if (!open) return;
        if (initialTab === "income" || initialTab === "history") void reloadWallet(1, initialTab === "income" ? "income" : "expenses");
        return () => {
            requestSequence.current += 1;
            historyAbort.current?.abort();
        };
    }, [open]);

    useEffect(() => {
        if (!open || !paymentInvalid) return;
        message.error(t("account.wallet.paymentInvalid"));
    }, [open, paymentInvalid]);

    const announceWalletUpdated = async () => {
        setPage(1);
        window.dispatchEvent(new CustomEvent("wallet:updated"));
        if (activeTab === "income" || activeTab === "history") await reloadWallet(1);
    };

    const announceGranted = async (order: PaymentOrder) => {
        void queryClient.invalidateQueries({ queryKey: productQueryKey });
        if (order.productKind === "storage") {
            await Promise.all([queryClient.invalidateQueries({ queryKey: accountFileStorageUsageQueryKey }), queryClient.invalidateQueries({ queryKey: storageGrantsQueryKey })]);
            return;
        }
        await announceWalletUpdated();
    };

    const payment = usePaymentOrderFlow({ onGranted: announceGranted });

    useEffect(() => {
        if (payment.order) void queryClient.invalidateQueries({ queryKey: paymentOrdersQueryKey });
    }, [payment.order, queryClient]);

    useEffect(() => {
        payment.resetIdempotency();
    }, [selectedProduct?.id, selectedOptionKey]);

    // 换了套餐后，当前支付入口可能因币种无法换算而不可用，改选第一个可用入口。
    useEffect(() => {
        if (!selectedProduct || !paymentOptions.length) return;
        const payable = (option: PaymentOption) => Boolean(estimatePaymentCharge(selectedProduct.amountFen, selectedProduct.currency, option.settlementCurrency, usdCnyRate));
        if (selectedOption && payable(selectedOption)) return;
        const next = paymentOptions.find(payable);
        if (next) setSelectedOptionKey(next.key);
    }, [selectedProduct, paymentOptions, selectedOption, usdCnyRate]);

    useEffect(() => {
        if (!open || !pendingPaymentOrderId || preview) return;
        void payment.showOrder(pendingPaymentOrderId);
    }, [open, pendingPaymentOrderId]);

    const redeem = async () => {
        const normalized = code.trim().toLowerCase();
        if (normalized.length !== 32) {
            message.error(t("account.wallet.redeemCodeInvalid"));
            return;
        }
        setRedeeming(true);
        try {
            await redeemCredits(normalized);
            setCode("");
            await announceWalletUpdated();
            message.success(t("account.wallet.redeemSuccess"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("account.wallet.redeemFailed"));
        } finally {
            setRedeeming(false);
        }
    };

    const startPayment = async () => {
        if (preview || checkout.isPending || checkout.isError) return;
        if (!selectedProduct || !selectedOption) {
            message.error(t("account.wallet.selectRequired"));
            return;
        }
        if (!selectedProduct.canPurchase) {
            message.error(t("account.wallet.productUnavailable"));
            return;
        }
        await payment.start(selectedProduct.id, selectedOption.providerId, selectedOption.method);
    };

    const title = t(creditsEnabled ? "account.wallet.shop.title" : "account.wallet.titleStorage");
    const available = balance.availableMicrocredits ?? wallet?.account.availableMicrocredits;
    const reserved = balance.reservedMicrocredits ?? wallet?.account.reservedMicrocredits;
    const totalPages = Math.max(1, Math.ceil((historyWallet?.total || 0) / 20));

    return (
        <>
            <AppModal
                flush
                open={open}
                title={<span className="sr-only">{title}</span>}
                footer={null}
                centered
                width="min(920px, calc(100vw - 28px))"
                onCancel={onClose}
                rootClassName="workspace-wallet-modal"
                classNames={{ header: "workspace-wallet-modal-label" }}
                getContainer={() => document.body}
            >
                <div className="workspace-wallet-shell" data-section={activeTab} data-preview={preview ? "" : undefined}>
                    <header className="workspace-wallet-header">
                        <div>
                            <h2>{title}</h2>
                            {preview ? <p>{t("account.wallet.shop.preview")}</p> : null}
                        </div>
                        <div className="workspace-wallet-stats">
                            {creditsEnabled && !preview ? (
                                <div className="workspace-wallet-balance">
                                    <span>{t("shell.account.availableCredits")}</span>
                                    <strong>{available === undefined ? "--" : formatCredits(available, 6)}</strong>
                                    <small>{t("account.wallet.reserved", { amount: reserved === undefined ? "--" : formatCredits(reserved, 6) })}</small>
                                </div>
                            ) : null}
                            <button type="button" className="workspace-wallet-balance is-storage" aria-label={t("account.wallet.viewStorage")} aria-pressed={activeTab === "storage"} onClick={() => setTab("storage")}>
                                <span>
                                    <HardDrive className="inline size-3 align-[-1px]" aria-hidden="true" /> {t("account.wallet.storage")}
                                </span>
                                {!preview && (
                                    <>
                                        <strong>{storageQuery.data ? `${storageMeter.usedLabel} / ${storageMeter.totalLabel}` : "--"}</strong>
                                        <span className="wallet-topup-storage-track" aria-hidden="true">
                                            <span style={{ width: `${storageMeter.percent}%` }} />
                                        </span>
                                        <small>
                                            {storageMeter.state === "read_only"
                                                ? t("account.wallet.storageReadOnly")
                                                : storageMeter.state === "grace"
                                                  ? t("account.wallet.storageGrace")
                                                  : storageMeter.purchasedLabel
                                                    ? t("account.wallet.storagePurchased", { size: storageMeter.purchasedLabel })
                                                    : t("account.layout.storage.remaining", { size: storageMeter.remainingLabel })}
                                        </small>
                                    </>
                                )}
                            </button>
                        </div>
                    </header>

                    <div className="workspace-wallet-navigation">
                        {creditsEnabled ? (
                            <div className="workspace-wallet-tabs" role="group" aria-label={t("account.wallet.shop.categories")}>
                                {shopSections.map((section) => (
                                    <button key={section} type="button" aria-pressed={activeTab === section} onClick={() => setTab(section)}>
                                        {t(`account.wallet.shop.${section}`)}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        <div className="workspace-wallet-actions" role="group" aria-label={t("account.wallet.shop.tools")}>
                            <button type="button" aria-pressed={activeTab === "orders"} onClick={() => setTab("orders")}>
                                {t("account.payment.ordersTitle")}
                            </button>
                            {creditsEnabled && (
                                <>
                                    <button type="button" aria-pressed={activeTab === "redeem"} onClick={() => setTab("redeem")}>
                                        {t("account.wallet.tabRedeem")}
                                    </button>
                                    <button type="button" aria-pressed={activeTab === "income"} onClick={() => openHistory("income")}>
                                        {t("account.wallet.tabIncome")}
                                    </button>
                                    <button type="button" aria-pressed={activeTab === "history"} onClick={() => openHistory("history")}>
                                        {t("account.wallet.tabHistory")}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {activeTab === "membership" ? (
                        (preview?.membership ?? (
                            <WalletMembershipPanel
                                onManage={() => {
                                    onClose();
                                    navigate("/membership");
                                }}
                            />
                        ))
                    ) : activeTab === "unlimited" ? (
                        <div className="workspace-wallet-content">
                            <div className="workspace-wallet-shop-empty">
                                <Infinity size={27} aria-hidden />
                                <p>{t("account.wallet.shop.noUnlimited")}</p>
                            </div>
                        </div>
                    ) : activeTab === "topup" || activeTab === "storage" ? (
                        productQuery.isError && !preview ? (
                            <div className="workspace-wallet-content wallet-shop-membership">
                                <Alert type="error" title={t("account.wallet.configLoadFailed")} description={productQuery.error.message} action={<Button onClick={() => void productQuery.refetch()}>{t("common.refresh")}</Button>} />
                            </div>
                        ) : (
                            <WalletTopupPanel
                                loading={!preview && productQuery.isPending}
                                kind={productKind}
                                products={categoryProducts}
                                paymentOptions={paymentOptions}
                                usdCnyRate={usdCnyRate}
                                previewDescription={preview && t("account.wallet.shop.previewTopup", { credits: preview.creditsPerYuan })}
                                selectedProduct={selectedProduct}
                                onSelectProduct={setSelectedProductId}
                                selectedOptionKey={selectedOptionKey}
                                onSelectOption={setSelectedOptionKey}
                                creating={payment.creating}
                                checkoutLoading={checkoutEnabled && checkout.isPending}
                                checkoutError={checkoutEnabled && checkout.isError ? checkout.error.message : undefined}
                                onRetryCheckout={() => void checkout.refetch()}
                                onPay={() => void startPayment()}
                                storageUsage={storageQuery.data}
                                storageGrants={grantsQuery.data?.grants || []}
                                onCleanAssets={() => {
                                    onClose();
                                    navigate("/assets");
                                }}
                            />
                        )
                    ) : preview ? (
                        <div className="workspace-wallet-content">
                            <div className="workspace-wallet-shop-empty">
                                <p>{t("account.wallet.shop.previewAccount")}</p>
                            </div>
                        </div>
                    ) : activeTab === "orders" ? (
                        <PaymentOrdersPanel onOpen={(id) => void payment.showOrder(id)} />
                    ) : activeTab === "redeem" ? (
                        <div className="workspace-wallet-content is-redeem">
                            <section className="workspace-wallet-section is-redeem">
                                <div className="workspace-wallet-section-heading">
                                    <div>
                                        <h3>{t("account.wallet.redeemTitle")}</h3>
                                        <p>
                                            {t("account.wallet.redeemDescription")}
                                            {redeemPurchaseUrl ? (
                                                <a className="workspace-wallet-redeem-link" href={redeemPurchaseUrl} target="_blank" rel="noopener noreferrer">
                                                    {t("account.wallet.redeemGet")}
                                                </a>
                                            ) : null}
                                        </p>
                                    </div>
                                    <TicketCheck />
                                </div>
                                <div className="workspace-wallet-redeem-row">
                                    <Input size="large" value={code} maxLength={32} placeholder={t("account.wallet.redeemPlaceholder")} onChange={(event) => setCode(event.target.value.replace(/\s/g, ""))} onPressEnter={() => void redeem()} />
                                    <Button size="large" loading={redeeming} disabled={code.trim().length !== 32} onClick={() => void redeem()}>
                                        {t("account.wallet.redeemSubmit")}
                                    </Button>
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div className="workspace-wallet-content is-history">
                            <div className="workspace-wallet-history-toolbar">
                                <div>
                                    <h3>{t(activeTab === "income" ? "account.wallet.tabIncome" : "account.wallet.tabHistory")}</h3>
                                    <p>{t(activeTab === "income" ? "account.wallet.incomeDescription" : "account.wallet.historyDescription")}</p>
                                </div>
                                <Button type="text" icon={<RefreshCw />} loading={walletLoading} onClick={() => void reloadWallet(page)}>
                                    {t("common.refresh")}
                                </Button>
                            </div>
                            <div className="workspace-wallet-history-scroll">
                                {walletError ? (
                                    <div className="workspace-wallet-inline-state is-error">
                                        <CircleAlert />
                                        <div>
                                            <strong>{t("account.wallet.historyLoadFailed")}</strong>
                                            <span>{walletError}</span>
                                        </div>
                                        <Button onClick={() => void reloadWallet(page)}>{t("common.retry")}</Button>
                                    </div>
                                ) : walletLoading && !historyWallet ? (
                                    <Skeleton active paragraph={{ rows: 6 }} />
                                ) : historyWallet?.entries.length ? (
                                    <div className="workspace-wallet-ledger">
                                        {historyWallet.entries.map((entry) => (
                                            <WalletHistoryRow key={`${entry.type}:${entry.id}`} entry={entry} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="workspace-wallet-empty">
                                        <History />
                                        <strong>{t(activeTab === "income" ? "account.wallet.incomeEmpty" : "account.wallet.historyEmpty")}</strong>
                                        <span>{t(activeTab === "income" ? "account.wallet.incomeEmptyHint" : "account.wallet.historyEmptyHint")}</span>
                                    </div>
                                )}
                            </div>
                            <div className="workspace-wallet-pagination">
                                <span>{t("account.wallet.pageOf", { page, total: totalPages })}</span>
                                <button
                                    type="button"
                                    disabled={page <= 1 || walletLoading}
                                    aria-label={t("account.layout.pagination.prev")}
                                    onClick={() => {
                                        const next = page - 1;
                                        setPage(next);
                                        void reloadWallet(next);
                                    }}
                                >
                                    <ChevronLeft />
                                </button>
                                <button
                                    type="button"
                                    disabled={page >= totalPages || walletLoading}
                                    aria-label={t("account.layout.pagination.next")}
                                    onClick={() => {
                                        const next = page + 1;
                                        setPage(next);
                                        void reloadWallet(next);
                                    }}
                                >
                                    <ChevronRight />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </AppModal>

            {payment.dialog}
        </>
    );
}
