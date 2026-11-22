import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Skeleton } from "antd";
import { useTranslation } from "react-i18next";

import { formatCredits } from "@/constant/credits";
import { getMembership } from "@/services/api/membership";
import { formatPaymentAmount } from "@/services/api/payments";
import { useUserStore } from "@/stores/use-user-store";

export function WalletMembershipPanel({ onManage }: { onManage: () => void }) {
    const { t } = useTranslation();
    const userId = useUserStore((state) => state.user?.id);
    const membership = useQuery({ queryKey: ["membership", userId], queryFn: ({ signal }) => getMembership(signal) });
    if (membership.isPending) {
        return (
            <div className="workspace-wallet-content">
                <Skeleton active paragraph={{ rows: 5 }} />
            </div>
        );
    }
    if (membership.isError) {
        return (
            <div className="workspace-wallet-content wallet-shop-membership">
                <Alert type="error" title={t("account.wallet.shop.membershipLoadFailed")} description={membership.error.message} action={<Button onClick={() => void membership.refetch()}>{t("common.refresh")}</Button>} />
            </div>
        );
    }

    const { plans } = membership.data;
    return (
        <section className="workspace-wallet-content wallet-shop-membership" aria-label={t("account.wallet.shop.membership")}>
            {plans.length ? (
                <div className="wallet-shop-plan-grid">
                    {plans.map((plan) => {
                        const monthly = plan.monthlyAmountFen > 0;
                        return (
                            <article className="wallet-shop-plan" key={plan.id}>
                                <h3>{plan.name}</h3>
                                <p className="wallet-shop-price">
                                    <strong>{formatPaymentAmount(monthly ? plan.monthlyAmountFen : plan.annualAmountFen, "CNY")}</strong>
                                    {t(monthly ? "account.wallet.shop.perMonth" : "account.wallet.shop.perYear")}
                                </p>
                                <p className="wallet-shop-benefit">{t("account.wallet.shop.creditPerMonth", { credits: formatCredits(plan.monthlyCreditsMicrocredits) })}</p>
                                {plan.description ? <p className="wallet-shop-description">{plan.description}</p> : null}
                            </article>
                        );
                    })}
                </div>
            ) : (
                <p className="workspace-wallet-inline-state">{t("account.wallet.shop.noMembership")}</p>
            )}
            <div>
                <Button onClick={onManage}>{t(plans.length ? "account.wallet.shop.membershipDetails" : "account.wallet.shop.myMembership")}</Button>
            </div>
        </section>
    );
}
