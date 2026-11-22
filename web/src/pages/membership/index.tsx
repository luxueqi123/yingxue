import { Alert, Button, Empty, Select, Spin, Tag } from "antd";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Crown, ArrowLeft, Check, RefreshCw } from "lucide-react";
import { PageHeader, WorkspacePage } from "@/components/layout/workspace-page";
import { usePaymentOrderFlow } from "@/components/payment/use-payment-order-flow";
import { formatCredits } from "@/constant/credits";
import { formatStorageCapacity } from "@/lib/account-storage-usage";
import { getMembership, type MembershipPlan } from "@/services/api/membership";
import { listPaymentProviders } from "@/services/api/payments";
import { useUserStore } from "@/stores/use-user-store";

const date = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });

export default function MembershipPage() {
    const userId = useUserStore((state) => state.user?.id);
    const client = useQueryClient();
    const member = useQuery({ queryKey: ["membership", userId], queryFn: ({ signal }) => getMembership(signal) });
    const providers = useQuery({ queryKey: ["membership-payment-providers", userId], queryFn: listPaymentProviders });
    const [annual, setAnnual] = useState(false);
    const [selected, setSelected] = useState("");
    const [search, setSearch] = useSearchParams();
    const methods = (providers.data?.providers || []).filter((p) => p.enabled && p.configured && p.pluginEnabled).flatMap<{value:string;label:string;provider:string;method:string|undefined}>((p) =>
        p.methods?.length ? p.methods.map((m) => ({ value: `${p.id}:${m.id}`, label: `${p.name} · ${m.name}`, provider: p.id, method: m.id }))
            : [{ value: p.id, label: p.name, provider: p.id, method: undefined }]);
    const method = methods.find((item) => item.value === selected) || methods[0];
    const payment = usePaymentOrderFlow({ onGranted: async () => { await client.invalidateQueries({ queryKey: ["membership", userId] }); await client.invalidateQueries({ queryKey: ["wallet"] }); } });
    useEffect(() => {
        const id = search.get("paymentOrder");
        if (id) { void payment.showOrder(id); const next = new URLSearchParams(search); next.delete("paymentOrder"); setSearch(next, { replace: true }); }
    }, [search, setSearch]);
    const buy = (plan: MembershipPlan) => {
        if (!method) return;
        payment.resetIdempotency();
        void payment.start(annual ? plan.annualProductId : plan.monthlyProductId, method.provider, method.method);
    };
    const current = member.data?.subscriptions.find((sub) => new Date(sub.startsAt).getTime() <= Date.now() && new Date(sub.endsAt).getTime() > Date.now());
    return <WorkspacePage>
        <div className="mx-auto max-w-6xl space-y-5 pb-8">
            <PageHeader title="映雪会员" description="从一个月开始，把灵感变成作品。" actions={<><Link to="/wallet"><Button icon={<ArrowLeft size={16} />}>积分钱包</Button></Link><Button aria-label="刷新会员" icon={<RefreshCw size={16} />} onClick={() => void member.refetch()} /></>} />
            {member.isPending ? <Spin /> : member.isError ? <Alert type="error" title={member.error.message} action={<Button onClick={() => void member.refetch()}>重试</Button>} /> : <>
                <section className="rounded-xl border border-border bg-surface p-5">
                    <div className="flex flex-wrap items-center gap-3"><Crown size={24} /><h2 className="text-lg font-semibold">{member.data.active?.name || "自由创作，按需开启会员"}</h2>{current ? <Tag color="blue">使用中</Tag> : null}</div>
                    {current ? <p className="mt-2 text-sm text-foreground/65">本期会员至 {date(current.endsAt)}{current.nextGrantAt ? ` · 下次积分到账 ${date(current.nextGrantAt)}` : ""}</p> : <p className="mt-2 text-sm text-foreground/65">月付即可获得套餐列出的积分、任务额度和存储权益。</p>}
                </section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-2"><Button aria-pressed={!annual} onClick={() => setAnnual(false)}>按月购买</Button><Button aria-pressed={annual} onClick={() => setAnnual(true)}>按年购买 · 每月到账</Button></div>
                    <Select aria-label="会员支付方式" className="min-w-52" placeholder="选择支付方式" value={method?.value} options={methods} onChange={(value) => { setSelected(value); payment.resetIdempotency(); }} loading={providers.isPending} />
                </div>
                {providers.isError ? <Alert type="error" title={providers.error.message} action={<Button onClick={() => void providers.refetch()}>重试</Button>} /> : null}
                {member.data.plans.length ? <div className="grid gap-4 md:grid-cols-3">{member.data.plans.map((plan) => {
                    const amount = annual ? plan.annualAmountFen : plan.monthlyAmountFen;
                    return <article key={plan.id} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
                        <div><h2 className="text-xl font-semibold">{plan.name}</h2><p className="mt-2 min-h-10 text-sm text-foreground/65">{plan.description}</p></div>
                        <div><strong className="text-3xl">{amount ? `¥${(amount / 100).toLocaleString("zh-CN")}` : "暂未开放"}</strong>{amount ? <span className="text-sm text-foreground/60"> / {annual ? "年" : "月"}</span> : null}</div>
                        <ul className="space-y-3 text-sm">{[`${formatCredits(plan.monthlyCreditsMicrocredits)} 积分 / 月`, `最多 ${plan.concurrentTasks} 个任务同时进行`, `${formatStorageCapacity(plan.storageBytes)} 存储容量`, plan.creditGraceDays ? `积分周期结束后另有 ${plan.creditGraceDays} 天使用期` : "周期积分在下一期开始时到期"].map((text) => <li key={text} className="flex items-center gap-2"><Check size={15} />{text}</li>)}</ul>
                        <Button className="mt-auto" type="primary" loading={payment.creating} disabled={!method || !amount} onClick={() => buy(plan)}>购买{annual ? "年" : "月"}会员</Button>
                    </article>;
                })}</div> : <Empty description="会员套餐准备中，现有积分仍可正常使用" />}
                <Alert type="info" title="购买与积分规则" description="一次购买，不自动续费。续购从已有会员结束后开始，换套餐也在下一段会员期生效。年付积分分12期按月到账，未用周期积分按标注时间到期；历史充值余额保留原规则。任务失败按原积分来源返还，跨过到期时间的冻结积分首次返还后保留24小时，重复返还不延长。存储到期按现有容量规则处理，不删除文件。" />
                <section className="rounded-xl border border-border bg-surface p-5"><h2 className="mb-3 font-semibold">会员积分</h2>{member.data.lots.length ? <ul className="divide-y divide-border">{member.data.lots.map((lot) => <li key={lot.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><div><strong>{lot.name}</strong><p className="mt-1 text-foreground/60">到期 {date(lot.expiresAt)}</p></div><div>可用 {formatCredits(lot.availableMicrocredits)} · 冻结 {formatCredits(lot.reservedMicrocredits)}</div></li>)}</ul> : <p className="text-sm text-foreground/60">暂无会员积分</p>}</section>
                {member.data.subscriptions.length ? <section className="rounded-xl border border-border bg-surface p-5"><h2 className="mb-3 font-semibold">购买记录</h2><ul className="space-y-3 text-sm">{member.data.subscriptions.map((sub) => <li key={sub.id}><strong>{sub.planName} · {sub.months}个月</strong><p className="text-foreground/65">{date(sub.startsAt)} — {date(sub.endsAt)} · 已发 {sub.grantedCycles}/{sub.months} 期</p></li>)}</ul></section> : null}
            </>}
        </div>{payment.dialog}
    </WorkspacePage>;
}
