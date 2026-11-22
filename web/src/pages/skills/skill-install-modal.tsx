import { App, Button, Form, Input, Modal, Upload, type UploadFile } from "antd";
import { Select } from "@/components/ui/base/select";
import { Switch } from "@/components/ui/base/switch";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { FileArchive, FileText, GitBranch, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import { fallbackSkillCategories, skillCategoryLabel } from "@/pages/skills/skill-catalog";
import { installGitHubSkill, installSkillUpload, type Skill } from "@/services/api/skills";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

type InstallMode = "markdown" | "zip" | "github";

type InstallFormValues = {
    name?: string;
    description?: string;
    tag: string;
    is_public: boolean;
    url?: string;
    ref?: string;
    subdir?: string;
    autoUpdate: boolean;
};

export function SkillInstallModal({ open, onClose, onInstalled, onManualCreate }: { open: boolean; onClose: () => void; onInstalled: (skill: Skill) => void; onManualCreate: () => void }) {
    const { t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const [form] = Form.useForm<InstallFormValues>();
    const [mode, setMode] = useState<InstallMode>("markdown");
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [installing, setInstalling] = useState(false);
    const modeOptions = [
        { value: "markdown", label: <span className="inline-flex items-center gap-1.5"><FileText className="size-3.5" />Markdown</span> },
        { value: "zip", label: <span className="inline-flex items-center gap-1.5"><FileArchive className="size-3.5" />{t("skillsUi.zipSkillPackage")}</span> },
        { value: "github", label: <span className="inline-flex items-center gap-1.5"><GitBranch className="size-3.5" />GitHub</span> },
    ];

    useEffect(() => {
        if (!open) return;
        setMode("markdown");
        setFileList([]);
        form.setFieldsValue({ tag: "creative", is_public: false, autoUpdate: true, name: "", description: "", url: "", ref: "", subdir: "" });
    }, [form, open]);

    const install = async () => {
        const values = await form.validateFields();
        const file = fileList[0]?.originFileObj;
        if (mode !== "github" && !file) {
            message.warning(t("skillsUi.selectInstallFile", { fileType: mode === "zip" ? t("skillsUi.zipSkillPackage") : t("skillsUi.markdownFile") }));
            return;
        }
        setInstalling(true);
        try {
            const result = mode === "github"
                ? await installGitHubSkill({
                    url: values.url || "",
                    ref: values.ref || undefined,
                    subdir: values.subdir || undefined,
                    tag: values.tag,
                    isPrivate: !values.is_public,
                    autoUpdate: values.autoUpdate,
                })
                : await installSkillUpload({
                    file: file as File,
                    sourceType: mode,
                    name: values.name || undefined,
                    description: values.description || undefined,
                    tag: values.tag,
                    isPrivate: !values.is_public,
                });
            message.success(t("skillsUi.skillInstalled"));
            onInstalled(result.skill);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsUi.installSkillFailed"));
        } finally {
            setInstalling(false);
        }
    };

    return (
        <Modal
            className="skill-install-modal"
            open={open}
            width={680}
            destroyOnHidden
            mask={{ closable: !installing }}
            title={t("skillsUi.installSkill")}
            onCancel={onClose}
            footer={(
                <div className="flex items-center justify-between gap-3">
                    <Button type="text" onClick={onManualCreate}>{t("skillsUi.createSingleFileFromBlank")}</Button>
                    <div className="flex gap-2"><Button onClick={onClose}>{t("skillsUi.cancel")}</Button><Button type="primary" loading={installing} onClick={() => void install()}>{t("skillsUi.installSkill")}</Button></div>
                </div>
            )}
        >
            <p className="mb-4 text-sm leading-6 text-foreground/55">{t("skillsUi.installDescription")}</p>
<SegmentedControl className="skill-install-mode" block options={modeOptions} value={mode} onChange={(value) => { setMode(value as InstallMode); setFileList([]); }} />

            <Form form={form} layout="vertical" requiredMark="optional" className="skill-install-form">
                {mode === "github" ? (
                    <>
                        <Form.Item name="url" label={t("skillsUi.githubAddress")} rules={[{ required: true, message: t("skillsUi.enterGithubAddress") }, { type: "url", message: t("skillsUi.validUrl") }]}>
                            <Input type="url" inputMode="url" spellCheck={false} prefix={<GitBranch className="size-4 text-foreground/35" />} placeholder="https://github.com/owner/repository" />
                        </Form.Item>
                        <div className="grid gap-x-3 sm:grid-cols-2">
                            <Form.Item name="ref" label={t("skillsUi.branchOrTag")} extra={t("skillsUi.defaultBranchHint")}><Input spellCheck={false} placeholder="main" /></Form.Item>
                            <Form.Item name="subdir" label={t("skillsUi.skillSubdirectory")} extra={t("skillsUi.skillSubdirectoryHint")}><Input spellCheck={false} placeholder="skills/ai-director" /></Form.Item>
                        </div>
                    </>
                ) : (
                    <>
                        <Upload.Dragger
                            accept={mode === "zip" ? ".zip,application/zip" : ".md,.markdown,text/markdown"}
                            maxCount={1}
                            fileList={fileList}
                            beforeUpload={(file) => {
                                if (file.size > 20 * 1024 * 1024) {
                                    message.error(t("skillsUi.skillFileSizeLimit"));
                                    return Upload.LIST_IGNORE;
                                }
                                return false;
                            }}
                            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
                            onRemove={() => { setFileList([]); return true; }}
                        >
                            <UploadCloud className="mx-auto mb-3 size-8 text-foreground/38" />
                            <div className="text-sm font-medium">{t("skillsUi.dropOrChooseFile", { fileType: mode === "zip" ? t("skillsUi.zipSkillPackage") : t("skillsUi.markdownFile") })}</div>
                            <div className="mt-1 text-xs text-foreground/45">{mode === "zip" ? t("skillsUi.zipEntryHint") : t("skillsUi.markdownEntryHint")}</div>
                        </Upload.Dragger>
                        <div className="mt-4 grid gap-x-3 sm:grid-cols-2">
                            <Form.Item name="name" label={t("skillsUi.overrideName")} extra={t("skillsUi.optionalReadAutomatically")}><Input maxLength={80} autoComplete="off" /></Form.Item>
                            <Form.Item name="description" label={t("skillsUi.overrideDescription")} extra={t("skillsUi.optionalReadAutomatically")}><Input maxLength={500} autoComplete="off" /></Form.Item>
                        </div>
                    </>
                )}

                <div className="grid gap-x-3 sm:grid-cols-2">
                    <Form.Item name="tag" label={t("skillsUi.skillCategory")} rules={[{ required: true, message: t("skillsUi.selectSkillCategory") }]}>
                        <Select options={fallbackSkillCategories.map(({ value }) => ({ value, label: skillCategoryLabel(value, fallbackSkillCategories, t) }))} />
                    </Form.Item>
                    <Form.Item name="is_public" label={t("skillsUi.visibility")} valuePropName="checked" extra={t("skillsUi.publicSkillNote")}>
                        <Switch checkedChildren={t("skillsUi.public")} unCheckedChildren={t("skillsUi.private")} />
                    </Form.Item>
                </div>
                {mode === "github" ? <Form.Item name="autoUpdate" label={t("skillsUi.autoSync")} valuePropName="checked" extra={t("skillsUi.autoSyncDescription")}><Switch checkedChildren={t("skillsUi.enabled")} unCheckedChildren={t("skillsUi.disabled")} /></Form.Item> : null}
            </Form>
        </Modal>
    );
}
