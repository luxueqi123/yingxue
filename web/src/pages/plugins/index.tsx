import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { App, Button, Input, Modal, Typography } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { AudioLines, CalendarDays, CheckCircle2, Clock3, CreditCard, ExternalLink, Film, FolderOpen, Image as ImageIcon, MessageSquareText, PlugZap, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/ui/product/empty-state";
import { PageHeader } from "@/components/layout/workspace-page";
import { listRegisteredPlugins } from "@/lib/plugins/plugin-registry";
import { pluginMatchesSearch } from "@/lib/plugins/plugin-search";
import "@/lib/plugins/builtin";
import { EAGLE_PLUGIN_ID } from "@/lib/plugins/builtin/eagle";
import { PROMPT_OPTIMIZER_PLUGIN_ID } from "@/lib/plugins/builtin/prompt-optimizer";
import { RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";
import { isOfficialApplicationPluginId } from "@/lib/plugins/official-applications";
import type { AnyPluginManifest as PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import { getEagleLibrary, type EagleFolder } from "@/services/api/eagle";
import { fetchPlugins, setUserPluginEnabled, type BackendPlugin, type PluginState } from "@/services/api/plugins";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { usePluginStore } from "@/stores/use-plugin-store";
import { useUserStore } from "@/stores/use-user-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceLocale, InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";

import { PluginDetailsModal } from "./plugin-documentation-modals";
import "./plugins.css";
import { Select } from "@/components/ui/base/select";

const categoryLabels: Readonly<Partial<Record<string, InterfaceMessageKey>>> = {
    provider: "pluginUi.categoryProvider",
    "payment-provider": "pluginUi.categoryPayment",
    "canvas-node": "pluginUi.categoryCanvasNode",
    workflow: "pluginUi.categoryWorkflow",
    transform: "pluginUi.categoryTransform",
    "asset-source": "pluginUi.categoryAssetSource",
    "ai-capability": "pluginUi.categoryAi",
    "usage-observer": "pluginUi.categoryUsage",
    agent: "pluginUi.categoryAgent",
    "import-export": "pluginUi.categoryImportExport",
} as const;

const surfaceLabels: Readonly<Partial<Record<string, InterfaceMessageKey>>> = {
    node: "pluginUi.surfaceNode",
    fullscreen: "pluginUi.surfaceFullscreen",
    hybrid: "pluginUi.surfaceHybrid",
    "asset-source": "pluginUi.surfaceAssetLibrary",
} as const;

const permissionLabels: Readonly<Partial<Record<string, InterfaceMessageKey>>> = {
    "canvas.read": "pluginUi.permissionCanvasRead",
    "canvas.write": "pluginUi.permissionCanvasWrite",
    "asset.read": "pluginUi.permissionAssetRead",
    "asset.search": "pluginUi.permissionAssetSearch",
    "asset.import": "pluginUi.permissionAssetImport",
    "asset.upload": "pluginUi.permissionAssetUpload",
    "generation.run": "pluginUi.permissionGenerationRun",
    "ai.text": "pluginUi.permissionAiText",
    "media.read": "pluginUi.permissionMediaRead",
    "external.open": "pluginUi.permissionExternalOpen",
} as const;

const protocolSectionMeta = [
    { key: "text", label: "pluginUi.protocolText", description: "pluginUi.protocolTextDescription", icon: MessageSquareText },
    { key: "image", label: "pluginUi.protocolImage", description: "pluginUi.protocolImageDescription", icon: ImageIcon },
    { key: "video", label: "pluginUi.protocolVideo", description: "pluginUi.protocolVideoDescription", icon: Film },
    { key: "audio", label: "pluginUi.protocolAudio", description: "pluginUi.protocolAudioDescription", icon: AudioLines },
    { key: "payment", label: "pluginUi.protocolPayment", description: "pluginUi.protocolPaymentDescription", icon: CreditCard },
] as const;

export default function PluginsPage() {
    const { message } = App.useApp();
    const { locale, t } = useInterfaceTranslation();
    const navigate = useNavigate();
    const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }), [locale]);
    const listSeparator = locale.startsWith("zh-") ? "、" : ", ";
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const user = useUserStore((state) => state.user);
    const features = useUserStore((state) => state.features);
    const installations = usePluginStore((state) => state.installations);
    const ensurePlugin = usePluginStore((state) => state.ensurePlugin);
    const setEnabled = usePluginStore((state) => state.setEnabled);
    const setRuntimeStatuses = usePluginStore((state) => state.setRuntimeStatuses);
    const setPluginStates = usePluginStore((state) => state.setPluginStates);
    const pluginStates = usePluginStore((state) => state.pluginStates);
    const updateConfig = usePluginStore((state) => state.updateConfig);
    const builtinPlugins = useMemo(() => listRegisteredPlugins(), []);
    const [backendPlugins, setBackendPlugins] = useState<BackendPlugin[]>([]);
    const [backendPluginsLoading, setBackendPluginsLoading] = useState(false);
    const [settingsPluginId, setSettingsPluginId] = useState<string | null>(null);
    const [detailsPluginId, setDetailsPluginId] = useState<string | null>(null);
    const [detailsRestoreFocus, setDetailsRestoreFocus] = useState(false);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
    const [trustFilter, setTrustFilter] = useState<"all" | "trusted">("all");
    const [eagleBaseUrl, setEagleBaseUrl] = useState("http://localhost:41595");
    const [eagleAutoUploadGenerated, setEagleAutoUploadGenerated] = useState(false);
    const [eagleGeneratedFolderId, setEagleGeneratedFolderId] = useState("");
    const [eagleFolders, setEagleFolders] = useState<EagleFolder[]>([]);
    const [eagleFoldersLoading, setEagleFoldersLoading] = useState(false);
    const [eagleFoldersError, setEagleFoldersError] = useState("");

    useEffect(() => {
        for (const plugin of builtinPlugins) ensurePlugin(plugin.manifest);
    }, [builtinPlugins, ensurePlugin]);

    const reloadBackendPlugins = async () => {
        setBackendPluginsLoading(true);
        try {
            const result = await fetchPlugins();
            setBackendPlugins(result.plugins);
            setPluginStates(result.states);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("pluginUi.readFailed"));
            setBackendPlugins([]);
        } finally {
            setBackendPluginsLoading(false);
        }
    };

    useEffect(() => {
        void reloadBackendPlugins();
    }, [user?.id]);

    const remotePlugins = useMemo(() => backendPlugins.map(toRegisteredPlugin), [backendPlugins]);
    const registeredPlugins = useMemo(() => {
        const byId = new Map(builtinPlugins.map((plugin) => [plugin.manifest.id, plugin]));
        for (const plugin of remotePlugins) byId.set(plugin.manifest.id, plugin);
        return [...byId.values()];
    }, [builtinPlugins, remotePlugins]);
    const backendPluginById = useMemo(() => new Map(backendPlugins.map((plugin) => [plugin.manifest.id, plugin])), [backendPlugins]);

    const eagle = installations.find((item) => item.manifest.id === EAGLE_PLUGIN_ID);

    useEffect(() => {
        const configured = eagle?.config.baseUrl;
        if (typeof configured === "string" && configured.trim()) setEagleBaseUrl(configured);
        const autoUpload = eagle?.config.autoUploadGenerated;
        setEagleAutoUploadGenerated(autoUpload === true || autoUpload === "true");
        const folderId = eagle?.config.generatedFolderId;
        setEagleGeneratedFolderId(typeof folderId === "string" ? folderId : "");
    }, [eagle?.config.baseUrl, eagle?.config.autoUploadGenerated, eagle?.config.generatedFolderId]);

    const filteredPlugins = useMemo(() => {
        return registeredPlugins.filter((plugin) => {
            const state = pluginStates[plugin.manifest.id];
            const isApplicationPlugin = backendPluginById.get(plugin.manifest.id)?.management.kind === "application" || isOfficialApplicationPluginId(plugin.manifest.id);
            if (user?.role !== "admin" && !features.systemPluginsVisibleToUsers && !isApplicationPlugin) return false;
            const installation = installations.find((item) => item.manifest.id === plugin.manifest.id);
            const enabled = state?.effectiveEnabled ?? Boolean(installation?.enabled);
            const manifest = plugin.manifest;
            if (!pluginMatchesSearch(manifest, search)) return false;
            const contributionKinds = contributionKindsFor(manifest);
            const searchableText = [manifest.name, manifest.description, manifest.author, manifest.id, ...contributionKinds.map((kind) => categoryLabel(t, kind))].filter(Boolean).join(" ").toLocaleLowerCase(locale);
            if (categoryFilter !== "all" && !pluginMatchesCategory(manifest, categoryFilter)) return false;
            if (trustFilter === "trusted" && !manifest.trusted) return false;
            if (statusFilter === "enabled" && !enabled) return false;
            if (statusFilter === "disabled" && enabled) return false;
            return true;
        });
    }, [backendPluginById, categoryFilter, features.systemPluginsVisibleToUsers, installations, locale, pluginStates, registeredPlugins, search, statusFilter, trustFilter, user?.role]);

    const pluginSections = useMemo(
        () =>
            [
                ...protocolSectionMeta.map((section) => ({
                    ...section,
                    label: t(section.label),
                    description: t(section.description),
                    plugins: filteredPlugins.filter((plugin) => pluginMatchesCategory(plugin.manifest, section.key)),
                })),
                {
                    key: "other",
                    label: t("pluginUi.categoryApps"),
                    description: t("pluginUi.appsDescription"),
                    icon: PlugZap,
                    plugins: filteredPlugins.filter((plugin) => pluginMatchesCategory(plugin.manifest, "other")),
                },
            ].filter((section) => categoryFilter === "all" || section.key === categoryFilter),
        [categoryFilter, filteredPlugins, locale],
    );

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const selectCategory = (key: string) => {
        setCategoryFilter(key);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    };

    const categoryCounts = useMemo(() => {
        const visiblePlugins = registeredPlugins.filter((plugin) => user?.role === "admin" || features.systemPluginsVisibleToUsers || isOfficialApplicationPluginId(plugin.manifest.id));
        const counts: Record<string, number> = { all: visiblePlugins.length, text: 0, image: 0, video: 0, audio: 0, payment: 0, other: 0 };
        for (const plugin of visiblePlugins) {
            for (const section of protocolSectionMeta) {
                if (pluginMatchesCategory(plugin.manifest, section.key)) counts[section.key] += 1;
            }
            if (pluginMatchesCategory(plugin.manifest, "other")) counts.other += 1;
        }
        return counts;
    }, [features.systemPluginsVisibleToUsers, registeredPlugins, user?.role]);

    const settingsPlugin = settingsPluginId ? registeredPlugins.find((plugin) => plugin.manifest.id === settingsPluginId) : undefined;
    const settingsInstallation = settingsPlugin ? installations.find((item) => item.manifest.id === settingsPlugin.manifest.id) : undefined;
    const settingsEnabled = settingsPlugin ? (pluginStates[settingsPlugin.manifest.id]?.effectiveEnabled ?? Boolean(settingsInstallation?.enabled)) : false;
    const detailsPlugin = detailsPluginId ? registeredPlugins.find((plugin) => plugin.manifest.id === detailsPluginId) : undefined;

    const hasPluginConfiguration = (plugin: RegisteredPlugin) => Boolean(plugin.manifest.configuration?.fields?.length);
    const canConfigurePlugin = (plugin: RegisteredPlugin) => Boolean(pluginStates[plugin.manifest.id]?.canConfigure) && (hasPluginConfiguration(plugin) || plugin.manifest.id === RUNNINGHUB_PLUGIN_ID);

    const isPluginEnabled = (plugin: RegisteredPlugin, installation = installations.find((item) => item.manifest.id === plugin.manifest.id)) => pluginStates[plugin.manifest.id]?.effectiveEnabled ?? Boolean(installation?.enabled);

    const togglePlugin = async (plugin: RegisteredPlugin, enabled: boolean) => {
        try {
            const next = await setUserPluginEnabled(plugin.manifest.id, enabled);
            setEnabled(plugin.manifest.id, enabled);
            setPluginStates({ ...usePluginStore.getState().pluginStates, [next.pluginId]: next });
            if (next.pluginId === RUNNINGHUB_PLUGIN_ID) {
                setRuntimeStatuses({ ...usePluginStore.getState().runtimeStatuses, [next.pluginId]: next.effectiveEnabled ? "enabled" : "disabled" });
            }
            message.success(t(enabled ? "pluginUi.pluginEnabled" : "pluginUi.pluginDisabled", { name: plugin.manifest.name }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("pluginUi.updatePluginFailed"));
        }
    };

    const loadEagleFolders = async (url = eagleBaseUrl) => {
        setEagleFoldersLoading(true);
        setEagleFoldersError("");
        try {
            const result = await getEagleLibrary(url.trim().replace(/\/$/, ""));
            setEagleFolders(result.library.folders || []);
        } catch (reason) {
            setEagleFoldersError(reason instanceof Error ? reason.message : t("pluginUi.eagleFolderReadFailed"));
            setEagleFolders([]);
        } finally {
            setEagleFoldersLoading(false);
        }
    };

    const saveEagleConfig = () => {
        const baseUrl = eagleBaseUrl.trim().replace(/\/$/, "");
        if (!/^https?:\/\//i.test(baseUrl)) {
            message.error(t("pluginUi.eagleAddressInvalid"));
            return;
        }
        updateConfig(EAGLE_PLUGIN_ID, { baseUrl, autoUploadGenerated: eagleAutoUploadGenerated, generatedFolderId: eagleGeneratedFolderId });
        message.success(t("pluginUi.eagleConfigSaved"));
    };

    return (
        <main className="app-workspace-page plugins-page flex h-full min-h-0 flex-col text-foreground">
            <div ref={scrollContainerRef} className="app-workspace-scroll min-h-0 flex-1 overflow-y-auto">
                <div className="plugins-page-layout">
                    <aside className="plugins-sidebar" aria-label={t("pluginUi.filterLabel")}>
                        <div className="plugins-sidebar-heading">
                            <PageHeader title={t("plugins")} description={t("pluginUi.pageDescription")} />
                        </div>
                        <nav className="plugins-sidebar-nav">
                            <button type="button" className={`plugins-sidebar-item${categoryFilter === "all" ? " is-active" : ""}`} aria-current={categoryFilter === "all" ? "page" : undefined} onClick={() => selectCategory("all")}>
                                <span className="plugins-sidebar-item-label">
                                    <PlugZap className="size-4" />
                                    {t("pluginUi.allPlugins")}
                                </span>
                                <span>{categoryCounts.all}</span>
                            </button>
                            {protocolSectionMeta.map((section) => {
                                const SectionIcon = section.icon;
                                return (
                                    <button
                                        key={section.key}
                                        type="button"
                                        className={`plugins-sidebar-item${categoryFilter === section.key ? " is-active" : ""}`}
                                        aria-current={categoryFilter === section.key ? "page" : undefined}
                                        onClick={() => selectCategory(section.key)}
                                    >
                                        <span className="plugins-sidebar-item-label">
                                            <SectionIcon className="size-4" />
                                            {t(section.label)}
                                        </span>
                                        <span>{categoryCounts[section.key] || 0}</span>
                                    </button>
                                );
                            })}
                            <button type="button" className={`plugins-sidebar-item${categoryFilter === "other" ? " is-active" : ""}`} aria-current={categoryFilter === "other" ? "page" : undefined} onClick={() => selectCategory("other")}>
                                <span className="plugins-sidebar-item-label">
                                    <PlugZap className="size-4" />
                                    {t("pluginUi.categoryApps")}
                                </span>
                                <span>{categoryCounts.other}</span>
                            </button>
                        </nav>
                    </aside>
                    <div className="plugins-page-content">
                        <CollectionToolbar
                            label={t("pluginUi.filterLabel")}
                            trailing={
                                <div className="plugins-toolbar-actions">
                                    <Button icon={<RefreshCw className="size-4" />} loading={backendPluginsLoading} onClick={() => void reloadBackendPlugins()}>
                                        {t("pluginUi.refreshPlugins")}
                                    </Button>
                                    {user?.role === "admin" ? (
                                        <Button type="primary" onClick={() => navigate("/admin/plugins")}>
                                            {t("pluginUi.adminManage")}
                                        </Button>
                                    ) : null}
                                </div>
                            }
                        >
                            <Input
                                className="plugins-search"
                                prefix={<Search className="size-4 text-foreground/38" aria-hidden="true" />}
                                value={search}
                                allowClear
                                placeholder={t("pluginUi.searchPlaceholder")}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                            <Select
                                className="plugins-filter"
                                value={statusFilter}
                                options={[
                                    { value: "all", label: t("pluginUi.statusAll") },
                                    { value: "enabled", label: t("pluginUi.statusEnabled") },
                                    { value: "disabled", label: t("pluginUi.statusDisabled") },
                                ]}
                                onChange={(value) => setStatusFilter(value as "all" | "enabled" | "disabled")}
                                aria-label={t("pluginUi.statusFilterAria")}
                            />
                            <Select
                                className="plugins-filter"
                                value={trustFilter}
                                options={[
                                    { value: "all", label: t("pluginUi.sourceAll") },
                                    { value: "trusted", label: t("pluginUi.sourceTrusted") },
                                ]}
                                onChange={(value) => setTrustFilter(value as "all" | "trusted")}
                                aria-label={t("pluginUi.sourceFilterAria")}
                            />
                        </CollectionToolbar>

                        {filteredPlugins.length ? (
                            <div className="plugins-sections">
                                {pluginSections.map((section) => {
                                    const SectionIcon = section.icon;
                                    return (
                                        <section
                                            key={section.key}
                                            id={`plugin-section-${section.key}`}
                                            className="plugin-section"
                                            data-category={section.key === "image" ? "creative" : section.key === "video" ? "drama" : section.key === "audio" ? "social" : section.key === "payment" ? "ecommerce" : undefined}
                                        >
                                            <header className="plugin-section-heading">
                                                <span className="plugin-section-icon">
                                                    <SectionIcon className="size-4" />
                                                </span>
                                                <div>
                                                    <h2>{section.label}</h2>
                                                    <p>{section.description}</p>
                                                </div>
                                                <span className="plugin-section-count">{section.plugins.length}</span>
                                            </header>
                                            {section.plugins.length ? (
                                                <div className="plugins-grid">
                                                    {section.plugins.map((plugin) => {
                                                        const installation = installations.find((item) => item.manifest.id === plugin.manifest.id);
                                                        const remote = backendPluginById.get(plugin.manifest.id);
                                                        const enabled = isPluginEnabled(plugin, installation);
                                                        const trusted = Boolean(plugin.manifest.trusted);
                                                        const state = pluginStates[plugin.manifest.id];
                                                        const sourceKey = pluginSourceKey(plugin, state);
                                                        const sourceLabel = t(sourceKey);
                                                        const canConfigure = canConfigurePlugin(plugin);
                                                        return (
                                                            <section key={plugin.manifest.id} className={`product-collection-card plugin-card library-card-surface${trusted ? " is-trusted" : ""}`}>
                                                                <button
                                                                    type="button"
                                                                    className="plugin-card-main"
                                                                    aria-label={t("pluginUi.viewDocAria", { name: plugin.manifest.name })}
                                                                    onClick={(event) => {
                                                                        const openedByKeyboard = event.detail === 0;
                                                                        setDetailsRestoreFocus(openedByKeyboard);
                                                                        setDetailsPluginId(plugin.manifest.id);
                                                                        if (!openedByKeyboard) event.currentTarget.blur();
                                                                    }}
                                                                >
                                                                    <div className="plugin-card-heading">
                                                                        <span className={`plugin-icon-tile${trusted ? " is-trusted" : ""}`} aria-hidden="true">
                                                                            <SectionIcon className="size-5" />
                                                                        </span>
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="plugin-card-title-row">
                                                                                <h3>{plugin.manifest.name}</h3>
                                                                                <span className="plugin-version">v{plugin.manifest.version}</span>
                                                                            </div>
                                                                            <div className="plugin-card-labels">
                                                                                <span className={`plugin-source-label${sourceKey === "pluginUi.sourceSystem" ? " is-system" : ""}`}>{sourceLabel}</span>
                                                                                {trusted ? (
                                                                                    <span className="plugin-trust-label">
                                                                                        <ShieldCheck className="size-3.5" />
                                                                                        {t("pluginUi.trustedPlugin")}
                                                                                    </span>
                                                                                ) : null}
                                                                                <span className="plugin-category-label">
                                                                                    {contributionKindsFor(plugin.manifest)
                                                                                        .map((kind) => categoryLabel(t, kind))
                                                                                        .join(" · ")}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <p className="plugin-card-description">{plugin.manifest.description}</p>

                                                                    <div className="plugin-card-meta">
                                                                        <span>
                                                                            <CalendarDays className="size-3.5" />
                                                                            {t("pluginUi.publishedDate", { date: formatPluginDate(plugin.manifest.publishedAt, t, dateFormatter) })}
                                                                        </span>
                                                                        <span>
                                                                            <Clock3 className="size-3.5" />
                                                                            {t("pluginUi.updatedDate", { date: formatPluginDate(plugin.manifest.updatedAt, t, dateFormatter) })}
                                                                        </span>
                                                                    </div>

                                                                    <div className="plugin-card-tags">
                                                                        {(plugin.manifest.surfaces || []).map((surface) => (
                                                                            <span key={surface}>{surfaceLabel(t, surface)}</span>
                                                                        ))}
                                                                        {(plugin.manifest.contributes.providers || []).flatMap((provider) =>
                                                                            provider.capabilities.map((capability) => (
                                                                                <span key={`${provider.id}-${capability}`} title={`Provider：${provider.label}（${provider.id}）`}>
                                                                                    {provider.kind === "processing" ? "处理工具" : "生成协议"} · {provider.kind === "processing" ? `${capabilityLabel(t, capability)}处理` : `${capabilityLabel(t, capability)}生成`}
                                                                                </span>
                                                                            )),
                                                                        )}
                                                                        {plugin.manifest.contributes.providers?.some((provider) => provider.poll) ? <span>异步轮询</span> : null}
                                                                        <span>{plugin.manifest.permissions.length} 项能力</span>
                                                                    </div>
                                                                </button>

                                                                <div className="plugin-card-actions">
                                                                    <span role="status" className={`settings-channel-status ${enabled ? "is-ready" : ""}`}>
                                                                        <i aria-hidden="true" />
                                                                        {!state?.platformAvailable && state?.blockedReason ? state.blockedReason : t(enabled ? "pluginUi.statusEnabled" : "pluginUi.statusDisabled")}
                                                                    </span>
                                                                    <Switch
                                                                        className="plugin-state-switch"
                                                                        disabled={!state?.canToggle}
                                                                        checked={enabled}
                                                                        aria-label={t(enabled ? "pluginUi.toggleEnabledAria" : "pluginUi.toggleDisabledAria", { name: plugin.manifest.name })}
                                                                        title={state?.blockedReason}
                                                                        onChange={(checked) => void togglePlugin(plugin, checked)}
                                                                    />
                                                                    {canConfigure ? (
                                                                        <Button
                                                                            className="plugin-settings-button"
                                                                            icon={<Settings2 className="size-4" />}
                                                                            aria-expanded={settingsPluginId === plugin.manifest.id}
                                                                            aria-haspopup="dialog"
                                                                            onClick={() => setSettingsPluginId(plugin.manifest.id)}
                                                                        >
                                                                            {t("pluginUi.pluginSettings")}
                                                                        </Button>
                                                                    ) : null}
                                                                </div>

                                                                {installation?.lastError || remote?.error ? (
                                                                    <Typography.Text type="danger" className="plugin-error" role="alert">
                                                                        {installation?.lastError || remote?.error}
                                                                    </Typography.Text>
                                                                ) : null}
                                                            </section>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="plugin-section-empty-hint">
                                                    <span>{t("pluginUi.noPluginType")}</span>
                                                </div>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyState
                                className="min-h-[260px] rounded-[var(--plugins-card-radius)] bg-foreground/[0.03]"
                                icon={SlidersHorizontal}
                                title={t("pluginUi.emptyTitle")}
                                description={t("pluginUi.emptyDescription")}
                                action={
                                    <Button
                                        onClick={() => {
                                            setSearch("");
                                            setCategoryFilter("all");
                                            setStatusFilter("all");
                                            setTrustFilter("all");
                                        }}
                                    >
                                        {t("pluginUi.clearFilters")}
                                    </Button>
                                }
                            />
                        )}

                        <Modal
                            className="workspace-modal workspace-modal-wide plugin-settings-modal"
                            title={settingsPlugin ? t("pluginUi.settingsTitle", { name: settingsPlugin.manifest.name }) : null}
                            open={Boolean(settingsPlugin)}
                            centered
                            footer={null}
                            destroyOnHidden
                            onCancel={() => setSettingsPluginId(null)}
                            styles={{ body: { maxHeight: "min(72vh, 760px)", overflowY: "auto", overscrollBehavior: "contain" } }}
                        >
                            {settingsPlugin ? (
                                <div className="plugin-settings-panel plugin-settings-modal-panel">
                                    <div className="plugin-settings-heading">
                                        <div>
                                            <p>{t("pluginUi.configurationIntro")}</p>
                                        </div>
                                        {settingsPlugin.manifest.trusted ? (
                                            <span className="plugin-trust-label">
                                                <ShieldCheck className="size-3.5" />
                                                {t("pluginUi.trustedPlugin")}
                                            </span>
                                        ) : (
                                            <span className="plugin-category-label">{t("pluginUi.thirdParty")}</span>
                                        )}
                                    </div>

                                    {settingsPlugin.manifest.id === EAGLE_PLUGIN_ID ? (
                                        <>
                                            <div className="plugin-settings-fields">
                                                <div className="min-w-0">
                                                    <label htmlFor="eagle-base-url">{t("pluginUi.eagleApiLabel")}</label>
                                                    <Input id="eagle-base-url" aria-label={t("pluginUi.eagleApiLabel")} value={eagleBaseUrl} onChange={(event) => setEagleBaseUrl(event.target.value)} placeholder="http://localhost:41595" />
                                                    <p>{t("pluginUi.eagleApiHint", { brand: brandName })}</p>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="plugin-setting-label-row">
                                                        <label htmlFor="eagle-auto-upload-generated">{t("pluginUi.eagleAutoArchive")}</label>
                                                        <Switch id="eagle-auto-upload-generated" checked={eagleAutoUploadGenerated} onChange={setEagleAutoUploadGenerated} aria-label={t("pluginUi.eagleAutoArchiveAria")} />
                                                    </div>
                                                    <p>{t("pluginUi.eagleAutoArchiveHint", { brand: brandName })}</p>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="plugin-setting-label-row">
                                                        <label htmlFor="eagle-generated-folder">{t("pluginUi.eagleFolderLabel")}</label>
                                                        <Button type="link" size="small" loading={eagleFoldersLoading} onClick={() => void loadEagleFolders()}>
                                                            {t("pluginUi.readEagleFolders")}
                                                        </Button>
                                                    </div>
                                                    <Select
                                                        id="eagle-generated-folder"
                                                        aria-label={t("pluginUi.eagleFolderLabel")}
                                                        showSearch
                                                        allowClear
                                                        value={eagleGeneratedFolderId || undefined}
                                                        placeholder={t("pluginUi.eagleRoot")}
                                                        optionFilterProp="label"
                                                        options={[{ value: "__root__", label: t("pluginUi.eagleRoot") }, ...eagleFolderOptions(eagleFolders, locale)]}
                                                        onChange={(value) => setEagleGeneratedFolderId(value === "__root__" || !value ? "" : value)}
                                                    />
                                                    <p>{eagleFoldersError || t("pluginUi.eagleDefaultFolderHint")}</p>
                                                </div>
                                            </div>
                                            <div className="plugin-settings-actions">
                                                <Button type="primary" icon={<CheckCircle2 className="size-4" />} onClick={saveEagleConfig}>
                                                    {t("pluginUi.saveConfig")}
                                                </Button>
                                                <Button icon={<FolderOpen className="size-4" />} disabled={!settingsEnabled} onClick={() => navigate("/plugins/eagle", { state: { returnTo: "/plugins" } })}>
                                                    {t("pluginUi.openEagleLibrary")}
                                                </Button>
                                                <Button icon={<ExternalLink className="size-4" />} href="https://api.eagle.cool/" target="_blank">
                                                    {t("pluginUi.viewApi")}
                                                </Button>
                                            </div>
                                        </>
                                    ) : settingsPlugin.manifest.id === PROMPT_OPTIMIZER_PLUGIN_ID ? (
                                        <div className="rounded-[var(--r-md)] border border-border/60 bg-muted/25 px-3 py-3 text-[var(--fs-body)] leading-6 text-foreground/70">
                                            <p>{t("pluginUi.promptOptimizerHint")}</p>
                                            <p className="mt-2 text-[var(--fs-micro)] text-foreground/50">{t("pluginUi.promptOptimizerNoOverwrite")}</p>
                                        </div>
                                    ) : settingsPlugin.manifest.id === RUNNINGHUB_PLUGIN_ID ? (
                                        <div className="plugin-settings-empty">
                                            <p>{t("pluginUi.runningHubHint")}</p>
                                            <Button
                                                type="primary"
                                                icon={<ExternalLink className="size-4" />}
                                                onClick={() => {
                                                    setSettingsPluginId(null);
                                                    navigate("/settings?section=runninghub");
                                                }}
                                            >
                                                {t("pluginUi.openWorkflowSettings")}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="plugin-settings-empty">
                                            {t("pluginUi.capabilitySummary", {
                                                capabilities:
                                                    contributionKindsFor(settingsPlugin.manifest)
                                                        .map((kind) => categoryLabel(t, kind))
                                                        .join(listSeparator) || t("pluginUi.notDeclared"),
                                            })}
                                        </div>
                                    )}

                                    <div className="plugin-permissions">
                                        <div>
                                            <span>{t("pluginUi.surfaceHeading")}</span>
                                            {(settingsPlugin.manifest.surfaces || []).map((surface) => surfaceLabel(t, surface)).join(listSeparator) || t("pluginUi.surfaceFallback")}
                                        </div>
                                        <div>
                                            <span>{t("pluginUi.permissionHeading")}</span>
                                            {settingsPlugin.manifest.permissions.map((permission) => (permissionLabels[permission] ? t(permissionLabels[permission]) : permission)).join(listSeparator)}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </Modal>
                        <PluginDetailsModal plugin={detailsPlugin} restoreFocus={detailsRestoreFocus} onClose={() => setDetailsPluginId(null)} />
                    </div>
                </div>
            </div>
        </main>
    );
}

function formatPluginDate(value: string | undefined, t: InterfaceTranslate, formatter: Intl.DateTimeFormat) {
    const fallback = t("pluginUi.notRecorded");
    if (!value) return fallback;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? formatter.format(timestamp) : fallback;
}

function toRegisteredPlugin(plugin: BackendPlugin): RegisteredPlugin {
    return { manifest: plugin.manifest, source: plugin.source };
}

function pluginSourceKey(plugin: RegisteredPlugin, state?: PluginState): "pluginUi.sourceCustom" | "pluginUi.sourceSystem" | "pluginUi.sourceOfficial" {
    if (plugin.source === "uploaded") return "pluginUi.sourceCustom";
    if (plugin.source === "system") return "pluginUi.sourceSystem";
    if (state?.canToggle || isOfficialApplicationPluginId(plugin.manifest.id)) return "pluginUi.sourceOfficial";
    return "pluginUi.sourceSystem";
}

function categoryLabel(t: InterfaceTranslate, kind: string) {
    const key = categoryLabels[kind];
    return key ? t(key) : kind;
}

function surfaceLabel(t: InterfaceTranslate, surface: string) {
    const key = surfaceLabels[surface];
    return key ? t(key) : surface;
}

function contributionKindsFor(manifest: PluginManifest): string[] {
    const contributions = manifest.contributes;
    const kinds: string[] = [];
    if (contributions.providers?.length) kinds.push("provider");
    if (contributions.paymentProviders?.length) kinds.push("payment-provider");
    if (contributions.workflows?.length) kinds.push("workflow");
    if (contributions.canvasNodes?.length) kinds.push("canvas-node");
    if (contributions.transforms?.length) kinds.push("transform");
    if (contributions.assetSources?.length) kinds.push("asset-source");
    if (contributions.aiCapabilities?.length) kinds.push("ai-capability");
    if (contributions.usageObservers?.length) kinds.push("usage-observer");
    if (contributions.agents?.length) kinds.push("agent");
    if (contributions.importExport?.length) kinds.push("import-export");
    return kinds;
}

function providerCapabilitiesFor(manifest: PluginManifest) {
    return [...new Set((manifest.contributes.providers || []).flatMap((provider) => provider.capabilities))];
}

function pluginMatchesCategory(manifest: PluginManifest, category: string) {
    const providerCapabilities = providerCapabilitiesFor(manifest);
    const isPaymentProtocol = Boolean(manifest.contributes.paymentProviders?.length);
    if (category === "payment") return isPaymentProtocol;
    if (category === "other") return !isPaymentProtocol && providerCapabilities.length === 0;
    return providerCapabilities.includes(category as "text" | "image" | "video" | "audio");
}

function capabilityLabel(t: InterfaceTranslate, value: string) {
    const key: Readonly<Partial<Record<string, InterfaceMessageKey>>> = {
        text: "pluginUi.capabilityText",
        image: "pluginUi.capabilityImage",
        video: "pluginUi.capabilityVideo",
        audio: "pluginUi.capabilityAudio",
    };
    return key[value] ? t(key[value]) : value;
}

function eagleFolderOptions(folders: EagleFolder[], locale: InterfaceLocale) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const pathFor = (folder: EagleFolder) => {
        const path: string[] = [];
        const seen = new Set<string>();
        let current: EagleFolder | undefined = folder;
        while (current && !seen.has(current.id)) {
            seen.add(current.id);
            path.unshift(current.name);
            current = current.parentId ? byId.get(current.parentId) : undefined;
        }
        return path.join(" / ");
    };
    const collator = new Intl.Collator(locale);
    return folders.map((folder) => ({ value: folder.id, label: pathFor(folder) })).sort((left, right) => collator.compare(left.label, right.label));
}
