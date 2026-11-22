import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { useAuthSettings } from "@/hooks/use-auth-entry";
import type { AuthView } from "@/lib/auth-entry";
import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { useThemePack } from "@/themes/use-theme-pack";
import { AuthLoginForm } from "./auth-login-form";
import { AuthRegisterForm } from "./auth-register-form";
import { AuthRecoveryForm } from "./auth-recovery-form";
import { WechatRegistrationForm } from "./wechat-registration-form";
import "./auth-panel.css";
export type AuthPanelProps = {
    view: AuthView;
    onViewChange: (view: AuthView) => void;
    next: string;
    onAuthenticated: () => void | Promise<void>;
    onSubmittingChange?: (submitting: boolean) => void;
    /** page：独立登录页里的卡片；dialog：登录弹窗右侧，由弹窗提供外壳。 */
    variant: "page" | "dialog";
};
/** 登录、注册与找回密码共用外壳；独立页面改路由，弹窗只切换视图。 */
export function AuthPanel({ view, onViewChange, next, onAuthenticated, onSubmittingChange, variant }: AuthPanelProps) {
    const { t } = useTranslation();
    const titleId = useId();
    const brand = useAppearanceStore((state) => state.appearance.brandName) || t("auth.register.platform");
    const { settings, failed, reload } = useAuthSettings();
    const [params] = useSearchParams();
    const wechatRegistration = params.get("wechat_register") === "1";
    const themeLoginTitle = useThemePack()?.copy?.loginTitle;
    const title = wechatRegistration ? t("auth.wechat.completeTitle", { defaultValue: "完成微信注册" }) : view === "recovery" ? t("auth.panel.recoveryTitle") : themeLoginTitle || t(view === "register" ? "auth.panel.registerTitle" : "auth.panel.loginTitle", { brand });
    const formProps = { settings, next, onAuthenticated, onViewChange, onSubmittingChange };
    return (
        <section className={cn("auth-panel", variant === "page" ? "is-page" : "is-dialog")} aria-labelledby={titleId}>
            <header className="auth-panel-header">
                <h2 id={titleId} className="auth-panel-title">
                    {title}
                </h2>
                {view === "recovery" ? <p className="auth-panel-description">{t("auth.panel.recoveryDescription")}</p> : null}
            </header>
            <div key={view} className="auth-panel-body">
                {wechatRegistration ? (
                    <WechatRegistrationForm settings={settings} settingsFailed={failed} onReloadSettings={() => void reload()} next={next} />
                ) : view === "recovery" ? (
                    <AuthRecoveryForm settings={settings} onViewChange={onViewChange} />
                ) : view === "register" ? (
                    <AuthRegisterForm {...formProps} settingsFailed={failed} onReloadSettings={() => void reload()} />
                ) : (
                    <AuthLoginForm {...formProps} settingsFailed={failed} onReloadSettings={() => void reload()} />
                )}
            </div>
        </section>
    );
}
