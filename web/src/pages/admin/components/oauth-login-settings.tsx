import { App, Button, Form, Input, Skeleton } from "antd";
import { Globe2, RefreshCw, RotateCcw, Save } from "lucide-react";
import { GithubOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";

import { getAdminGitHubSetting, getAdminGoogleSetting, updateAdminGitHubSetting, updateAdminGoogleSetting, type OAuthClientSetting } from "@/services/api/wallet";
import { Switch } from "@/pages/admin/ui/controls";
import { AdminStatusBadge, configuredSecretText, SettingsSectionCard } from "./admin-ui";

type Values = Omit<OAuthClientSetting, "hasClientSecret"> & { clientSecret: string };
const providers = {
    google: { name: "Google", load: getAdminGoogleSetting, save: updateAdminGoogleSetting, description: "在 Google Cloud 创建 Web 应用 OAuth 客户端，将下方回调地址登记为授权重定向 URI。", icon: Globe2 },
    github: { name: "GitHub", load: getAdminGitHubSetting, save: updateAdminGitHubSetting, description: "在 GitHub Developer settings 的 OAuth Apps 创建应用，将下方回调地址登记为 Authorization callback URL。", icon: GithubOutlined },
};

export default function OAuthLoginSettings({ provider, onDirtyChange }: { provider: keyof typeof providers; onDirtyChange: (dirty: boolean) => void }) {
    const config = providers[provider];
    const Icon = config.icon;
    const { message } = App.useApp();
    const [form] = Form.useForm<Values>();
    const [setting, setSetting] = useState<OAuthClientSetting | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState("");
    const enabled = Form.useWatch("enabled", form);

    const apply = useCallback((value: OAuthClientSetting) => {
        setSetting(value);
        form.setFieldsValue({ enabled: value.enabled, clientId: value.clientId, redirectUrl: value.redirectUrl || `${window.location.origin}/api/auth/${provider}/callback`, clientSecret: "" });
        setDirty(false);
        onDirtyChange(false);
        setError("");
    }, [form, onDirtyChange, provider]);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const result = await config.load();
            apply(result.setting);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : `读取 ${config.name} 登录配置失败`);
        } finally {
            setLoading(false);
        }
    }, [apply, config]);

    useEffect(() => { void load(); }, [load]);

    const save = async () => {
        if (!setting || saving) return;
        let values: Values;
        try { values = await form.validateFields(); } catch { return; }
        values = { enabled: Boolean(values.enabled), clientId: values.clientId.trim(), clientSecret: values.clientSecret.trim(), redirectUrl: values.redirectUrl.trim() };
        setSaving(true);
        setError("");
        try {
            const { setting: saved } = await config.save(values);
            if (saved.enabled !== values.enabled || saved.clientId !== values.clientId || saved.redirectUrl !== values.redirectUrl || (values.enabled && !saved.hasClientSecret)) {
                throw new Error(`服务端返回的 ${config.name} 登录配置不一致，请重新读取核对`);
            }
            apply(saved);
            message.success(`${config.name} 登录配置已保存`);
        } catch (cause) {
            const detail = cause instanceof Error ? cause.message : `保存 ${config.name} 登录配置失败`;
            setError(detail);
            message.error(detail);
        } finally {
            setSaving(false);
        }
    };

    return <div id={`admin-access-${provider}`} className="admin-settings-anchor">
        <SettingsSectionCard
            className="admin-access-section"
            icon={<Icon className="size-4" aria-hidden="true" />}
            title={`${config.name} 登录与注册`}
            description={config.description}
            status={<AdminStatusBadge label={dirty ? "待保存" : setting?.enabled ? "已启用" : "未启用"} tone={dirty ? "warning" : setting?.enabled ? "success" : "neutral"} />}
            footer={<div className="flex flex-wrap items-center gap-2">
                <Button icon={<RefreshCw className="size-4" />} loading={loading} disabled={dirty || saving} onClick={() => void load()}>重新读取</Button>
                <Button icon={<RotateCcw className="size-4" />} disabled={!dirty || saving || !setting} onClick={() => setting && apply(setting)}>撤销</Button>
                <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || !setting} onClick={() => void save()}>保存</Button>
            </div>}
        >
            {error ? <p role="alert" className="text-[var(--destructive)]">{error}</p> : null}
            {loading && !setting ? <Skeleton active paragraph={{ rows: 3 }} /> : setting ? <Form
                name={`${provider}-oauth-settings`} className="p-5" form={form} layout="vertical" requiredMark={false} disabled={loading || saving}
                onValuesChange={(_, values: Values) => {
                    const changed = values.enabled !== setting.enabled || values.clientId.trim() !== setting.clientId || values.redirectUrl.trim() !== setting.redirectUrl || Boolean(values.clientSecret.trim());
                    setDirty(changed);
                    onDirtyChange(changed);
                    setError("");
                }}
            >
                <Form.Item name="enabled" label={`在登录与注册页显示 ${config.name}`} valuePropName="checked"><Switch aria-label={`在登录与注册页显示 ${config.name}`} /></Form.Item>
                <Form.Item name="clientId" label="Client ID" rules={[{ required: Boolean(enabled), whitespace: true, message: "请填写 Client ID" }]}><Input autoComplete="off" /></Form.Item>
                <Form.Item name="clientSecret" label={setting.hasClientSecret ? `Client Secret（${configuredSecretText}）` : "Client Secret"} rules={[{ required: Boolean(enabled) && !setting.hasClientSecret, whitespace: true, message: "请填写 Client Secret" }]}><Input.Password autoComplete="new-password" placeholder={setting.hasClientSecret ? "留空保留原密钥" : "仅保存在服务端"} /></Form.Item>
                <Form.Item name="redirectUrl" label={provider === "github" ? "Authorization callback URL" : "授权重定向 URI"} rules={[{ required: Boolean(enabled), message: "请填写本站回调地址" }]} extra={`必须与 ${config.name} 中登记的地址完全一致。`}><Input inputMode="url" autoComplete="off" /></Form.Item>
            </Form> : null}
        </SettingsSectionCard>
    </div>;
}
