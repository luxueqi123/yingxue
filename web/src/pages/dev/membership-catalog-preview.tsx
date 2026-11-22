import { useState } from "react";
import { Button, Segmented, Select, Tabs } from "antd";
import { ArrowUpRight, Moon, Sun } from "lucide-react";
import { WorkspacePage, PageHeader } from "@/components/layout/workspace-page";
import { MembershipCreditSummary, MembershipModelAccess, type MembershipCreditEstimate } from "@/components/membership/membership-offer-details";
import { AppModal } from "@/components/ui/product/app-modal";
import { useThemeStore } from "@/stores/use-theme-store";
import {
    creditSubscriptions,
    creditsPerYuan,
    currency,
    discountLabel,
    entryTopup,
    estimateMonthlyBundle,
    formatCredits,
    membershipBreakEvenFen,
    membershipModelGroups,
    membershipOffers,
    modelCampaign,
    modelPrices,
    modelQuote,
    modelSpecLabel,
    modelSpecs,
    renderSeatPlans,
    standardCreditsPerClip,
    subscriptionQuote,
    topupPacks,
    topupQuote,
    videoPasses,
    yuanPerUnit,
    type BillingPeriod,
    type MembershipOffer,
} from "./membership-offer-config";
import "./membership-catalog-preview.css";

type QuoteLine = readonly [label: string, value: string];

type OfferQuote = {
    name: string;
    amountFen: number;
    period?: string;
    lines: readonly QuoteLine[];
};

type ShowQuote = (quote: OfferQuote) => void;

const membershipOptions = membershipOffers.map(({ key, name }) => ({ value: key, label: name }));
const buyerOptions = [{ value: "guest", label: "普通用户" }, ...membershipOptions];
const pricingTopupOptions = topupPacks.map(({ id, amountFen }) => ({ value: id, label: `${currency(amountFen)} 面额` }));
const h3Example = modelSpecs.h3Base480;
const seedanceExample = modelSpecs.seedance480;
const sampleSpecs = [h3Example, modelSpecs.h3Origin768, seedanceExample, modelSpecs.seedance720];

function QuoteButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className="catalog-preview-quote-button" onClick={onClick}>
            {label}
            <ArrowUpRight size={15} aria-hidden />
        </button>
    );
}

function pointVideoLines(purchase: { amountFen: number; credits: number }, availableCredits = purchase.credits): QuoteLine[] {
    return sampleSpecs.map((spec) => {
        const quote = modelQuote(spec, purchase);
        return [modelSpecLabel(spec), `最多 ${formatCredits(Math.floor(availableCredits / quote.baseCredits))} 条 × ${spec.seconds} 秒 · ¥${quote.yuanPerClip}/条 · ¥${quote.yuanPerSecond}/秒`];
    });
}

function PointVideoHighlights({ credits }: { credits: number }) {
    const h3Count = Math.floor(credits / standardCreditsPerClip(h3Example));
    const seedanceCount = Math.floor(credits / standardCreditsPerClip(seedanceExample));
    return (
        <>
            <li>
                H3 Base Fast 480p <strong>{formatCredits(h3Count)} 条</strong>
            </li>
            <li>
                或 Seedance 2.5 官转 480p <strong>{formatCredits(seedanceCount)} 条</strong>
            </li>
        </>
    );
}

function MembershipOffers({ showQuote }: { showQuote: ShowQuote }) {
    const [period, setPeriod] = useState<BillingPeriod>("month");
    const [pricingTier, setPricingTier] = useState<MembershipOffer["key"]>("team");
    const [pricingTopupId, setPricingTopupId] = useState(entryTopup.id);
    const comparison = membershipOffers.find(({ key }) => key === pricingTier) ?? membershipOffers[1];
    const pricingPack = topupPacks.find(({ id }) => id === pricingTopupId) ?? entryTopup;
    const topup = topupQuote(pricingPack, comparison);
    const prices = modelPrices(topup, comparison.modelPayBasisPoints, comparison.campaignMaxJobs);
    const pricePeriod = period === "month" ? "月" : "年";

    function previewMembership(plan: MembershipOffer, bundle?: MembershipCreditEstimate) {
        setPricingTier(plan.key);
        const membershipFen = period === "month" ? plan.monthlyFen : plan.annualFen;
        if (bundle) {
            const { reference } = bundle;
            showQuote({
                name: plan.name,
                amountFen: membershipFen,
                period: pricePeriod,
                lines: [
                    ["每月到账", `${formatCredits(bundle.credits)} 积分`],
                    ["积分单价", `约 ¥${bundle.yuanPerCredit} / 分`],
                    ["折合视频", `约 ${formatCredits(bundle.videoCount)} 条`],
                    ["参考规格", `${reference.model} ${reference.resolution} · ${reference.seconds} 秒/条 · ${reference.creditsPerVideo} 分/条。实际扣分以生成页为准。`],
                    ["权益", plan.benefits.join(" · ")],
                ],
            });
            return;
        }
        const purchase = topupQuote(pricingPack, plan);
        const promo = { payBasisPoints: plan.modelPayBasisPoints, maxJobs: plan.campaignMaxJobs };
        const h3 = modelQuote(h3Example, purchase, promo);
        const seedance = modelQuote(seedanceExample, purchase, promo);
        const giftClips = Math.floor(plan.monthlyGiftCredits / h3.baseCredits);

        showQuote({
            name: plan.name,
            amountFen: membershipFen,
            period: pricePeriod,
            lines: [
                ["功能", plan.benefits.join(" · ") + (plan.teamSeats ? ` · ${plan.teamSeats} 席（含所有者）` : "")],
                ["会员充值", `${currency(pricingPack.amountFen)} 面额实付 ${currency(purchase.amountFen, true)} · 到账 ${formatCredits(purchase.credits)} 分`],
                ["开卡和本次充值合计", currency(membershipFen + purchase.amountFen, true)],
                ["每月体验积分", `${plan.monthlyGiftCredits} 分按标准扣分可试 ${giftClips} 条 H3 Base Fast 480p · 每条 5 秒`],
                ["模型首期优惠", `活动 ${modelCampaign.days} 天 · ${discountLabel(plan.modelPayBasisPoints)} · 全部活动规格合计 ${plan.campaignMaxJobs} 条`],
                ["H3 Base Fast 480p", `¥${h3.yuanPerClip}/5 秒 · ¥${h3.yuanPerSecond}/秒`],
                ["Seedance 2.5 官转 480p", `¥${seedance.yuanPerClip}/5 秒 · ¥${seedance.yuanPerSecond}/秒 · 需 1 张参考图`],
                ["本次充值全做 H3", `${formatCredits(h3.activityClips)} 条活动价 + ${formatCredits(h3.regularClips)} 条标准价`],
                ["加上当月体验积分", `合计 ${formatCredits(h3.totalClips + giftClips)} 条 H3 Base Fast 480p · 每条 5 秒`],
                ["仅靠充值折扣省回会员费", `每${pricePeriod}累计购买原价 ${currency(membershipBreakEvenFen(plan, period))} 的适用积分包`],
            ],
        });
    }

    return (
        <>
            <div className="catalog-preview-section-heading">
                <div>
                    <h2>会员方案</h2>
                </div>
                <Segmented<BillingPeriod>
                    aria-label="会员付费周期"
                    value={period}
                    onChange={setPeriod}
                    options={[
                        { label: "月付", value: "month" },
                        { label: "年付", value: "year" },
                    ]}
                />
            </div>
            <div className="catalog-preview-deck catalog-preview-deck-four">
                {membershipOffers.map((plan) => {
                    const bundle = period === "month" && plan.monthlyBundleCredits ? estimateMonthlyBundle(plan) : undefined;
                    const purchase = topupQuote(entryTopup, plan);
                    const giftClips = Math.floor(plan.monthlyGiftCredits / standardCreditsPerClip(h3Example));

                    return (
                        <article key={plan.key} className="catalog-preview-offer">
                            <h3>{plan.name}</h3>
                            <p className="catalog-preview-price">
                                <strong>{currency(period === "month" ? plan.monthlyFen : plan.annualFen)}</strong>
                                <span>/{pricePeriod}</span>
                            </p>
                            {bundle ? (
                                <MembershipCreditSummary estimate={bundle} />
                            ) : (
                                (period === "month" || !plan.monthlyBundleCredits) && (
                                    <p className="catalog-preview-offer-lead">{period === "month" ? `${currency(purchase.amountFen, true)} 买 ${formatCredits(purchase.credits)} 积分` : `年付比逐月省 ${currency(plan.monthlyFen * 12 - plan.annualFen)}`}</p>
                                )
                            )}
                            <ul className="catalog-preview-benefits">
                                {plan.benefits.map((benefit) => (
                                    <li key={benefit}>{benefit}</li>
                                ))}
                                {!bundle && plan.teamSeats > 0 && (
                                    <li>
                                        <strong>{plan.teamSeats} 个团队席位</strong>（含所有者）
                                    </li>
                                )}
                                {!bundle && (
                                    <>
                                        <li>充值积分 {discountLabel(plan.topupPayBasisPoints)}</li>
                                        <li>
                                            每月送 {plan.monthlyGiftCredits} 分 · 可试 {giftClips} 条 5 秒 H3 Base Fast 480p
                                        </li>
                                        <li>
                                            模型活动 {discountLabel(plan.modelPayBasisPoints)} · {modelCampaign.days} 天共 {plan.campaignMaxJobs} 条
                                        </li>
                                    </>
                                )}
                            </ul>
                            {bundle && <MembershipModelAccess groups={membershipModelGroups} />}
                            <QuoteButton label={`查看${plan.name}`} onClick={() => previewMembership(plan, bundle)} />
                        </article>
                    );
                })}
            </div>
            <section className="catalog-preview-models" aria-labelledby="catalog-pricing-heading">
                <div className="catalog-preview-section-heading">
                    <div>
                        <h2 id="catalog-pricing-heading">指定模型活动价</h2>
                        <p>
                            {currency(pricingPack.amountFen)} 面额实付 {currency(topup.amountFen, true)}，到账 {formatCredits(topup.credits)} 分。活动 {discountLabel(comparison.modelPayBasisPoints)} 扣分，会员费另计。
                        </p>
                        <p>活动限以下 5 秒规格。各规格共享 {comparison.campaignMaxJobs} 条优惠次数，用完按标准积分继续生成。</p>
                    </div>
                    <div className="catalog-preview-pricing-options">
                        <Select aria-label="模型秒价对应的会员" value={pricingTier} options={membershipOptions} onChange={setPricingTier} virtual={false} className="catalog-preview-select" />
                        <Select aria-label="活动价试算充值面额" value={pricingTopupId} options={pricingTopupOptions} onChange={setPricingTopupId} virtual={false} className="catalog-preview-select" />
                    </div>
                </div>
                <div className="catalog-preview-table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th scope="col">模型 · 规格</th>
                                <th scope="col">标准 → 活动（积分/条）</th>
                                <th scope="col">活动折算</th>
                                <th scope="col">本档最多可做</th>
                            </tr>
                        </thead>
                        <tbody>
                            {prices.map((row) => (
                                <tr key={modelSpecLabel(row)}>
                                    <th scope="row">
                                        {modelSpecLabel(row)}
                                        <small>
                                            {row.seconds} 秒 · {row.input}
                                        </small>
                                    </th>
                                    <td>
                                        {formatCredits(row.baseCredits)} → {formatCredits(row.activityCredits)}
                                    </td>
                                    <td>
                                        <strong>¥{row.yuanPerSecond}/秒</strong>
                                        <small>¥{row.yuanPerClip}/条</small>
                                    </td>
                                    <td>
                                        {row.totalClips} 条
                                        <small>
                                            {row.activityClips} 条活动价 + {row.regularClips} 条标准价
                                        </small>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}

function TopupOffers({ showQuote }: { showQuote: ShowQuote }) {
    const [buyerTier, setBuyerTier] = useState("guest");
    const member = membershipOffers.find(({ key }) => key === buyerTier);

    return (
        <>
            <div className="catalog-preview-section-heading">
                <div>
                    <h2>积分充值</h2>
                    <p>普通充值 ¥1 = {creditsPerYuan} 分。会员按身份折价，到账积分相同。</p>
                    <p>下列条数按 5 秒单一规格、标准积分价计算。Seedance 需 1 张参考图。</p>
                </div>
                <Select aria-label="积分包计价身份" value={buyerTier} options={buyerOptions} onChange={setBuyerTier} virtual={false} className="catalog-preview-select" />
            </div>
            <div className="catalog-preview-deck catalog-preview-deck-three catalog-preview-topups">
                {topupPacks.map((pack) => {
                    const quote = topupQuote(pack, member);

                    return (
                        <article className="catalog-preview-offer" key={pack.id}>
                            <h3>{pack.name}</h3>
                            <p className="catalog-preview-price">
                                <strong>{currency(quote.amountFen, true)}</strong>
                            </p>
                            <p className="catalog-preview-offer-lead">{formatCredits(pack.credits)} 积分</p>
                            <ul className="catalog-preview-benefits">
                                {quote.payBasisPoints && <li>会员比普通价省 {currency(pack.amountFen - quote.amountFen)}</li>}
                                <PointVideoHighlights credits={pack.credits} />
                            </ul>
                            <QuoteButton
                                label={`查看${pack.name}`}
                                onClick={() =>
                                    showQuote({
                                        name: pack.name,
                                        amountFen: quote.amountFen,
                                        lines: [
                                            ["即时到账", `${formatCredits(pack.credits)} 分 · ¥${yuanPerUnit(quote.amountFen, pack.credits)}/分`],
                                            ["计价", quote.payBasisPoints ? `普通价 ${currency(pack.amountFen)} · 会员 ${discountLabel(quote.payBasisPoints)}` : "普通充值价"],
                                            ...pointVideoLines(quote),
                                            ["试算条件", "条数按标准扣分分别计算。H3 为文生视频，Seedance 为 1 张参考图图生视频。"],
                                        ],
                                    })
                                }
                            />
                        </article>
                    );
                })}
            </div>
        </>
    );
}

function PassOffers({ showQuote }: { showQuote: ShowQuote }) {
    const firstPass = videoPasses[0];

    return (
        <>
            <div className="catalog-preview-section-heading">
                <div>
                    <h2>视频次卡</h2>
                    <p>
                        {currency(firstPass.amountFen, true)} 试 {firstPass.uses} 条 H3。选定模型与规格后，成功出片才核销。
                    </p>
                </div>
            </div>
            <div className="catalog-preview-deck catalog-preview-deck-three catalog-preview-passes">
                {videoPasses.map((pass) => {
                    const { spec, amountFen, uses } = pass;
                    const perClip = yuanPerUnit(amountFen, uses);
                    const perSecond = yuanPerUnit(amountFen, uses * spec.seconds);
                    const standardPrice = modelQuote(spec, entryTopup);

                    return (
                        <article className="catalog-preview-offer" key={pass.id}>
                            <h3>{pass.name}</h3>
                            <p className="catalog-preview-price">
                                <strong>{currency(amountFen, true)}</strong>
                                <span>/{uses} 条</span>
                            </p>
                            <p className="catalog-preview-offer-lead">
                                ¥{perClip}/条 · ¥{perSecond}/秒
                            </p>
                            <ul className="catalog-preview-benefits">
                                <li>
                                    {modelSpecLabel(spec)} · 单条 {spec.seconds} 秒
                                </li>
                                <li>{spec.input}</li>
                                <li>自购买起 {pass.days} 天有效</li>
                                {spec.mode === "fixed_request" && <li>按条计费，秒价按 {spec.seconds} 秒均摊</li>}
                            </ul>
                            <QuoteButton
                                label={`查看${pass.name}`}
                                onClick={() =>
                                    showQuote({
                                        name: pass.name,
                                        amountFen,
                                        lines: [
                                            ["适用", `${modelSpecLabel(spec)} · ${spec.input}`],
                                            ["可抵扣", `${uses} 条，每条 ${spec.seconds} 秒，购买起 ${pass.days} 天内使用`],
                                            ["每条与每秒", `¥${perClip}/条 · ¥${perSecond}/秒${spec.mode === "fixed_request" ? `（固定 ${spec.seconds} 秒均摊）` : ""}`],
                                            ["以 ¥10 买 1,000 分为例", `同规格标准扣 ${standardPrice.baseCredits} 分，折算 ¥${standardPrice.yuanPerClip}/条`],
                                            ["抵扣规则", "成功核销 1 次，失败释放。购买后选择使用次卡或积分。"],
                                        ],
                                    })
                                }
                            />
                        </article>
                    );
                })}
            </div>
        </>
    );
}

function SubscriptionOffers({ showQuote }: { showQuote: ShowQuote }) {
    const [buyerTier, setBuyerTier] = useState("guest");
    const member = membershipOffers.find(({ key }) => key === buyerTier);

    return (
        <>
            <div className="catalog-preview-section-heading">
                <div>
                    <h2>积分订阅</h2>
                    <p>适合有固定月度制作预算的账号。首期即时入账，已到账余额可留到下月使用。</p>
                    <p>下列条数按单月到账、5 秒单一规格和标准积分价计算。Seedance 需 1 张参考图。</p>
                </div>
                <Select aria-label="积分订阅计价身份" value={buyerTier} options={buyerOptions} onChange={setBuyerTier} virtual={false} className="catalog-preview-select" />
            </div>
            <div className="catalog-preview-deck catalog-preview-deck-three">
                {creditSubscriptions.map((pack) => {
                    const quote = subscriptionQuote(pack, member);
                    const standard = subscriptionQuote(pack);
                    const monthlyPrice = quote.amountFen / pack.months;

                    return (
                        <article className="catalog-preview-offer" key={pack.id}>
                            <h3>{pack.name}</h3>
                            <p className="catalog-preview-price">
                                <strong>{currency(quote.amountFen)}</strong>
                                <span>/{pack.months} 个月</span>
                            </p>
                            <p className="catalog-preview-offer-lead">
                                每月 {currency(monthlyPrice, true)} · {formatCredits(pack.creditsPerMonth)} 分
                            </p>
                            <ul className="catalog-preview-benefits">
                                <li>累计到账 {formatCredits(quote.credits)} 分</li>
                                {quote.payBasisPoints && <li>会员比普通价省 {currency(standard.amountFen - quote.amountFen)}</li>}
                                <PointVideoHighlights credits={pack.creditsPerMonth} />
                            </ul>
                            <QuoteButton
                                label={`查看${pack.name}`}
                                onClick={() =>
                                    showQuote({
                                        name: pack.name,
                                        amountFen: quote.amountFen,
                                        lines: [
                                            ["发放", `每月到账 ${formatCredits(pack.creditsPerMonth)} 分 · 共 ${pack.months} 期`],
                                            ["累计到账", `${formatCredits(quote.credits)} 分 · ¥${yuanPerUnit(quote.amountFen, quote.credits)}/分`],
                                            ...pointVideoLines(quote, pack.creditsPerMonth),
                                            ["续费规则", "首期即时到账，后续逐月发放。已入账可累计使用，到期手动续费。"],
                                        ],
                                    })
                                }
                            />
                        </article>
                    );
                })}
            </div>
        </>
    );
}

function SeatOffers({ showQuote }: { showQuote: ShowQuote }) {
    const [seats, setSeats] = useState(1);
    return (
        <>
            <div className="catalog-preview-section-heading">
                <div>
                    <h2>高频席位</h2>
                    <p>给批量跑镜头的账号。每席 1 条在途，按队列调度，有效期内按额度使用。</p>
                    <p>可用并发待实测，当前为席位报价预览。</p>
                </div>
                <Select aria-label="高频并发席位数" value={seats} onChange={setSeats} options={[1, 2, 3].map((count) => ({ value: count, label: `${count} 席` }))} virtual={false} className="catalog-preview-select" />
            </div>
            <div className="catalog-preview-deck catalog-preview-deck-two">
                {renderSeatPlans.map((plan) => {
                    const amountFen = plan.amountFen * seats;
                    const uses = plan.uses * seats;
                    const perClip = yuanPerUnit(amountFen, uses);
                    const perSecond = yuanPerUnit(amountFen, uses * plan.spec.seconds);
                    return (
                        <article className="catalog-preview-offer" key={plan.id}>
                            <h3>{plan.name}</h3>
                            <p className="catalog-preview-price">
                                <strong>{currency(amountFen, true)}</strong>
                                <span>/{plan.days} 天</span>
                            </p>
                            <p className="catalog-preview-offer-lead">
                                {seats} 席 · {formatCredits(uses)} 条
                            </p>
                            <ul className="catalog-preview-benefits">
                                <li>
                                    {modelSpecLabel(plan.spec)} · 每条 {plan.spec.seconds} 秒
                                </li>
                                <li>
                                    满额使用约 ¥{perClip}/条 · ¥{perSecond}/秒
                                </li>
                                <li>
                                    {plan.uses} 条/席 · 最多 {seats} 条同时在途
                                </li>
                            </ul>
                            <QuoteButton
                                label={`查看${plan.name}报价`}
                                onClick={() =>
                                    showQuote({
                                        name: plan.name,
                                        amountFen,
                                        period: `${plan.days} 天`,
                                        lines: [
                                            ["适用", `${modelSpecLabel(plan.spec)} · ${plan.spec.input}`],
                                            ["使用额度", `${seats} 席共 ${formatCredits(uses)} 条，每条 ${plan.spec.seconds} 秒`],
                                            ["满额折算", `¥${perClip}/条 · ¥${perSecond}/秒`],
                                            ["并发上限", `${seats} 条在途，按队列调度，购买起 ${plan.days} 天有效`],
                                        ],
                                    })
                                }
                            />
                        </article>
                    );
                })}
            </div>
        </>
    );
}

export default function MembershipCatalogPreview() {
    const [quote, setQuote] = useState<OfferQuote | null>(null);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const tabs = [
        { key: "membership", label: "会员方案", children: <MembershipOffers showQuote={setQuote} /> },
        { key: "topup", label: "积分充值", children: <TopupOffers showQuote={setQuote} /> },
        { key: "passes", label: "视频次卡", children: <PassOffers showQuote={setQuote} /> },
        { key: "subscription", label: "积分订阅", children: <SubscriptionOffers showQuote={setQuote} /> },
        { key: "seats", label: "高频席位", children: <SeatOffers showQuote={setQuote} /> },
    ];

    return (
        <WorkspacePage>
            <div className="catalog-preview">
                <PageHeader
                    title="会员与充值"
                    description="套餐报价预览"
                    actions={
                        <>
                            <Button href="?view=welcome">看注册弹窗</Button>
                            <Button icon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                                {theme === "dark" ? "浅色预览" : "深色预览"}
                            </Button>
                        </>
                    }
                />
                <Tabs items={tabs} defaultActiveKey="membership" tabBarGutter={20} className="catalog-preview-tabs" />
            </div>
            <AppModal title={quote?.name} open={quote !== null} onCancel={() => setQuote(null)} footer={null} width={488} centered>
                {quote && (
                    <div className="catalog-preview-transaction">
                        <p className="catalog-preview-transaction-total">
                            {currency(quote.amountFen, true)}
                            {quote.period && <span>/{quote.period}</span>}
                        </p>
                        <dl>
                            {quote.lines.map(([label, value]) => (
                                <div key={label}>
                                    <dt>{label}</dt>
                                    <dd>{value}</dd>
                                </div>
                            ))}
                        </dl>
                        <Button onClick={() => setQuote(null)}>返回方案</Button>
                    </div>
                )}
            </AppModal>
        </WorkspacePage>
    );
}
