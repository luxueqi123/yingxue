import { useState } from "react";
import { Button, ConfigProvider, Select } from "antd";
import { Check, Moon, Sun } from "lucide-react";
import { MembershipWelcomeReminder, type MembershipWelcomePlan, type MembershipWelcomeTrial } from "@/components/membership/membership-welcome";
import { MembershipCreditSummary, MembershipModelAccess } from "@/components/membership/membership-offer-details";
import { WorkspaceWalletModal } from "@/components/layout/workspace-wallet-modal";
import { WorkspacePage, PageHeader } from "@/components/layout/workspace-page";
import { useThemeStore } from "@/stores/use-theme-store";
import type { TopupProduct } from "@/services/api/payments";
import MembershipCatalogPreview from "./membership-catalog-preview";
import {
    creditsPerYuan, currency, entryTopup, formatCredits, membershipModelGroups, modelCampaign,
    modelPrices, modelSpecLabel, topupPacks, welcomePlans,
} from "./membership-offer-config";

const accounts = [
    { value: "new-account", label: "新注册账号" },
    { value: "expired-account", label: "体验已到期账号" },
    { value: "second-account", label: "另一位新注册用户" },
    { value: "guest", label: "未登录访客" },
];

const previewCreditProducts = topupPacks.map((pack, index): TopupProduct => ({
    id: `preview-${pack.id}`,
    name: pack.name,
    kind: "credits",
    amountFen: pack.amountFen,
    currency: "CNY",
    creditsMicrocredits: pack.credits * 1_000_000,
    storageBytes: 0,
    storageDurationDays: 0,
    enabled: true,
    sortOrder: index,
    saleStrategy: "unlimited",
    canPurchase: true,
    createdBy: "",
    updatedBy: "",
    createdAt: "",
    updatedAt: "",
}));

function MembershipShopPreview() {
    const [open, setOpen] = useState(true);
    return (
        <WorkspacePage>
            <PageHeader title="积分商城预览" actions={<Button onClick={() => setOpen(true)}>打开积分商城预览</Button>} />
            <ConfigProvider getPopupContainer={() => document.body}>
                <WorkspaceWalletModal open={open} onClose={() => setOpen(false)} preview={{
                    creditsPerYuan,
                    creditProducts: previewCreditProducts,
                    membership: (
                        <section className="workspace-wallet-content wallet-shop-membership" aria-label="会员方案">
                            <div className="wallet-shop-plan-grid">
                                {welcomePlans.map((plan) => (
                                    <article key={plan.key} className="wallet-shop-plan">
                                        <h3>{plan.name}</h3>
                                        <p className="wallet-shop-price"><strong>{currency(plan.amountFen)}</strong> / 月</p>
                                        <MembershipCreditSummary estimate={plan.monthlyBundle} />
                                        <ul className="wallet-shop-perks">
                                            <li><Check size={14} aria-hidden /> 解锁电商 Agent</li>
                                            {plan.teams && <li><Check size={14} aria-hidden /> 解锁公司与团队</li>}
                                        </ul>
                                    </article>
                                ))}
                            </div>
                            <div className="wallet-shop-models">
                                <h3>两档均可使用的模型</h3>
                                <MembershipModelAccess groups={membershipModelGroups} />
                            </div>
                        </section>
                    ),
                }} />
            </ConfigProvider>
        </WorkspacePage>
    );
}

function previewTrial(account: string, now: Date, seconds?: number): MembershipWelcomeTrial {
    const offset = seconds === undefined ? (account === "expired-account" ? -2 * 3600 : 20 * 3600 + 42 * 60) : seconds;
    return { serverNow: now.toISOString(), endsAt: new Date(now.getTime() + offset * 1000).toISOString() };
}

function PlanExample({ plan }: { plan: MembershipWelcomePlan }) {
    const rows = modelPrices(plan.sampleTopup, plan.modelPayBasisPoints, plan.campaignMaxJobs);
    const clip = rows[0];
    return (
        <section className="space-y-2 rounded-xl border border-border bg-surface p-5" aria-label="月卡报价示例">
            <h2 className="text-xl font-semibold">{plan.name} · 报价示例</h2>
            <MembershipCreditSummary estimate={plan.monthlyBundle} />
            <p>另购 {formatCredits(entryTopup.credits)} 积分原价 {currency(entryTopup.amountFen)}，会员实付 <strong>{currency(plan.sampleTopup.amountFen, true)}</strong>。</p>
            <p>{modelSpecLabel(clip)}、{clip.seconds} 秒的示例报价，活动从 {clip.baseCredits} 分降为 <strong>{clip.activityCredits} 分</strong>。</p>
            <p>活动 {modelCampaign.days} 天。指定规格合计最多 {plan.campaignMaxJobs} 条优惠，用完恢复标准扣分。</p>
            <p>{plan.teams ? "包含电商 Agent 和公司与团队使用权。" : "包含电商 Agent 使用权。"}</p>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                    <caption className="pb-2 text-left text-foreground/70">各规格按 5 秒试算。H3 为文生视频，Seedance 需 1 张参考图。月费另计。</caption>
                    <thead>
                        <tr className="border-b border-border">
                            <th scope="col" className="p-2">模型与规格</th>
                            <th scope="col" className="p-2">活动积分/条</th>
                            <th scope="col" className="p-2">活动折算</th>
                            <th scope="col" className="p-2">上述积分可做</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={`${row.model}-${row.resolution}`} className="border-b border-border">
                                <th scope="row" className="p-2 font-medium">{modelSpecLabel(row)}</th>
                                <td className="p-2 tabular-nums">{row.activityCredits}</td>
                                <td className="p-2 tabular-nums">¥{row.yuanPerSecond}/秒 · ¥{row.yuanPerClip}/条</td>
                                <td className="p-2 tabular-nums">{row.activityClips} 条活动价 + {row.regularClips} 条标准价</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default function MembershipPreviewLab() {
    const [previewParams] = useState(() => new URLSearchParams(window.location.search));
    if (previewParams.get("view") === "plans") return <MembershipShopPreview />;
    if (previewParams.get("view") === "quotes") return <MembershipCatalogPreview />;
    return <MembershipWelcomePreview previewParams={previewParams} />;
}

function MembershipWelcomePreview({ previewParams }: { previewParams: URLSearchParams }) {
    const [account, setAccount] = useState(() => {
        const requested = previewParams.get("account");
        return accounts.find((entry) => entry.value === requested)?.value ?? accounts[0].value;
    });
    const [trial, setTrial] = useState(() => previewTrial(account, new Date(), previewParams.get("endsIn") === "2" ? 2 : undefined));
    const [visit, setVisit] = useState(0);
    const [plan, setPlan] = useState<MembershipWelcomePlan | null>(null);
    const [feature, setFeature] = useState<"ecommerce" | "teams" | null>(null);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);

    const switchAccount = (next: string) => {
        setAccount(next);
        setTrial(previewTrial(next, new Date()));
        setPlan(null);
        setFeature(null);
    };

    return (
        <WorkspacePage>
            <div className="mx-auto max-w-4xl space-y-5">
                <PageHeader title="映雪会员卡片预览" description="预览注册体验、两档月卡及每日提醒。"
                    actions={<Button icon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                        {theme === "dark" ? "浅色预览" : "深色预览"}
                    </Button>}
                />
                <div className="flex flex-wrap items-center gap-2">
                    <Select aria-label="预览账号状态" className="min-w-40" options={accounts} value={account} onChange={switchAccount} />
                    <Button href="?view=plans">查看全部套餐</Button>
                    <Button onClick={() => {
                        setTrial((current) => ({ ...current, serverNow: new Date().toISOString() }));
                        setVisit((value) => value + 1);
                    }}>模拟再次打开网站</Button>
                </div>
                {plan && <PlanExample plan={plan} />}
                {feature && (
                    <section className="rounded-xl border border-border bg-surface p-5" aria-label="体验入口预览">
                        <h2 className="text-xl font-semibold">{feature === "ecommerce" ? "电商 Agent 体验入口" : "公司与团队体验入口"}</h2>
                        <p className="mt-2">正式流程由服务端校验注册体验时限后进入工作区。</p>
                    </section>
                )}
            </div>
            <MembershipWelcomeReminder
                key={visit}
                accountId={account === "guest" ? "" : `preview:${account}`}
                plans={welcomePlans}
                trial={trial}
                modelGroups={membershipModelGroups}
                onTrialFeature={(selectedFeature) => {
                    setPlan(null);
                    setFeature(selectedFeature);
                }}
                onViewPlan={(selectedPlan) => {
                    setFeature(null);
                    setPlan(selectedPlan);
                }}
            />
        </WorkspacePage>
    );
}
