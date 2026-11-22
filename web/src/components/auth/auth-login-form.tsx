import { type FormEvent, type MouseEvent, useEffect, useId, useState } from "react";
import { App, Button, Checkbox, Divider, Input } from "antd";
import { Info, MessageCircle, TriangleAlert } from "lucide-react";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { wechatLoginURL } from "@/services/api/wechat";
import { GithubOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import { VerificationFields } from "@/components/auth/verification-fields";
import { assertActiveAuthSession, type AuthView } from "@/lib/auth-entry";
import { getAuthSession, githubLoginURL, googleLoginURL, linuxDOLoginURL, login, oidcLoginURL, type AuthSettings } from "@/services/api/auth";
import { emptyVerification, loginVerification, verificationMethods, type VerificationMethod } from "@/services/api/verification";
import { AuthAgreementDialog, AuthNotice, AuthTabs, LinuxDOIcon, authTabId, authTabPanelId, useAuthAgreement } from "./auth-form-parts";

type LoginMethod = "password" | VerificationMethod;

export type AuthFormProps = {
    settings: AuthSettings | null;
    next: string;
    onAuthenticated: () => void | Promise<void>;
    onSubmittingChange?: (submitting: boolean) => void;
    onViewChange: (view: AuthView) => void;
};
export type AuthSettingsFormProps = AuthFormProps & { settingsFailed: boolean; onReloadSettings: () => void };

export function AuthLoginForm({ settings, settingsFailed, onReloadSettings, next, onAuthenticated, onSubmittingChange, onViewChange }: AuthSettingsFormProps) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const tabsId = useId();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [chosenMethod, setChosenMethod] = useState<LoginMethod>("password");
    const [verification, setVerification] = useState({ ...emptyVerification });
    const [agreementAccepted, setAgreementAccepted] = useState(false);
    const [agreementOpen, setAgreementOpen] = useState(false);
    const agreement = useAuthAgreement(settings);
    useEffect(() => { onSubmittingChange?.(submitting); }, [submitting, onSubmittingChange]);

    const methods: LoginMethod[] = ["password", ...(settings ? verificationMethods(settings, "login") : [])];
    const method = methods.includes(chosenMethod) ? chosenMethod : "password";
    const canRegister = Boolean(settings && (settings.firstUser || settings.registrationEnabled));
    const showLinuxDO = Boolean(settings?.linuxdoEnabled && !settings.smsAndEmailRegistration);
    const showOIDC = Boolean(settings?.oidcEnabled);
    const showWechat = Boolean(settings?.wechatEnabled);
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileResetKey, setTurnstileResetKey] = useState(0);
    const turnstileRequired = Boolean(settings?.turnstileEnabled && settings.turnstileSiteKey);
    const showThirdParty = showLinuxDO || showOIDC || showWechat || settings?.googleEnabled || settings?.githubEnabled;
    const showAgreement = Boolean(settings);
    const methodLabel = (value: LoginMethod) => value === "password" ? t("auth.login.password") : value === "sms" ? t("auth.login.smsTab") : t("auth.login.emailTab");

    const checkAgreement = () => {
        if (!settings || settingsFailed) {
            message.warning(t("auth.register.settingsFailed"));
            return false;
        }
        if (!agreementAccepted) {
            message.warning(t("auth.register.agreeFirst", { title: agreement.title }));
            return false;
        }
        return true;
    };
    const guardLogin = (event: MouseEvent<HTMLElement>) => {
        if (!checkAgreement()) event.preventDefault();
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitting || !checkAgreement()) return;
        setSubmitting(true);
        try {
            if (turnstileRequired && !turnstileToken) throw new Error(t("auth.turnstile.required", { defaultValue: "请完成安全验证" }));
            if (method === "password") await login({ username: username.trim(), password, turnstileToken });
            else {
                if (!verification.ticket) throw new Error(t("auth.login.needCode"));
                await loginVerification({ ...verification, turnstileToken });
            }
            const { applyUserSession } = await import("@/lib/user-session");
            const session = await getAuthSession();
            assertActiveAuthSession(session);
            await applyUserSession(session);
            message.success(t("auth.login.success"));
            await onAuthenticated();
        } catch (error) {
            if (turnstileRequired) {
                setTurnstileToken("");
                setTurnstileResetKey((key) => key + 1);
            }
            message.error(error instanceof Error ? error.message : t("auth.login.failed"));
        } finally { setSubmitting(false); }
    };

    return (
        <form onSubmit={submit} className="auth-form">
            {settings?.firstUser ? <AuthNotice icon={<Info className="size-3.5" />} tone="blue">{t("auth.register.firstUser")}</AuthNotice> : null}
            {settingsFailed ? (
                <AuthNotice icon={<TriangleAlert className="size-3.5" />}>
                    <span>{t("auth.register.settingsFailed")} <button type="button" className="auth-form-link is-strong" onClick={onReloadSettings}>{t("auth.register.reload")}</button></span>
                </AuthNotice>
            ) : null}
            {methods.length > 1 ? <AuthTabs id={tabsId} label={t("auth.login.method")} items={methods.map((value) => ({ value, label: methodLabel(value) }))} value={method} disabled={submitting} onChange={(value) => { setChosenMethod(value); setVerification({ ...emptyVerification }); }} /> : null}
            <div {...(methods.length > 1 ? { role: "tabpanel", id: authTabPanelId(tabsId), "aria-labelledby": authTabId(tabsId, method) } : {})} className="auth-form-fields">
                {method === "password" ? (
                    <>
                        <Input size="large" value={username} onChange={(event) => setUsername(event.target.value)} aria-label={t("authPhoneAccount")} placeholder={t("authPhoneAccountPlaceholder")} autoComplete="username" required disabled={submitting} />
                        <Input.Password size="large" value={password} onChange={(event) => setPassword(event.target.value)} aria-label={t("auth.login.passwordLabel")} placeholder={t("auth.login.passwordPlaceholder")} autoComplete="current-password" required disabled={submitting} />
                        <div className="auth-form-aside"><button type="button" className="auth-form-link" onClick={() => onViewChange("recovery")} disabled={submitting}>{t("auth.login.forgot")}</button></div>
                    </>
                ) : <VerificationFields key={method} purpose="login" method={method} value={verification} onChange={setVerification} disabled={submitting} />}
            </div>
            {turnstileRequired ? <TurnstileWidget siteKey={settings?.turnstileSiteKey ?? ""} resetKey={turnstileResetKey} onToken={setTurnstileToken} /> : null}
            {showAgreement ? <div className="auth-agreement-row" data-accepted={agreementAccepted ? "true" : "false"}><Checkbox checked={agreementAccepted} onChange={(event) => setAgreementAccepted(event.target.checked)}><span className="auth-agreement-label">{t("auth.register.agree")}</span></Checkbox><button type="button" className="auth-agreement-link" onClick={() => setAgreementOpen(true)}>《{agreement.title}》</button></div> : null}
            <Button type="primary" htmlType="submit" size="large" block loading={submitting} onClick={guardLogin}>{t("auth.login.submit")}</Button>
            {canRegister ? <p className="auth-form-switch">{t("auth.login.noAccount")} <button type="button" className="auth-form-link is-strong" onClick={() => onViewChange("register")} disabled={submitting}>{t("auth.login.toRegister")}</button></p> : null}
            {showThirdParty ? (
                <>
                    <Divider plain className="auth-scene-divider auth-form-divider">{t("common.or")}</Divider>
                    {showLinuxDO ? <Button size="large" block icon={<LinuxDOIcon />} href={linuxDOLoginURL(next, agreementAccepted || undefined)} onClick={guardLogin} disabled={submitting}>{t("auth.login.linuxdo")}</Button> : null}
                    {showOIDC ? <Button size="large" block href={oidcLoginURL(next, agreementAccepted)} onClick={guardLogin} disabled={submitting}>{t("auth.login.oidc")}</Button> : null}
                    {showWechat ? <Button size="large" block icon={<MessageCircle className="size-4" aria-hidden="true" />} href={wechatLoginURL(next, agreementAccepted)} onClick={guardLogin} disabled={submitting}>{t("auth.login.wechat", { defaultValue: "使用微信登录" })}</Button> : null}
                    {settings?.googleEnabled ? <Button size="large" block href={googleLoginURL(next, agreementAccepted)} onClick={guardLogin} disabled={submitting}>{t("authGoogleLogin")}</Button> : null}
                    {settings?.githubEnabled ? <Button size="large" block icon={<GithubOutlined aria-hidden="true" />} href={githubLoginURL(next, agreementAccepted)} onClick={guardLogin} disabled={submitting}>{t("authGitHubLogin")}</Button> : null}
                </>
            ) : null}
            <AuthAgreementDialog open={agreementOpen} title={agreement.title} paragraphs={agreement.paragraphs} onClose={() => setAgreementOpen(false)} />
        </form>
    );
}
