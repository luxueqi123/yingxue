import { App, Button, Form, Input } from "antd";
import { AppDrawer } from "@/components/ui/product/app-drawer";
import { Select } from "@/components/ui/base/select";
import { Switch } from "@/components/ui/base/switch";
import { Minus, Plus, Save, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fallbackSkillCategories, skillCategoryLabel } from "@/pages/skills/skill-catalog";
import { generateSkillDraft } from "@/lib/canvas/skill-drafting";
import { navigateToSettings } from "@/lib/settings-navigation";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { createSkill, updateSkill, type Skill, type SkillMutationInput, type SkillShowcaseMedia } from "@/services/api/skills";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

type SkillFormValues = Omit<SkillMutationInput, "isPrivate"> & { is_public: boolean };

/** 后台基本信息：不含正文和公开状态。 */
export type SkillInfoInput = Omit<SkillMutationInput, "instruction" | "isPrivate">;

const HTTP_URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * admin 存在时为后台模式：只改基本信息（不显示正文、公开状态和 AI 起草），保存走管理员接口。
 * 正文与附属文件统一在技能工作台修改。
 */
export function SkillEditorDrawer({
    open,
    skill,
    onClose,
    onSaved,
    admin,
    conversationIdea,
}: {
    open: boolean;
    skill: Skill | null;
    onClose: () => void;
    onSaved: (skill: Skill) => void;
    conversationIdea?: string;
    admin?: { save: (skillId: string, input: SkillInfoInput) => Promise<{ skill: Skill }> };
}) {
    const { t } = useInterfaceTranslation();
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<SkillFormValues>();
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [draftIdea, setDraftIdea] = useState("");
    const [drafting, setDrafting] = useState(false);
    const [draftWasStopped, setDraftWasStopped] = useState(false);
    const draftRequest = useRef<AbortController | null>(null);
    const editorEpoch = useRef(0);
    const effectiveConfig = useEffectiveConfig();
    const isPackageSkill = Boolean(skill && skill.sourceType !== "markdown" && skill.sourceType !== "builtin" && skill.sourceType !== "");
    const infoOnly = Boolean(admin);
    const initialMarkdownUrl = skill?.markdownUrl || skill?.sourceUrl || "";
    // 内置技能的 markdownUrl 是包内相对路径；后台未改动时原样保留，不按外链校验。
    const markdownUrlRules = admin
        ? [{ validator: (_: unknown, value?: string) => (!value || value === initialMarkdownUrl || HTTP_URL_PATTERN.test(value) ? Promise.resolve() : Promise.reject(new Error("请输入有效的 HTTP(S) 链接"))) }]
        : [{ type: "url" as const, message: "请输入有效的 HTTP(S) 链接" }];

    useEffect(() => {
        if (!open) return;
        editorEpoch.current++;
        form.setFieldsValue({
            skillName: skill?.skillName || "",
            description: skill?.description || "",
            instruction: skill?.instruction || "",
            tag: skill?.tag || "creative",
            is_public: skill ? !skill.isPrivate : false,
            markdownUrl: skill?.markdownUrl || skill?.sourceUrl || "",
            showcaseMedia: skill?.showcaseMedia || [],
            extraInfo: skill?.extraInfo || "",
        });
        setDirty(false);
        setDraftIdea(conversationIdea || "");
        setDrafting(false);
        setSaving(false);
        setDraftWasStopped(false);
        return () => {
            editorEpoch.current++;
            draftRequest.current?.abort();
            draftRequest.current = null;
        };
    }, [form, open, skill, conversationIdea]);

    const requestClose = () => {
        if (!dirty) {
            onClose();
            return;
        }
        modal.confirm({ title: t("skillsUi.discardUnsavedTitle"), content: t("skillsUi.discardUnsavedContent"), okText: t("skillsUi.discardChanges"), okButtonProps: { danger: true }, cancelText: t("skillsUi.continueEditing"), onOk: onClose });
    };

    const submit = async (values: SkillFormValues) => {
        const epoch = editorEpoch.current;
        setSaving(true);
        try {
            const input: SkillMutationInput = {
                skillName: values.skillName,
                description: values.description,
                instruction: values.instruction || "",
                tag: values.tag,
                isPrivate: !values.is_public,
                markdownUrl: values.markdownUrl || "",
                showcaseMedia: (values.showcaseMedia || []).map((item) => ({ ...item, showcaseUri: item.showcaseUri || "" })),
                extraInfo: values.extraInfo || "",
            };
            const result =
                admin && skill
                    ? await admin.save(skill.skillId, { skillName: input.skillName, description: input.description, tag: input.tag, markdownUrl: input.markdownUrl, showcaseMedia: input.showcaseMedia, extraInfo: input.extraInfo })
                    : skill
                      ? await updateSkill(skill.skillId, input)
                      : await createSkill(input);
            if (editorEpoch.current !== epoch) return;
            setDirty(false);
            message.success(skill ? t("skillsUi.skillUpdated") : t("skillsUi.skillCreated"));
            onSaved(result.skill);
        } catch (error) {
            if (editorEpoch.current === epoch) message.error(error instanceof Error ? error.message : t("skillsUi.saveSkillFailed"));
        } finally {
            if (editorEpoch.current === epoch) setSaving(false);
        }
    };

    const draftFromIdea = async () => {
        if (draftRequest.current) return;
        const idea = draftIdea.trim();
        if (!idea) {
            message.warning(t("skillsUi.describeSkillIdea"));
            return;
        }
        if (!useConfigStore.getState().isAiConfigReady(effectiveConfig, effectiveConfig.model)) {
            message.info(t("skillsUi.configureTextModel"));
            navigateToSettings({ section: "models", continueCreation: true });
            return;
        }
        const controller = new AbortController();
        draftRequest.current = controller;
        setDraftWasStopped(false);
        setDrafting(true);
        try {
            const draft = await generateSkillDraft(idea, effectiveConfig, controller.signal);
            if (controller.signal.aborted) return;
            form.setFieldsValue({
                skillName: draft.skillName || "",
                description: draft.description || "",
                instruction: draft.instruction || "",
                ...(draft.tag ? { tag: draft.tag } : {}),
            });
            setDirty(true);
            message.success(t("skillsUi.draftGenerated"));
        } catch (error) {
            if (!controller.signal.aborted) message.error(error instanceof Error ? t("skillsUi.draftFailedWithError", { error: error.message }) : t("skillsUi.draftFailed"));
        } finally {
            if (draftRequest.current === controller) {
                draftRequest.current = null;
                setDrafting(false);
            }
        }
    };

    return (
        <AppDrawer
            className={admin ? "library-drawer admin-drawer-panel" : "library-drawer"}
            rootClassName={admin ? "admin-drawer" : undefined}
            open={open}
            size={720}
            mask={{ closable: !dirty }}
            title={admin ? "编辑技能信息" : skill ? t("skillsUi.editSkill") : conversationIdea ? t("skillsUi.extractFromConversation") : t("skillsUi.createSkill")}
            onClose={requestClose}
            extra={
                <Button type="primary" loading={saving} disabled={drafting} icon={<Save className="size-4" />} onClick={() => form.submit()}>
                    {t("skillsUi.saveSkill")}
                </Button>
            }
        >
            {infoOnly ? (
                <div className="mb-4 rounded-xl border bg-foreground/[.02] p-3 text-sm leading-6 text-foreground/58">{adminInfoNotice(skill)}</div>
            ) : !isPackageSkill ? (
                <div className="mb-4 rounded-xl border bg-foreground/[.02] p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                        <Wand2 className="size-4" />
                        {t("skillsUi.aiDrafting")}
                        <span className="font-normal text-foreground/45">{conversationIdea ? t("skillsUi.reviewConversationBeforeDrafting") : t("skillsUi.describeIdeaToDraft")}</span>
                    </div>
                    <Input.TextArea
                        value={draftIdea}
                        onChange={(event) => setDraftIdea(event.target.value)}
                        autoSize={{ minRows: 3, maxRows: 6 }}
                        maxLength={conversationIdea ? 12000 : 2000}
                        showCount
                        disabled={drafting}
                        placeholder={t("skillsUi.draftIdeaPlaceholder")}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground/45">{t("skillsUi.draftPrivacyBillingNotice")}</span>
                        {drafting ? (
                            <Button
                                onClick={() => {
                                    draftRequest.current?.abort();
                                    draftRequest.current = null;
                                    setDrafting(false);
                                    setDraftWasStopped(true);
                                    message.info(t("skillsUi.stoppedWaiting"));
                                }}
                            >
                                {t("skillsUi.stopWaiting")}
                            </Button>
                        ) : (
                            <Button
                                type="primary"
                                disabled={!draftIdea.trim()}
                                icon={<Wand2 className="size-4" />}
                                onClick={() => {
                                    if (draftWasStopped)
                                        modal.confirm({
                                            title: t("skillsUi.regenerateCreatesTaskTitle"),
                                            content: t("skillsUi.regenerateCreatesTaskContent"),
                                            okText: t("skillsUi.confirmRegenerate"),
                                            cancelText: t("skillsUi.returnToCheck"),
                                            onOk: () => {
                                                void draftFromIdea();
                                            },
                                        });
                                    else void draftFromIdea();
                                }}
                            >
                                {t("skillsUi.generateDraft")}
                            </Button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="mb-4 rounded-xl border bg-foreground/[.02] p-3 text-sm leading-6 text-foreground/58">{t("skillsUi.packageEditingNotice")}</div>
            )}
            <Form form={form} layout="vertical" requiredMark="optional" onFinish={submit} onValuesChange={() => setDirty(true)}>
                <div className="grid gap-x-4 sm:grid-cols-2">
                    <Form.Item
                        name="skillName"
                        label={t("skillsUi.skillName")}
                        rules={[
                            { required: true, message: t("skillsUi.enterSkillName") },
                            { max: 80, message: t("skillsUi.maxCharacters", { count: 80 }) },
                        ]}
                    >
                        <Input maxLength={80} showCount placeholder={t("skillsUi.skillNamePlaceholder")} autoComplete="off" />
                    </Form.Item>
                    <Form.Item name="tag" label={t("skillsUi.skillCategory")} rules={[{ required: true, message: t("skillsUi.selectSkillCategory") }]}>
                        <Select options={fallbackSkillCategories.map(({ value }) => ({ value, label: skillCategoryLabel(value, fallbackSkillCategories, t) }))} />
                    </Form.Item>
                </div>

                <Form.Item
                    name="description"
                    label={t("skillsUi.skillDescription")}
                    rules={[
                        { required: true, message: t("skillsUi.enterSkillDescription") },
                        { max: 500, message: t("skillsUi.maxCharacters", { count: 500 }) },
                    ]}
                >
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} showCount placeholder={t("skillsUi.skillDescriptionPlaceholder")} />
                </Form.Item>

                {!isPackageSkill && !infoOnly ? (
                    <Form.Item
                        name="instruction"
                        label={t("skillsUi.skillInstruction")}
                        rules={[
                            { required: true, message: t("skillsUi.enterSkillInstruction") },
                            { max: 100000, message: t("skillsUi.maxCharacters", { count: 100000 }) },
                        ]}
                        extra={t("skillsUi.singleFileSkillNote")}
                    >
                        <Input.TextArea className="font-mono text-xs leading-5" autoSize={{ minRows: 14, maxRows: 28 }} maxLength={100000} showCount placeholder={t("skillsUi.skillInstructionPlaceholder")} />
                    </Form.Item>
                ) : null}

                <div className={infoOnly ? "grid gap-x-4" : "grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_180px]"}>
                    <Form.Item name="markdownUrl" label={isPackageSkill ? "来源地址" : "Markdown 地址"} rules={markdownUrlRules}>
                        <Input type="url" inputMode="url" spellCheck={false} placeholder="https://example.com/SKILL.md" />
                    </Form.Item>
                    {!infoOnly ? (
                        <Form.Item name="is_public" label="公开状态" valuePropName="checked" extra="公开后其他用户可以加入使用。">
                            <Switch checkedChildren="公开" unCheckedChildren="私有" />
                        </Form.Item>
                    ) : null}
                </div>

                <Form.List name="showcaseMedia">
                    {(fields, { add, remove }) => (
                        <section aria-labelledby="skill-media-title">
                            <div className="mb-3 flex items-center justify-between">
                                <div>
                                    <h3 id="skill-media-title" className="text-sm font-medium">
                                        {t("skillsUi.showcaseMedia")}
                                    </h3>
                                    <p className="mt-1 text-xs text-foreground/50">{t("skillsUi.showcaseMediaNote")}</p>
                                </div>
                                <Button disabled={fields.length >= 8} icon={<Plus className="size-4" />} onClick={() => add(emptyMedia())}>
                                    {t("skillsUi.addMedia")}
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {fields.map((field) => (
                                    <div key={field.key} className="grid grid-cols-[112px_minmax(0,1fr)_36px] gap-2">
                                        <Form.Item {...field} name={[field.name, "type"]} className="mb-0" rules={[{ required: true, message: t("skillsUi.selectMediaType") }]}>
                                            <Select
                                                options={[
                                                    { value: "image", label: t("skillsUi.image") },
                                                    { value: "video", label: t("skillsUi.video") },
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            {...field}
                                            name={[field.name, "showcaseUrl"]}
                                            className="mb-0"
                                            rules={[
                                                { required: true, message: t("skillsUi.enterMediaUrl") },
                                                { type: "url", message: t("skillsUi.invalidUrl") },
                                            ]}
                                        >
                                            <Input type="url" inputMode="url" spellCheck={false} placeholder="https://example.com/media" />
                                        </Form.Item>
                                        <Button aria-label={t("skillsUi.removeMedia")} title={t("skillsUi.removeMedia")} icon={<Minus className="size-4" />} onClick={() => remove(field.name)} />
                                        <Form.Item {...field} name={[field.name, "showcaseUri"]} hidden>
                                            <Input />
                                        </Form.Item>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </Form.List>

                <Form.Item name="extraInfo" label={t("skillsUi.extraInformation")} className="mt-5" rules={[{ max: 2000, message: t("skillsUi.maxCharacters", { count: 2000 }) }]}>
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} showCount placeholder={t("skillsUi.extraInformationPlaceholder")} />
                </Form.Item>
            </Form>
        </AppDrawer>
    );
}

function adminInfoNotice(skill: Skill | null) {
    const base = "这里只修改名称、简介、分类和展示信息；正文与附属文件请在技能工作台中编辑。公开状态由作者决定，不在后台修改。";
    if (skill?.sourceType === "builtin") return `${base}保存后，系统升级时不再用内置版本覆盖这些信息。`;
    if (skill?.sourceType === "github") return `${base}保存后，GitHub 同步不再覆盖名称和简介，文件内容仍以仓库为准。`;
    return base;
}

function emptyMedia(): SkillShowcaseMedia {
    return { type: "image", showcaseUri: "", showcaseUrl: "" };
}
