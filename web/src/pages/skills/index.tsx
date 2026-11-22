import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { AppModal } from "@/components/ui/product/app-modal";
import { App, Button, Dropdown, Input } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";

import {
    Boxes,
    Check,
    ChevronDown,
    ChevronRight,
    Clapperboard,
    FolderInput,
    FolderPlus,
    Globe2,
    Heart,
    LayoutGrid,
    Library,
    LoaderCircle,
    Lock,
    Megaphone,
    MoreHorizontal,
    Palette,
    Pencil,
    Plus,
    Puzzle,
    Search,
    ShoppingBag,
    Sparkles,
    Trash2,
    UserRound,
    Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceState } from "@/components/layout/workspace-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { publishedSkills } from "@/lib/published-production-assets";
import { fallbackSkillCategories, formatSkillCount, skillAccent, skillCategoryLabel, skillGlyph } from "@/pages/skills/skill-catalog";
import { cn } from "@/lib/utils";
import { SkillDetailModal } from "@/pages/skills/skill-detail-drawer";
import { SkillEditorDrawer } from "@/pages/skills/skill-editor-drawer";
import { SkillInstallModal } from "@/pages/skills/skill-install-modal";
import { SkillRecommendationsModal } from "@/components/skills/skill-recommendations-modal";
import {
    addSkill,
    createSkillLibraryCategory,
    deleteSkill,
    deleteSkillLibraryCategory,
    getSkill,
    likeSkill,
    listSkillLibraryCategories,
    listSkills,
    removeSkill,
    setSkillLibraryCategory,
    syncSkill,
    unlikeSkill,
    type Skill,
    type SkillCategory,
    type SkillLibraryCategory,
    type SkillLibraryCategoryList,
    type SkillScope,
    type SkillSort,
} from "@/services/api/skills";
import { useSkillAdministrationAccess } from "@/lib/skill-access";
import { Select } from "@/components/ui/base/select";
import { useNavigate } from "react-router";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceLocale, InterfaceTranslate } from "@/lib/interface-locale";

const scopeOptions = [
    { labelKey: "skillsUi.scopeMarketplace", value: "public", icon: Sparkles },
    { labelKey: "skillsUi.scopeMine", value: "mine", icon: Library },
    { labelKey: "skillsUi.scopeCreated", value: "created", icon: UserRound },
    { labelKey: "skillsUi.scopeFavorites", value: "favorites", icon: Heart },
] as const;

/* 分类图标映射：左侧分类导航，未知分类回退 Boxes。 */
const categoryIcons: Record<string, LucideIcon> = {
    drama: Clapperboard,
    ecommerce: ShoppingBag,
    creative: Palette,
    social: Megaphone,
    others: Puzzle,
};
const categoryIconOf = (value: string) => categoryIcons[value] ?? Boxes;

const sortOptions = [
    { labelKey: "skillsUi.sortPopular", value: "popular" },
    { labelKey: "skillsUi.sortNewest", value: "new" },
    { labelKey: "skillsUi.sortRecentlyUpdated", value: "updated" },
] as const;

import { useSkillCuration, curationQuery, curationIcon, effectiveCurationRoot } from "@/components/skills/skill-curation-browser";

export default function SkillsPage() {
    const { t, locale } = useInterfaceTranslation();
    const { curation, error: curationError, retry: retryCuration } = useSkillCuration();
    const [platformCategory, setPlatformCategory] = useState("");
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const [scope, setScope] = useState<SkillScope>("public");
    const [sort, setSort] = useState<SkillSort>("popular");
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search, 250);
    const [tag, setTag] = useState("all");
    const [libraryCategoryId, setLibraryCategoryId] = useState("all");
    const [libraryCategoryList, setLibraryCategoryList] = useState<SkillLibraryCategoryList | null>(null);
    const [libraryCategoryError, setLibraryCategoryError] = useState("");
    const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
    const [categoryName, setCategoryName] = useState("");
    const [categoryScope, setCategoryScope] = useState<"personal" | "platform">("personal");
    const [categorySaving, setCategorySaving] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [skills, setSkills] = useState<Skill[]>([]);
    const [categories, setCategories] = useState<SkillCategory[]>(fallbackSkillCategories);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState<Partial<Record<SkillScope, number>>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [mutatingID, setMutatingID] = useState("");
    const [editorOpen, setEditorOpen] = useState(false);
    const [installOpen, setInstallOpen] = useState(false);
    const [recommendationsOpen, setRecommendationsOpen] = useState(false);
    const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
    const isAdmin = useSkillAdministrationAccess();
    const isLibraryScope = scope === "mine" || scope === "created";
    const libraryCategoryScope = scope === "created" ? "created" : "mine";

    const reload = useCallback(() => setReloadKey((value) => value + 1), []);
    const selectScope = (next: SkillScope) => {
        setScope(next);
        setTag("all");
        setPlatformCategory("");
        setLibraryCategoryId("all");
        setPage(1);
    };
    const selectMarketplaceCategory = (categoryId: string, nextPlatformCategory = "") => {
        setTag(categoryId);
        setPlatformCategory(nextPlatformCategory);
        setPage(1);
    };
    const selectLibraryCategory = (categoryId: string) => {
        setLibraryCategoryId(categoryId);
        setPage(1);
    };

    useEffect(() => {
        if (!platformCategory) return;
        const valid =
            platformCategory === "__uncategorized__" ||
            (platformCategory.startsWith("root:") ? curation?.roots?.some((root) => root.id === platformCategory.slice(5) && root.enabled !== false) : curation?.categories.some((item) => item.id === platformCategory && item.enabled !== false));
        if (!curation?.enabled || !valid) {
            setPlatformCategory("");
            setPage(1);
        }
    }, [curation, platformCategory]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError("");
        const libraryFilter = isLibraryScope ? (libraryCategoryId === "__uncategorized__" ? { libraryUncategorized: true } : libraryCategoryId !== "all" ? { libraryCategoryId } : {}) : {};
        listSkills({ page, pageSize, scope, sort, search: debouncedSearch || undefined, tag: !isLibraryScope && tag !== "all" ? tag : undefined, ...libraryFilter, ...(isLibraryScope ? {} : curationQuery(curation, platformCategory)) })
            .then((result) => {
                if (cancelled) return;
                setSkills(result.skills);
                setTotal(result.totalCount);
                if (scope === "public" && result.categories.length) setCategories(result.categories);
            })
            .catch((error) => {
                if (cancelled) return;
                setSkills([]);
                setTotal(0);
                setLoadError(error instanceof Error ? error.message : t("skillsUi.loadFailed"));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [debouncedSearch, isLibraryScope, libraryCategoryId, page, pageSize, reloadKey, scope, sort, tag, curation, platformCategory, t]);

    useEffect(() => {
        let cancelled = false;
        for (const option of scopeOptions) {
            void listSkills({ scope: option.value, page: 1, pageSize: 1 })
                .then((result) => {
                    if (cancelled) return;
                    setCounts((current) => ({ ...current, [option.value]: result.totalCount }));
                    if (option.value === "public" && result.categories.length) setCategories(result.categories);
                })
                .catch(() => {
                    if (cancelled) return;
                    setCounts((current) => {
                        const next = { ...current };
                        delete next[option.value];
                        return next;
                    });
                });
        }
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    useEffect(() => {
        let cancelled = false;
        setLibraryCategoryError("");
        listSkillLibraryCategories(libraryCategoryScope)
            .then((result) => {
                if (!cancelled) setLibraryCategoryList(result);
            })
            .catch((error) => {
                if (!cancelled) {
                    setLibraryCategoryList(null);
                    setLibraryCategoryError(error instanceof Error ? error.message : t("skillsUi.libraryCategoriesLoadFailed"));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [libraryCategoryScope, reloadKey, t]);

    const curationRoots = curation?.enabled ? (curation.roots || []).filter((root) => root.enabled !== false) : [];
    const browseCategories: (SkillCategory & { iconKey?: string })[] = curation?.enabled
        ? curationRoots.map((root) => ({ value: root.id, label: root.name, iconKey: root.iconKey }))
        : categories.map((category) => ({ ...category, label: skillCategoryLabel(category.value, categories, t) }));
    const activeCurationCategory = curation?.enabled && platformCategory && !platformCategory.startsWith("root:") && platformCategory !== "__uncategorized__" ? curation.categories.find((item) => item.id === platformCategory) : undefined;
    const activeCurationRootId = platformCategory.startsWith("root:") ? platformCategory.slice(5) : activeCurationCategory?.rootTag || "";
    const libraryCategories = libraryCategoryList?.categories ?? [];
    const scopeLabel = t(scopeOptions.find((option) => option.value === scope)!.labelKey);
    const viewLabel = isLibraryScope
        ? libraryCategoryId === "all"
            ? scopeLabel
            : libraryCategoryId === "__uncategorized__"
              ? t("skillsUi.uncategorized")
              : libraryCategories.find((category) => category.id === libraryCategoryId)?.name || scopeLabel
        : curation?.enabled && platformCategory
          ? platformCategory === "__uncategorized__"
              ? t("skillsUi.uncategorized")
              : [curationRoots.find((root) => root.id === activeCurationRootId)?.name, activeCurationCategory?.name].filter(Boolean).join(" / ") || scopeLabel
          : tag !== "all"
            ? skillCategoryLabel(tag, categories, t)
            : scopeLabel;
    const categoryFiltered = isLibraryScope ? libraryCategoryId !== "all" : Boolean(platformCategory) || tag !== "all";
    const filtersActive = Boolean(search || categoryFiltered || sort !== "popular");
    const resetFilters = useCallback(() => {
        setSearch("");
        setTag("all");
        setPlatformCategory("");
        setLibraryCategoryId("all");
        setSort("popular");
        setPage(1);
    }, []);

    const openSkill = async (skill: Skill) => {
        setActiveSkill(skill);
        setDetailLoading(true);
        try {
            const result = await getSkill(skill.skillId);
            setActiveSkill(result.skill);
            patchSkill(result.skill);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsUi.detailLoadFailed"));
            setActiveSkill(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const openEditor = async (skill?: Skill) => {
        if (!isAdmin) return;
        if (!skill) {
            setEditingSkill(null);
            setEditorOpen(true);
            return;
        }
        try {
            const result = skill.instruction ? { skill } : await getSkill(skill.skillId);
            setActiveSkill(null);
            setEditingSkill(result.skill);
            setEditorOpen(true);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsUi.skillReadFailed"));
        }
    };

    const openWorkbench = (skill: Skill) => {
        if (!isAdmin || !skill.isOwner) return;
        setActiveSkill(null);
        navigate(`/skills/${encodeURIComponent(skill.skillId)}/edit`);
    };

    const patchSkill = (next: Skill) => {
        setSkills((items) => items.map((item) => (item.skillId === next.skillId ? { ...item, ...next, instruction: next.instruction || item.instruction } : item)));
        setActiveSkill((current) => (current?.skillId === next.skillId ? { ...current, ...next, instruction: next.instruction || current.instruction } : current));
    };

    const toggleAdded = async (skill: Skill) => {
        if (skill.isOwner) return;
        setMutatingID(skill.skillId);
        try {
            const result = skill.isAdded ? await removeSkill(skill.skillId) : await addSkill(skill.skillId);
            patchSkill(result.skill);
            message.success(result.skill.isAdded ? t("skillsUi.addedToMine") : t("skillsUi.removedFromMine"));
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsUi.updateSkillStateFailed"));
        } finally {
            setMutatingID("");
        }
    };

    const toggleLiked = async (skill: Skill) => {
        setMutatingID(skill.skillId);
        try {
            const result = skill.isLike ? await unlikeSkill(skill.skillId) : await likeSkill(skill.skillId);
            patchSkill(result.skill);
            message.success(result.skill.isLike ? t("skillsUi.favorited") : t("skillsUi.unfavorited"));
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsUi.updateFavoriteFailed"));
        } finally {
            setMutatingID("");
        }
    };

    const synchronizeSkill = async (skill: Skill) => {
        if (!isAdmin) return;
        setMutatingID(skill.skillId);
        try {
            const result = await syncSkill(skill.skillId);
            patchSkill(result.skill);
            message.success(result.skill.versionId === skill.versionId ? t("skillsUi.alreadyLatest") : t("skillsUi.syncedLatest"));
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsUi.githubSyncFailed"));
        } finally {
            setMutatingID("");
        }
    };

    const confirmDelete = (skill: Skill) => {
        if (!isAdmin) return;
        modal.confirm({
            title: t("skillsUi.deleteSkillTitle", { name: skill.skillName }),
            content: t("skillsUi.deleteSkillContent"),
            okText: t("skillsUi.deleteSkill"),
            okButtonProps: { danger: true },
            cancelText: t("skillsUi.cancel"),
            onOk: async () => {
                try {
                    await deleteSkill(skill.skillId);
                    setActiveSkill(null);
                    message.success(t("skillsUi.skillDeleted"));
                    reload();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("skillsUi.deleteSkillFailed"));
                    throw error;
                }
            },
        });
    };

    const saveLibraryCategory = async () => {
        const name = categoryName.trim();
        if (!name) {
            message.error(t("skillsUi.enterCategoryName"));
            return;
        }
        setCategorySaving(true);
        try {
            await createSkillLibraryCategory({ name, scope: isAdmin ? categoryScope : "personal" });
            message.success(t("skillsUi.libraryCategoryCreated"));
            setCategoryEditorOpen(false);
            setCategoryName("");
            setLibraryCategoryId("all");
            setPage(1);
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsUi.createCategoryFailed"));
        } finally {
            setCategorySaving(false);
        }
    };

    const confirmDeleteLibraryCategory = (category: SkillLibraryCategory) => {
        modal.confirm({
            title: t("skillsUi.deleteCategoryTitle", { name: category.name }),
            content: t("skillsUi.deleteCategoryContent"),
            okText: t("skillsUi.deleteCategory"),
            okButtonProps: { danger: true },
            cancelText: t("skillsUi.cancel"),
            onOk: async () => {
                try {
                    await deleteSkillLibraryCategory(category.id);
                    if (libraryCategoryId === category.id) setLibraryCategoryId("all");
                    message.success(t("skillsUi.libraryCategoryDeleted"));
                    reload();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("skillsUi.deleteCategoryFailed"));
                    throw error;
                }
            },
        });
    };

    const assignLibraryCategory = async (skill: Skill, categoryId: string) => {
        setMutatingID(skill.skillId);
        try {
            const result = await setSkillLibraryCategory(skill.skillId, categoryId);
            patchSkill(result.skill);
            message.success(categoryId ? t("skillsUi.skillCategorized") : t("skillsUi.skillUncategorized"));
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsUi.categorizeSkillFailed"));
        } finally {
            setMutatingID("");
        }
    };

    const renderSkillCard = (skill: Skill) => (
        <SkillCard
            key={skill.skillId}
            skill={skill}
            rootLabel={curation?.enabled ? curation.roots?.find((root) => root.id === effectiveCurationRoot(skill, curation))?.name : undefined}
            showCategory={!isLibraryScope && !categoryFiltered}
            categories={categories}
            t={t}
            locale={locale}
            libraryCategories={libraryCategories}
            canCategorize={isLibraryScope}
            canManage={isAdmin && skill.isOwner}
            loading={mutatingID === skill.skillId}
            onOpen={() => void openSkill(skill)}
            onAdd={() => void toggleAdded(skill)}
            onLike={() => void toggleLiked(skill)}
            onEdit={() => void openEditor(skill)}
            onOpenWorkbench={() => openWorkbench(skill)}
            onDelete={() => confirmDelete(skill)}
            onSetLibraryCategory={(categoryId) => void assignLibraryCategory(skill, categoryId)}
        />
    );
    const skillContent =
        loading && !skills.length ? (
            <SkillSkeleton />
        ) : loadError ? (
            <WorkspaceErrorState compact description={loadError} onRetry={reload} />
        ) : skills.length ? (
            <div className={cn("skill-tile-grid", loading && "is-refreshing")} aria-busy={loading}>
                {skills.map(renderSkillCard)}
            </div>
        ) : (
            <WorkspaceState
                compact
                className="min-h-[188px]"
                icon="skills"
                title={filtersActive ? t("skillsUi.noMatchingSkills") : scope === "created" ? t("skillsUi.noCreatedSkills") : scope === "public" ? t("skillsUi.emptyMarketplace") : t("skillsUi.noSkillsHere")}
                description={filtersActive ? t("skillsUi.tryDifferentFilters") : scope === "favorites" ? t("skillsUi.favoritesEmptyDescription") : scope === "mine" ? t("skillsUi.mineEmptyDescription") : t("skillsUi.marketplaceEmptyDescription")}
                action={
                    filtersActive ? (
                        <Button onClick={resetFilters}>{t("skillsUi.clearFilters")}</Button>
                    ) : scope === "mine" ? (
                        <Button onClick={() => selectScope("public")}>去技能广场</Button>
                    ) : isAdmin && (scope === "created" || scope === "public") ? (
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setInstallOpen(true)}>
                            {t("skillsUi.installSkill")}
                        </Button>
                    ) : undefined
                }
            />
        );

    const railItem = ({ key, label, icon: Icon, count, active, nested = false, onClick }: { key: string; label: string; icon?: LucideIcon; count?: number; active: boolean; nested?: boolean; onClick: () => void }) => (
        <button key={key} type="button" className={cn("skills-rail-item", nested && "is-nested")} aria-pressed={active} onClick={onClick}>
            {Icon ? <Icon aria-hidden="true" /> : null}
            <span className="skills-rail-item-label">{label}</span>
            {count !== undefined ? <span className="skills-rail-count">{formatSkillCount(count, locale)}</span> : null}
        </button>
    );
    const openCategoryEditor = () => {
        setCategoryName("");
        setCategoryScope("personal");
        setCategoryEditorOpen(true);
    };

    return (
        <>
            <WorkspacePage className="library-page skills-library-page" grid>
                <PageHeader title={t("skillsUi.pageTitle")} />

                <div className="skills-browser">
                    <aside className="skills-rail" aria-label={t("skillsUi.categoryFiltersAria")}>
                        <nav className="skills-rail-group" aria-label={t("skillsUi.scopeAria")}>
                            {scopeOptions.map((option) => railItem({ key: option.value, label: t(option.labelKey), icon: option.icon, count: counts[option.value], active: scope === option.value, onClick: () => selectScope(option.value) }))}
                        </nav>

                        {!isLibraryScope ? (
                            <section className="skills-rail-section" aria-labelledby="skills-rail-categories">
                                <div className="skills-rail-heading">
                                    <span id="skills-rail-categories" className="collection-filter-label">
                                        {t("skillsUi.marketplaceCategories")}
                                    </span>
                                </div>
                                {curationError ? (
                                    <div className="skills-rail-error" role="alert">
                                        {curationError}
                                        <Button type="link" size="small" onClick={retryCuration}>
                                            {t("skillsUi.retry")}
                                        </Button>
                                    </div>
                                ) : null}
                                <div className="skills-rail-group">
                                    {railItem({ key: "all", label: t("skillsUi.allSkills"), icon: LayoutGrid, active: tag === "all" && !platformCategory, onClick: () => selectMarketplaceCategory("all") })}
                                    {browseCategories.map((category) => {
                                        const Icon = curation?.enabled ? curationIcon(category.iconKey) : categoryIconOf(category.value);
                                        if (!curation?.enabled) return railItem({ key: category.value, label: category.label, icon: Icon, count: category.count, active: tag === category.value, onClick: () => selectMarketplaceCategory(category.value) });
                                        const children = activeCurationRootId === category.value ? curation.categories.filter((item) => item.rootTag === category.value && item.enabled !== false) : [];
                                        return [
                                            railItem({ key: category.value, label: category.label, icon: Icon, active: platformCategory === "root:" + category.value, onClick: () => selectMarketplaceCategory("all", "root:" + category.value) }),
                                            ...children.map((child) => railItem({ key: child.id, label: child.name, nested: true, active: platformCategory === child.id, onClick: () => selectMarketplaceCategory("all", child.id) })),
                                        ];
                                    })}
                                    {curation?.enabled
                                        ? railItem({ key: "__uncategorized__", label: t("skillsUi.uncategorized"), icon: FolderInput, active: platformCategory === "__uncategorized__", onClick: () => selectMarketplaceCategory("all", "__uncategorized__") })
                                        : null}
                                </div>
                            </section>
                        ) : (
                            <section className="skills-rail-section" aria-labelledby="skills-rail-library">
                                <div className="skills-rail-heading">
                                    <span id="skills-rail-library" className="collection-filter-label">
                                        {t("skillsUi.mySkillCategories")}
                                    </span>
                                    <Tooltip title={t("skillsUi.newCategory")}>
                                        <button type="button" className="product-icon-button skills-rail-add" aria-label={t("skillsUi.newCategory")} onClick={openCategoryEditor}>
                                            <FolderPlus />
                                        </button>
                                    </Tooltip>
                                </div>
                                {libraryCategoryError ? (
                                    <div className="skills-rail-error" role="alert">
                                        {libraryCategoryError}
                                        <Button type="link" size="small" onClick={reload}>
                                            {t("skillsUi.retry")}
                                        </Button>
                                    </div>
                                ) : null}
                                <div className="skills-rail-group">
                                    {railItem({ key: "all", label: t("skillsUi.allSkills"), icon: Library, count: libraryCategoryList?.totalCount, active: libraryCategoryId === "all", onClick: () => selectLibraryCategory("all") })}
                                    {railItem({
                                        key: "__uncategorized__",
                                        label: t("skillsUi.uncategorized"),
                                        icon: FolderInput,
                                        count: libraryCategoryList?.uncategorizedCount,
                                        active: libraryCategoryId === "__uncategorized__",
                                        onClick: () => selectLibraryCategory("__uncategorized__"),
                                    })}
                                    {libraryCategories.map((category) => (
                                        <div key={category.id} className="skills-rail-row">
                                            {railItem({
                                                key: category.id,
                                                label: category.name,
                                                icon: category.scope === "platform" ? Globe2 : FolderInput,
                                                count: category.count,
                                                active: libraryCategoryId === category.id,
                                                onClick: () => selectLibraryCategory(category.id),
                                            })}
                                            {category.scope === "personal" || isAdmin ? (
                                                <button
                                                    type="button"
                                                    className="product-icon-button skills-rail-delete"
                                                    aria-label={t("skillsUi.deleteCategoryAria", { name: category.name })}
                                                    title={t("skillsUi.deleteCategory")}
                                                    onClick={() => confirmDeleteLibraryCategory(category)}
                                                >
                                                    <Trash2 aria-hidden="true" />
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                    {!libraryCategories.length && libraryCategoryList ? (
                                        <button type="button" className="skills-rail-item is-hint" onClick={openCategoryEditor}>
                                            <Plus aria-hidden="true" />
                                            <span className="skills-rail-item-label">{t("skillsUi.newCategory")}</span>
                                        </button>
                                    ) : null}
                                </div>
                            </section>
                        )}
                    </aside>

                    <section className="skills-results" aria-labelledby="skills-results-title">
                        <div className="skills-results-header">
                            <div className="skills-results-title">
                                {viewLabel !== scopeLabel ? (
                                    <>
                                        <button type="button" className="skills-results-scope" onClick={() => selectScope(scope)}>
                                            {scopeLabel}
                                        </button>
                                        <ChevronRight className="skills-results-separator" aria-hidden="true" />
                                    </>
                                ) : null}
                                <h2 id="skills-results-title">{viewLabel}</h2>
                                <span className="app-projects-header-meta">{loading && !skills.length ? "—" : t("skillsUi.itemsCount", { count: total })}</span>
                            </div>
                            <CollectionToolbar
                                active={filtersActive}
                                onReset={resetFilters}
                                trailing={
                                    <>
                                        <Button icon={<Sparkles className="size-4" />} onClick={() => setRecommendationsOpen(true)}>
                                            {t("nativeControls.skillRecommendations")}
                                        </Button>
                                        {isAdmin ? (
                                            <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setInstallOpen(true)}>
                                                安装技能
                                            </Button>
                                        ) : null}
                                    </>
                                }
                            >
                                <Input
                                    className="min-w-0 sm:!w-56"
                                    prefix={<Search />}
                                    value={search}
                                    allowClear
                                    placeholder={t("skillsUi.searchPlaceholder")}
                                    aria-label={t("skillsUi.searchPlaceholder")}
                                    onChange={(event) => {
                                        setSearch(event.target.value);
                                        setPage(1);
                                    }}
                                />
                                <Select
                                    aria-label={t("skillsUi.sortAria")}
                                    className="w-28"
                                    value={sort}
                                    options={sortOptions.map(({ labelKey, value }) => ({ label: t(labelKey), value }))}
                                    onChange={(value) => {
                                        setSort(value);
                                        setPage(1);
                                    }}
                                />
                            </CollectionToolbar>
                        </div>
                        {skillContent}
                        <PaginationBar
                            current={page}
                            pageSize={pageSize}
                            total={total}
                            pageSizeOptions={[20, 40, 80]}
                            onChange={(nextPage, nextPageSize) => {
                                setPage(nextPageSize !== pageSize ? 1 : nextPage);
                                setPageSize(nextPageSize);
                            }}
                        />
                    </section>
                </div>
            </WorkspacePage>

            <AppModal
                open={categoryEditorOpen}
                title={
                    <div className="skills-library-category-title">
                        <span className="skills-library-category-title-icon">
                            <FolderPlus className="size-4" aria-hidden="true" />
                        </span>
                        <span>
                            <small>{t("skillsUi.organizeLibrary")}</small>
                            <strong>{t("skillsUi.newCategory")}</strong>
                        </span>
                    </div>
                }
                className="library-modal skills-library-category-modal"
                width="min(480px, calc(100vw - 32px))"
                centered
                okText={t("skillsUi.createCategory")}
                cancelText={t("skillsUi.cancel")}
                okButtonProps={{ disabled: !categoryName.trim() }}
                confirmLoading={categorySaving}
                onOk={() => void saveLibraryCategory()}
                onCancel={() => setCategoryEditorOpen(false)}
                destroyOnHidden
            >
                <div className="skills-library-category-editor">
                    <div className="skills-library-category-field">
                        <label htmlFor="skills-library-category-name">{t("skillsUi.categoryName")}</label>
                        <Input
                            id="skills-library-category-name"
                            autoFocus
                            maxLength={64}
                            showCount
                            value={categoryName}
                            onChange={(event) => setCategoryName(event.target.value)}
                            onPressEnter={() => void saveLibraryCategory()}
                            placeholder={t("skillsUi.categoryNamePlaceholder")}
                        />
                        <span className="skills-library-category-field-hint">{t("skillsUi.categoryNameHint")}</span>
                    </div>
                    {isAdmin ? (
                        <div className="skills-library-category-scope">
                            <span className="skills-library-category-field-label">{t("skillsUi.categoryScope")}</span>
                            <div className="skills-library-category-scope-options" role="group" aria-label={t("skillsUi.categoryScope")}>
                                <button type="button" className={`skills-library-category-scope-option${categoryScope === "personal" ? " is-active" : ""}`} aria-pressed={categoryScope === "personal"} onClick={() => setCategoryScope("personal")}>
                                    <span className="skills-library-category-scope-icon">
                                        <UserRound className="size-4" aria-hidden="true" />
                                    </span>
                                    <span className="skills-library-category-scope-copy">
                                        <strong>{t("skillsUi.personalCategory")}</strong>
                                        <small>{t("skillsUi.personalCategoryDescription")}</small>
                                    </span>
                                    {categoryScope === "personal" ? <Check className="skills-library-category-scope-check size-4" aria-hidden="true" /> : null}
                                </button>
                                <button type="button" className={`skills-library-category-scope-option${categoryScope === "platform" ? " is-active" : ""}`} aria-pressed={categoryScope === "platform"} onClick={() => setCategoryScope("platform")}>
                                    <span className="skills-library-category-scope-icon">
                                        <Globe2 className="size-4" aria-hidden="true" />
                                    </span>
                                    <span className="skills-library-category-scope-copy">
                                        <strong>{t("skillsUi.platformCategory")}</strong>
                                        <small>{t("skillsUi.platformCategoryDescription")}</small>
                                    </span>
                                    {categoryScope === "platform" ? <Check className="skills-library-category-scope-check size-4" aria-hidden="true" /> : null}
                                </button>
                            </div>
                        </div>
                    ) : null}
                    <div className={`skills-library-category-note${categoryScope === "platform" && isAdmin ? " is-platform" : ""}`}>
                        <Sparkles className="size-4" aria-hidden="true" />
                        <p>{categoryScope === "platform" && isAdmin ? t("skillsUi.platformCategoryNote") : t("skillsUi.personalCategoryNote")}</p>
                    </div>
                </div>
            </AppModal>
            <SkillDetailModal
                skill={activeSkill}
                loading={detailLoading}
                mutating={Boolean(activeSkill && mutatingID === activeSkill.skillId)}
                categories={categories}
                onClose={() => setActiveSkill(null)}
                onAdd={(skill) => void toggleAdded(skill)}
                onLike={(skill) => void toggleLiked(skill)}
                onEdit={(skill) => void openEditor(skill)}
                onOpenWorkbench={openWorkbench}
                onSync={(skill) => void synchronizeSkill(skill)}
            />
            {isAdmin ? (
                <SkillInstallModal
                    open={installOpen}
                    onClose={() => setInstallOpen(false)}
                    onInstalled={(skill) => {
                        setInstallOpen(false);
                        setActiveSkill(skill);
                        reload();
                    }}
                    onManualCreate={() => {
                        setInstallOpen(false);
                        void openEditor();
                    }}
                />
            ) : null}
            <SkillRecommendationsModal
                open={recommendationsOpen}
                onClose={() => setRecommendationsOpen(false)}
                onInstalled={(installed) => {
                    if (installed.length) reload();
                }}
            />
            {isAdmin ? (
                <SkillEditorDrawer
                    open={editorOpen}
                    skill={editingSkill}
                    onClose={() => setEditorOpen(false)}
                    onSaved={(skill) => {
                        setEditorOpen(false);
                        setEditingSkill(null);
                        setActiveSkill(skill);
                        reload();
                    }}
                />
            ) : null}
        </>
    );
}

export function SkillCard({
    skill,
    rootLabel,
    showCategory = true,
    categories,
    libraryCategories,
    canCategorize,
    canManage,
    loading,
    t,
    locale,
    onOpen,
    onAdd,
    onLike,
    onEdit,
    onOpenWorkbench,
    onDelete,
    onSetLibraryCategory,
}: {
    skill: Skill;
    rootLabel?: string;
    showCategory?: boolean;
    categories: SkillCategory[];
    libraryCategories: SkillLibraryCategory[];
    canCategorize: boolean;
    canManage: boolean;
    loading: boolean;
    t: InterfaceTranslate;
    locale: InterfaceLocale;
    onOpen: () => void;
    onAdd: () => void;
    onLike: () => void;
    onEdit: () => void;
    onOpenWorkbench: () => void;
    onDelete: () => void;
    onSetLibraryCategory: (categoryId: string) => void;
}) {
    const cover = publishedSkills[skill.skillId]?.cover || skill.showcaseMedia.find((media) => media.type === "image")?.showcaseUrl;
    const currentLibraryCategory = libraryCategories.find((category) => category.id === skill.libraryCategoryId);
    const libraryCategoryLabel = currentLibraryCategory?.name || (skill.libraryCategoryId ? t("skillsUi.categorized") : t("skillsUi.uncategorized"));
    const categoryLabel = showCategory ? rootLabel || skillCategoryLabel(skill.tag, categories, t) : undefined;
    const workbenchLabel = t(skill.sourceType === "github" ? "skillsUi.viewInWorkbench" : "skillsUi.editInWorkbench");
    const likeLabel = t(skill.isLike ? "skillsUi.favorited" : "skillsUi.favorite");
    const menuItems = [
        { key: "detail", label: "查看详情" },
        ...(canManage
            ? [{ key: "workbench", label: workbenchLabel }, { key: "edit", label: "编辑技能信息" }, { type: "divider" as const }, { key: "delete", label: "删除技能", danger: true }]
            : skill.isOwner
              ? []
              : [{ key: "toggle-added", label: skill.isAdded ? "从我的技能移除" : "加入我的技能", disabled: loading }]),
    ];
    return (
        <article className={cn("product-collection-card skill-tile", skill.isAdded && "is-added")} data-accent={skillAccent(skill.tag)}>
            <div className="skill-tile-head">
                <span className="skill-tile-glyph" aria-hidden="true">
                    {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : skillGlyph(skill.skillName)}
                </span>
                <div className="skill-tile-heading">
                    <h3 className="skill-tile-name">
                        <button type="button" className="skill-tile-open" title={skill.skillName} onClick={onOpen}>
                            <span className="skill-tile-name-text">{skill.skillName}</span>
                        </button>
                    </h3>
                    <div className="skill-tile-byline">
                        {skill.effectiveUser.name ? (
                            <span className="skill-tile-author" title={skill.effectiveUser.name}>
                                {skill.effectiveUser.name}
                            </span>
                        ) : null}
                        {canCategorize ? (
                            <Dropdown
                                trigger={["click"]}
                                menu={{
                                    selectable: true,
                                    selectedKeys: [skill.libraryCategoryId || "__uncategorized__"],
                                    items: [{ key: "__uncategorized__", label: t("skillsUi.uncategorized") }, ...libraryCategories.map((category) => ({ key: category.id, label: category.name }))],
                                    onClick: ({ key }) => onSetLibraryCategory(key === "__uncategorized__" ? "" : key),
                                }}
                            >
                                <button
                                    type="button"
                                    className="skill-tile-chip is-picker"
                                    aria-label={t("skillsUi.setSkillCategoryAria", { category: libraryCategoryLabel })}
                                    title={t("skillsUi.libraryCategoryTooltip", { category: libraryCategoryLabel })}
                                    disabled={loading}
                                >
                                    <FolderInput aria-hidden="true" />
                                    <span>{libraryCategoryLabel}</span>
                                    <ChevronDown aria-hidden="true" />
                                </button>
                            </Dropdown>
                        ) : categoryLabel ? (
                            <span className="skill-tile-chip">{categoryLabel}</span>
                        ) : null}
                        {skill.isPrivate ? (
                            <Tooltip title={t("skillsUi.privateOnly")}>
                                <span className="skill-tile-private" role="img" aria-label={t("skillsUi.privateOnly")}>
                                    <Lock aria-hidden="true" />
                                </span>
                            </Tooltip>
                        ) : null}
                    </div>
                </div>
            </div>

            {skill.description ? <p className="skill-tile-description">{skill.description}</p> : null}

            <div className="skill-tile-footer">
                <Tooltip title={likeLabel}>
                    <button type="button" disabled={loading} className="skill-tile-stat is-like" aria-pressed={skill.isLike} aria-label={likeLabel} onClick={onLike}>
                        <Heart aria-hidden="true" />
                        <span>{formatSkillCount(skill.likeCount, locale)}</span>
                    </button>
                </Tooltip>
                <span className="skill-tile-stat" title={t("skillsUi.joinedCount", { count: formatSkillCount(skill.addedCount, locale) })}>
                    <Users aria-hidden="true" />
                    <span>{t("skillsUi.joinedCount", { count: formatSkillCount(skill.addedCount, locale) })}</span>
                </span>
                <div className="skill-tile-actions">
                    {canManage ? (
                        <Tooltip title={workbenchLabel}>
                            <button type="button" className="product-icon-button skill-tile-edit" aria-label={workbenchLabel + "：" + skill.skillName} onClick={onOpenWorkbench}>
                                <Pencil />
                            </button>
                        </Tooltip>
                    ) : null}
                    <Dropdown
                        trigger={["click"]}
                        placement="bottomRight"
                        menu={{
                            items: menuItems,
                            onClick: ({ key }) => (key === "detail" ? onOpen() : key === "workbench" ? onOpenWorkbench() : key === "edit" ? onEdit() : key === "delete" ? onDelete() : onAdd()),
                        }}
                    >
                        <button type="button" className="product-icon-button skill-tile-more" aria-label={t("skillsUi.skillActionsAria")} title={t("skillsUi.skillActionsAria")}>
                            <MoreHorizontal />
                        </button>
                    </Dropdown>
                </div>
            </div>

            {skill.isOwner ? (
                <div className="skill-tile-corner">
                    <span className="skill-tile-own" title={t("skillsUi.ownerSkill")}>
                        {t("skillsUi.scopeMine")}
                    </span>
                </div>
            ) : (
                <div className="skill-tile-corner">
                    <Tooltip title={skill.isAdded ? t("skillsUi.removeFromMine") : t("skillsUi.addSkillToLibrary")}>
                        <button type="button" className="skill-tile-add" aria-pressed={skill.isAdded} aria-label={t(skill.isAdded ? "skillsUi.removeFromMineAria" : "skillsUi.addToMineAria", { name: skill.skillName })} disabled={loading} onClick={onAdd}>
                            {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : skill.isAdded ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                            <span>{t(skill.isAdded ? "skillsUi.added" : "skillsUi.addAction")}</span>
                        </button>
                    </Tooltip>
                </div>
            )}
        </article>
    );
}

function SkillSkeleton() {
    return (
        <div className="skill-tile-grid" aria-busy="true">
            {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="skill-tile-skeleton" />
            ))}
        </div>
    );
}
