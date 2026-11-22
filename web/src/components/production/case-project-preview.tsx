import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AudioLines, Box, ChevronDown, ChevronUp, Copy, FileText, Film, Image as ImageIcon, LayoutPanelLeft, Maximize, Minus, Music2, Play, Plus, Search, Workflow, X } from "lucide-react";

import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { ConnectionPath } from "@/components/canvas/canvas-connections";
import { canvasNodeVideoPreviewUrl } from "@/lib/canvas/canvas-media-preview";
import { buildLibTVVideoSourceUrl } from "@/lib/canvas/libtv-import";
import { getCanvasNodesBounds, viewportAtScale, viewportForBounds } from "@/lib/canvas/canvas-viewport";
import { buildCaseStoryboard, type StoryboardEntry } from "@/lib/case-storyboard";
import { loadProductionCaseProject } from "@/services/production-case-project";
import { captureVideoPoster } from "@/lib/video-poster";
import { resolveMediaUrl } from "@/services/file-storage";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceMessageKey } from "@/lib/interface-locale";
import "./case-project-preview.css";
import "./case-storyboard.css";

type CaseProject = {
    title: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

export type CaseProjectPreviewProps = { project: CaseProject; author?: string; onClose?: () => void; onCopy?: () => void | Promise<void>; copying?: boolean };

export function CaseProjectViewer({ id, title, author, onClose, onCopy }: { id: string; title: string; author?: string; onClose: () => void; onCopy?: () => void | Promise<void> }) {
    const { t } = useInterfaceTranslation();
    const [project, setProject] = useState<CaseProject>();
    const [error, setError] = useState<string>();
    const [attempt, setAttempt] = useState(0);
    const [copying, setCopying] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        setProject(undefined); setError(undefined);
        void loadProductionCaseProject(id, { mode: "preview", signal: controller.signal })
            .then(value => { if (!controller.signal.aborted) setProject(value); })
            .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t("galleryProjectUnavailable")); });
        return () => controller.abort();
    }, [id, attempt, t]);
    if (!project) return <section className="case-project-preview case-project-preview-loading">
        <header className="case-project-preview-header"><strong>{title}</strong><button type="button" onClick={onClose} aria-label={t("previewClose")}><X size={18} /></button></header>
        <div role={error ? "alert" : "status"}>{error || t("galleryRestoringProject")}{error ? <button type="button" onClick={() => setAttempt(value => value + 1)}>{t("galleryReloadProject")}</button> : null}</div>
    </section>;
    return <CaseProjectPreview project={project} author={author} onClose={onClose} copying={copying} onCopy={onCopy ? async () => {
        setCopying(true);
        try { await onCopy(); } finally { setCopying(false); }
    } : undefined} />;
}

type PreviewView = "workflow" | "assets";
type AssetCategory = "text" | "image" | "video" | "audio";

const CATEGORY_LABELS: Record<AssetCategory, InterfaceMessageKey> = {
    text: "previewAssetText",
    image: "previewAssetImage",
    video: "previewAssetVideo",
    audio: "previewAssetAudio",
};

const PARAMETER_LABELS: Record<string, InterfaceMessageKey> = {
    generationMode: "previewParamMode",
    model: "previewParamModel",
    workflowProvider: "previewParamProvider",
    runningHubWorkflowId: "previewParamRunningHub",
    runningHubWorkflowKind: "previewParamRunningHubKind",
    comfyBridgeWorkflowId: "previewParamComfy",
    size: "previewSize",
    quality: "previewParamQuality",
    transparentBackground: "previewParamTransparent",
    count: "previewParamCount",
    textCount: "previewParamTextCount",
    seconds: "previewParamDuration",
    vquality: "previewParamVideoQuality",
    generateAudio: "previewParamAudio",
    watermark: "previewParamWatermark",
    audioVoice: "previewParamVoice",
    audioFormat: "previewParamAudioFormat",
    audioSpeed: "previewParamSpeed",
    audioInstructions: "previewParamInstructions",
    videoEditOperation: "previewParamVideoOperation",
    videoWebSearch: "previewParamVideoSearch",
    strictGenerationOptions: "previewParamStrict",
    ltvExecutionContract: "previewParamContract",
    videoKling: "previewParamKling",
    arkImageSequential: "previewParamArk",
    audioMusic: "previewParamMusic",
    imageGrounding: "previewParamImageSearch",
    videoEnhancement: "previewParamVideoEnhance",
    imageEnhancement: "previewParamImageEnhance",
    generationSpec: "previewParamSavedContract",
};

const SAVED_PARAMETER_KEYS = Object.keys(PARAMETER_LABELS);

export function CaseProjectPreview({ project, author, onClose, onCopy, copying }: CaseProjectPreviewProps) {
    const { t } = useInterfaceTranslation();
    const [view, setView] = useState<PreviewView>("workflow");
    const [selectedId, setSelectedId] = useState<string>();
    const [focusRequest, setFocusRequest] = useState<{ id: string; sequence: number }>();
    const nodeById = useMemo(() => new Map(project.nodes.map((node) => [node.id, node])), [project.nodes]);
    const selectedNode = selectedId ? nodeById.get(selectedId) : undefined;

    useEffect(() => {
        if (!selectedId) return;
        const closeDetails = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            setSelectedId(undefined);
        };
        document.addEventListener("keydown", closeDetails, true);
        return () => document.removeEventListener("keydown", closeDetails, true);
    }, [selectedId]);

    useEffect(() => {
        if (selectedId && !nodeById.has(selectedId)) setSelectedId(undefined);
    }, [nodeById, selectedId]);

    return (
        <section className="case-project-preview" aria-label={t("previewProjectLabel", { title: project.title })}>
            <header className="case-project-preview-header">
                <div className="case-project-preview-heading">
                    <h2>{project.title || t("previewUntitledProject")}{author ? ` | ${author}` : ""}</h2>
                </div>
                <div className="case-project-preview-view-switch" role="group" aria-label={t("previewViews")}>
                    <button type="button" aria-label={t("previewWorkflow")} title={t("previewWorkflow")} aria-pressed={view === "workflow"} onClick={() => setView("workflow")}>
                        <Workflow size={16} aria-hidden="true" />
                    </button>
                    <button type="button" aria-label={t("previewAssets")} title={t("previewAssets")} aria-pressed={view === "assets"} onClick={() => setView("assets")}>
                        <LayoutPanelLeft size={16} aria-hidden="true" />
                    </button>
                </div>
                <div className="case-project-preview-actions">
                    <span>{t("previewReadonlyHint")}</span>
                    {onCopy ? <button type="button" className="case-project-preview-copy" disabled={copying} aria-busy={copying} onClick={() => void onCopy()}><Copy size={15} />{t("previewCopyProject")}</button> : null}
                    {onClose ? <button type="button" onClick={onClose} aria-label={t("previewClose")}><X size={18} /></button> : null}
                </div>
            </header>
            <div className="case-project-preview-body">
                <div className="case-project-preview-view" hidden={view !== "workflow"}>
                    <WorkflowView project={project} selectedId={selectedId} onSelect={setSelectedId} focusRequest={focusRequest} onCloseInspector={() => setSelectedId(undefined)} />
                </div>
                {view === "assets" ? <AssetView project={project} selectedId={selectedId} onSelect={setSelectedId} /> : null}
                {selectedNode ? <NodeInspector node={selectedNode} project={project} onSelect={setSelectedId} onClose={() => setSelectedId(undefined)} onLocate={() => {
                    setView("workflow"); setFocusRequest(previous => ({ id: selectedNode.id, sequence: (previous?.sequence || 0) + 1 }));
                }} /> : null}
            </div>
        </section>
    );
}

function WorkflowView({ project, selectedId, focusRequest, onSelect, onCloseInspector }: { project: CaseProject; selectedId?: string; focusRequest?: { id: string; sequence: number }; onSelect: (id: string) => void; onCloseInspector: () => void }) {
    const { t } = useInterfaceTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({ x: 0, y: 0, k: 1 });
    const frames = useMemo(() => project.nodes.filter((node) => node.type === CanvasNodeType.Frame), [project.nodes]);
    const nodes = useMemo(() => project.nodes.filter((node) => node.type !== CanvasNodeType.Frame), [project.nodes]);
    const nodeById = useMemo(() => new Map(project.nodes.map((node) => [node.id, node])), [project.nodes]);
    const validConnections = useMemo(
        () =>
            project.connections.flatMap((connection) => {
                const from = nodeById.get(connection.fromNodeId);
                const to = nodeById.get(connection.toNodeId);
                return from && to ? [{ connection, from, to }] : [];
            }),
        [nodeById, project.connections],
    );

    const fit = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        const bounds = getCanvasNodesBounds(project.nodes);
        if (!rect || !bounds) return;
        setViewport(viewportForBounds(bounds, { width: rect.width, height: rect.height }, { padding: 72, minScale: 0.001, maxScale: 1 }));
    }, [project.nodes]);

    useLayoutEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        let previous = { width: 0, height: 0 };
        const resize = () => {
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height) return;
            if (!previous.width || !previous.height) {
                const bounds = getCanvasNodesBounds(project.nodes);
                if (bounds) setViewport(viewportForBounds(bounds, { width, height }, { padding: 64, minScale: 0.001, maxScale: 1 }));
            }
            else {
                const dx = (width - previous.width) / 2, dy = (height - previous.height) / 2;
                setViewport(current => ({ ...current, x: current.x + dx, y: current.y + dy }));
            }
            previous = { width, height };
        };
        resize();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        return () => observer.disconnect();
    }, [project.nodes]);

    useLayoutEffect(() => {
        const node = focusRequest ? nodeById.get(focusRequest.id) : undefined;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!node || !rect?.width) return;
        const bounds = getCanvasNodesBounds([node]);
        if (bounds) setViewport(viewportForBounds(bounds, { width: Math.max(180, rect.width - Math.min(380, rect.width * .4)), height: rect.height }, { padding: 80, minScale: .05, maxScale: 1 }));
    }, [focusRequest, nodeById]);

    const zoom = (scale: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setViewport((current) => viewportAtScale(current, { width: rect.width, height: rect.height }, scale, 0.001));
    };

    const connectedToSelection = useMemo(() => {
        if (!selectedId) return new Set<string>();
        return new Set(validConnections.filter(({ connection }) => connection.fromNodeId === selectedId || connection.toNodeId === selectedId).map(({ connection }) => connection.id));
    }, [selectedId, validConnections]);

    return (
        <div className="case-project-preview-workflow-layout">
            <div className="case-project-preview-canvas-region" data-testid="case-workflow">
                <InfiniteCanvas
                    minScale={0.001}
                    containerRef={containerRef}
                    viewport={viewport}
                    backgroundMode="dots"
                    onViewportChange={setViewport}
                    onContextMenu={(event) => event.preventDefault()}
                    onDrop={(event) => event.preventDefault()}
                    onCanvasDeselect={onCloseInspector}
                >
                    <svg className="case-project-preview-connections" width={1} height={1} aria-hidden="true">
                        {validConnections.map(({ connection, from, to }) => (
                            <ConnectionPath key={connection.id} connection={connection} from={from} to={to} active={connectedToSelection.has(connection.id)} onSelect={() => onSelect(connection.toNodeId)} />
                        ))}
                    </svg>
                    {nodes.map((node) => (
                        <WorkflowNode key={node.id} node={node} selected={selectedId === node.id} onSelect={onSelect} />
                    ))}
                    {frames.map((frame) => (
                        <PreviewFrame key={frame.id} node={frame} childCount={nodes.filter((node) => node.parentId === frame.id).length} onSelect={onSelect} />
                    ))}
                </InfiniteCanvas>

                {!project.nodes.length ? <div className="case-project-preview-empty-canvas">{t("previewEmptyCanvas")}</div> : null}
                <div className="case-project-preview-canvas-tools" data-canvas-no-zoom aria-label={t("previewCanvasControls")}>
                    <button type="button" aria-label={t("previewZoomOut")} onClick={() => zoom(viewport.k / 1.2)}>
                        <Minus size={15} />
                    </button>
                    <span aria-label={t("previewZoomLevel")}>{Math.round(viewport.k * 100)}%</span>
                    <button type="button" aria-label={t("previewZoomIn")} onClick={() => zoom(viewport.k * 1.2)}>
                        <Plus size={15} />
                    </button>
                    <button type="button" aria-label={t("previewFitAll")} onClick={fit}>
                        <Maximize size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function PreviewFrame({ node, childCount, onSelect }: { node: CanvasNodeData; childCount: number; onSelect: (id: string) => void }) {
    const { t } = useInterfaceTranslation();
    return (
        <div className="case-project-preview-frame" data-frame-id={node.id} data-node-id={node.id} style={{ left: node.position.x, top: node.position.y, width: node.width, height: node.height }} onClick={() => onSelect(node.id)}>
            <button
                type="button"
                className="case-project-preview-frame-title"
                aria-label={t("previewViewGroup", { name: node.title || t("previewGroup") })}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect(node.id);
                }}
            >
                <Box size={14} />
                {node.title || t("previewGroup")}
                <small>{t(childCount === 1 ? "previewOneNode" : "previewNodeCount", { count: childCount })}</small>
            </button>
        </div>
    );
}

function WorkflowNode({ node, selected, onSelect }: { node: CanvasNodeData; selected: boolean; onSelect: (id: string) => void }) {
    const { t } = useInterfaceTranslation();
    const category = nodeAssetCategory(node);
    return (
        <button
            type="button"
            className={`case-project-preview-node ${selected ? "is-selected" : ""}`}
            data-node-id={node.id}
            data-parent-id={node.parentId || undefined}
            aria-label={t("previewViewNode", { name: node.title || t(CATEGORY_LABELS[category]) })}
            aria-pressed={selected}
            style={{ left: node.position.x, top: node.position.y, width: Math.max(1, node.width), height: Math.max(1, node.height) }}
            onClick={(event) => {
                event.stopPropagation();
                onSelect(node.id);
            }}
        >
            <span className="case-project-preview-node-header">
                <NodeTypeIcon category={category} />
                <strong title={node.title || t(CATEGORY_LABELS[category])}>{node.title || t(CATEGORY_LABELS[category])}</strong>
                <small>{t(CATEGORY_LABELS[category])}</small>
            </span>
            <NodeThumbnail node={node} />
            {node.parentId ? <span className="case-project-preview-node-group">{t("previewGroupedNode")}</span> : null}
        </button>
    );
}

function AssetView({ project, selectedId, onSelect }: { project: CaseProject; selectedId?: string; onSelect: (id: string) => void }) {
    const { t } = useInterfaceTranslation();
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState<Record<AssetCategory, string>>({ text: "all", image: "all", video: "all", audio: "all" });
    const [collapsed, setCollapsed] = useState<Partial<Record<AssetCategory, boolean>>>({});
    const groups = useMemo(() => buildCaseStoryboard(project.nodes, search), [project.nodes, search]);
    const options: Record<AssetCategory, Array<[string, InterfaceMessageKey]>> = {
        text: [["all", "previewAll"], ["script", "previewScripts"], ["other", "previewOther"]],
        image: [["all", "previewAll"], ["character", "previewCharacters"], ["scene", "previewScenes"], ["prop", "previewProps"], ["other", "previewOther"]],
        video: [["all", "previewAll"], ["clip", "previewClips"], ["film", "previewFilms"]],
        audio: [],
    };
    return <div className="case-storyboard" data-testid="case-materials">
        <div className="case-storyboard-toolbar">
            <strong>{t("previewProjectMaterials")}</strong>
            <label><Search size={15} /><input aria-label={t("previewSearchMaterials")} placeholder={t("previewSearchMaterials")} value={search} onChange={event => setSearch(event.target.value)} /></label>
        </div>
        <div className="case-storyboard-panels">
            {([["text", "audio"], ["image", "video"]] as AssetCategory[][]).map((column, index) => <div className="case-storyboard-column" key={index}>{column.map(kind => {
                const cards = groups[kind].filter(entry => filters[kind] === "all" || entry.category === filters[kind]);
                return <section key={kind} className={`case-storyboard-section is-${kind}${collapsed[kind] ? " is-collapsed" : ""}`} aria-label={t(CATEGORY_LABELS[kind])}>
                    <header>
                        <strong>{t(CATEGORY_LABELS[kind])} <span>{groups[kind].length}</span></strong>
                        <div className="case-storyboard-filters" role="group" aria-label={t(CATEGORY_LABELS[kind])}>
                            {options[kind].map(([value, label]) => <button key={value} type="button" aria-pressed={filters[kind] === value} onClick={() => setFilters(current => ({ ...current, [kind]: value }))}>{t(label)}</button>)}
                        </div>
                        <button type="button" className="case-storyboard-collapse" aria-expanded={!collapsed[kind]} aria-label={t(collapsed[kind] ? "previewExpandSection" : "previewCollapseSection", { kind: t(CATEGORY_LABELS[kind]) })} onClick={() => setCollapsed(current => ({ ...current, [kind]: !current[kind] }))}>{collapsed[kind] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
                    </header>
                    {!collapsed[kind] ? <div className="case-storyboard-cards">
                        {cards.map(entry => <AssetCard key={entry.node.id} entry={entry} selected={entry.node.id === selectedId} onSelect={onSelect} />)}
                        {!cards.length ? <p className="case-storyboard-empty">{t("previewEmptyCategory")}</p> : null}
                    </div> : null}
                </section>;
            })}</div>)}
        </div>
    </div>;
}

function AssetCard({ entry, selected, onSelect }: { entry: StoryboardEntry; selected: boolean; onSelect: (id: string) => void }) {
    const { t } = useInterfaceTranslation();
    const { node, variants } = entry;
    const category = nodeAssetCategory(node);
    const seconds = node.metadata?.durationMs ? node.metadata.durationMs / 1000 : Number(node.metadata?.seconds);
    const duration = seconds && seconds > 0 ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}` : "";
    const compact = category === "text" || category === "audio";
    return <button type="button" className={`case-storyboard-card${selected ? " is-selected" : ""}`} data-storyboard-node={node.id} aria-label={node.title || t(CATEGORY_LABELS[category])} aria-pressed={selected} onClick={() => onSelect(node.id)}>
        {compact ? <NodeTypeIcon category={category} /> : <span className="case-storyboard-thumbnail">
            {category === "video" && !videoPosterSource(node) ? <StoryboardVideoThumbnail node={node} /> : <NodeThumbnail node={node} />}
            {category === "video" ? <span className="case-storyboard-play"><Play size={17} fill="currentColor" /></span> : null}
            {variants > 1 ? <span className="case-storyboard-badge">×{variants}</span> : duration ? <span className="case-storyboard-badge">{duration}</span> : null}
        </span>}
        <strong title={node.title}>{node.title || t(CATEGORY_LABELS[category])}</strong>
        {compact && duration ? <span className="case-storyboard-duration">{duration}</span> : null}
    </button>;
}

function StoryboardVideoThumbnail({ node }: { node: CanvasNodeData }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [poster, setPoster] = useState("");
    const source = getMediaSource(node);
    useEffect(() => {
        const element = ref.current;
        if (!element || !source) return;
        let capture: AbortController | undefined;
        let objectUrl = "";
        let done = false;
        setPoster("");
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) { capture?.abort(); capture = undefined; return; }
            if (done || capture) return;
            const controller = new AbortController(); capture = controller;
            // Reuse the single-decoder queue, only for visible cards; never persist or upload.
            void captureVideoPoster(source, { signal: controller.signal, maxWidth: 320, timeoutMs: 60000 }).then(result => {
                if (controller.signal.aborted) return;
                done = true;
                if (result.poster) { objectUrl = URL.createObjectURL(result.poster); setPoster(objectUrl); }
            }).catch(() => { if (!controller.signal.aborted) done = true; });
        });
        observer.observe(element);
        return () => { observer.disconnect(); capture?.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [source]);
    return <span ref={ref} className="case-storyboard-video-poster">{poster ? <img src={poster} alt="" /> : <Film size={22} />}</span>;
}

function NodeInspector({ node, project, onSelect, onClose, onLocate }: { node?: CanvasNodeData; project: CaseProject; onSelect: (id: string) => void; onClose: () => void; onLocate: () => void }) {
    const { t } = useInterfaceTranslation();
    const mediaSource = useMediaSource(node);
    const category = node ? nodeAssetCategory(node) : undefined;
    const references = node ? buildNodeReferenceEntries(node, project) : [];
    const parameters = node ? readSavedParameters(node) : [];
    const prompt = node ? nodePrompt(node) : "";
    const output = node ? nodeOutput(node) : "";

    if (!node) {
        return (
            <aside className="case-project-preview-inspector is-empty" aria-label={t("previewNodeDetails")}>
                <Box size={22} />
                <strong>{t("previewSelectNode")}</strong>
                <p>{t("previewInspectorHint")}</p>
            </aside>
        );
    }

    return (
        <aside className="case-project-preview-inspector" data-canvas-no-zoom aria-label={t("previewNamedDetails", { name: node.title || t("previewNode") })}>
            <header className="case-project-preview-inspector-header">
                <div>
                    <span>{t("previewTypedNode", { type: t(CATEGORY_LABELS[category || "text"]) })}</span>
                    <h3 title={node.title}>{node.title || t("previewUntitledNode")}</h3>
                </div>
                <button type="button" aria-label={t("previewCloseDetails")} onClick={onClose}>
                    <X size={17} />
                </button>
            </header>
            <div className="case-project-preview-inspector-body">
                <InspectorMedia node={node} source={mediaSource} />
                <button type="button" className="case-project-preview-locate" onClick={onLocate}><Maximize size={14} />{t("previewLocate")}</button>

                <InspectorSection title={t("previewNodeInfo")}>
                    <dl className="case-project-preview-meta-list">
                        <div>
                            <dt>{t("previewType")}</dt>
                            <dd>{String(node.type)}</dd>
                        </div>
                        <div>
                            <dt>{t("previewPosition")}</dt>
                            <dd>
                                {formatNumber(node.position.x)}, {formatNumber(node.position.y)}
                            </dd>
                        </div>
                        <div>
                            <dt>{t("previewSize")}</dt>
                            <dd>
                                {formatNumber(node.width)} × {formatNumber(node.height)}
                            </dd>
                        </div>
                        <div>
                            <dt>{t("previewGroup")}</dt>
                            <dd>{node.parentId ? project.nodes.find((item) => item.id === node.parentId)?.title || node.parentId : t("previewTopLevel")}</dd>
                        </div>
                    </dl>
                </InspectorSection>

                <InspectorSection title={t("previewFullPrompt")}>
                    <div className="case-project-preview-long-text">{prompt || t("previewNoPrompt")}</div>
                </InspectorSection>

                {category === "text" ? (
                    <InspectorSection title={t("previewOutputText")}>
                        <div className="case-project-preview-long-text">{output || t("previewNoOutput")}</div>
                    </InspectorSection>
                ) : null}

                <InspectorSection title={t("previewSavedSettings")}>
                    {parameters.length ? (
                        <dl className="case-project-preview-parameter-list">
                            {parameters.map(([key, value]) => (
                                <div key={key}>
                                    <dt>{PARAMETER_LABELS[key] ? t(PARAMETER_LABELS[key]) : key}</dt>
                                    <dd>{formatParameterValue(value, t("previewUnset"))}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className="case-project-preview-muted">{t("previewNoSettings")}</p>
                    )}
                </InspectorSection>

                <InspectorSection title={t("previewInputReferences", { count: references.length })}>
                    {references.length ? (
                        <div className="case-project-preview-reference-list">
                            {references.map(({ node: referenceNode, relation }) => (
                                <button key={`${relation}-${referenceNode.id}`} type="button" onClick={() => onSelect(referenceNode.id)}>
                                    <NodeTypeIcon category={nodeAssetCategory(referenceNode)} />
                                    <span>
                                        <strong>{referenceNode.title || t("previewUntitledNode")}</strong>
                                        <small>
                                            {t(relation === "连线输入" ? "previewEdgeInput" : "previewSavedReference")} · {t(CATEGORY_LABELS[nodeAssetCategory(referenceNode)])}
                                        </small>
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="case-project-preview-muted">{t("previewNoReferences")}</p>
                    )}
                </InspectorSection>
            </div>
        </aside>
    );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="case-project-preview-inspector-section">
            <h4>{title}</h4>
            {children}
        </section>
    );
}

function InspectorMedia({ node, source }: { node: CanvasNodeData; source: string }) {
    const { t } = useInterfaceTranslation();
    const category = nodeAssetCategory(node);
    if (category === "image") {
        return (
            <div className="case-project-preview-inspector-media">
                <PreviewImage source={source || imageSource(node)} fallback={imageOriginalSource(node)} alt={node.title || t("previewImageAsset")} failureLabel={t("previewImageFailed")} />
            </div>
        );
    }
    if (category === "video") {
        const poster = videoPosterSource(node);
        return (
            <div className="case-project-preview-inspector-media">
                <InspectorVideo node={node} source={source} poster={poster} />
            </div>
        );
    }
    if (category === "audio") {
        return <div className="case-project-preview-inspector-audio">{source ? <audio src={source} controls preload="none" aria-label={node.title || t("previewAudioAsset")} /> : <MediaPlaceholder icon={<Music2 size={25} />} label={t("previewNoAudio")} />}</div>;
    }
    return null;
}

function InspectorVideo({ node, source, poster }: { node: CanvasNodeData; source: string; poster: string }) {
    const { t } = useInterfaceTranslation();
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [poster, source]);

    if (failed) {
        return poster ? (
            <>
                <PreviewImage source={poster} alt={t("previewFirstFrame", { name: node.title || t("previewAssetVideo") })} failureLabel={t("previewFirstFrameFailed")} />
                <p className="case-project-preview-media-error" role="status">
                    {t("previewVideoPosterOnly")}
                </p>
            </>
        ) : (
            <MediaPlaceholder icon={<Film size={25} />} label={t("previewVideoFailed")} role="status" />
        );
    }

    if (source) return <video src={source} poster={poster || undefined} autoPlay controls playsInline preload="metadata" aria-label={node.title || t("previewVideoAsset")} onError={() => setFailed(true)} />;
    if (poster) return <PreviewImage source={poster} alt={t("previewFirstFrame", { name: node.title || t("previewAssetVideo") })} failureLabel={t("previewFirstFrameFailed")} />;
    return <MediaPlaceholder icon={<Film size={25} />} label={t("previewNoVideo")} role="status" />;
}

function MediaPlaceholder({ icon, label, role }: { icon: ReactNode; label: string; role?: "status" }) {
    return (
        <div className="case-project-preview-media-placeholder" role={role}>
            {icon}
            <span>{label}</span>
        </div>
    );
}

function PreviewImage({ source, fallback = "", alt, failureLabel, loading = "lazy" }: { source: string; fallback?: string; alt: string; failureLabel: string; loading?: "lazy" | "eager" }) {
    const { t } = useInterfaceTranslation();
    const [current, setCurrent] = useState(source || fallback);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setCurrent(source || fallback);
        setFailed(false);
    }, [fallback, source]);

    if (!current) return <MediaPlaceholder icon={<ImageIcon size={22} />} label={t("previewAssetImage")} />;
    if (failed) return <MediaPlaceholder icon={<ImageIcon size={22} />} label={failureLabel} role="status" />;
    return (
        <img
            src={current}
            alt={alt}
            loading={loading}
            decoding="async"
            draggable={false}
            onError={() => {
                if (fallback && current !== fallback) {
                    setCurrent(fallback);
                    return;
                }
                setFailed(true);
            }}
        />
    );
}

function NodeThumbnail({ node }: { node: CanvasNodeData }) {
    const { t } = useInterfaceTranslation();
    const category = nodeAssetCategory(node);
    if (category === "image") {
        const source = imageSource(node);
        return <PreviewImage source={source} fallback={imageOriginalSource(node)} alt="" failureLabel={t("previewImageFailed")} />;
    }
    if (category === "video") {
        const poster = videoPosterSource(node);
        return poster ? <PreviewImage source={poster} alt="" failureLabel={t("previewPosterUnavailable")} /> : <MediaPlaceholder icon={<Film size={22} />} label={t("previewPosterUnavailable")} role="status" />;
    }
    if (category === "audio") return <MediaPlaceholder icon={<Music2 size={22} />} label={t("previewOpenAudio")} />;
    const content = nodeOutput(node) || nodePrompt(node);
    return <span className="case-project-preview-text-thumbnail">{content || t("previewTextThumbnail")}</span>;
}

function NodeTypeIcon({ category }: { category: AssetCategory }) {
    if (category === "image") return <ImageIcon size={14} aria-hidden="true" />;
    if (category === "video") return <Film size={14} aria-hidden="true" />;
    if (category === "audio") return <Music2 size={14} aria-hidden="true" />;
    return <FileText size={14} aria-hidden="true" />;
}

function useMediaSource(node?: CanvasNodeData) {
    const fallback = node ? getMediaSource(node) : "";
    const storageKey = node?.metadata?.storageKey || "";
    const [source, setSource] = useState(fallback);

    useEffect(() => {
        let active = true;
        if (!node || !["image", "video", "audio"].includes(nodeAssetCategory(node))) {
            setSource("");
            return () => {
                active = false;
            };
        }
        setSource(fallback);
        void resolveMediaUrl(storageKey, fallback)
            .then((url) => {
                if (active) setSource(url || fallback);
            })
            .catch(() => {
                if (active) setSource(fallback);
            });
        return () => {
            active = false;
        };
    }, [fallback, node, storageKey]);

    return source;
}

function nodeAssetCategory(node: CanvasNodeData): AssetCategory {
    if (
        node.type === CanvasNodeType.Image ||
        node.type === CanvasNodeType.Drawing ||
        node.type === CanvasNodeType.Panorama ||
        node.type === CanvasNodeType.ColorGrade
    )
        return "image";
    if (node.type === CanvasNodeType.Video) return "video";
    if (node.type === CanvasNodeType.Audio) return "audio";
    return "text";
}

function nodePrompt(node: CanvasNodeData) {
    const metadata = node.metadata;
    if (metadata?.prompt) return metadata.prompt;
    if (metadata?.composerContent) return metadata.composerContent;
    if (metadata?.ltvReferencePlan?.prompt) return metadata.ltvReferencePlan.prompt;
    return "";
}

function nodeOutput(node: CanvasNodeData) {
    return nodeAssetCategory(node) === "text" ? node.metadata?.content || "" : "";
}

function imageSource(node: CanvasNodeData) {
    return node.metadata?.previewContent || node.metadata?.content || "";
}

function imageOriginalSource(node: CanvasNodeData) {
    return node.metadata?.content || "";
}

function videoPosterSource(node: CanvasNodeData) {
    if (node.metadata?.videoPreview?.content) return node.metadata.videoPreview.content;
    if (node.metadata?.previewContent) return node.metadata.previewContent;
    return canvasNodeVideoPreviewUrl(node);
}

function getMediaSource(node: CanvasNodeData) {
    const content = node.metadata?.content || "";
    if (nodeAssetCategory(node) === "image") return node.metadata?.previewContent || content;
    if (nodeAssetCategory(node) === "video") return node.metadata?.importSource?.provider === "libtv" ? buildLibTVVideoSourceUrl(content) : content;
    if (nodeAssetCategory(node) === "audio") return content;
    return "";
}

function buildNodeReferenceEntries(node: CanvasNodeData, project: CaseProject) {
    const byId = new Map(project.nodes.map((item) => [item.id, item]));
    const entries: Array<{ node: CanvasNodeData; relation: "连线输入" | "保存的参考" }> = [];
    const seen = new Set<string>();
    project.connections
        .filter((connection) => connection.toNodeId === node.id)
        .forEach((connection) => {
            const referenceNode = byId.get(connection.fromNodeId);
            if (referenceNode && referenceNode.id !== node.id) {
                entries.push({ node: referenceNode, relation: "连线输入" });
                seen.add(referenceNode.id);
            }
        });
    collectSavedReferenceIds(node).forEach((id) => {
        const referenceNode = byId.get(id);
        if (referenceNode && referenceNode.id !== node.id && !seen.has(referenceNode.id)) {
            entries.push({ node: referenceNode, relation: "保存的参考" });
            seen.add(referenceNode.id);
        }
    });
    return entries;
}

function collectSavedReferenceIds(node: CanvasNodeData) {
    const metadata = node.metadata;
    const ids = new Set<string>();
    const add = (value: unknown) => {
        if (typeof value === "string" && value) ids.add(value);
    };
    metadata?.references?.forEach(add);
    metadata?.referenceAssetNodeIds?.forEach(add);
    metadata?.storyboardManagedReferenceNodeIds?.forEach(add);
    metadata?.storyboard?.referenceNodeIds.forEach(add);
    add(metadata?.videoStartFrameNodeId);
    add(metadata?.videoEndFrameNodeId);
    add(metadata?.videoFrameSourceNodeId);
    Object.values(metadata?.characterViewNodeIds || {}).forEach(add);
    metadata?.ltvReferencePlan?.references.forEach((reference) => add(reference.nodeId));
    metadata?.ltvReferencePlan?.texts?.forEach((reference) => add(reference.nodeId));
    metadata?.storyboard?.rows.forEach((row) => {
        add(row.imageNodeId);
        add(row.videoNodeId);
        row.characters.forEach((character) => add(character.characterImageNodeId));
        row.assetBindings.forEach((binding) => add(binding.nodeId));
        row.generationReferenceNodeIds?.image.forEach(add);
        row.generationReferenceNodeIds?.video.forEach(add);
    });
    return ids;
}

function readSavedParameters(node: CanvasNodeData) {
    const metadata = node.metadata || {};
    return SAVED_PARAMETER_KEYS.flatMap((key) => (key in metadata && metadata[key as keyof typeof metadata] !== undefined ? [[key, metadata[key as keyof typeof metadata]] as [string, unknown]] : []));
}

function formatParameterValue(value: unknown, unsetLabel: string) {
    if (value === undefined || value === null || value === "") return unsetLabel;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return redactCredentialQuery(value.toString());
    try {
        return JSON.stringify(redactSensitiveValue(value), null, 2);
    } catch {
        return String(value);
    }
}

const SENSITIVE_KEY_PATTERN = /(?:api[_-]?key|token|secret|password|authorization|cookie|credential|private[_-]?key)/i;

function redactSensitiveValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactSensitiveValue);
    if (!value || typeof value !== "object") return typeof value === "string" ? redactCredentialQuery(value) : value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, SENSITIVE_KEY_PATTERN.test(key) ? "[已隐藏]" : redactSensitiveValue(child)]));
}

function redactCredentialQuery(value: string) {
    return value.replace(/([?&](?:api[_-]?key|token|secret|password|authorization|cookie)=)[^&#\s]+/gi, "$1[已隐藏]");
}

function formatNumber(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
