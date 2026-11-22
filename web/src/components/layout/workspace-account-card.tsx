import { Button } from "antd";
import { ArrowUpRight, Coins, Gift, LogOut, RefreshCw, Send, Settings, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { currentLocale } from "@/i18n";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { useWorkspaceLogout } from "@/hooks/use-workspace-logout";
import { useUserStore } from "@/stores/use-user-store";
import { UserAvatar } from "./user-avatar";
import { UserGroupAvatarRing, UserGroupBadge } from "./user-group-badge";
import "./workspace-account-card.css";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

/** 同一账户卡片用于顶部和侧栏；余额与退出均复用真实服务。 */
export function WorkspaceAccountCard({ onWallet, onNavigate }: { onWallet: () => void; onNavigate: () => void }) {
    const location = useLocation();
    const { locale, t } = useInterfaceTranslation();
    const { t: translate } = useTranslation();
    const user = useUserStore((state) => state.user);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const referralAvailable = useUserStore((state) => state.referralAvailable);
    const { availableMicrocredits, refreshing, refresh } = useWalletBalance(user?.id, creditsEnabled);
    const { handleLogout, loggingOut } = useWorkspaceLogout();

    if (!user) return null;
    return (
        <section className="workspace-account-card" aria-label={t("shell.account.region")}>
            <header className="workspace-account-card-identity">
                <UserGroupAvatarRing>
                    <UserAvatar user={user} className="workspace-account-card-avatar" />
                </UserGroupAvatarRing>
                <div>
                    <strong className="workspace-account-card-name">
                        <span>{user.displayName || user.username}</span>
                        <UserGroupBadge />
                    </strong>
                    <span>@{user.username}</span>
                </div>
                <em>{t(user.role === "admin" ? "admin" : "creator")}</em>
            </header>
            {creditsEnabled ? (
                <div className="workspace-account-card-wallet">
                    <div className="workspace-account-card-balance">
                        <span>
                            <Coins />
                            {t("shell.account.availableCredits")}
                        </span>
                        <strong>{availableMicrocredits === null ? "—" : (availableMicrocredits / 1_000_000).toLocaleString(currentLocale(), { maximumFractionDigits: 2 })}</strong>
                    </div>
                    {availableMicrocredits === null ? (
                        <Button size="small" loading={refreshing} icon={<RefreshCw />} onClick={() => void refresh()}>
                            {t("shell.account.refreshBalance")}
                        </Button>
                    ) : (
                        <button type="button" onClick={onWallet}>
                            {t("shell.account.topup")}
                            <ArrowUpRight />
                        </button>
                    )}
                </div>
            ) : null}
            <nav className="workspace-account-card-actions" aria-label={t("shell.account.actions")}>
                {creditsEnabled ? <Link to="/membership" onClick={onNavigate}><Gift /><span>{locale === "en-US" ? "Membership" : "会员中心"}</span><ArrowUpRight /></Link> : null}
                <Link to="/settings?section=profile" state={location.pathname === "/settings" ? location.state : { returnTo: location.pathname + location.search + location.hash, returnState: location.state }} onClick={onNavigate}>
                    <Settings />
                    <span>{t("shell.account.settings")}</span>
                    <ArrowUpRight />
                </Link>
                <Link to="/my/works" state={{ returnTo: location.pathname + location.search + location.hash, returnState: location.state }} onClick={onNavigate}>
                    <Send />
                    <span>{translate("communityWorks.mine")}</span>
                    <ArrowUpRight />
                </Link>
                {referralAvailable ? (
                    <Link to="/referral" onClick={onNavigate}>
                        <Gift />
                        <span>{t("shell.account.referral")}</span>
                        <ArrowUpRight />
                    </Link>
                ) : null}
                {user.role === "admin" ? (
                    <Link to="/admin" onClick={onNavigate}>
                        <ShieldCheck />
                        <span>{t("shell.account.adminConsole")}</span>
                        <ArrowUpRight />
                    </Link>
                ) : null}
                <Button danger type="text" icon={<LogOut />} loading={loggingOut} onClick={() => void handleLogout()}>
                    {t("shell.account.logout")}
                </Button>
            </nav>
        </section>
    );
}
