import type { MembershipWelcomePlan } from "@/components/membership/membership-welcome";
import type { MembershipCreditEstimate, MembershipModelGroup } from "@/components/membership/membership-offer-details";

const MICRO = 1_000_000;
const BASIS_POINTS = 10_000;

export const creditsPerYuan = 100;
export const modelCampaign = { days: 7 } as const;

export const membershipOffers = [
    {
        key: "creator",
        name: "创作会员",
        monthlyFen: 3000,
        annualFen: 29900,
        topupPayBasisPoints: 9500,
        modelPayBasisPoints: 9500,
        monthlyBundleCredits: 3300,
        monthlyGiftCredits: 100,
        teamSeats: 0,
        campaignMaxJobs: 20,
        benefits: ["解锁电商 Agent · 商品分析、文案与商品图"],
    },
    {
        key: "team",
        name: "团队会员",
        monthlyFen: 6000,
        annualFen: 49900,
        topupPayBasisPoints: 9000,
        modelPayBasisPoints: 9000,
        monthlyBundleCredits: 7000,
        monthlyGiftCredits: 100,
        teamSeats: 3,
        campaignMaxJobs: 50,
        benefits: ["解锁电商 Agent · 商品分析、文案与商品图", "解锁公司与团队 · 共享画布、素材和团队钱包"],
    },
    {
        key: "production",
        name: "制作会员",
        monthlyFen: 8900,
        annualFen: 89900,
        topupPayBasisPoints: 9000,
        modelPayBasisPoints: 9000,
        monthlyBundleCredits: 0,
        monthlyGiftCredits: 200,
        teamSeats: 5,
        campaignMaxJobs: 100,
        benefits: ["含团队会员功能", "短剧工作台 · 分集、分镜与素材协作"],
    },
    {
        key: "studio",
        name: "工作室会员",
        monthlyFen: 19900,
        annualFen: 199900,
        topupPayBasisPoints: 9000,
        modelPayBasisPoints: 9000,
        monthlyBundleCredits: 0,
        monthlyGiftCredits: 300,
        teamSeats: 20,
        campaignMaxJobs: 200,
        benefits: ["含制作会员功能", "团队额度分配与资金流水"],
    },
] as const;

export type MembershipOffer = (typeof membershipOffers)[number];
export type BillingPeriod = "month" | "year";

type PointsPurchase = { amountFen: number; credits: number };
type TopupPack = PointsPurchase & { id: string; name: string };

function standardTopup(id: string, name: string, amountFen: number): TopupPack {
    return { id, name, amountFen, credits: (amountFen * creditsPerYuan) / 100 };
}

export const entryTopup = standardTopup("flex", "随用包", 1000);

export const topupPacks: readonly TopupPack[] = [
    entryTopup,
    standardTopup("practice", "练手包", 5000),
    standardTopup("short", "短片包", 10_000),
    standardTopup("weekly", "周更包", 20_000),
    standardTopup("batch", "批量包", 50_000),
    standardTopup("studio", "工作室积分包", 100_000),
];

export type ModelSpec = {
    model: string;
    resolution: string;
    mode: "per_second" | "fixed_request";
    seconds: number;
    unitCredits: number;
    input: string;
};

const h3 = { mode: "per_second", seconds: 5, input: "文生视频 · 标准速度、不放大" } as const;
const seedance = { mode: "per_second", seconds: 5, input: "图生视频 · 1 张参考图，16:9" } as const;

export const modelSpecs = {
    wan3Pool1080: { model: "Wan3.0-Video", resolution: "1080p", mode: "fixed_request", seconds: 30, unitCredits: 300, input: "成片时长折算" },
    h3Base480: { ...h3, model: "H3 Base Fast", resolution: "480p", unitCredits: 2 },
    h3Base768: { ...h3, model: "H3 Base Fast", resolution: "768p", unitCredits: 4 },
    h3Origin480: { ...h3, model: "H3 Origin Fast", resolution: "480p", unitCredits: 3 },
    h3Origin768: { ...h3, model: "H3 Origin Fast", resolution: "768p", unitCredits: 6 },
    seedance480: { ...seedance, model: "Seedance 2.5 官转", resolution: "480p", unitCredits: 46 },
    seedance720: { ...seedance, model: "Seedance 2.5 官转", resolution: "720p", unitCredits: 100 },
    flash480: { ...seedance, model: "Seedance 2.5 Flash 官转", resolution: "480p", mode: "fixed_request", seconds: 15, unitCredits: 460 },
} as const satisfies Record<string, ModelSpec>;

export const membershipModelGroups: readonly MembershipModelGroup[] = [
    {
        label: "AI 生图",
        models: [
            { name: "GPT-Image-2.6 Sunburst", id: "gpt-image-2.6-sunburst" },
            { name: "Gemini Nano Banana 2.1", id: "gemini-nano-banana-2.1" },
        ],
    },
    { label: "语言理解", models: [{ name: "GPT-6.2 Astra", id: "gpt-6.2-astra" }] },
    { label: "视频生成", models: [{ name: "Seedance 2.0" }, { name: "Seedance 2.5" }, { name: modelSpecs.wan3Pool1080.model }, { name: "MiniMax H3" }] },
];

export function estimateMonthlyBundle(plan: Pick<MembershipOffer, "monthlyFen" | "monthlyBundleCredits">): MembershipCreditEstimate {
    const spec = modelSpecs.wan3Pool1080;
    const seconds = 2;
    const credits = plan.monthlyBundleCredits;
    const creditsPerVideo = (standardCreditsPerClip(spec) * seconds) / spec.seconds;

    return {
        credits,
        yuanPerCredit: (plan.monthlyFen / 100 / credits).toFixed(4),
        videoCount: Math.floor(credits / creditsPerVideo),
        reference: { model: spec.model, resolution: spec.resolution, seconds, creditsPerVideo },
    };
}

export const campaignSpecs = [modelSpecs.h3Base480, modelSpecs.h3Base768, modelSpecs.h3Origin480, modelSpecs.h3Origin768, modelSpecs.seedance480, modelSpecs.seedance720] as const;

export const videoPasses = [
    { id: "h3-base", name: "H3 试镜次卡", spec: modelSpecs.h3Base480, amountFen: 790, uses: 100, days: 7 },
    { id: "h3-origin", name: "H3 高清次卡", spec: modelSpecs.h3Origin768, amountFen: 1190, uses: 50, days: 30 },
    { id: "seedance-480", name: "Seedance 480p 次卡", spec: modelSpecs.seedance480, amountFen: 1790, uses: 10, days: 7 },
    { id: "seedance-720", name: "Seedance 720p 次卡", spec: modelSpecs.seedance720, amountFen: 3900, uses: 10, days: 30 },
    { id: "flash", name: "Seedance Flash 长镜头次卡", spec: modelSpecs.flash480, amountFen: 3590, uses: 10, days: 30 },
] as const;

export const creditSubscriptions = [
    { id: "quarter", name: "积分季卡", months: 3, creditsPerMonth: 2000 },
    { id: "half-year", name: "积分半年卡", months: 6, creditsPerMonth: 2000 },
    { id: "year", name: "积分年卡", months: 12, creditsPerMonth: 2000 },
] as const;

export const renderSeatPlans = [
    { id: "week", name: "高频周席", days: 7, uses: 200, amountFen: 1690, spec: modelSpecs.h3Base480 },
    { id: "month", name: "高频月席", days: 30, uses: 800, amountFen: 6490, spec: modelSpecs.h3Base480 },
] as const;

const wholeMoney = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const decimalMoney = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numeric = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 });

export function currency(amountFen: number, decimals = false) {
    return (decimals ? decimalMoney : wholeMoney).format(amountFen / 100);
}

export function formatCredits(credits: number) {
    return numeric.format(credits);
}

export function discountLabel(payBasisPoints: number) {
    return `${payBasisPoints / 1000} 折`;
}

function discountedAmount(amount: number, payBasisPoints: number) {
    return Math.ceil((amount * payBasisPoints) / BASIS_POINTS);
}

// Round the last displayed decimal up. Intermediate values represent integral fen or microcredits.
function yuanRatio(fen: bigint, divisor: bigint) {
    const denominator = divisor * BigInt(100);
    const micros = (fen * BigInt(MICRO) + denominator - BigInt(1)) / denominator;
    return (Number(micros) / MICRO).toFixed(6).replace(/\.?0+$/, "");
}

export function yuanPerUnit(amountFen: number, units: number) {
    return yuanRatio(BigInt(amountFen), BigInt(units));
}

export function topupQuote(pack: PointsPurchase, plan?: Pick<MembershipOffer, "topupPayBasisPoints">) {
    const payBasisPoints = plan?.topupPayBasisPoints;
    return {
        credits: pack.credits,
        payBasisPoints,
        amountFen: payBasisPoints ? discountedAmount(pack.amountFen, payBasisPoints) : pack.amountFen,
    };
}

export function subscriptionQuote(pack: { creditsPerMonth: number; months: number }, plan?: Pick<MembershipOffer, "topupPayBasisPoints">) {
    const credits = pack.creditsPerMonth * pack.months;
    const amountFen = Math.ceil((credits * 100) / creditsPerYuan);
    return topupQuote({ amountFen, credits }, plan);
}

export function modelSpecLabel(spec: ModelSpec) {
    return `${spec.model} ${spec.resolution}`;
}

export function standardCreditsPerClip(spec: ModelSpec) {
    return spec.unitCredits * (spec.mode === "per_second" ? spec.seconds : 1);
}

export function modelQuote(spec: ModelSpec, purchase: PointsPurchase, campaign?: { payBasisPoints: number; maxJobs: number }) {
    const baseCredits = standardCreditsPerClip(spec);
    const baseMicrocredits = baseCredits * MICRO;
    const activityMicrocredits = discountedAmount(baseMicrocredits, campaign?.payBasisPoints ?? BASIS_POINTS);
    const wallet = purchase.credits * MICRO;
    const activityClips = Math.min(campaign?.maxJobs ?? 0, Math.floor(wallet / activityMicrocredits));
    const remaining = wallet - activityClips * activityMicrocredits;
    const regularClips = Math.floor(remaining / baseMicrocredits);
    const proportionalFen = BigInt(activityMicrocredits) * BigInt(purchase.amountFen);
    const pointDivisor = BigInt(wallet);

    return {
        baseCredits,
        activityCredits: activityMicrocredits / MICRO,
        yuanPerClip: yuanRatio(proportionalFen, pointDivisor),
        yuanPerSecond: yuanRatio(proportionalFen, pointDivisor * BigInt(spec.seconds)),
        activityClips,
        regularClips,
        totalClips: activityClips + regularClips,
    };
}

export function modelPrices(purchase: PointsPurchase, payBasisPoints: number, maxJobs: number) {
    return campaignSpecs.map((spec) => ({
        ...spec,
        ...modelQuote(spec, purchase, { payBasisPoints, maxJobs }),
    }));
}

export function membershipBreakEvenFen(plan: MembershipOffer, period: BillingPeriod) {
    const periodPrice = period === "month" ? plan.monthlyFen : plan.annualFen;
    return Math.ceil((periodPrice * BASIS_POINTS) / (BASIS_POINTS - plan.topupPayBasisPoints));
}

export const welcomePlans = [membershipOffers[0], membershipOffers[1]].map((plan): MembershipWelcomePlan => ({
    key: plan.key,
    name: plan.name.replace(/会员$/, "月卡"),
    amountFen: plan.monthlyFen,
    topupPayBasisPoints: plan.topupPayBasisPoints,
    modelPayBasisPoints: plan.modelPayBasisPoints,
    campaignMaxJobs: plan.campaignMaxJobs,
    monthlyBundle: estimateMonthlyBundle(plan),
    teams: plan.teamSeats > 0,
    sampleTopup: topupQuote(entryTopup, plan),
}));
