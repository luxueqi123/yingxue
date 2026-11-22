import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlipayCircleFilled, WechatFilled } from "@ant-design/icons";
import { App, Button, Grid, Input, Modal, QRCode, Skeleton, Table, Tag } from "antd";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import type { ColumnsType } from "antd/es/table";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, CalendarCheck, Coins, CreditCard, RefreshCw, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, TicketCheck } from "lucide-react";

import { formatCredits } from "@/constant/credits";
import { accountFileStorageUsageQueryKey, formatStorageCapacity, formatStorageDuration } from "@/lib/account-storage-usage";
import type { InterfaceLocale, InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { PaginationBar, TableSurface } from "@/components/layout/workspace-page";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { checkinCredits, getWallet, redeemCredits, type CreditLedgerEntry, type WalletCreditEntry, type WalletHistoryEntry, type WalletSummary } from "@/services/api/wallet";
import { WalletHistoryRow } from "@/components/layout/workspace-wallet-history-row";
import { closePaymentOrder, createPaymentOrder, getPaymentOrder, listPaymentOrders, listPaymentProviders, listTopupProducts, queryPaymentOrder, refreshPaymentCheckout, type PaymentOrder, type PaymentProvider, type TopupProduct } from "@/services/api/payments";
import { modelDisplayName, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import "@/components/payment/payment-method-colors.css";

type LedgerFilter = "all" | "income" | "consume" | "refund";

export default function WalletPage() {
    const { locale, t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const screens = Grid.useBreakpoint();
    const reducedMotion = useReducedMotion();
    const config = useEffectiveConfig();
    const [wallet, setWallet] = useState<WalletSummary | null>(null);
    const [code, setCode] = useState("");
    const [filter, setFilter] = useState<LedgerFilter>("all");
    const [loading, setLoading] = useState(false);
    const [redeeming, setRedeeming] = useState(false);
    const [checkingIn, setCheckingIn] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [paymentProducts, setPaymentProducts] = useState<TopupProduct[]>([]);
    const [paymentProviders, setPaymentProviders] = useState<PaymentProvider[]>([]);
    const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
    const [paymentsLoading, setPaymentsLoading] = useState(true);
    const [selectedProductId, setSelectedProductId] = useState("");
    const [selectedProviderId, setSelectedProviderId] = useState("");
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"alipay" | "wxpay">("alipay");
    const [paymentCreating, setPaymentCreating] = useState(false);
    const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [paymentQuerying, setPaymentQuerying] = useState(false);
    const [clock, setClock] = useState(Date.now());
    const requestSequence = useRef(0);
    const paymentPollSequence = useRef(0);
    const paymentRefreshInFlight = useRef(false);
    const nextPaymentRefreshAt = useRef(0);
    const paymentIdempotencyKey = useRef("");
    const completedPaymentOrderId = useRef("");

    const reload = async (targetPage = page, targetPageSize = pageSize, propagateError = false) => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        try {
            const nextWallet = await getWallet(targetPage, targetPageSize, filter);
            if (sequence === requestSequence.current) setWallet(nextWallet);
        } catch (error) {
            if (sequence === requestSequence.current) message.error(error instanceof Error ? error.message : t("storageUi.walletLoadFailed"));
            if (propagateError) throw error;
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    };

    useEffect(() => {
        void reload(page, pageSize);
    }, [filter, page, pageSize]);

    useEffect(() => {
        let active = true;
        setPaymentsLoading(true);
        Promise.all([listTopupProducts(), listPaymentProviders(), listPaymentOrders({ page: 1, pageSize: 10 })])
            .then(([productsResult, providersResult, ordersResult]) => {
                if (!active) return;
                setPaymentProducts(productsResult.products);
                setPaymentProviders(providersResult.providers);
                setPaymentOrders(ordersResult.items);
                setSelectedProductId((current) => current || productsResult.products[0]?.id || "");
                setSelectedProviderId((current) => current || providersResult.providers[0]?.id || "");
            })
            .catch((error) => {
                if (active) message.error(error instanceof Error ? error.message : t("storageUi.topupConfigLoadFailed"));
            })
            .finally(() => {
                if (active) setPaymentsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const returnedOrderId = new URLSearchParams(window.location.search).get("paymentOrder");
        if (!returnedOrderId) return;
        getPaymentOrder(returnedOrderId)
            .then(({ order }) => {
                if(order.productKind === "membership") { window.location.replace(`/membership?paymentOrder=${encodeURIComponent(order.id)}`); return; }
                trackPaymentOrder(order);
                nextPaymentRefreshAt.current = 0;
                setPaymentModalOpen(true);
                if (order.status === "pending") void confirmPayment(order.id);
            })
            .catch((error) => message.error(error instanceof Error ? error.message : t("storageUi.readPaymentResultFailed")));
        window.history.replaceState(null, "", window.location.pathname);
    }, []);

    useEffect(() => {
        if (!paymentModalOpen || !paymentOrder || !["created", "pending", "closing"].includes(paymentOrder.status)) return;
        const interval = window.setInterval(() => {
            setClock(Date.now());
            const sequence = ++paymentPollSequence.current;
            void getPaymentOrder(paymentOrder.id)
                .then(({ order }) => {
                    if (sequence !== paymentPollSequence.current) return;
                    trackPaymentOrder(order);
                    if (order.status === "credited") {
                        void paymentCompleted(order);
                        return;
                    }
                    const checkoutExpired = order.checkout.mode === "qr_code" && order.checkout.expiresAt && new Date(order.checkout.expiresAt).getTime() <= Date.now();
                    if (checkoutExpired && new Date(order.expiresAt).getTime() > Date.now() && !paymentRefreshInFlight.current && Date.now() >= nextPaymentRefreshAt.current) {
                        paymentRefreshInFlight.current = true;
                        nextPaymentRefreshAt.current = Date.now() + 15 * 60_000;
                        void refreshPaymentCheckout(order.id)
                            .then(async (result) => {
                                trackPaymentOrder(result.order);
                                if (result.order.status === "credited") await paymentCompleted(result.order);
                            })
                            .catch(() => undefined)
                            .finally(() => {
                                paymentRefreshInFlight.current = false;
                            });
                    }
                })
                .catch(() => undefined);
        }, 2_000);
        return () => window.clearInterval(interval);
    }, [paymentModalOpen, paymentOrder?.id, paymentOrder?.status]);

    const selectedProduct = useMemo(() => paymentProducts.find((item) => item.id === selectedProductId), [paymentProducts, selectedProductId]);
    const selectedProvider = useMemo(() => paymentProviders.find((item) => item.id === selectedProviderId), [paymentProviders, selectedProviderId]);
    const availablePaymentMethods = useMemo(() => paymentMethodsForProvider(selectedProvider), [selectedProvider]);

    useEffect(() => {
        if (!availablePaymentMethods.includes(selectedPaymentMethod)) setSelectedPaymentMethod(availablePaymentMethods[0] || "alipay");
    }, [availablePaymentMethods, selectedPaymentMethod]);

    useEffect(() => {
        paymentIdempotencyKey.current = "";
    }, [selectedProductId, selectedProviderId, selectedPaymentMethod]);

    function trackPaymentOrder(order: PaymentOrder) {
        setPaymentOrder(order);
        setPaymentOrders((current) => [order, ...current.filter((item) => item.id !== order.id)].slice(0, 10));
    }

    function continuePayment(order: PaymentOrder) {
        trackPaymentOrder(order);
        nextPaymentRefreshAt.current = 0;
        if ((order.status === "created" || order.status === "pending") && order.checkout.mode === "redirect" && order.checkout.url) {
            window.location.assign(order.checkout.url);
            return;
        }
        setPaymentModalOpen(true);
    }

    const redeem = async () => {
        const normalized = code.trim().toLowerCase();
        if (normalized.length !== 32) {
            message.error(t("storageUi.redeemCodeInvalid"));
            return;
        }
        setRedeeming(true);
        try {
            await redeemCredits(normalized);
            setCode("");
            setPage(1);
            await reload(1, pageSize);
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            message.success(t("storageUi.redeemSucceeded"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("storageUi.redeemFailed"));
        } finally {
            setRedeeming(false);
        }
    };

    const checkin = async () => {
        setCheckingIn(true);
        try {
            await checkinCredits();
            await reload(page, pageSize);
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            message.success(t("storageUi.checkinSucceeded"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("storageUi.checkinFailed"));
        } finally {
            setCheckingIn(false);
        }
    };

    const startPayment = async () => {
        if (!selectedProduct || !selectedProvider) {
            message.error(t("storageUi.selectTopupProductAndPaymentMethod"));
            return;
        }
        setPaymentCreating(true);
        try {
            if (!paymentIdempotencyKey.current) paymentIdempotencyKey.current = crypto.randomUUID();
            const result = await createPaymentOrder({ productId: selectedProduct.id, providerId: selectedProvider.id, paymentMethod: selectedPaymentMethod, idempotencyKey: paymentIdempotencyKey.current });
            paymentIdempotencyKey.current = "";
            trackPaymentOrder(result.order);
            nextPaymentRefreshAt.current = 0;
            if (result.order.status === "credited") {
                setPaymentModalOpen(true);
                await paymentCompleted(result.order);
                return;
            }
            if (result.order.checkout.mode === "redirect" && result.order.checkout.url) {
                window.location.assign(result.order.checkout.url);
                return;
            }
            setPaymentModalOpen(true);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("storageUi.createPaymentOrderFailed"));
        } finally {
            setPaymentCreating(false);
        }
    };

    async function confirmPayment(orderId = paymentOrder?.id) {
        if (!orderId) return;
        setPaymentQuerying(true);
        try {
            const result = await queryPaymentOrder(orderId);
            trackPaymentOrder(result.order);
            if (result.order.status === "credited") await paymentCompleted(result.order);
            else if (result.order.status === "closed") message.warning(notGrantedPaymentText(result.order, t));
            else message.info(t("storageUi.paymentNotConfirmed"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("storageUi.queryPaymentResultFailed"));
        } finally {
            setPaymentQuerying(false);
        }
    }

    const cancelPayment = async () => {
        if (!paymentOrder) return;
        setPaymentQuerying(true);
        try {
            const result = await closePaymentOrder(paymentOrder.id);
            trackPaymentOrder(result.order);
            if (result.order.status === "credited") await paymentCompleted(result.order);
            else if (result.order.status === "closed") message.success(t("storageUi.unpaidOrderClosed"));
            else message.info(t("storageUi.paymentNotConfirmed"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("storageUi.closePaymentOrderFailed"));
        } finally {
            setPaymentQuerying(false);
        }
    };

    const retryPaymentCheckout = async () => {
        if (!paymentOrder) return;
        setPaymentQuerying(true);
        try {
            const result = await refreshPaymentCheckout(paymentOrder.id);
            trackPaymentOrder(result.order);
            if (result.order.status === "credited") await paymentCompleted(result.order);
            else if (result.order.status === "closed") message.warning(notGrantedPaymentText(result.order, t));
            else if (result.order.checkout.mode === "redirect" && result.order.checkout.url) {
                window.location.assign(result.order.checkout.url);
                return;
            } else message.success(t("storageUi.paymentQrRecreated"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("storageUi.refreshPaymentEntryFailed"));
        } finally {
            setPaymentQuerying(false);
        }
    };

    async function paymentCompleted(order: PaymentOrder) {
        if (completedPaymentOrderId.current === order.id) return;
        await reload(1, pageSize, true);
        if (order.productKind === "storage") {
            await queryClient.invalidateQueries({ queryKey: accountFileStorageUsageQueryKey });
            await queryClient.invalidateQueries({ queryKey: ["account-storage-grants"] });
        }
        setPage(1);
        window.dispatchEvent(new CustomEvent("wallet:updated"));
        completedPaymentOrderId.current = order.id;
        message.success(grantedPaymentText(order, t));
    }

    const entries = wallet?.entries || [];
    const account = wallet?.account;
    const totalMicrocredits = (account?.availableMicrocredits || 0) + (account?.reservedMicrocredits || 0);
    const ledgerFilterOptions = [
        { label: t("storageUi.ledgerFilterAll"), value: "all" },
        { label: t("storageUi.ledgerFilterIncome"), value: "income" },
        { label: t("storageUi.ledgerFilterConsume"), value: "consume" },
        { label: t("storageUi.ledgerFilterRefund"), value: "refund" },
    ];

    const columns: ColumnsType<WalletHistoryEntry> = [
        { title: t("storageUi.ledgerOccurredAt"), dataIndex: "createdAt", width: 180, render: (value) => formatTime(value, locale) },
        { title: t("storageUi.ledgerType"), dataIndex: "type", width: 120, render: (_, entry) => entry.type === "billing" ? t("storageUi.ledgerFilterConsume") : <LedgerTypeTag type={entry.type} t={t} /> },
        {
            title: t("storageUi.ledgerDetails"),
            width: 400,
            ellipsis: true,
            render: (_, entry) => entry.type === "billing" ? <WalletHistoryRow entry={entry} /> : (
                <div className="min-w-0 max-w-full overflow-hidden" title={[ledgerModelName(config, entry, t), [sceneLabel(entry.scene, t), entry.note].filter(Boolean).join(" · ")].filter(Boolean).join("\n")}>
                    <div className="truncate font-medium">{ledgerModelName(config, entry, t)}</div>
                    <div className="mt-1 truncate text-xs text-foreground/50">{[sceneLabel(entry.scene, t), entry.note].filter(Boolean).join(" · ") || t("storageUi.noSupplementalInfo")}</div>
                </div>
            ),
        },
        {
            title: t("storageUi.ledgerCreditsChange"),
            dataIndex: "amountMicrocredits",
            width: 145,
            align: "right",
            render: (value: number, entry) => entry.type === "billing" ? "—" : <CreditDelta value={value} />,
        },
        { title: t("storageUi.ledgerBalanceAfter"), dataIndex: "availableAfterMicrocredits", width: 145, align: "right", render: (value, entry) => entry.type === "billing" ? "—" : <span className="tabular-nums">{formatCredits(value)}</span> },
    ];

    return (
        <main className="app-user-content app-workspace-scroll library-page wallet-library-page relative h-full overflow-y-auto text-foreground">
            <div className="relative w-full px-4 py-6 sm:px-6 lg:px-8">
                <div className="studio-band">
                    <motion.header
                        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}
                        className="app-page-header flex flex-wrap items-start justify-between gap-4"
                    >
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="min-w-0">
                                <h1 className="text-[var(--fs-heading-lg)] font-semibold leading-7">{t("wallet")}</h1>
                                <p className="mt-1 text-xs leading-5 text-foreground/58">{t("storageUi.walletPageDescription")}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="app-projects-header-meta wallet-credit-meta">
                                <Coins className="size-3" />
                                {t("storageUi.availableCredits")}: {formatCredits(account?.availableMicrocredits || 0, 6)}
                            </span>
                            <Button
                                className="library-primary-action"
                                icon={<CalendarCheck className="size-4" />}
                                type={wallet?.policy.checkedInToday ? "default" : "primary"}
                                loading={checkingIn}
                                disabled={wallet?.policy.checkedInToday}
                                onClick={() => void checkin()}
                            >
                                {wallet?.policy.checkedInToday ? t("storageUi.checkedInToday") : t("storageUi.checkinReward", { value: formatCredits(wallet?.policy.checkinBonusMicrocredits || 0) })}
                            </Button>
                            <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void reload()}>
                                {t("storageUi.refreshBalance")}
                            </Button>
                        </div>
                    </motion.header>
                </div>

                <section className="library-feature-grid mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
                    <section className="credit-balance-card">
                        <div className="wallet-balance-inner">
                            <div className="wallet-balance-primary">
                                <div className="wallet-balance-heading">
                                    <span className="library-icon-tile wallet-balance-icon">
                                        <Coins />
                                    </span>
                                    <div>
                                        <strong>{t("storageUi.availableCreationCredits")}</strong>
                                        <span>{t("storageUi.lastUpdated", { date: formatTime(account?.updatedAt, locale) })}</span>
                                    </div>
                                </div>
                                <div className="wallet-balance-number">
                                    <strong>{formatCredits(account?.availableMicrocredits || 0, 6)}</strong>
                                    <span>{t("credits")}</span>
                                </div>
                            </div>
                            <div className="wallet-balance-details">
                                <span className="wallet-account-status">
                                    <ShieldCheck />
                                    {t("storageUi.accountNormal")}
                                </span>
                                <BalanceMetric label={t("storageUi.reservedCreditsLabel")} description={t("storageUi.reservedCreditsDescription")} value={account?.reservedMicrocredits || 0} icon={<TicketCheck className="size-4" />} />
                                <BalanceMetric label={t("storageUi.totalCreditsLabel")} description={t("storageUi.availableAndReservedDescription")} value={totalMicrocredits} icon={<Coins className="size-4" />} />
                            </div>
                        </div>
                    </section>

                    <motion.div
                        initial={reducedMotion ? false : { opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}
                        className="wallet-redeem-panel app-workspace-surface flex flex-col rounded-lg p-5 backdrop-blur-xl sm:p-6"
                    >
                        <div className="flex items-start gap-3">
                            <span className="wallet-redeem-icon grid size-9 shrink-0 place-items-center rounded-lg">
                                <TicketCheck className="size-4" />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold">{t("storageUi.redeemCreditsHeading")}</h2>
                                <p className="mt-1 text-xs leading-5 text-foreground/55">{t("storageUi.redeemCreditsDescription")}</p>
                            </div>
                        </div>
                        <label className="mt-6 block">
                            <span className="text-xs font-medium text-foreground/70">{t("storageUi.redeemCodeHeading")}</span>
                            <Input
                                className="mt-2 font-mono"
                                size="large"
                                value={code}
                                maxLength={32}
                                spellCheck={false}
                                autoComplete="off"
                                onChange={(event) => setCode(event.target.value.replace(/[-\s]/g, ""))}
                                placeholder={t("storageUi.redeemCodePlaceholder")}
                                onPressEnter={() => void redeem()}
                            />
                        </label>
                        <div className="mt-2 flex items-center justify-between text-xs text-foreground/45">
                            <span>{t("storageUi.redeemCreditArrival")}</span>
                            <span className="tabular-nums">{code.length} / 32</span>
                        </div>
                        <Button className="mt-5" type="primary" size="large" block loading={redeeming} disabled={code.length !== 32} onClick={() => void redeem()}>
                            {t("storageUi.redeemCreditsButton")}
                        </Button>
                    </motion.div>
                </section>

                <section className="app-workspace-surface mt-6 rounded-lg p-5 sm:p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="flex items-start gap-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/6 text-foreground/70">
                                    <CreditCard className="size-4" />
                                </span>
                                <div>
                                    <h2 className="text-base font-semibold">{t("storageUi.onlineTopupHeading")}</h2>
                                    <p className="mt-1 text-xs leading-5 text-foreground/55">{t("storageUi.onlineTopupDescription")}</p>
                                </div>
                            </div>
                        </div>
                        {selectedProduct ? (
                            <div className="text-right">
                                <div className="text-xs text-foreground/45">{t("storageUi.payableAmount")}</div>
                                <div className="mt-1 text-2xl font-semibold tabular-nums">¥ {(selectedProduct.amountFen / 100).toFixed(2)}</div>
                            </div>
                        ) : null}
                    </div>
                    {paymentsLoading ? (
                        <Skeleton className="mt-6" active paragraph={{ rows: 2 }} />
                    ) : paymentProducts.length && paymentProviders.length ? (
                        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                            <div>
                                <div className="mb-2 text-xs font-medium text-foreground/65">{t("storageUi.selectTopupProduct")}</div>
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {paymentProducts.map((product) => (
                                        <button
                                            key={product.id}
                                            type="button"
                                            className={`rounded-lg border px-4 py-3 text-left transition-colors ${selectedProductId === product.id ? "border-primary bg-primary/5" : "border-border/70 bg-background/35 hover:border-foreground/25"}`}
                                            disabled={!product.canPurchase}
                                            onClick={() => setSelectedProductId(product.id)}
                                        >
                                            <div className="font-medium">{product.name}</div>
                                            <div className="mt-1 text-xs text-foreground/48">
                                                {product.kind === "storage" ? t("storageUi.paymentStorageGrantLabel", { capacity: formatStorageCapacity(product.storageBytes), duration: formatStorageDuration(product.storageDurationDays, t) }) : t("storageUi.paymentCreditsGrantLabel", { value: formatCredits(product.creditsMicrocredits, 6), unit: t("credits") })} · ¥ {(product.amountFen / 100).toFixed(2)}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="mb-2 text-xs font-medium text-foreground/65">{t("storageUi.selectPaymentMethod")}</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {paymentProviders.map((provider) => (
                                        <button
                                            key={provider.id}
                                            type="button"
                                            className={`flex items-center gap-2 rounded-lg border px-3 py-3 text-left transition-colors ${selectedProviderId === provider.id ? "border-primary bg-primary/5" : "border-border/70 bg-background/35 hover:border-foreground/25"}`}
                                            onClick={() => setSelectedProviderId(provider.id)}
                                        >
                                            <PaymentBrandIcon providerId={provider.id} t={t} />
                                            <span className="min-w-0 truncate text-sm font-medium">{provider.name}</span>
                                        </button>
                                    ))}
                                </div>
                                {availablePaymentMethods.length > 1 ? (
                                    <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={t("storageUi.paymentChannel")}>
                                        {availablePaymentMethods.map((method) => (
                                            <button
                                                key={method}
                                                type="button"
                                                className={`payment-method-choice is-${method} flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors`}
                                                disabled={paymentCreating}
                                                onClick={() => setSelectedPaymentMethod(method)}
                                                aria-pressed={selectedPaymentMethod === method}
                                            >
                                                <PaymentBrandIcon providerId={selectedProvider?.id || ""} paymentMethod={method} t={t} />
                                                {paymentMethodLabel(method, t)}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                                <Button className="mt-3" type="primary" size="large" block loading={paymentCreating} disabled={!selectedProduct || !selectedProvider} onClick={() => void startPayment()}>
                                    {selectedProvider?.checkoutMode === "qr_code" ? t("storageUi.generatePaymentQrCode") : t("storageUi.goToPaymentProvider", { name: selectedProvider?.name || t("storageUi.payment") })}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <WorkspaceState compact icon="wallet" title={t("storageUi.onlineTopupNotOpen")} description={t("storageUi.configureTopupToUse")} />
                    )}
                    {paymentOrders.length ? (
                        <div className="mt-6 border-t border-border/60 pt-4">
                            <div className="mb-2 text-xs font-medium text-foreground/65">{t("storageUi.recentTopupOrders")}</div>
                            <div className="grid gap-2">
                                {paymentOrders.map((order) => {
                                    const actionable = ["created", "pending", "create_failed"].includes(order.status);
                                    return (
                                        <div key={order.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/30 px-3 py-2.5">
                                            <PaymentBrandIcon providerId={order.providerId} paymentMethod={order.paymentMethod} t={t} />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">{order.productName || t("storageUi.creditTopupProduct")}</div>
                                                <div className="mt-0.5 text-xs text-foreground/48">¥ {(order.amountFen / 100).toFixed(2)} · {formatTime(order.createdAt, locale)}</div>
                                            </div>
                                            <Tag variant="filled" color={paymentOrderStatusMeta(order.status, t).color}>{paymentOrderStatusMeta(order.status, t).label}</Tag>
                                            {actionable ? <Button size="small" onClick={() => continuePayment(order)}>{t("storageUi.continuePayment")}</Button> : <Button size="small" type="text" onClick={() => continuePayment(order)}>{t("storageUi.viewOrder")}</Button>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                </section>

                <section className="wallet-ledger-panel app-workspace-surface mt-9 rounded-lg p-4 backdrop-blur-xl sm:p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold">{t("storageUi.ledgerHeading")}</h2>
                            <p className="mt-1 text-xs text-foreground/55">{t("storageUi.recentLedgerRecords", { count: wallet?.entries.length || 0 })}</p>
                        </div>
                        <SegmentedControl
                            block={!screens.sm}
                            value={filter}
                            options={ledgerFilterOptions}
                            onChange={(value) => {
                                setFilter(value as LedgerFilter);
                                setPage(1);
                            }}
                        />
                    </div>

                    {screens.md ? (
                        <TableSurface className="mt-0 rounded-xl border-border/70 bg-transparent">
                            <Table className="app-data-table wallet-ledger-table" rowKey="id" size="middle" loading={loading} columns={columns} dataSource={entries} pagination={false} tableLayout="fixed" scroll={{ x: 990 }} />
                        </TableSurface>
                    ) : (
                        <div className="grid gap-1 overflow-hidden rounded-md bg-transparent">
                            {entries.length ? (
                                entries.map((entry) => entry.type === "billing" ? <WalletHistoryRow key={entry.id} entry={entry} /> : <LedgerMobileRow key={entry.id} config={config} entry={entry} locale={locale} t={t} />)
                            ) : (
                                <WorkspaceState compact icon="wallet" title={t("storageUi.noMatchedCreditRecords")} description={t("storageUi.noMatchedCreditRecordsHint")} />
                            )}
                        </div>
                    )}
                    <PaginationBar
                        current={page}
                        pageSize={pageSize}
                        total={wallet?.total || 0}
                        pageSizeOptions={[20, 50, 100]}
                        onChange={(nextPage, nextPageSize) => {
                            setPage(nextPageSize !== pageSize ? 1 : nextPage);
                            setPageSize(nextPageSize);
                        }}
                    />
                </section>
            </div>

            <Modal
                open={paymentModalOpen}
                title={paymentOrder?.status === "credited" ? (paymentOrder.productKind === "storage" ? t("storageUi.storageExpansionComplete") : t("storageUi.topupComplete")) : paymentOrder?.checkout.mode === "qr_code" ? t("storageUi.scanToPay") : t("storageUi.confirmPaymentResult")}
                onCancel={() => setPaymentModalOpen(false)}
                footer={
                    paymentOrder?.status === "pending"
                        ? [
                              ...(paymentOrder.canClose === false ? [] : [
                                  <Button key="close" danger disabled={paymentQuerying} onClick={() => void cancelPayment()}>
                                       {t("storageUi.closeOrder")}
                                  </Button>,
                              ]),
                              <Button key="query" type="primary" loading={paymentQuerying} onClick={() => void confirmPayment()}>
                                   {t("storageUi.paymentCompleted")}
                              </Button>,
                          ]
                        : paymentOrder?.status === "create_failed"
                          ? [
                                <Button key="done" onClick={() => setPaymentModalOpen(false)}>
                                    {t("storageUi.handleLater")}
                                </Button>,
                                <Button key="retry" type="primary" loading={paymentQuerying} onClick={() => void retryPaymentCheckout()}>
                                    {paymentOrder.checkout.mode === "redirect" ? t("storageUi.reopenCashier") : t("storageUi.recreatePaymentQrCode")}
                                </Button>,
                            ]
                          : [
                                <Button key="done" type="primary" onClick={() => setPaymentModalOpen(false)}>
                                    {t("storageUi.done")}
                                </Button>,
                            ]
                }
                destroyOnHidden
            >
                {paymentOrder ? (
                    <div className="py-2 text-center">
                        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-foreground/5">
                            <PaymentBrandIcon providerId={paymentOrder.providerId} paymentMethod={paymentOrder.paymentMethod} size="large" t={t} />
                        </div>
                        <div className="mt-3 text-lg font-semibold">¥ {(paymentOrder.amountFen / 100).toFixed(2)}</div>
                        <div className="mt-1 text-xs text-foreground/48">
                            {paymentOrder.productName} · {paymentOrder.productKind === "storage"
                                ? t("storageUi.paymentStorageGrantLabel", { capacity: formatStorageCapacity(paymentOrder.storageBytes || 0), duration: formatStorageDuration(paymentOrder.storageDurationDays || 0, t) })
                                : t("storageUi.paymentCreditsGrantLabel", { value: formatCredits(paymentOrder.creditsMicrocredits, 6), unit: t("credits") })}
                        </div>
                        {paymentOrder.productKind !== "storage" && wallet ? <TopupCreditsBreakdown product={{ amountFen: paymentOrder.amountFen, creditsMicrocredits: paymentOrder.creditsMicrocredits }} creditPerYuan={wallet.policy.creditPerYuan} t={t} /> : null}
                        {paymentOrder.status === "pending" && paymentOrder.checkout.mode === "qr_code" && paymentOrder.checkout.value ? (
                            <div className="mt-5 flex flex-col items-center">
                                <QRCode value={paymentOrder.checkout.value} size={208} bordered={false} />
                                <p className="mt-3 text-sm font-medium">{t("storageUi.scanWithPaymentApp")}</p>
                                <p className="mt-1 text-xs text-foreground/45">{t("storageUi.doNotLongPressQr")}</p>
                            </div>
                        ) : null}
                        <PaymentOrderStatus order={paymentOrder} now={clock} t={t} />
                    </div>
                ) : null}
            </Modal>
        </main>
    );
}

function BalanceMetric({ label, description, value, icon }: { label: string; description: string; value: number; icon: ReactNode }) {
    return (
        <div className="wallet-balance-metric">
            <span className="wallet-balance-metric-icon">{icon}</span>
            <div>
                <span>{label}</span>
                <strong>{formatCredits(value, 6)}</strong>
                <small>{description}</small>
            </div>
        </div>
    );
}

function LedgerMobileRow({ config, entry, locale, t }: { config: AiConfig; entry: WalletCreditEntry; locale: InterfaceLocale; t: InterfaceTranslate }) {
    const meta = ledgerTypeMeta(entry.type, t);
    return (
        <article className="flex items-start gap-3 rounded-md bg-foreground/[.025] px-4 py-4">
            <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${meta.iconClass}`}>{meta.icon}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{ledgerModelName(config, entry, t)}</div>
                        <div className="mt-1 text-xs text-foreground/45">{formatTime(entry.createdAt, locale)}</div>
                    </div>
                    <CreditDelta value={entry.amountMicrocredits} />
                </div>
                <div className="mt-2 line-clamp-2 break-words text-xs leading-5 text-foreground/55">{[sceneLabel(entry.scene, t), entry.note].filter(Boolean).join(" · ") || meta.label}</div>
            </div>
        </article>
    );
}

function CreditDelta({ value }: { value: number }) {
    const colorClass = value > 0 ? "text-emerald-600 dark:text-emerald-400" : value < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground/60";
    return (
        <span className={`shrink-0 font-medium tabular-nums ${colorClass}`}>
            {value > 0 ? "+" : ""}
            {formatCredits(value, 6)}
        </span>
    );
}

function LedgerTypeTag({ type, t }: { type: CreditLedgerEntry["type"]; t: InterfaceTranslate }) {
    const meta = ledgerTypeMeta(type, t);
    return (
        <Tag variant="filled" color={meta.tagColor}>
            {meta.label}
        </Tag>
    );
}

function ledgerTypeMeta(type: CreditLedgerEntry["type"], t: InterfaceTranslate) {
    const values = {
        team_transfer: { label: "团队积分划转", tagColor: "default", icon: <Coins className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        membership_grant: { label: "会员积分到账", tagColor: "success", icon: <Coins className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        membership_expire: { label: "会员积分到期", tagColor: "default", icon: <CalendarCheck className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        redeem: { label: t("storageUi.ledgerRedeemTopup"), tagColor: "default", icon: <ArrowDownLeft className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        payment_topup: { label: t("storageUi.ledgerOnlineTopup"), tagColor: "success", icon: <CreditCard className="size-4" />, iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
        referral_commission: { label: t("storageUi.ledgerReferralCommission"), tagColor: "success", icon: <Coins className="size-4" />, iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
        recharge: { label: t("storageUi.ledgerOnlineTopup"), tagColor: "success", icon: <CreditCard className="size-4" />, iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
        admin_grant: { label: t("storageUi.ledgerAdminCreditGrant"), tagColor: "default", icon: <ArrowDownLeft className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        consume: { label: t("storageUi.ledgerModelUsage"), tagColor: "error", icon: <Sparkles className="size-4" />, iconClass: "bg-rose-500/10 text-rose-600 dark:text-rose-300" },
        reserve: { label: t("storageUi.ledgerCreditsReserved"), tagColor: "warning", icon: <ArrowUpRight className="size-4" />, iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-300" },
        refund: { label: t("storageUi.ledgerRefund"), tagColor: "warning", icon: <RotateCcw className="size-4" />, iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-300" },
        admin_adjustment: { label: t("storageUi.ledgerAdminAdjustment"), tagColor: "default", icon: <SlidersHorizontal className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        signup_bonus: { label: t("storageUi.ledgerSignupBonus"), tagColor: "default", icon: <Sparkles className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        checkin_bonus: { label: t("storageUi.ledgerCheckinBonus"), tagColor: "default", icon: <CalendarCheck className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
    } as const;
    return values[type] || { label: t("storageUi.ledgerOtherCreditChange"), tagColor: "default", icon: <ArrowUpRight className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" };
}

function ledgerTitle(entry: WalletCreditEntry, t: InterfaceTranslate) {
    if (entry.type === "redeem") return t("storageUi.ledgerRedeemTopup");
    if (entry.type === "payment_topup" || entry.type === "recharge") return t("storageUi.ledgerOnlinePaymentTopup");
    if (entry.type === "referral_commission") return t("storageUi.ledgerReferralCommission");
    if (entry.type === "refund") return t("storageUi.ledgerModelRefund");
    if (entry.type === "consume") return t("storageUi.ledgerModelUsage");
    if (entry.type === "signup_bonus") return t("storageUi.ledgerNewUserBonus");
    if (entry.type === "checkin_bonus") return t("storageUi.ledgerDailyCheckinBonus");
    return entry.note || t("storageUi.ledgerCreditAdjustment");
}

function PaymentBrandIcon({ providerId, paymentMethod, size = "normal", t }: { providerId: string; paymentMethod?: string; size?: "normal" | "large"; t: InterfaceTranslate }) {
    const className = size === "large" ? "text-3xl" : "text-xl";
    if (paymentMethod === "wxpay" || providerId === "wechat-native") return <WechatFilled className={`${className} text-[#07C160]`} aria-label={t("storageUi.wechatPay")} />;
    if (paymentMethod === "alipay" || providerId.includes("alipay") || providerId === "cloudcat-epay") return <AlipayCircleFilled className={`${className} text-[#1677ff]`} aria-label={t("storageUi.alipay")} />;
    return <CreditCard className={`${className} text-foreground/60`} aria-label={t("storageUi.payment")} />;
}

function paymentMethodsForProvider(provider?: PaymentProvider): Array<"alipay" | "wxpay"> {
    const configured = provider?.paymentMethods?.filter((value): value is "alipay" | "wxpay" => value === "alipay" || value === "wxpay") || [];
    if (configured.length) return configured;
    if (provider?.id.includes("alipay")) return ["alipay"];
    return ["wxpay"];
}

function paymentMethodLabel(method: "alipay" | "wxpay", t: InterfaceTranslate) {
    return method === "alipay" ? t("storageUi.alipay") : t("storageUi.wechatPay");
}

function paymentOrderStatusMeta(status: PaymentOrder["status"], t: InterfaceTranslate): { label: string; color: "default" | "success" | "warning" | "error" } {
    if (status === "credited") return { label: t("storageUi.paymentOrderCredited"), color: "success" };
    if (status === "closed") return { label: t("storageUi.paymentOrderClosed"), color: "default" };
    if (status === "create_failed") return { label: t("storageUi.paymentOrderRetry"), color: "error" };
    if (status === "closing") return { label: t("storageUi.paymentOrderClosing"), color: "warning" };
    return { label: t("storageUi.paymentOrderPending"), color: "warning" };
}

function TopupCreditsBreakdown({ product, creditPerYuan, t }: { product: Pick<TopupProduct, "amountFen" | "creditsMicrocredits">; creditPerYuan: number; t: InterfaceTranslate }) {
    const principalMicrocredits = product.amountFen * creditPerYuan * 1_000_000 / 100;
    const bonusMicrocredits = Math.max(0, product.creditsMicrocredits - principalMicrocredits);
    if (!bonusMicrocredits) return null;
    return <div className="mt-1 text-xs text-foreground/48">{t("storageUi.topupCreditsBreakdown", { principal: formatCredits(principalMicrocredits, 6), bonus: formatCredits(bonusMicrocredits, 6), unit: t("credits") })}</div>;
}

function PaymentOrderStatus({ order, now, t }: { order: PaymentOrder; now: number; t: InterfaceTranslate }) {
    const remainingSeconds = Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - now) / 1000));
    if (order.status === "credited") return <div className="mt-5 rounded-lg bg-emerald-500/8 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-300">{grantedPaymentText(order, t)}</div>;
    if (order.status === "closed") return <div className="mt-5 rounded-lg bg-foreground/5 px-4 py-3 text-sm text-foreground/60">{notGrantedPaymentText(order, t)}</div>;
    if (order.status === "create_failed") {
        const action = order.checkout.mode === "redirect" ? t("storageUi.reopenCashier") : t("storageUi.recreatePaymentQrCode");
        return <div className="mt-5 rounded-lg bg-rose-500/8 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{t("storageUi.paymentEntryCreateFailedWithAction", { action })}</div>;
    }
    return <div className="mt-5 text-xs text-foreground/48">{t("storageUi.paymentTimeRemaining", { time: formatCountdown(remainingSeconds) })}</div>;
}

function formatCountdown(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

function ledgerModelName(config: AiConfig, entry: WalletCreditEntry, t: InterfaceTranslate) {
    return entry.model ? modelDisplayName(config, entry.model) : ledgerTitle(entry, t);
}

function sceneLabel(scene: string | undefined, t: InterfaceTranslate) {
    const labels: Record<string, InterfaceMessageKey> = { image: "storageUi.sceneImageGeneration", text: "storageUi.sceneTextGeneration", video: "storageUi.sceneVideoGeneration", audio: "storageUi.sceneAudioGeneration", storyboard: "storageUi.sceneStoryboardGeneration" };
    const key = scene ? labels[scene] : undefined;
    return key ? t(key) : scene ? t("storageUi.sceneOther") : "";
}

function grantedPaymentText(order: PaymentOrder, t: InterfaceTranslate) {
    if(order.productKind === "membership") return "会员已开通或续期，积分按会员周期到账";
    return order.productKind === "storage" ? t("storageUi.paymentStorageGranted") : t("storageUi.paymentCreditsGranted");
}

function notGrantedPaymentText(order: PaymentOrder, t: InterfaceTranslate) {
    if(order.productKind === "membership") return "订单已关闭，未开通会员";
    return order.productKind === "storage" ? t("storageUi.paymentStorageNotGranted") : t("storageUi.paymentCreditsNotGranted");
}

function formatTime(value: string | undefined, locale: InterfaceLocale) {
    return value ? new Date(value).toLocaleString(locale, { hour12: false }) : "--";
}
