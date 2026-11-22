import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Input, Skeleton } from "antd";
import { Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { ApiError } from "@/services/api/request";
import { formatReferralCredits, formatReferralRate, formatReferralYuan, getReferralOverview, listReferralCommissions, listReferralInvitees, referralLink } from "@/services/api/referral";
import { useUserStore } from "@/stores/use-user-store";
import "./referral-page.css";

type RecordTab = "invitees" | "commissions";

const PAGE_SIZE = 20;

export default function ReferralPage() {
    const { t, locale } = useInterfaceTranslation();
    const { message } = App.useApp();
    const referralAvailable = useUserStore((state) => state.referralAvailable);
    const hydrated = useUserStore((state) => state.hydrated);
    const [tab, setTab] = useState<RecordTab>("invitees");
    const [page, setPage] = useState(1);
    const overview = useQuery({ queryKey: ["referral", "overview"], queryFn: getReferralOverview, enabled: referralAvailable });
    const invitees = useQuery({ queryKey: ["referral", "invitees", page], queryFn: () => listReferralInvitees({ page, pageSize: PAGE_SIZE }), enabled: referralAvailable && tab === "invitees" });
    const commissions = useQuery({ queryKey: ["referral", "commissions", page], queryFn: () => listReferralCommissions({ page, pageSize: PAGE_SIZE }), enabled: referralAvailable && tab === "commissions" });

    // 入口不可见时直接访问 URL 也不展示页面；后端同样会拒绝。
    if (hydrated && !referralAvailable) return <Navigate to="/home" replace />;
    const forbidden = overview.error instanceof ApiError && overview.error.status === 403;
    if (forbidden) return <Navigate to="/home" replace />;

    const data = overview.data;
    const link = data ? referralLink(data.code) : "";
    const copy = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            message.success(t("followupUi.copiedName", { name: label }));
        } catch {
            message.error(t("followupUi.copyManually"));
        }
    };
    const refresh = () => {
        void overview.refetch();
        void (tab === "invitees" ? invitees.refetch() : commissions.refetch());
    };
    const records = tab === "invitees" ? invitees : commissions;
    const total = records.data?.total ?? 0;

    return (
        <WorkspacePage className="referral-page">
            <PageHeader
                title={t("referralCenter")}
                description={t("followupUi.referralDescription")}
                actions={
                    <Button icon={<RefreshCw className="size-3.5" />} loading={overview.isFetching} onClick={refresh}>
                        {t("storageUi.refresh")}
                    </Button>
                }
            />
            <div className="mt-4 grid gap-4">
                {overview.isPending ? (
                    <Skeleton active paragraph={{ rows: 4 }} />
                ) : overview.error ? (
                    <div className="referral-page-link-card">
                        <p>{overview.error instanceof Error ? overview.error.message : t("followupUi.referralReadFailed")}</p>
                        <div>
                            <Button onClick={() => void overview.refetch()}>{t("authRetry")}</Button>
                        </div>
                    </div>
                ) : data ? (
                    <>
                        <section className="referral-page-link-card" aria-label={t("followupUi.myReferralLink")}>
                            <h2>{t("followupUi.myReferralLink")}</h2>
                            <div className="referral-page-link-row">
                                <Input readOnly value={link} aria-label={t("followupUi.referralLink")} onFocus={(event) => event.currentTarget.select()} />
                                <Button type="primary" icon={<Copy className="size-3.5" />} onClick={() => void copy(link, t("followupUi.referralLink"))}>
                                    {t("galleryCopyLink")}
                                </Button>
                            </div>
                            <p>
                                {t("followupUi.referralCode")} <span className="referral-page-code font-semibold">{data.code}</span>
                                <Button type="link" size="small" onClick={() => void copy(data.code, t("followupUi.referralCode"))}>
                                    {t("agentLocalUiCopy")}
                                </Button>
                                {" · "}{t("followupUi.referralRate", { rate: formatReferralRate(data.commissionRateBasisPoints) })}{" · "}{t("followupUi.referralRule")}
                            </p>
                        </section>
                        <section className="referral-page-stats" aria-label={t("followupUi.referralEarnings")}>
                            <Stat label={t("followupUi.invitedRegistrations")} value={t("followupUi.peopleCount", { count: data.stats.inviteeCount })} />
                            <Stat label={t("followupUi.payingInvitees")} value={t("followupUi.peopleCount", { count: data.stats.paidInviteeCount })} />
                            <Stat label={t("followupUi.referredPurchases")} value={formatReferralYuan(data.stats.orderAmountFen)} />
                            <Stat label={t("followupUi.totalReferralCredits")} value={formatReferralCredits(data.stats.commissionMicrocredits)} />
                        </section>
                    </>
                ) : null}
                <section className="referral-page-records" aria-label={t("followupUi.referralRecords")}>
                    <SegmentedControl<RecordTab>
                        ariaLabel={t("followupUi.referralRecordType")}
                        size="sm"
                        value={tab}
                        options={[
                            { value: "invitees", label: t("followupUi.invitationRecords") },
                            { value: "commissions", label: t("followupUi.commissionRecords") },
                        ]}
                        onChange={(next) => {
                            setTab(next);
                            setPage(1);
                        }}
                    />
                    <div className="mt-2">
                        {records.isPending ? (
                            <Skeleton active paragraph={{ rows: 3 }} title={false} />
                        ) : records.error ? (
                            <div className="referral-page-empty">{records.error instanceof Error ? records.error.message : t("followupUi.recordsReadFailed")}</div>
                        ) : tab === "invitees" ? (
                            invitees.data?.invitees.length ? (
                                invitees.data.invitees.map((item, index) => (
                                    <div key={`${item.createdAt}-${index}`} className="referral-page-record-row">
                                        <div>
                                            {item.name}
                                            <small>{t("followupUi.registeredAt", { time: formatTime(item.createdAt, locale) })}</small>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="referral-page-empty">{t("followupUi.noInvitees")}</div>
                            )
                        ) : commissions.data?.commissions.length ? (
                            commissions.data.commissions.map((item) => (
                                <div key={item.id} className="referral-page-record-row">
                                    <div>
                                        {item.inviteeName} {t("storageUi.tabTopup")} {formatReferralYuan(item.orderAmountFen)} ({formatReferralCredits(item.orderCreditsMicrocredits)} {t("credits")})
                                        <small>
                                            {formatTime(item.createdAt, locale)} · {t("followupUi.commissionRate", { rate: formatReferralRate(item.rateBasisPoints) })}
                                        </small>
                                    </div>
                                    <b>+{formatReferralCredits(item.commissionMicrocredits)}</b>
                                </div>
                            ))
                        ) : (
                            <div className="referral-page-empty">{t("followupUi.noCommission")}</div>
                        )}
                    </div>
                    {total > PAGE_SIZE ? <PaginationBar current={page} pageSize={PAGE_SIZE} total={total} pageSizeOptions={[PAGE_SIZE]} onChange={(next) => setPage(next)} /> : null}
                </section>
            </div>
        </WorkspacePage>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="referral-page-stat">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function formatTime(value: string, locale: string) {
    return new Date(value).toLocaleString(locale, { hour12: false });
}
