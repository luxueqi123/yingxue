import { loadInterfaceLocale as preloadInterfaceLocale } from "../src/lib/interface-locale";
await preloadInterfaceLocale("en-US");

import { expect, test } from "bun:test";
import { interfaceLocales, interfaceTranslator, isInterfaceLocale, translateInterface } from "../src/lib/interface-locale";

test("编辑器顶栏及导入提示翻译保留源名称、规格和未归档边界", () => {
    const en = interfaceTranslator("en-US"), zh = interfaceTranslator("zh-CN");
    expect(en("canvasToolbarMenu")).toBe("Open canvas menu");
    expect(en("canvasToolbarRename")).toBe("Rename canvas");
    expect(zh("canvasToolbarRename")).toBe("重命名画布");
    expect(en("canvasToolbarBackProject", { name: "中文工程 {name}" })).toBe("Back to project: 中文工程 {name}");
    expect(en("canvasImportTitle", { source: "LibTV" })).toBe("Import LibTV canvas");
    expect(en("canvasImportFileHint")).toContain("8 MiB");
    expect(en("canvasImportMediaWarning")).toContain("not archived");
    expect(en("canvasImportSnapshotWarning")).toContain("unconverted nodes");
    expect(en("canvasImportDone", { nodes: 2, connections: 1 })).toBe("Imported 2 nodes and 1 connections");
});

test("画布确认提示保留删除范围以及云端替换而非合并的边界", () => {
    const en = interfaceTranslator("en-US"), zh = interfaceTranslator("zh-CN");
    expect(en("canvasHistoryTitle")).toBe("Canvas creation and change history");
    expect(en("canvasDeleteWarning", { count: 2 })).toContain("2 canvas(es), including their nodes and connections");
    expect(zh("canvasDeleteWarning", { count: 2 })).toBe("将删除 2 个画布，里面的节点和连线也会一起移除。");
    expect(en("canvasSyncReplaceWarning")).toContain("not a merge");
    expect(en("canvasSyncKeepDraftWarning")).toContain("local edits will be saved as a draft");
    expect(en("canvasSyncDraftCount", { count: 3 })).toContain("3");
});

test("画布库操作双语保留工程名和项目名中的中文及占位符", () => {
    const en = interfaceTranslator("en-US"), zh = interfaceTranslator("zh-CN");
    expect(en("canvasLibrarySearch")).toBe("Search canvases");
    expect(en("canvasLibrarySortName")).toBe("By name");
    expect(zh("canvasLibrarySearch")).toBe("搜索画布");
    expect(en("canvasLibraryOpen", { name: "中文工程 {name}" })).toBe("Open canvas 中文工程 {name}");
    expect(en("canvasLibraryProject", { name: "项目中文" })).toBe("Project: 项目中文");
    expect(en("canvasLibrarySelected", { count: 2 })).toBe("Selected canvases: 2");
    expect(en("canvasLibraryAssociationHint")).toContain("nodes and local media");
});

test("时间线主操作与缩放可访问名称随界面语言切换", () => {
    const zh = interfaceTranslator("zh-CN"), en = interfaceTranslator("en-US");
    expect(zh("timelineTitle")).toBe("多轨时间线");
    expect(en("timelineTitle")).toBe("Multitrack timeline");
    expect(en("timelineSave")).toBe("Save");
    expect(en("timelineCancel")).toBe("Cancel");
    expect(en("timelineZoomIn")).toBe("Zoom in timeline");
    expect(en("timelineZoomOut")).toBe("Zoom out timeline");
    expect(en("timelineSnapOn")).toBe("Snap on");
    expect(en("timelineSnapOff")).toBe("Snap off");
    expect(en("timelineSummary", {time:"27:03.3",clips:62,tracks:3})).toBe("Duration 27:03.3 · 62 clips · 3 tracks");
    expect(zh("timelineSummary", {time:"27:03.3",clips:62,tracks:3})).toBe("总时长 27:03.3 · 62 个片段 · 3 条轨道");
    expect(en("timelineClipEdit")).toBe("Edit clip");
    expect(en("timelineSourceStart")).toBe("Source start");
    expect(en("timelineNoSubtitle")).toContain("select a subtitle clip");
    expect(en("timelineAdded", { name:"雪山 {name}" })).toBe("Added “雪山 {name}” to the timeline");
    expect(en("timelinePreviewDecodeFailed")).toBe("Video decoding or cross-origin access failed");
    expect(zh("timelinePreviewDecodeFailed")).toBe("视频素材解码或跨域读取失败");
    expect(en("timelineSeekInside")).toContain("inside the clip");
});

test("案例复制进度区分文件核验、账号素材保存和工程保存",()=>{
    expect(interfaceTranslator("zh-CN")("caseCopyVerifying",{completed:42,total:104})).toBe("正在校验素材 42/104");
    expect(interfaceTranslator("en-US")("caseCopyUploading",{completed:42,total:104})).toBe("Saving account media 42/104");
    expect(interfaceTranslator("en-US")("caseCopySaving")).toContain("saving project");
});

test("语言仅接收已提供字典的值，不把路径或任意字符串当作语言", () => {
    for (const value of interfaceLocales) expect(isInterfaceLocale(value)).toBe(true);
    for (const value of ["en", "fr", "de", "../../en-US", null, {}, undefined]) expect(isInterfaceLocale(value)).toBe(false);
});

test("广场详情双语保留用户标题、署名和只读边界", () => {
    const t = interfaceTranslator("en-US");
    expect(t("galleryViewNamedCase", { name: "雪山 Snow {name}" })).toBe("View case 雪山 Snow {name}");
    expect(t("galleryNodeCredit", { author: "夏时安 / Echo", count: 12 })).toBe("夏时安 / Echo · 12 production nodes");
    expect(t("galleryRequiredInputs", { count: 3 })).toContain("3");
    expect(t("galleryReadOnly")).toBe("Read-only preview · Copy to edit");
    expect(t("galleryViewBoundary")).toContain("does not generate or save");
    expect(interfaceTranslator("zh-CN")("galleryReloadProject")).toBe("重新加载工程");
});

test("键值翻译及变量替换不翻译用户数据，不递归解析插值", () => {
    expect(translateInterface("zh-CN", "home")).toBe("首页");
    expect(translateInterface("en-US", "home")).toBe("Home");
    expect(interfaceTranslator("en-US")("creditsBalance", { balance: "1,234.5" })).toBe("Open credits, 1,234.5 available");
    expect(translateInterface("en-US", "creditsBalance", { balance: "<script>{balance}</script>" })).toBe("Open credits, <script>{balance}</script> available");
    expect(translateInterface("en-US", "creditsBalance")).toContain("{balance}");
    expect(translateInterface("en-US", "openTool", { name: "Character studio" })).toBe("Open Character studio");
    expect(translateInterface("zh-CN", "scriptStudio")).toBe("剧本原创与改编");
    expect(translateInterface("en-US", "canvasHeadline")).toBe("Give ideas room to grow");
});

test("持久化只存语言偏好，坏值恢复为中文，拒绝非法运行时输入", async () => {
    const { useInterfaceLocaleStore: store } = await import("../src/stores/use-interface-locale-store");
    const initial = store.getState();
    try {
        initial.setLocale("en-US");
        expect(store.getState().locale).toBe("en-US");
        initial.setLocale("xx" as never);
        expect(store.getState().locale).toBe("en-US");
        const options = store.persist.getOptions();
        expect(options.partialize?.(store.getState())).toEqual({ locale: "en-US", preference: "manual" });
        expect(options.merge?.({ locale: "../invalid", setLocale: "bad" }, initial)).toEqual({ ...initial, locale: "zh-CN", preference: "automatic" });
        expect(options.merge?.({ locale: "en-US" }, initial)).toEqual({ ...initial, locale: "en-US", preference: "manual" });
    } finally { store.setState(initial); }
});

test("输入区翻译保留模型计费与逐步确认语义，插值不改用户提示词", () => {
    const t = interfaceTranslator("en-US");
    expect(t("composerSendCost", { credits: "1.5" })).toBe("Estimated 1.5 credits, send");
    expect(t("composerConfirmHint")).toBe("Confirm before the Agent runs production tools");
    expect(t("composerAutoHint")).toContain("billed by model");
    expect(t("composerRemoveFailed", { name: "分镜中文-English.png" })).toBe("Remove failed attachment 分镜中文-English.png");
    expect(interfaceTranslator("zh-CN")("composerStart")).toBe("开始创作");
});

test("片头控件双语保留尺寸、选帧和未确认保存语义", () => {
    const t = interfaceTranslator("en-US");
    expect(t("titleText")).toBe("Title text");
    expect(t("titleFrameInfo", { width: 320, height: 180, seconds: "1.000" })).toBe("Original size 320 × 180 · Frame at 1.000 seconds");
    expect(t("titleSaveUnconfirmed", { detail: "原始错误 {detail}" })).toBe("原始错误 {detail}; cloud saving is not confirmed. You can retry the same asset.");
    expect(t("titleMotionHint")).toContain("preserving the full video duration and audio");
    expect(t("titleExportCancelled")).toContain("source video and title frame are preserved");
    expect(interfaceTranslator("zh-CN")("titleCapture")).toBe("提取并预览设计帧");
});
test("模型确认区分账号配置与底座协议，原模型名称不翻译", () => {
    const t = interfaceTranslator("en-US");
    expect(t("caseModelCounts", {ready: 46, mismatch: 0, unconfigured: 62})).toBe("Matching models: 46 · Specification mismatches: 0 · Unconfigured: 62");
    expect(t("caseModelMissingReason")).toContain("does not mean the platform lacks protocol support");
    expect(t("caseModelSource", {value: "原模型 {value}"})).toBe("Source project model: 原模型 {value}");
    expect(t("caseModelCopyNotice")).toContain("without calling models or charging");
    expect(interfaceTranslator("zh-CN")("caseModelUnconfigured")).toBe("当前账号未配置匹配模型");
});
