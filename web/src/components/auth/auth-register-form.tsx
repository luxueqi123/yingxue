import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { App, Button, Checkbox, Input } from "antd";
import { Info, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { assertActiveAuthSession, clearReferralCode, readReferralCode } from "@/lib/auth-entry";
import { getAuthSession, invalidateAuthSessionCache, register } from "@/services/api/auth";
import { ApiError } from "@/services/api/request";
import { emptyVerification, registrationVerificationRequired, verificationMethods, type VerificationMethod } from "@/services/api/verification";
import type { AuthSettingsFormProps } from "./auth-login-form";
import { AuthAgreementDialog, AuthNotice, AuthTabs, useAuthAgreement } from "./auth-form-parts";
import { VerificationFields } from "./verification-fields";
import { TurnstileWidget } from "./turnstile-widget";

export function AuthRegisterForm({ settings, settingsFailed, onReloadSettings, onAuthenticated, onSubmittingChange, onViewChange }: AuthSettingsFormProps) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const tabsId = useId();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [email, setEmail] = useState("");
    const [verification, setVerification] = useState({ ...emptyVerification });
    const [chosenMethod, setChosenMethod] = useState<VerificationMethod | null>(null);
    const [agreementAccepted, setAgreementAccepted] = useState(false);
    const [agreementOpen, setAgreementOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const submitInFlight = useRef(false);
    const [createdUserId, setCreatedUserId] = useState("");
    const recoveryNoticeRef = useRef<HTMLSpanElement>(null);
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileResetKey, setTurnstileResetKey] = useState(0);
    const [retryCountdown, setRetryCountdown] = useState(0);
    const [referralCode] = useState(readReferralCode);
    const agreement = useAuthAgreement(settings);
    const canRegister = Boolean(settings && (settings.firstUser || settings.registrationEnabled));
    const verificationRequired = Boolean(settings && !settings.firstUser && (registrationVerificationRequired(settings) || settings.smsRegistration || settings.smsAndEmailRegistration));
    const methods = settings && verificationRequired ? verificationMethods(settings, "register") : [];
    const method = chosenMethod && methods.includes(chosenMethod) ? chosenMethod : methods[0];
    const verificationUnavailable = verificationRequired && !method;
    const showEmail = Boolean(!settings?.firstUser && settings?.emailRequired && method !== "email" && method !== "sms_email");
    const blocked = !canRegister || settingsFailed || verificationUnavailable;
    const turnstileRequired = Boolean(settings?.turnstileEnabled && settings.turnstileSiteKey);
    useEffect(() => { onSubmittingChange?.(submitting); }, [submitting, onSubmittingChange]);
    useEffect(() => { if (createdUserId) recoveryNoticeRef.current?.focus(); }, [createdUserId]);
    useEffect(() => {
        if (retryCountdown <= 0) return;
        const timer = window.setTimeout(() => setRetryCountdown((value) => Math.max(0, value - 1)), 1000);
        return () => window.clearTimeout(timer);
    }, [retryCountdown]);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitInFlight.current || (!createdUserId && (retryCountdown > 0 || blocked))) return;
        if (!createdUserId && !agreementAccepted) { message.warning(t("auth.register.agreeFirst", { title: agreement.title })); return; }
        submitInFlight.current = true;
        setSubmitting(true);
        let expectedUserId = createdUserId;
        try {
            if (!expectedUserId) {
                if (password !== confirmPassword) throw new Error(t("auth.register.mismatch"));
                if (verificationRequired && !verification.ticket) throw new Error(t("auth.register.needCode"));
                if (turnstileRequired && !turnstileToken) throw new Error(t("auth.turnstile.required", { defaultValue: "请完成安全验证" }));
                const result = await register({ username: username.trim(), password, ...(verificationRequired ? verification : {}), ...(showEmail ? { email: email.trim() } : {}), acceptedTerms: agreementAccepted, ...(referralCode ? { referralCode } : {}), turnstileToken });
                expectedUserId = result.user.id;
                setCreatedUserId(expectedUserId);
                clearReferralCode();
                if (!settings?.firstUser) window.sessionStorage.setItem("yingce:model-setup-guide", "1");
            } else {
                invalidateAuthSessionCache();
            }
            const { applyUserSession } = await import("@/lib/user-session");
            const session = await getAuthSession();
            assertActiveAuthSession(session);
            if (session.user?.id !== expectedUserId) throw new Error(t("auth.login.sessionUnavailable"));
            await applyUserSession(session);
            message.success(settings?.firstUser ? t("auth.register.adminCreated") : t("auth.register.success"));
            await onAuthenticated();
        } catch (error) {
            if (!expectedUserId) {
                if (turnstileRequired) {
                    setTurnstileToken("");
                    setTurnstileResetKey((value) => value + 1);
                }
                if (error instanceof ApiError && error.status === 429) setRetryCountdown(Math.max(1, Math.ceil((error.retryAfterMs ?? 60000) / 1000)));
            }
            message.error(error instanceof Error ? error.message : t("auth.register.failed"));
        } finally {
            submitInFlight.current = false;
            setSubmitting(false);
        }
    };

    if (createdUserId) {
        return (
            <form onSubmit={submit} className="auth-form">
                <AuthNotice icon={<Info className="size-3.5" />} tone="blue"><span ref={recoveryNoticeRef} role="status" tabIndex={-1}>{t("auth.login.registrationSessionPending")}</span></AuthNotice>
                <Button type="primary" htmlType="submit" size="large" block loading={submitting}>{t("auth.login.retrySession")}</Button>
                <button type="button" className="auth-form-link" disabled={submitting} onClick={() => onViewChange("login")}>{t("auth.register.toLogin")}</button>
            </form>
        );
    }

    return (
        <form onSubmit={submit} className="auth-form">
            {settings?.firstUser ? <AuthNotice icon={<Info className="size-3.5" />} tone="blue">{t("auth.register.firstUser")}</AuthNotice> : null}
            {settings && !canRegister ? <AuthNotice icon={<Info className="size-3.5" />}>{t("auth.register.closed")}</AuthNotice> : null}
            {settingsFailed ? <AuthNotice icon={<TriangleAlert className="size-3.5" />}><span>{t("auth.register.settingsFailed")} <button type="button" className="auth-form-link is-strong" onClick={onReloadSettings}>{t("auth.register.reload")}</button></span></AuthNotice> : null}
            {verificationUnavailable ? <AuthNotice icon={<TriangleAlert className="size-3.5" />}>{t("auth.register.noMethod")}</AuthNotice> : null}
            <div className="auth-form-fields">
                <Input size="large" value={username} onChange={(event) => setUsername(event.target.value)} aria-label={t("auth.register.username")} placeholder={t("auth.register.usernamePlaceholder")} autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]{3,32}" disabled={submitting || blocked} />
                <Input.Password size="large" value={password} onChange={(event) => setPassword(event.target.value)} aria-label={t("auth.register.password")} placeholder={t("auth.register.passwordPlaceholder")} autoComplete="new-password" required minLength={8} disabled={submitting || blocked} />
                <Input.Password size="large" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-label={t("auth.register.confirmPassword")} placeholder={t("auth.register.confirmPlaceholder")} autoComplete="new-password" required disabled={submitting || blocked} />
                {showEmail ? <Input size="large" type="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-label={t("auth.verification.email")} placeholder={t("auth.login.emailRequiredPlaceholder")} autoComplete="email" required disabled={submitting || blocked} /> : null}
                {methods.length > 1 ? <AuthTabs id={tabsId} label={t("auth.register.method")} items={methods.map((value) => ({ value, label: value === "sms" ? t("auth.register.smsTab") : t("auth.register.emailTab") }))} value={method} disabled={submitting} onChange={(value) => { setChosenMethod(value); setVerification({ ...emptyVerification }); }} /> : null}
                {method ? <VerificationFields key={method} purpose="register" method={method} value={verification} onChange={setVerification} disabled={submitting || blocked} /> : null}
            </div>
            {turnstileRequired ? <TurnstileWidget siteKey={settings?.turnstileSiteKey ?? ""} resetKey={turnstileResetKey} onToken={setTurnstileToken} /> : null}
            {settings ? <div className="auth-agreement-row" data-accepted={agreementAccepted ? "true" : "false"}><Checkbox checked={agreementAccepted} onChange={(event) => setAgreementAccepted(event.target.checked)}><span className="auth-agreement-label">{t("auth.register.agree")}</span></Checkbox><button type="button" className="auth-agreement-link" onClick={() => setAgreementOpen(true)}>《{agreement.title}》</button></div> : null}
            <Button type="primary" htmlType="submit" size="large" block loading={submitting} disabled={blocked || retryCountdown > 0 || !agreementAccepted}>{retryCountdown > 0 ? t("auth.register.retryIn", { seconds: retryCountdown }) : t("auth.register.submit")}</Button>
            <p className="auth-form-switch">{t("auth.register.hasAccount")} <button type="button" className="auth-form-link is-strong" onClick={() => onViewChange("login")} disabled={submitting}>{t("auth.register.toLogin")}</button></p>
            <AuthAgreementDialog open={agreementOpen} title={agreement.title} paragraphs={agreement.paragraphs} onClose={() => setAgreementOpen(false)} />
        </form>
    );
}
