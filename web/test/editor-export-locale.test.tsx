import { loadInterfaceLocale as preloadInterfaceLocale } from "../src/lib/interface-locale";
await preloadInterfaceLocale("en-US");

import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { interfaceTranslator, type InterfaceLocale } from "../src/lib/interface-locale";
import type { TimelineProject } from "../src/types/timeline";

let locale: InterfaceLocale = "en-US";
let project: TimelineProject = { version: 2, tracks: [], clips: [], durationMs: 0 };
mock.module("../src/components/editor/editor-context", () => ({
    useEditorHostContext: () => ({ projectId: "fixture" }),
    useEditorStoreContext: () => ({ project }),
}));
mock.module("../src/stores/use-interface-locale-store", () => ({ useInterfaceTranslation: () => ({ locale, t: interfaceTranslator(locale) }) }));
mock.module("../src/lib/timeline/timeline-export", () => ({ exportTimelineToMp4: () => { throw new Error("SSR must not export"); } }));
const { EditorExport, EditorExportResult } = await import("../src/lib/plugins/builtin/editor/editor-export");

test("server result exposes exact UTF-8 subtitle sidecar without claiming burned-in video", () => {
    const subtitleSrt = "1\n00:00:00,100 --> 00:00:01,000\n中文 <字幕> & 100% #?\n\n";
    for (const language of ["en-US", "zh-CN"] as const) {
        locale = language;
        const html = renderToStaticMarkup(<EditorExportResult result={{ resourceId: "fixture", fileName: "中文成片.MP4", subtitleSrt }} />);
        const href = html.match(/href="data:application\/x-subrip;charset=utf-8,([^"]+)"/)?.[1];
        expect(href).toBeDefined();
        expect(decodeURIComponent(href!)).toBe(subtitleSrt);
        expect(html).toContain('download="中文成片.srt"');
        expect(html).toContain(interfaceTranslator(language)("exportSubtitleSidecar"));
    }
    const without = renderToStaticMarkup(<EditorExportResult result={{ resourceId: "fixture" }} />);
    expect(without).not.toContain("application/x-subrip");
    expect(without).toContain('download="timeline.mp4"');
});

test("empty export panel renders both languages and disabled actions", () => {
    project = { version: 2, tracks: [], clips: [], durationMs: 0 };
    locale = "en-US";
    const english = renderToStaticMarkup(<EditorExport />);
    for (const text of ["Render plan", "Media sources", "Render video (server)", "Export locally (ffmpeg.wasm)", "no media clips to export"]) expect(english).toContain(text);
    expect(english.match(/disabled=""/g)).toHaveLength(2);
    expect(english).not.toContain("渲染计划");
    locale = "zh-CN";
    const chinese = renderToStaticMarkup(<EditorExport />);
    expect(chinese).toContain("渲染计划");
    expect(chinese).toContain("本地导出（ffmpeg.wasm）");
});

test("renderable panel translates plan labels without changing media or subtitles", () => {
    locale = "en-US";
    project = { version: 2, durationMs: 1000, tracks: [], clips: [
        { id: "video", kind: "video", trackId: "video", nodeId: "source", title: "原片 {name}", startMs: 0, durationMs: 1000, sourceDurationMs: 1000,
            directMedia: { id: "asset", kind: "video", title: "中文原片", url: "https://example.invalid/source.mp4" } },
        { id: "sub", kind: "subtitle", trackId: "sub", nodeId: "source", startMs: 0, durationMs: 500, text: "字幕不翻译" },
    ] };
    const before = JSON.stringify(project);
    const html = renderToStaticMarkup(<EditorExport />);
    expect(html).toContain("Trimming video");
    expect(html).toContain("Rendering subtitles");
    expect(html).not.toContain('disabled=""');
    expect(JSON.stringify(project)).toBe(before);
    expect(interfaceTranslator("en-US")("exportRemoteComplete", { name: "中文 {name}.mp4" })).toBe("Render complete: 中文 {name}.mp4");
});
