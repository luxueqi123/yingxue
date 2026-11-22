import { Alert, App, Button, Form, Input, InputNumber, Modal, Switch, Table, Tag } from "antd";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AdminPageFrame } from "../components/admin-shell";
import { getAdminMembershipPlans, saveMembershipPlan, type MembershipPlan } from "@/services/api/membership";
import { formatCredits } from "@/constant/credits";
import { formatStorageCapacity } from "@/lib/account-storage-usage";

type Values = { name: string; description: string; monthlyYuan: number; annualYuan: number; credits: number; concurrentTasks: number; storageGB: number; creditGraceDays: number; sortOrder: number; enabled: boolean };
const initial: Values = { name: "", description: "", monthlyYuan: 29, annualYuan: 0, credits: 3480, concurrentTasks: 3, storageGB: 20, creditGraceDays: 0, sortOrder: 0, enabled: false };
const suggestions: Values[] = [
    { ...initial, name: "轻创会员", description: "适合开始尝试 AI 影像创作", sortOrder: 10 },
    { ...initial, name: "创作会员", description: "适合持续创作与多项目探索", monthlyYuan: 99, credits: 12375, concurrentTasks: 5, storageGB: 100, sortOrder: 20 },
    { ...initial, name: "专业会员", description: "适合高频制作与团队主创", monthlyYuan: 299, credits: 37375, concurrentTasks: 8, storageGB: 300, sortOrder: 30 },
];

export default function AdminMembershipPage() {
    const { message } = App.useApp();
    const plans = useQuery({ queryKey: ["admin-membership-plans"], queryFn: ({ signal }) => getAdminMembershipPlans(signal) });
    const [editing, setEditing] = useState<MembershipPlan | null>();
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<Values>();
    const open = (plan?: MembershipPlan, suggested?: Values) => {
        setEditing(plan || null);
        form.setFieldsValue(plan ? { name: plan.name, description: plan.description, monthlyYuan: plan.monthlyAmountFen / 100, annualYuan: plan.annualAmountFen / 100, credits: plan.monthlyCreditsMicrocredits / 1e6, concurrentTasks: plan.concurrentTasks, storageGB: plan.storageBytes / 2 ** 30, creditGraceDays: plan.creditGraceDays, sortOrder: plan.sortOrder, enabled: plan.enabled } : suggested || initial);
    };
    const save = async (values: Values) => {
        setSaving(true);
        try {
            await saveMembershipPlan(editing?.id, { name: values.name, description: values.description || "", version: editing?.version || 0, enabled: values.enabled, sortOrder: values.sortOrder, monthlyAmountFen: Math.round(values.monthlyYuan * 100), annualAmountFen: Math.round(values.annualYuan * 100), monthlyCreditsMicrocredits: Math.round(values.credits * 1e6), concurrentTasks: values.concurrentTasks, storageBytes: Math.round(values.storageGB * 2 ** 30), creditGraceDays: values.creditGraceDays });
            setEditing(undefined); await plans.refetch(); void message.success("套餐已保存");
        } catch (error) { void message.error(error instanceof Error ? error.message : "保存失败"); }
        finally { setSaving(false); }
    };
    return <AdminPageFrame title="会员套餐" description="低门槛月付，积分按周期到账。已购买权益保留购买时的版本。">
        <div className="space-y-4">
            <Alert type="info" title="收费规则" description="模型积分标价保持现有规则，不叠加会员折扣。发布时每月积分不得超过同价充值基础积分的125%，年付按12期总积分核算。年费设0即可仅开放月付。续购顺延，换档在下一会员期生效。" />
            <div className="flex flex-wrap gap-2"><Button type="primary" icon={<Plus size={16} />} onClick={() => open()}>新建套餐</Button>{suggestions.map((values) => <Button key={values.name} onClick={() => open(undefined, values)}>参考草稿 · ¥{values.monthlyYuan}/月</Button>)}</div>
            {plans.isError ? <Alert type="error" title={plans.error.message} action={<Button onClick={() => void plans.refetch()}>重试</Button>} /> : null}
            <Table<MembershipPlan> rowKey="id" loading={plans.isPending} dataSource={plans.data?.plans || []} pagination={false} scroll={{ x: 860 }} columns={[
                { title: "套餐", dataIndex: "name", render: (_, p) => <><strong>{p.name}</strong><p className="text-xs">版本 {p.version}</p></> },
                { title: "价格", render: (_, p) => `月 ¥${p.monthlyAmountFen / 100} / 年 ${p.annualAmountFen ? `¥${p.annualAmountFen / 100}` : "未开放"}` },
                { title: "每月积分", render: (_, p) => formatCredits(p.monthlyCreditsMicrocredits) },
                { title: "任务 / 存储", render: (_, p) => `${p.concurrentTasks} / ${formatStorageCapacity(p.storageBytes)}` },
                { title: "状态", render: (_, p) => <Tag color={p.enabled ? "green" : "default"}>{p.enabled ? "已上架" : "草稿"}</Tag> },
                { title: "操作", render: (_, p) => <Button onClick={() => open(p)}>编辑</Button> },
            ]} />
        </div>
        <Modal title={editing ? "编辑会员套餐" : "新建会员套餐"} open={editing !== undefined} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} confirmLoading={saving} destroyOnHidden>
            <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
                <Form.Item name="name" label="套餐名称" rules={[{ required: true }, { max: 80 }]}><Input maxLength={80} /></Form.Item>
                <Form.Item name="description" label="套餐介绍"><Input.TextArea maxLength={500} /></Form.Item>
                <div className="grid grid-cols-2 gap-x-3">
                    <Form.Item name="monthlyYuan" label="月付价格（元）" rules={[{ required: true }]}><InputNumber min={0} max={1000000} precision={2} /></Form.Item>
                    <Form.Item name="annualYuan" label="年付价格（0不开放）" rules={[{ required: true }]}><InputNumber min={0} max={1000000} precision={2} /></Form.Item>
                    <Form.Item name="credits" label="每月积分" rules={[{ required: true }]}><InputNumber min={0.000001} max={1000000000} precision={6} /></Form.Item>
                    <Form.Item name="concurrentTasks" label="同时进行的任务数" rules={[{ required: true }]}><InputNumber min={1} max={100} precision={0} /></Form.Item>
                    <Form.Item name="storageGB" label="会员存储总容量（GB）" rules={[{ required: true }]}><InputNumber min={0} max={100000} precision={0} /></Form.Item>
                    <Form.Item name="creditGraceDays" label="积分额外使用期（天）" rules={[{ required: true }]}><InputNumber min={0} max={31} precision={0} /></Form.Item>
                    <Form.Item name="sortOrder" label="排序"><InputNumber precision={0} /></Form.Item>
                    <Form.Item name="enabled" label="公开上架" valuePropName="checked"><Switch /></Form.Item>
                </div>
                <p className="text-xs">参考价仅为草稿建议。确认积分、容量成本和价格后再公开上架。现有更高任务或容量权益保留。</p>
            </Form>
        </Modal>
    </AdminPageFrame>;
}
