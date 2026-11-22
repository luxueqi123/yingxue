import { useEffect, useState, type FormEvent } from "react";
import { App, Button, Input } from "antd";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { Link } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal";
import { getAuthSession, login } from "@/services/api/auth";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function CreationLoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            setUsername("");
            setPassword("");
            setSubmitting(false);
        }
    }, [open]);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            await login({ username: username.trim(), password });
            const { applyUserSession } = await import("@/lib/user-session");
            await applyUserSession(await getAuthSession());
            message.success(t("createUiLoginGenerateAgain"));
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("authLoginFailed"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AppModal open={open} onCancel={onClose} title={t("createUiLoginToCreate")} footer={null} centered width="min(440px, calc(100vw - 32px))">
            <div className="space-y-4">
                <p className="text-sm text-foreground/60">{t("createUiLoginDraftHint")}</p>
                <form className="space-y-3" onSubmit={(event) => void submit(event)}>
                    <Input
                        size="large"
                        aria-label={t("createUiUsernameEmail")}
                        prefix={<UserRound className="size-4 text-foreground/40" />}
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder={t("createUiUsernameEmail")}
                        autoComplete="username"
                        required
                    />
                    <Input.Password
                        size="large"
                        aria-label={t("authPassword")}
                        prefix={<LockKeyhole className="size-4 text-foreground/40" />}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={t("authPassword")}
                        autoComplete="current-password"
                        required
                    />
                    <Button type="primary" htmlType="submit" size="large" block loading={submitting} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                        {t("createUiLoginContinue")}
                    </Button>
                </form>
                <p className="text-center text-xs text-foreground/55">
                    {t("createUiNoAccount")}{" "}
                    <Link className="text-primary hover:underline" to="/register?next=%2F" onClick={onClose}>
                        {t("register")}
                    </Link>
                </p>
            </div>
        </AppModal>
    );
}
