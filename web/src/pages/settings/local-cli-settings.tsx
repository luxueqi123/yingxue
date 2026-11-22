import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { interfaceTranslator, type InterfaceLocale, type InterfaceTranslate } from "@/lib/interface-locale";
import { App, Button, Popconfirm, Tag, Typography } from "antd";
import { StatusBadge } from "@/components/ui/base/badges";
import { CheckCircle2, Copy, ExternalLink, LogIn, LogOut, RefreshCw, Server, SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { DreaminaAgentError, getDreaminaStatus, loginDreamina, logoutDreamina, type DreaminaCliStatus } from "@/services/local-dreamina-cli";
import { getLocalRuntimeSessionClient, useLocalRuntimeStore, type LocalRuntimeConnectionState } from "@/stores/use-local-runtime-store";

type PendingAction = "refresh" | "login" | "logout" | "";
type PresentationAction = "refresh" | "login" | "open_verification" | "logout" | null;
type Presentation = {
    label: string;
    tone: "success" | "processing" | "warning" | "error" | "default";
    action: PresentationAction;
    actionLabel?: string;
    creditLabel?: string;
    creditObservedAtLabel?: string;
};

export const LOCAL_CLI_SETTINGS_COPY = {
    runtimeTitle: "本机连接",
    runtimeConnected: "本机服务已连接，CLI 状态会自动同步。",
    runtimeDetecting: "正在检测本机服务；请确认已启动当前版本。",
    runtimeReconnect: "重新连接",
    runtimeSafety: "官方 CLI 登录资料保存在本机；本页面不读取或上传 Cookie、浏览器 Profile 或登录令牌。",
    runtimeRefresh: "刷新状态",
    dreaminaDescription: "直接读取当前 Windows 用户的官方即梦 CLI 登录状态。",
    dreaminaDisconnected: "连接本机服务后自动检测",
    dreaminaDisconnectedMessage: "重新连接本机服务后，将自动读取官方 CLI 状态。",
    dreaminaMembership: "账号生成权限：未知。当前页面只确认本机适配器支持与登录状态；具体账号是否可生成，以官方最终结果为准。",
    dreaminaConsistency: "任务状态通过后台轮询最终同步，不是实时推送；关闭页面不会停止已经提交的官方任务。",
    dreaminaCancel: "官方 Dreamina CLI 当前不提供取消命令；官方已接受的任务只能转入后台继续同步，不能伪装成已取消。",
    dreaminaAccountSwitch: "本机任务运行期间，请不要在其他程序中切换 Dreamina CLI 账号；外部换号无法被本页面实时感知。",
    dreaminaRefresh: "刷新状态",
} as const;

export function localCliSettingsPresentation(input: { connection: string; moduleAvailable: boolean; dreamina?: DreaminaCliStatus; timeZone?: string; locale?: InterfaceLocale; t?: InterfaceTranslate }): { runtime: Presentation; dreamina: Presentation } {
    const t = input.t || interfaceTranslator(input.locale || "zh-CN");
    const runtime = runtimePresentation(input.connection as LocalRuntimeConnectionState, t);
    if (input.connection !== "connected") {
        return { runtime, dreamina: { label: t("settingsUi.dreaminaAfterConnect"), tone: "default", action: null } };
    }
    if (!input.moduleAvailable) {
        return { runtime, dreamina: { label: t("settingsUi.moduleNotLoaded"), tone: "error", action: "refresh" } };
    }
    const status = input.dreamina;
    if (!status) return { runtime, dreamina: { label: t("settingsUi.detecting"), tone: "processing", action: "refresh" } };
    const creditObservedAt = formatCreditObservedAt(status.creditObservedAt, input.timeZone);
    const hasScopedCredit = status.totalCredit !== undefined && Boolean(status.accountBinding) && status.sessionEpoch !== undefined && Boolean(creditObservedAt);
    if (status.state === "missing") return { runtime, dreamina: { label: t("settingsUi.notInstalled"), tone: "error", action: "refresh" } };
    if (status.state === "login_pending") return { runtime, dreamina: { label: t("settingsUi.authorizationPending"), tone: "processing", action: "open_verification" } };
    if (status.authenticated)
        return {
            runtime,
            dreamina: {
                label: t("settingsUi.signedIn"),
                tone: "success",
                action: "logout",
                ...(!hasScopedCredit
                    ? {}
                    : {
                          creditLabel: t("settingsUi.dreaminaCredits", { count: new Intl.NumberFormat(input.locale || "zh-CN").format(status.totalCredit!) }),
                      }),
                ...(creditObservedAt ? { creditObservedAtLabel: t("settingsUi.creditsRefreshed", { time: creditObservedAt }) } : {}),
            },
        };
    if (status.state === "installed") return { runtime, dreamina: { label: t("signedOut"), tone: "warning", action: "login" } };
    return { runtime, dreamina: { label: t("settingsUi.detectionFailed"), tone: "error", action: "refresh" } };
}

export function formatCreditObservedAt(value: unknown, timeZone?: string) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
    try {
        const parts = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            ...(timeZone ? { timeZone } : {}),
        }).formatToParts(new Date(value));
        const hour = parts.find((part) => part.type === "hour")?.value;
        const minute = parts.find((part) => part.type === "minute")?.value;
        return hour && minute ? `${hour}:${minute}` : undefined;
    } catch {
        return undefined;
    }
}

export function LocalCliSettings() {
    const { t, locale } = useInterfaceTranslation();
    const { message } = App.useApp();
    const connection = useLocalRuntimeStore((state) => state.connection);
    const connecting = useLocalRuntimeStore((state) => state.connecting);
    const modules = useLocalRuntimeStore((state) => state.modules);
    const runtimeError = useLocalRuntimeStore((state) => state.error);
    const connect = useLocalRuntimeStore((state) => state.connect);
    const moduleAvailable = modules.some((module) => module.id === "dreamina");
    const [status, setStatus] = useState<DreaminaCliStatus>();
    const [pending, setPending] = useState<PendingAction>("");
    const lifecycle = useRef<{ revision: number; controller: AbortController | null }>({
        revision: 0,
        controller: null,
    });
    const presentation = localCliSettingsPresentation({ connection, moduleAvailable, dreamina: status, t, locale });

    const refreshRuntime = useCallback(() => {
        const controller = new AbortController();
        void connect(controller.signal);
    }, [connect]);

    const runDreamina = useCallback(
        async (action: Exclude<PendingAction, "">) => {
            if (connection !== "connected" || !moduleAvailable) {
                message.warning(t("settingsUi.connectDreamina"));
                return;
            }
            lifecycle.current.controller?.abort();
            const revision = ++lifecycle.current.revision;
            const controller = new AbortController();
            lifecycle.current.controller = controller;
            setPending(action);
            try {
                const client = getLocalRuntimeSessionClient();
                const options = { signal: controller.signal };
                const next = action === "login" ? await loginDreamina(client, options) : action === "logout" ? await logoutDreamina(client, options) : await getDreaminaStatus(client, options);
                if (revision !== lifecycle.current.revision || controller.signal.aborted) return;
                setStatus(next);
                if (action === "logout") message.success(t("settingsUi.dreaminaSignedOut"));
                if (action === "login" && next.state === "login_pending") {
                    message.info(t("settingsUi.dreaminaAuthorize"));
                }
            } catch (error) {
                if (revision !== lifecycle.current.revision || controller.signal.aborted) return;
                setStatus(undefined);
                message.error(error instanceof DreaminaAgentError ? error.message : t("settingsUi.dreaminaActionFailed"));
            } finally {
                if (revision === lifecycle.current.revision) {
                    lifecycle.current.controller = null;
                    setPending("");
                }
            }
        },
        [connection, message, moduleAvailable, t],
    );

    useEffect(() => {
        if (connection !== "connected" || !moduleAvailable) {
            lifecycle.current.revision++;
            lifecycle.current.controller?.abort();
            lifecycle.current.controller = null;
            setStatus(undefined);
            setPending("");
            return;
        }
        const timer = window.setTimeout(() => {
            void runDreamina("refresh");
        }, 0);
        return () => {
            window.clearTimeout(timer);
            lifecycle.current.revision++;
            lifecycle.current.controller?.abort();
            lifecycle.current.controller = null;
        };
    }, [connection, moduleAvailable, runDreamina]);

    const openVerification = () => {
        if (status?.verificationUri) window.open(status.verificationUri, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="space-y-4">
            <section aria-labelledby="local-runtime-title" className="rounded-md border border-border bg-background px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <Server className="size-4 shrink-0 text-foreground/60" />
                        <h2 id="local-runtime-title" className="text-base font-semibold">
                            {t("settingsUi.localConnection")}
                        </h2>
                        <StatusBadge variant="filled" className="m-0" tone={presentation.runtime.tone === "processing" ? "loading" : presentation.runtime.tone === "default" ? "neutral" : presentation.runtime.tone} label={presentation.runtime.label} />
                        <p className="min-w-0 text-sm text-foreground/60">{connection === "connected" ? t("settingsUi.runtimeConnectedHint") : runtimeError || t("settingsUi.runtimeDetectingHint")}</p>
                        <p className="basis-full text-xs leading-5 text-foreground/55">{t("settingsUi.runtimePrivacy")}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} loading={connecting} onClick={refreshRuntime}>
                        {presentation.runtime.actionLabel || t("settingsUi.refreshStatus")}
                    </Button>
                </div>
            </section>

            <section aria-labelledby="dreamina-cli-title" className="rounded-md border border-border bg-background p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--r-lg)] bg-foreground/5">
                            <SquareTerminal className="size-5" />
                        </span>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 id="dreamina-cli-title" className="text-base font-semibold">
                                    Dreamina CLI
                                </h2>
                                <StatusBadge
                                    variant="filled"
                                    className="m-0"
                                    tone={presentation.dreamina.tone === "processing" ? "loading" : presentation.dreamina.tone === "default" ? "neutral" : presentation.dreamina.tone}
                                    label={presentation.dreamina.label}
                                />
                                {status?.version ? <Tag className="m-0">v{status.version}</Tag> : null}
                                {presentation.dreamina.creditLabel ? (
                                    <Tag color="blue" className="m-0">
                                        {presentation.dreamina.creditLabel}
                                    </Tag>
                                ) : null}
                            </div>
                            <p className="mt-1 text-sm text-foreground/60">{t("settingsUi.dreaminaStatusHint")}</p>
                            {presentation.dreamina.creditObservedAtLabel ? <p className="mt-1 text-xs text-foreground/50">{presentation.dreamina.creditObservedAtLabel}</p> : null}
                        </div>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} loading={pending === "refresh"} disabled={connection !== "connected" || !moduleAvailable || Boolean(pending && pending !== "refresh")} onClick={() => void runDreamina("refresh")}>
                        {t("settingsUi.refreshStatus")}
                    </Button>
                </div>

                <div className="grid gap-4 pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="space-y-3 text-sm">
                        <p className="text-foreground/75">{status?.message || dreaminaEmptyMessage(connection, moduleAvailable, t)}</p>
                        <p className="text-xs leading-6 text-foreground/60">{t("settingsUi.dreaminaPermissions")}</p>
                        <p className="text-xs leading-6 text-foreground/55">{t("settingsUi.dreaminaPolling")}</p>
                        <p className="text-xs leading-6 text-foreground/55">{t("settingsUi.dreaminaCancelHint")}</p>
                        <p className="text-xs leading-6 text-foreground/55">{t("settingsUi.dreaminaSwitchHint")}</p>
                        {status?.state === "missing" ? (
                            <p className="rounded-md bg-foreground/[0.035] p-3 text-xs leading-6 text-foreground/65">{t("settingsUi.dreaminaInstallHint")}</p>
                        ) : null}
                        {status?.state === "login_pending" ? (
                            <div className="rounded-md border border-border/70 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-foreground/60">{t("settingsUi.officialUserCode")}</span>
                                    <Typography.Text
                                        strong
                                        copyable={{
                                            text: status.userCode,
                                            icon: [<Copy className="size-3.5" key="copy" />, <CheckCircle2 className="size-3.5" key="done" />],
                                        }}
                                    >
                                        {status.userCode}
                                    </Typography.Text>
                                </div>
                                {status.expiresAt ? <p className="mt-1 text-xs text-foreground/50">{t("settingsUi.validUntil")} {new Date(status.expiresAt).toLocaleTimeString(locale)}</p> : null}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                        {status?.state === "installed" ? (
                            <Button type="primary" icon={<LogIn className="size-4" />} loading={pending === "login"} disabled={Boolean(pending && pending !== "login")} onClick={() => void runDreamina("login")}>
                                {t("login")}
                            </Button>
                        ) : null}
                        {status?.state === "login_pending" ? (
                            <Button type="primary" icon={<ExternalLink className="size-4" />} onClick={openVerification}>
                                {t("settingsUi.openVerification")}
                            </Button>
                        ) : null}
                        {status?.authenticated ? (
                            <Popconfirm title={t("settingsUi.dreaminaLogoutConfirm")} description={t("settingsUi.dreaminaLogoutHint")} okText={t("settingsUi.exit")} cancelText={t("timelineCancel")} onConfirm={() => void runDreamina("logout")}>
                                <Button danger icon={<LogOut className="size-4" />} loading={pending === "logout"}>
                                    {t("logout")}
                                </Button>
                            </Popconfirm>
                        ) : null}
                    </div>
                </div>
            </section>
        </div>
    );
}

function runtimePresentation(connection: LocalRuntimeConnectionState, t: InterfaceTranslate): Presentation {
    if (connection === "connected") return { label: t("settingsUi.connected"), tone: "success", action: "refresh" };
    if (connection === "connecting") return { label: t("settingsUi.detecting"), tone: "processing", action: null };
    if (connection === "origin_not_trusted") return { label: t("settingsUi.reconnectNeeded"), tone: "error", action: "refresh", actionLabel: t("stateReconnect") };
    if (connection === "unreachable") return { label: t("settingsUi.notFound"), tone: "error", action: "refresh" };
    if (connection === "incompatible") return { label: t("settingsUi.incompatible"), tone: "error", action: "refresh" };
    if (connection === "runtime_error") return { label: t("settingsUi.runtimeError"), tone: "error", action: "refresh" };
    return { label: t("settingsUi.notChecked"), tone: "default", action: "refresh" };
}

function dreaminaEmptyMessage(connection: LocalRuntimeConnectionState, moduleAvailable: boolean, t: InterfaceTranslate) {
    if (connection !== "connected") return t("settingsUi.dreaminaReconnectHint");
    if (!moduleAvailable) return t("settingsUi.dreaminaModuleMissing");
    return t("settingsUi.dreaminaChecking");
}
