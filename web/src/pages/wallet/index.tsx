import { useEffect, useRef, useState, type ReactNode } from "react";
import { App, Button, Grid, Input, Modal, QRCode, Radio, Segmented, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, CalendarCheck, CircleCheckBig, Coins, CreditCard, ExternalLink, RefreshCw, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, TicketCheck } from "lucide-react";

import { formatCredits } from "@/constant/credits";
import { PaginationBar, TableSurface } from "@/components/layout/workspace-page";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { checkinCredits, createPaymentOrder, getPaymentConfig, getPaymentOrder, getWallet, listPaymentOrders, redeemCredits, type CreditLedgerEntry, type PaymentConfig, type PaymentOrder, type PublicRechargePlan, type WalletSummary } from "@/services/api/wallet";
import { modelDisplayName, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";

type LedgerFilter = "all" | "income" | "consume" | "refund";

const ledgerFilterOptions = [
    { label: "全部", value: "all" },
    { label: "充值与调整", value: "income" },
    { label: "模型消费", value: "consume" },
    { label: "退款", value: "refund" },
];

export default function WalletPage() {
    const { message } = App.useApp();
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
    const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
    const [selectedPaymentPlan, setSelectedPaymentPlan] = useState<PublicRechargePlan | null>(null);
    const [payType, setPayType] = useState<PaymentOrder["payType"]>("alipay");
    const [activePayment, setActivePayment] = useState<PaymentOrder | null>(null);
    const [recentPayments, setRecentPayments] = useState<PaymentOrder[]>([]);
    const [startingPayment, setStartingPayment] = useState(false);
    const requestSequence = useRef(0);

    const reload = async (targetPage = page, targetPageSize = pageSize) => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        try {
            const nextWallet = await getWallet(targetPage, targetPageSize, filter);
            if (sequence === requestSequence.current) setWallet(nextWallet);
        } catch (error) {
            if (sequence === requestSequence.current) message.error(error instanceof Error ? error.message : "读取积分记录失败");
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    };

    useEffect(() => {
        void reload(page, pageSize);
    }, [filter, page, pageSize]);

    useEffect(() => {
        void getPaymentConfig()
            .then(({ config: nextConfig }) => {
                setPaymentConfig(nextConfig);
                if (nextConfig.payTypes.length) setPayType(nextConfig.payTypes[0]);
            })
            .catch(() => setPaymentConfig({ enabled: false, payTypes: [] }));
        void listPaymentOrders(5)
            .then(({ orders }) => setRecentPayments(orders))
            .catch(() => setRecentPayments([]));
        const returnedOrder = new URLSearchParams(window.location.search).get("paymentOrder");
        if (returnedOrder) {
            void getPaymentOrder(returnedOrder)
                .then(({ order }) => setActivePayment(order))
                .catch(() => undefined);
        }
    }, []);

    useEffect(() => {
        if (!activePayment || activePayment.status !== "pending") return;
        let cancelled = false;
        const poll = async () => {
            try {
                const { order } = await getPaymentOrder(activePayment.id);
                if (cancelled) return;
                setActivePayment(order);
                setRecentPayments((current) => [order, ...current.filter((item) => item.id !== order.id)].slice(0, 5));
                if (order.status === "paid") {
                    await reload(page, pageSize);
                    window.dispatchEvent(new CustomEvent("wallet:updated"));
                    window.history.replaceState(null, "", window.location.pathname);
                    message.success("支付成功，积分已到账");
                }
            } catch {
                // 短暂网络失败保留轮询，支付终态仍以后端回调为准。
            }
        };
        const timer = window.setInterval(() => void poll(), 2500);
        void poll();
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [activePayment?.id, activePayment?.status]);

    const beginPayment = (plan: PublicRechargePlan) => {
        setSelectedPaymentPlan(plan);
        setActivePayment(null);
    };

    const submitPayment = async () => {
        if (!selectedPaymentPlan || !paymentConfig?.enabled) return;
        setStartingPayment(true);
        try {
            const { order } = await createPaymentOrder({ planId: selectedPaymentPlan.id, payType }, crypto.randomUUID());
            setActivePayment(order);
            setRecentPayments((current) => [order, ...current.filter((item) => item.id !== order.id)].slice(0, 5));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建支付订单失败");
        } finally {
            setStartingPayment(false);
        }
    };

    const redeem = async () => {
        const normalized = code.trim().toLowerCase();
        if (normalized.length !== 32) {
            message.error("请输入完整的 32 位兑换码");
            return;
        }
        setRedeeming(true);
        try {
            await redeemCredits(normalized);
            setCode("");
            setPage(1);
            await reload(1, pageSize);
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            message.success("兑换成功，积分已到账");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
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
            message.success("签到成功，积分已到账");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "签到失败");
        } finally {
            setCheckingIn(false);
        }
    };

    const entries = wallet?.entries || [];
    const account = wallet?.account;
    const totalMicrocredits = (account?.availableMicrocredits || 0) + (account?.reservedMicrocredits || 0);

    const columns: ColumnsType<CreditLedgerEntry> = [
        { title: "发生时间", dataIndex: "createdAt", width: 180, render: formatTime },
        { title: "类型", dataIndex: "type", width: 120, render: (type) => <LedgerTypeTag type={type} /> },
        {
            title: "明细",
            width: 400,
            ellipsis: true,
            render: (_, entry) => (
                <div className="min-w-0 max-w-full overflow-hidden" title={[ledgerModelName(config, entry), [sceneLabel(entry.scene), entry.note].filter(Boolean).join(" · ")].filter(Boolean).join("\n")}>
                    <div className="truncate font-medium">{ledgerModelName(config, entry)}</div>
                    <div className="mt-1 truncate text-xs text-foreground/50">{[sceneLabel(entry.scene), entry.note].filter(Boolean).join(" · ") || "无补充说明"}</div>
                </div>
            ),
        },
        {
            title: "积分变化",
            dataIndex: "amountMicrocredits",
            width: 145,
            align: "right",
            render: (value: number) => <CreditDelta value={value} />,
        },
        { title: "变更后余额", dataIndex: "availableAfterMicrocredits", width: 145, align: "right", render: (value) => <span className="tabular-nums">{formatCredits(value)}</span> },
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
                                <h1 className="text-[var(--fs-heading-lg)] font-semibold leading-7">积分中心</h1>
                                <p className="mt-1 text-xs leading-5 text-foreground/58">模型调用、冻结与退款都在同一条可追溯流水中。</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="app-projects-header-meta wallet-credit-meta">
                                <Coins className="size-3" />
                                可用 {formatCredits(account?.availableMicrocredits || 0, 6)}
                            </span>
                            <Button
                                className="library-primary-action"
                                icon={<CalendarCheck className="size-4" />}
                                type={wallet?.policy.checkedInToday ? "default" : "primary"}
                                loading={checkingIn}
                                disabled={wallet?.policy.checkedInToday}
                                onClick={() => void checkin()}
                            >
                                {wallet?.policy.checkedInToday ? "今日已签到" : `签到 +${formatCredits(wallet?.policy.checkinBonusMicrocredits || 0)}`}
                            </Button>
                            <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void reload()}>
                                刷新余额
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
                                        <strong>可用创作积分</strong>
                                        <span>最近更新 {formatTime(account?.updatedAt)}</span>
                                    </div>
                                </div>
                                <div className="wallet-balance-number">
                                    <strong>{formatCredits(account?.availableMicrocredits || 0, 6)}</strong>
                                    <span>积分</span>
                                </div>
                            </div>
                            <div className="wallet-balance-details">
                                <span className="wallet-account-status">
                                    <ShieldCheck />
                                    账户正常
                                </span>
                                <BalanceMetric label="冻结积分" description="调用中或待核对" value={account?.reservedMicrocredits || 0} icon={<TicketCheck className="size-4" />} />
                                <BalanceMetric label="账户总额" description="可用与冻结合计" value={totalMicrocredits} icon={<Coins className="size-4" />} />
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
                                <h2 className="text-base font-semibold">兑换积分</h2>
                                <p className="mt-1 text-xs leading-5 text-foreground/55">输入管理员发放的 32 位兑换码。</p>
                            </div>
                        </div>
                        <label className="mt-6 block">
                            <span className="text-xs font-medium text-foreground/70">兑换码</span>
                            <Input
                                className="mt-2 font-mono"
                                size="large"
                                value={code}
                                maxLength={32}
                                spellCheck={false}
                                autoComplete="off"
                                onChange={(event) => setCode(event.target.value.replace(/[-\s]/g, ""))}
                                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                onPressEnter={() => void redeem()}
                            />
                        </label>
                        <div className="mt-2 flex items-center justify-between text-xs text-foreground/45">
                            <span>兑换成功后立即到账</span>
                            <span className="tabular-nums">{code.length} / 32</span>
                        </div>
                        <Button className="mt-5" type="primary" size="large" block loading={redeeming} disabled={code.length !== 32} onClick={() => void redeem()}>
                            兑换积分
                        </Button>
                    </motion.div>
                </section>

                <RechargeNotice policy={wallet?.policy} paymentConfig={paymentConfig} onPay={beginPayment} />

                <RecentPaymentOrders orders={recentPayments} onOpen={setActivePayment} />

                <section className="wallet-ledger-panel app-workspace-surface mt-9 rounded-lg p-4 backdrop-blur-xl sm:p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold">积分流水</h2>
                            <p className="mt-1 text-xs text-foreground/55">当前展示最近 {wallet?.entries.length || 0} 条记录。</p>
                        </div>
                        <Segmented
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
                                entries.map((entry) => <LedgerMobileRow key={entry.id} config={config} entry={entry} />)
                            ) : (
                                <WorkspaceState compact icon="wallet" title="没有匹配的积分记录" description="切换流水类型，或完成一次生成后再回来查看。" />
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
                title="在线充值"
                open={Boolean(selectedPaymentPlan || activePayment)}
                footer={null}
                destroyOnHidden
                onCancel={() => {
                    setSelectedPaymentPlan(null);
                    setActivePayment(null);
                }}
            >
                {activePayment ? (
                    <PaymentCheckout order={activePayment} />
                ) : selectedPaymentPlan ? (
                    <div className="py-2">
                        <div className="rounded-lg border border-border/70 bg-foreground/[.025] p-4">
                            <div className="text-sm text-foreground/55">充值套餐</div>
                            <div className="mt-2 flex items-end justify-between gap-4">
                                <strong className="text-xl">{formatCredits(selectedPaymentPlan.creditsMicrocredits)} 积分</strong>
                                <span className="text-lg font-semibold tabular-nums">¥{formatCents(selectedPaymentPlan.priceCents)}</span>
                            </div>
                        </div>
                        <div className="mt-5 text-sm font-medium">选择支付方式</div>
                        <Radio.Group className="mt-3" value={payType} onChange={(event) => setPayType(event.target.value)}>
                            {(paymentConfig?.payTypes || []).map((type) => (
                                <Radio.Button key={type} value={type}>
                                    {paymentTypeLabel(type)}
                                </Radio.Button>
                            ))}
                        </Radio.Group>
                        <Button className="mt-6" block size="large" type="primary" icon={<CreditCard className="size-4" />} loading={startingPayment} onClick={() => void submitPayment()}>
                            创建支付订单
                        </Button>
                        <p className="mt-3 text-center text-xs leading-5 text-foreground/45">到账以服务端签名回调为准，请勿重复支付同一订单。</p>
                    </div>
                ) : null}
            </Modal>
        </main>
    );
}

function RechargeNotice({ policy, paymentConfig, onPay }: { policy?: WalletSummary["policy"]; paymentConfig: PaymentConfig | null; onPay: (plan: PublicRechargePlan) => void }) {
    const plans = policy?.rechargePlans || [];
    if (!plans.length) return null;
    return (
        <section className="wallet-recharge-panel app-workspace-surface mt-6 rounded-lg p-5 backdrop-blur-xl sm:p-6" aria-labelledby="wallet-recharge-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 id="wallet-recharge-title" className="text-base font-semibold">
                        充值与价格公示
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-foreground/65">{paymentConfig?.enabled ? "支持支付宝、微信等在线支付，支付成功后积分自动到账。" : "在线支付尚未开放，可继续使用兑换码充值。"}</p>
                    <p className="mt-2 text-xs leading-5 text-foreground/45">充值积分不直接等同人民币余额。</p>
                </div>
            </div>

            {plans.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {plans.map((plan, index) => (
                        <div key={plan.id} className={`wallet-recharge-plan rounded-lg border px-4 py-4 ${index === 2 ? "border-primary/50 bg-primary/[.06]" : "border-border/70 bg-foreground/[.025]"}`}>
                            <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-medium text-foreground/55">充值档位</span>
                                {plan.bonusPercent > 0 ? <Tag color="gold">赠 {plan.bonusPercent}%</Tag> : null}
                            </div>
                            <div className="mt-3 flex items-baseline gap-1">
                                <strong className="text-2xl font-semibold tabular-nums">¥{formatCents(plan.priceCents)}</strong>
                            </div>
                            <div className="mt-2 text-sm font-medium tabular-nums">到账 {formatCredits(plan.creditsMicrocredits)} 积分</div>
                            {paymentConfig?.enabled ? (
                                <Button className="mt-4" block type={index === 2 ? "primary" : "default"} onClick={() => onPay(plan)}>
                                    在线充值
                                </Button>
                            ) : (
                                <div className="mt-1 text-xs text-foreground/45">等待管理员开放在线支付</div>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}

            <div className="mt-6 border-t border-border/60 pt-5">
                <div>
                    <h3 className="text-sm font-semibold">换算公式</h3>
                    <p className="mt-2 text-xs leading-6 text-foreground/58">
                        1 元 = {policy?.creditPerYuan || 10} 积分；扣除积分 = ⌈使用秒数 × 标价（元/秒） × {policy?.creditPerYuan || 10}⌉。
                    </p>
                    <p className="mt-1 text-xs leading-6 text-foreground/45">实际扣费以任务命中的渠道、分辨率和结算账单为准；失败任务按系统账单状态处理。</p>
                </div>
            </div>
        </section>
    );
}

function PaymentCheckout({ order }: { order: PaymentOrder }) {
    if (order.status === "paid") {
        return (
            <div className="flex flex-col items-center py-8 text-center">
                <CircleCheckBig className="size-12 text-emerald-500" />
                <h3 className="mt-4 text-lg font-semibold">支付成功</h3>
                <p className="mt-2 text-sm text-foreground/55">{formatCredits(order.creditsMicrocredits)} 积分已经到账。</p>
            </div>
        );
    }
    if (order.status === "failed") {
        return (
            <div className="py-8 text-center">
                <h3 className="text-lg font-semibold">订单创建失败</h3>
                <p className="mt-2 text-sm text-foreground/55">{order.providerError || "支付平台暂时不可用，请关闭后重试。"}</p>
            </div>
        );
    }
    const qrValue = order.qrCode || order.checkoutUrl;
    return (
        <div className="flex flex-col items-center py-4 text-center">
            <div className="text-sm text-foreground/55">应付金额</div>
            <strong className="mt-1 text-3xl tabular-nums">¥{formatCents(order.amountCents)}</strong>
            {order.qrCodeImage ? <img className="mt-5 size-[210px] rounded-lg object-contain" src={order.qrCodeImage} alt={`${paymentTypeLabel(order.payType)}付款二维码`} referrerPolicy="no-referrer" /> : qrValue ? <QRCode className="mt-5" value={qrValue} size={210} /> : null}
            <p className="mt-4 text-sm text-foreground/55">请使用{paymentTypeLabel(order.payType)}完成支付，页面会自动确认到账。</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
                {order.checkoutUrl ? (
                    <Button type="primary" href={order.checkoutUrl} target="_blank" rel="noreferrer" icon={<ExternalLink className="size-4" />}>
                        打开收银台
                    </Button>
                ) : null}
                {order.urlScheme ? (
                    <Button type="primary" href={order.urlScheme}>
                        打开支付应用
                    </Button>
                ) : null}
            </div>
            <div className="mt-5 font-mono text-[11px] text-foreground/35">订单号 {order.id}</div>
        </div>
    );
}

function RecentPaymentOrders({ orders, onOpen }: { orders: PaymentOrder[]; onOpen: (order: PaymentOrder) => void }) {
    if (!orders.length) return null;
    return (
        <section className="app-workspace-surface mt-6 rounded-lg p-5 backdrop-blur-xl sm:p-6" aria-labelledby="wallet-payment-orders-title">
            <div>
                <h2 id="wallet-payment-orders-title" className="text-base font-semibold">最近充值订单</h2>
                <p className="mt-1 text-xs text-foreground/55">可重新打开待支付订单，已支付订单不会重复入账。</p>
            </div>
            <div className="mt-4 grid gap-2">
                {orders.map((order) => (
                    <button key={order.id} type="button" className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/70 bg-foreground/[.025] px-4 py-3 text-left transition-colors hover:bg-foreground/[.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" onClick={() => onOpen(order)}>
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{order.planName}</span>
                            <span className="mt-1 block text-xs text-foreground/45">{formatTime(order.createdAt)} · {paymentTypeLabel(order.payType)}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                            <strong className="text-sm tabular-nums">¥{formatCents(order.amountCents)}</strong>
                            <Tag color={order.status === "paid" ? "success" : order.status === "failed" ? "error" : "processing"}>{paymentOrderStatusLabel(order.status)}</Tag>
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}

function paymentOrderStatusLabel(status: PaymentOrder["status"]) {
    return status === "paid" ? "已到账" : status === "failed" ? "创建失败" : "待支付";
}

function paymentTypeLabel(type: PaymentOrder["payType"]) {
    return ({ alipay: "支付宝", wxpay: "微信支付", qqpay: "QQ 钱包", bank: "网银支付", jdpay: "京东支付", paypal: "PayPal" } as const)[type] || type;
}

function formatCents(value: number) {
    return (value / 100).toLocaleString("zh-CN", { minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 });
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

function LedgerMobileRow({ config, entry }: { config: AiConfig; entry: CreditLedgerEntry }) {
    const meta = ledgerTypeMeta(entry.type);
    return (
        <article className="flex items-start gap-3 rounded-md bg-foreground/[.025] px-4 py-4">
            <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${meta.iconClass}`}>{meta.icon}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{ledgerModelName(config, entry)}</div>
                        <div className="mt-1 text-xs text-foreground/45">{formatTime(entry.createdAt)}</div>
                    </div>
                    <CreditDelta value={entry.amountMicrocredits} />
                </div>
                <div className="mt-2 line-clamp-2 break-words text-xs leading-5 text-foreground/55">{[sceneLabel(entry.scene), entry.note].filter(Boolean).join(" · ") || meta.label}</div>
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

function LedgerTypeTag({ type }: { type: CreditLedgerEntry["type"] }) {
    const meta = ledgerTypeMeta(type);
    return (
        <Tag variant="filled" color={meta.tagColor}>
            {meta.label}
        </Tag>
    );
}

function ledgerTypeMeta(type: CreditLedgerEntry["type"]) {
    const values = {
        redeem: { label: "兑换充值", tagColor: "default", icon: <ArrowDownLeft className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        recharge: { label: "在线充值", tagColor: "success", icon: <CreditCard className="size-4" />, iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
        admin_grant: { label: "管理员充值", tagColor: "default", icon: <ArrowDownLeft className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        consume: { label: "模型消费", tagColor: "error", icon: <Sparkles className="size-4" />, iconClass: "bg-rose-500/10 text-rose-600 dark:text-rose-300" },
        reserve: { label: "积分冻结", tagColor: "warning", icon: <ArrowUpRight className="size-4" />, iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-300" },
        refund: { label: "消费退款", tagColor: "warning", icon: <RotateCcw className="size-4" />, iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-300" },
        admin_adjustment: { label: "管理员调账", tagColor: "default", icon: <SlidersHorizontal className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        signup_bonus: { label: "注册奖励", tagColor: "default", icon: <Sparkles className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        checkin_bonus: { label: "签到奖励", tagColor: "default", icon: <CalendarCheck className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
    } as const;
    return values[type] || { label: "其他积分变动", tagColor: "default", icon: <ArrowUpRight className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" };
}

function ledgerTitle(entry: CreditLedgerEntry) {
    if (entry.type === "redeem") return "兑换码充值";
    if (entry.type === "recharge") return "在线支付充值";
    if (entry.type === "refund") return "模型消费退款";
    if (entry.type === "consume") return "模型调用";
    if (entry.type === "signup_bonus") return "新用户注册奖励";
    if (entry.type === "checkin_bonus") return "每日签到奖励";
    return entry.note || "积分调整";
}

function ledgerModelName(config: AiConfig, entry: CreditLedgerEntry) {
    return entry.model ? modelDisplayName(config, entry.model) : ledgerTitle(entry);
}

function sceneLabel(scene?: string) {
    const labels: Record<string, string> = { image: "图片生成", text: "文本生成", video: "视频生成", audio: "音频生成", storyboard: "分镜生成" };
    return scene ? labels[scene] || "其他场景" : "";
}

function formatTime(value?: string) {
    return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";
}
