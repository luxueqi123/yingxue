import { type FormEvent, useEffect, useState, type ReactNode } from "react";
import { App, Button, Divider, Input } from "antd";
import { ArrowRight, Info, LockKeyhole, TriangleAlert, UserRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { applyUserSession } from "@/lib/user-session";
import { getAuthSession, getAuthSettings, linuxDOLoginURL, register } from "@/services/api/auth";
import { LinuxDOIcon } from "./auth-scene";

type AuthSettings = Awaited<ReturnType<typeof getAuthSettings>>;

export default function RegisterPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { message } = App.useApp();
    const [settings, setSettings] = useState<AuthSettings | null>(null);
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const next = safeNext(params.get("next"));

    useEffect(() => {
        let cancelled = false;
        void getAuthSettings().then((value) => !cancelled && setSettings(value)).catch((error) => !cancelled && message.error(error instanceof Error ? error.message : "读取注册设置失败"));
        return () => { cancelled = true; };
    }, [message]);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (password !== confirmPassword) {
            message.error("两次输入的密码不一致");
            return;
        }
        setSubmitting(true);
        try {
            await register({ username, displayName, password });
            await applyUserSession(await getAuthSession());
            if (!settings?.firstUser) window.sessionStorage.setItem("infinite-canvas:model-setup-guide", "1");
            message.success(settings?.firstUser ? "管理员账号已创建" : "注册成功");
            navigate(next, { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "注册失败");
        } finally {
            setSubmitting(false);
        }
    };

    const registrationClosed = settings?.registrationEnabled === false;
    const disabled = registrationClosed;

    return (
        <form onSubmit={submit} className="space-y-4">
            {settings?.firstUser ? <Notice icon={<Info className="size-3.5" />} tone="blue">首个账号自动成为管理员，邮箱验证码暂不要求。</Notice> : null}
            {registrationClosed ? <Notice icon={<TriangleAlert className="size-3.5" />} tone="amber">当前已关闭普通注册，请联系管理员创建账号。</Notice> : null}
            <div className="grid gap-4 sm:grid-cols-2">
                <AuthField label="用户名"><Input size="large" prefix={<UserRound className="size-4 text-white/35" />} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3-32 位字符" autoComplete="username" required disabled={disabled} /></AuthField>
                <AuthField label="显示名称"><Input size="large" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="不填则使用用户名" disabled={disabled} /></AuthField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <AuthField label="密码"><Input.Password size="large" prefix={<LockKeyhole className="size-4 text-white/35" />} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" autoComplete="new-password" required disabled={disabled} /></AuthField>
                <AuthField label="确认密码"><Input.Password size="large" prefix={<LockKeyhole className="size-4 text-white/35" />} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" autoComplete="new-password" required disabled={disabled} /></AuthField>
            </div>

            <Button type="primary" htmlType="submit" size="large" block loading={submitting} disabled={disabled} icon={<ArrowRight className="size-4" />} iconPlacement="end">创建账号</Button>
            {settings?.linuxdoEnabled ? <><Divider plain className="!border-white/10 !text-white/30">或</Divider><Button size="large" block icon={<LinuxDOIcon />} href={linuxDOLoginURL(next)}>使用 Linux.do 注册 / 登录</Button></> : null}
        </form>
    );
}

function AuthField({ label, children }: { label: string; children: ReactNode }) {
    return <label className="block space-y-2"><span className="text-xs font-medium text-white/62">{label}</span>{children}</label>;
}

function Notice({ icon, tone, children }: { icon: ReactNode; tone: "blue" | "amber"; children: ReactNode }) {
    return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5 ${tone === "blue" ? "border-blue-300/15 bg-blue-300/[0.06] text-blue-100/78" : "border-amber-300/15 bg-amber-300/[0.06] text-amber-100/78"}`}><span className="mt-0.5 shrink-0">{icon}</span>{children}</div>;
}

function safeNext(value: string | null) {
    if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
    return value;
}
