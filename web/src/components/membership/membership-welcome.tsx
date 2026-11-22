import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Checkbox, ConfigProvider } from "antd";
import { ArrowUpRight, Check, Pause, Play, X } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import {
    MembershipCreditSummary, MembershipModelAccess, type MembershipCreditEstimate, type MembershipModelGroup,
} from "./membership-offer-details";
import "./membership-welcome.css";

export type MembershipWelcomePlan = {
    key: "creator" | "team";
    name: string;
    amountFen: number;
    topupPayBasisPoints: number;
    modelPayBasisPoints: number;
    campaignMaxJobs: number;
    monthlyBundle: MembershipCreditEstimate;
    teams: boolean;
    sampleTopup: { amountFen: number; credits: number };
};

export type MembershipWelcomeTrial = {
    endsAt: string;
    serverNow: string;
};

type WelcomeProps = {
    accountId: string;
    plans: readonly MembershipWelcomePlan[];
    trial: MembershipWelcomeTrial | null;
    modelGroups: readonly MembershipModelGroup[];
    onTrialFeature: (feature: "ecommerce" | "teams") => void;
    onViewPlan: (plan: MembershipWelcomePlan) => void;
};

const shanghaiDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
const shanghaiTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});
const cny = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(notify: () => void) {
    const preference = window.matchMedia(reducedMotionQuery);
    preference.addEventListener("change", notify);
    return () => preference.removeEventListener("change", notify);
}

function prefersReducedMotion() {
    return window.matchMedia(reducedMotionQuery).matches;
}

function reminderKey(accountId: string) {
    return `yingxue:membership-welcome:${accountId}`;
}

function dismissedToday(accountId: string) {
    try {
        return window.localStorage.getItem(reminderKey(accountId)) === shanghaiDay.format(new Date());
    } catch {
        return false;
    }
}

function trialClock(trial: MembershipWelcomeTrial) {
    const endsAt = Date.parse(trial.endsAt);
    const serverNow = Date.parse(trial.serverNow);
    if (!Number.isFinite(endsAt) || !Number.isFinite(serverNow)) return null;
    return { endsAt, serverNow, receivedAt: performance.now() };
}

function TrialCard({ trial, onTrialFeature }: Pick<WelcomeProps, "trial" | "onTrialFeature">) {
    const [clock] = useState(() => trial ? trialClock(trial) : null);
    const [elapsed, setElapsed] = useState(0);
    const remainingMinutes = clock ? Math.max(0, Math.ceil((clock.endsAt - clock.serverNow - elapsed) / 60_000)) : 0;
    const active = remainingMinutes > 0;

    useEffect(() => {
        if (!clock || !active) return;
        const refresh = () => setElapsed(performance.now() - clock.receivedAt);
        const interval = window.setInterval(refresh, 1000);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [clock, active]);

    if (!clock) return null;
    return (
        <section className="membership-welcome-trial" aria-labelledby="membership-trial-title">
            <div className="membership-welcome-trial-head">
                <h3 id="membership-trial-title">24 小时体验卡</h3>
                {active ? (
                    <time dateTime={trial?.endsAt}>
                        剩余 {Math.floor(remainingMinutes / 60)} 小时 {remainingMinutes % 60} 分
                        <span aria-hidden="true"> · </span>
                        {shanghaiTime.format(clock.endsAt)} 到期
                    </time>
                ) : <span>体验已到期</span>}
            </div>
            {active && (
                <div className="membership-welcome-trial-actions">
                    <button type="button" onClick={() => onTrialFeature("ecommerce")}>
                        体验电商 Agent <ArrowUpRight size={13} aria-hidden />
                    </button>
                    <button type="button" onClick={() => onTrialFeature("teams")}>
                        体验公司与团队 <ArrowUpRight size={13} aria-hidden />
                    </button>
                </div>
            )}
        </section>
    );
}

function MembershipBackdropVideo({ active }: { active: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const syncPlayback = () => {
            if (!active || document.hidden) {
                video.pause();
                return;
            }
            void video.play().catch(() => {
                if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) setVisible(false);
            });
        };
        syncPlayback();
        document.addEventListener("visibilitychange", syncPlayback);

        return () => {
            document.removeEventListener("visibilitychange", syncPlayback);
            video.pause();
        };
    }, [active]);

    return (
        <video
            ref={videoRef}
            className="membership-welcome-backdrop-video"
            data-visible={visible}
            src={`${import.meta.env.BASE_URL}showcase/membership/brushed-steel-reflection.mp4`}
            muted
            playsInline
            loop
            preload="metadata"
            aria-hidden
            onPlaying={() => setVisible(true)}
            onError={() => setVisible(false)}
        />
    );
}

type PlanOfferProps = {
    plan: MembershipWelcomePlan;
    onViewPlan: WelcomeProps["onViewPlan"];
};

function PlanOffer({ plan, onViewPlan }: PlanOfferProps) {
    return (
        <article className="membership-welcome-plan" data-plan={plan.key} aria-labelledby={`membership-plan-${plan.key}`}>
            <h3 id={`membership-plan-${plan.key}`}>{plan.name}</h3>
            <div className="membership-welcome-plan-numbers">
                <p className="membership-welcome-price">
                    <strong>{cny.format(plan.amountFen / 100)}</strong>
                    <span> / 月</span>
                </p>
                <MembershipCreditSummary estimate={plan.monthlyBundle} />
            </div>
            <ul className="membership-welcome-benefits">
                <li><Check size={14} aria-hidden /> 解锁电商 Agent</li>
                {plan.teams && <li><Check size={14} aria-hidden /> 解锁公司与团队</li>}
            </ul>
            <button type="button" className="membership-welcome-plan-action" onClick={() => onViewPlan(plan)}>
                查看{plan.name}
                <ArrowUpRight size={15} aria-hidden />
            </button>
        </article>
    );
}

export function MembershipWelcomeReminder(props: WelcomeProps) {
    if (!props.accountId || props.plans.length === 0) return null;
    return (
        <ConfigProvider getPopupContainer={() => document.body}>
            <AccountMembershipWelcome key={props.accountId} {...props} />
        </ConfigProvider>
    );
}

function AccountMembershipWelcome({ accountId, plans, trial, modelGroups, onTrialFeature, onViewPlan }: WelcomeProps) {
    const [open, setOpen] = useState(() => !dismissedToday(accountId));
    const [hideToday, setHideToday] = useState(false);
    const [playBackground, setPlayBackground] = useState(true);
    const reduceMotion = useSyncExternalStore(subscribeToMotionPreference, prefersReducedMotion, () => true);
    const animateBackground = open && playBackground && !reduceMotion;

    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key === reminderKey(accountId) && dismissedToday(accountId)) setOpen(false);
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [accountId]);

    const close = () => {
        setOpen(false);
        if (!hideToday) return;
        try {
            window.localStorage.setItem(reminderKey(accountId), shanghaiDay.format(new Date()));
        } catch {
            // The dialog remains dismissible when storage is unavailable.
        }
    };

    return (
        <AppModal
            open={open}
            onCancel={close}
            footer={null}
            closable={false}
            mask={{ closable: false }}
            width={844}
            centered
            flush
            title={<span className="sr-only">映雪会员</span>}
            classNames={{ header: "membership-welcome-modal-title" }}
            styles={{ container: { background: "transparent" } }}
        >
            <div className="membership-welcome" data-motion={animateBackground}>
                <div className="membership-welcome-backdrop" aria-hidden>
                    {!reduceMotion && <MembershipBackdropVideo active={animateBackground} />}
                </div>
                <div className="membership-welcome-rim-light" aria-hidden />
                <header className="membership-welcome-header">
                    <h2>映雪会员</h2>
                    <div className="membership-welcome-header-actions">
                        {!reduceMotion && (
                            <button
                                type="button"
                                className="membership-welcome-close"
                                aria-label="背景动效"
                                aria-pressed={playBackground}
                                title={playBackground ? "暂停背景动效" : "播放背景动效"}
                                onClick={() => setPlayBackground((playing) => !playing)}
                            >
                                {playBackground ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
                            </button>
                        )}
                        <button type="button" className="membership-welcome-close" aria-label="关闭会员介绍" onClick={close}>
                            <X size={20} aria-hidden />
                        </button>
                    </div>
                </header>
                <div className="membership-welcome-content">
                    <TrialCard key={trial?.endsAt} trial={trial} onTrialFeature={(feature) => {
                        close();
                        onTrialFeature(feature);
                    }} />
                    <div className="membership-welcome-plans">
                        {plans.map((plan) => (
                            <PlanOffer
                                key={plan.key}
                                plan={plan}
                                onViewPlan={(selected) => {
                                    close();
                                    onViewPlan(selected);
                                }}
                            />
                        ))}
                    </div>
                    <section className="membership-welcome-models" aria-labelledby="membership-shared-models-title">
                        <h3 id="membership-shared-models-title">两档均可使用的模型</h3>
                        <MembershipModelAccess groups={modelGroups} />
                    </section>
                </div>
                <footer className="membership-welcome-footer">
                    <Checkbox checked={hideToday} onChange={(event) => setHideToday(event.target.checked)}>本日不再提醒</Checkbox>
                    <Button onClick={close}>稍后再看</Button>
                </footer>
            </div>
        </AppModal>
    );
}
