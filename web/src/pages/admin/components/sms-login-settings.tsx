import { App, Button, Form, Input, InputNumber, Skeleton } from "antd";
import { MessageSquare, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Select } from "@/components/ui/base/select";
import { Switch } from "@/pages/admin/ui/controls";
import { fetchAdminPlugins, setPluginPlatformAvailability } from "@/services/api/plugins";
import { getSMSChannels, saveSMSChannel, testSMSChannel, type SMSChannel, type SMSChannelInput } from "@/services/api/sms";
import { getVerificationPolicy, saveVerificationPolicy, type VerificationPolicy } from "@/services/api/verification";
import { useAuthSettingsStore } from "@/stores/use-auth-settings-store";
import { AdminStatusBadge, configuredSecretText, SettingsSectionCard } from "./admin-ui";

const pluginID = "official-sms-aliyun";
const defaults = { name: "阿里云短信认证", enabled: false, priority: 10, dailyLimit: 100, signName: "恒创联众", accessId: "", accessKey: "" };
type Values = typeof defaults;

export function aliyunPNSChannelInput(values: Values, channel: SMSChannel | null): SMSChannelInput {
    return {
        ...values, name: values.name.trim(), signName: values.signName.trim(), accessId: values.accessId.trim(), accessKey: values.accessKey.trim(),
        provider: "aliyun-pns", appId: "", version: channel?.version ?? 0,
        templates: (["register", "login", "bind"] as const).map((purpose) => ({
            purpose, templateId: purpose === "bind" ? "100004" : "100001",
            parameters: [{ name: "code", value: "code" }, { name: "min", value: "minutes" }],
        })),
    };
}

export default function SMSLoginSettings({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<Values>();
    const [channels, setChannels] = useState<SMSChannel[]>([]);
    const [channel, setChannel] = useState<SMSChannel | null>(null);
    const [policy, setPolicy] = useState<VerificationPolicy | null>(null);
    const [pluginEnabled, setPluginEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState("");
    const [phone, setPhone] = useState("");
    const [testResult, setTestResult] = useState("");

    const apply = useCallback((saved: SMSChannel | null) => {
        setChannel(saved);
        form.setFieldsValue(saved ? { name: saved.name, enabled: saved.enabled, priority: saved.priority, dailyLimit: saved.dailyLimit, signName: saved.signName, accessId: "", accessKey: "" } : defaults);
        form.setFields([]);
        setDirty(false);
        onDirtyChange(false);
        setTestResult("");
    }, [form, onDirtyChange]);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [allChannels, currentPolicy, plugins] = await Promise.all([getSMSChannels(), getVerificationPolicy(), fetchAdminPlugins()]);
            const compatible = allChannels.filter((item) => item.provider === "aliyun-pns");
            setChannels(compatible);
            setPolicy(currentPolicy);
            setPluginEnabled(Boolean(plugins.states[pluginID]?.effectiveEnabled));
            apply(compatible.length === 1 ? compatible[0] : null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "读取短信配置失败");
        } finally {
            setLoading(false);
        }
    }, [apply]);

    useEffect(() => { void load(); }, [load]);

    const save = async () => {
        let values: Values;
        try { values = await form.validateFields(); } catch { return; }
        setSaving(true);
        setError("");
        try {
            const saved = await saveSMSChannel(channel?.id, aliyunPNSChannelInput(values, channel));
            setChannels((items) => [...items.filter((item) => item.id !== saved.id), saved]);
            apply(saved);
            await useAuthSettingsStore.getState().load({ maxAgeMs: 0 });
            message.success("短信渠道已保存");
        } catch (cause) {
            const detail = cause instanceof Error ? cause.message : "保存短信渠道失败";
            setError(detail);
            message.error(detail);
        } finally { setSaving(false); }
    };

    const enablePlugin = async () => {
        setSaving(true);
        setError("");
        try {
            const state = await setPluginPlatformAvailability(pluginID, true);
            if (!state.effectiveEnabled) throw new Error("短信插件未生效，请重新读取检查");
            setPluginEnabled(true);
            message.success("短信插件已启用");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "启用短信插件失败"); }
        finally { setSaving(false); }
    };

    const togglePolicy = async (key: "smsLogin" | "smsRegistration", enabled: boolean) => {
        if (!policy) return;
        setSaving(true);
        setError("");
        try {
            setPolicy(await saveVerificationPolicy({ ...policy, [key]: enabled }));
            await useAuthSettingsStore.getState().load({ maxAgeMs: 0 });
            message.success("手机号登录与注册设置已保存");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "保存手机号设置失败"); }
        finally { setSaving(false); }
    };

    const sendTest = () => {
        if (!channel || !/^1[3-9]\d{9}$/.test(phone.trim())) {
            setError("请填写有效的中国大陆测试手机号");
            return;
        }
        modal.confirm({
            title: "发送一条测试短信？", content: `接收号码 ${phone.trim()}，短信按阿里云实际用量计费。`, okText: "发送", cancelText: "取消",
            onOk: async () => {
                setSaving(true);
                setError("");
                setTestResult("");
                try {
                    const result = await testSMSChannel(channel.id, phone.trim());
                    if (result.state !== "accepted") throw new Error("短信尚未受理，请检查发送记录");
                    setTestResult(`已受理 · ${result.maskedPhone} · ${result.requestId}`);
                } catch (cause) { setError(cause instanceof Error ? cause.message : "测试发送失败"); }
                finally { setSaving(false); }
            },
        });
    };

    return <div id="admin-access-sms" className="admin-settings-anchor">
        <SettingsSectionCard className="admin-access-section" title="手机号登录与注册" icon={<MessageSquare className="size-4" aria-hidden="true" />}
            status={<AdminStatusBadge label={dirty ? "待保存" : channel?.enabled && pluginEnabled ? "渠道已启用" : "未启用"} tone={dirty ? "warning" : channel?.enabled && pluginEnabled ? "success" : "neutral"} />}
            footer={<div className="flex flex-wrap gap-2">
                <Button icon={<RefreshCw className="size-4" />} loading={loading} disabled={dirty || saving} onClick={() => void load()}>重新读取</Button>
                <Button disabled={!dirty || saving} onClick={() => apply(channel)}>撤销</Button>
                <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || !policy} onClick={() => void save()}>保存渠道</Button>
            </div>}>
            {error ? <p role="alert" className="p-5 text-[var(--destructive)]">{error}</p> : null}
            {loading ? <Skeleton active paragraph={{ rows: 3 }} /> : policy ? <div className="p-5">
                {!pluginEnabled ? <Button className="mb-4" loading={saving} onClick={() => void enablePlugin()}>启用阿里云短信插件</Button> : null}
                {channels.length ? <div className="mb-4"><Select aria-label="短信认证渠道" value={channel?.id ?? ""} disabled={dirty || saving}
                    options={[{ label: "新增短信认证渠道", value: "" }, ...channels.map((item) => ({ label: item.name, value: item.id }))]}
                    onChange={(id) => apply(channels.find((item) => item.id === id) ?? null)} /></div> : null}
                <Form form={form} layout="vertical" requiredMark={false} disabled={saving} onValuesChange={() => { setDirty(true); onDirtyChange(true); setError(""); }}>
                    <div className="admin-access-form-grid">
                        <Form.Item name="name" label="渠道名称" rules={[{ required: true, whitespace: true, message: "请填写渠道名称" }]}><Input /></Form.Item>
                        <Form.Item name="signName" label="短信签名" rules={[{ required: true, whitespace: true, message: "请填写阿里云赠送签名" }]}><Input /></Form.Item>
                        <Form.Item name="accessId" label="AccessKey ID" rules={[{ required: !channel?.hasCredentials, whitespace: true, message: "请填写 AccessKey ID" }]}><Input autoComplete="off" /></Form.Item>
                        <Form.Item name="accessKey" label={channel?.hasCredentials ? `AccessKey Secret（${configuredSecretText}）` : "AccessKey Secret"} rules={[{ required: !channel?.hasCredentials, whitespace: true, message: "请填写 AccessKey Secret" }]}><Input.Password autoComplete="new-password" placeholder={channel?.hasCredentials ? "留空保留原凭据" : "仅加密保存在服务端"} /></Form.Item>
                        <Form.Item name="dailyLimit" label="每日发送上限" rules={[{ required: true, message: "请填写每日发送上限" }]}><InputNumber min={1} max={100000} precision={0} /></Form.Item>
                        <Form.Item name="priority" label="渠道优先级" rules={[{ required: true, message: "请填写优先级" }]}><InputNumber min={0} max={1000} precision={0} /></Form.Item>
                    </div>
                    <Form.Item name="enabled" label="启用渠道" valuePropName="checked"><Switch aria-label="启用短信认证渠道" disabled={!pluginEnabled || saving} /></Form.Item>
                </Form>
                <div className="flex flex-wrap gap-6 border-t border-[var(--border)] py-4">
                    <label className="flex items-center gap-3"><Switch aria-label="手机号注册" checked={policy.smsRegistration} disabled={saving || dirty || policy.smsAndEmailRegistration} onChange={(enabled) => void togglePolicy("smsRegistration", enabled)} />手机号注册</label>
                    <label className="flex items-center gap-3"><Switch aria-label="短信验证码登录" checked={policy.smsLogin} disabled={saving || dirty} onChange={(enabled) => void togglePolicy("smsLogin", enabled)} />短信验证码登录</label>
                </div>
                {policy.smsAndEmailRegistration ? <p>已启用短信与邮箱双重验证，请先调整现有注册策略。</p> : null}
                <div className="flex max-w-md items-center gap-2">
                    <Input aria-label="测试手机号" placeholder="测试手机号" inputMode="tel" autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} />
                    <Button loading={saving} disabled={!channel?.enabled || !pluginEnabled || dirty || !phone.trim()} onClick={sendTest}>发送测试短信</Button>
                </div>
                {testResult ? <p role="status" className="mt-3 break-all">{testResult}</p> : null}
            </div> : null}
        </SettingsSectionCard>
    </div>;
}
