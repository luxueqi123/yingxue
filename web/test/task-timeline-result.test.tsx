import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskResultMedia } from "../src/pages/tasks/task-result-media";

test("retained timeline task previews and downloads its owned resource instead of its filename", () => {
    const html = renderToStaticMarkup(<TaskResultMedia taskType="timeline_render"
        value={JSON.stringify({ resourceId: "result-owned", fileName: "原生成片.mp4", durationMs: 1126048 })} />);
    expect(html).toContain('src="/api/resources/result-owned/file"');
    expect(html).toContain('href="/api/resources/result-owned/file"');
    expect(html).toContain('download="原生成片.mp4"');
    expect(html).not.toContain('src="原生成片.mp4"');
});

test("retained timeline task keeps exact UTF-8 subtitle sidecar independently from MP4", () => {
    const subtitleSrt = "1\n00:00:00,000 --> 00:00:01,000\n中文 <字幕> & 100% #?\n\n";
    const html = renderToStaticMarkup(<TaskResultMedia taskType="timeline_render"
        value={JSON.stringify({ resourceId: "result-owned", fileName: "原生成片.MP4", subtitleSrt })} />);
    const encoded = html.match(/href="data:application\/x-subrip;charset=utf-8,([^"]+)"/)?.[1];
    expect(encoded).toBeDefined();
    expect(decodeURIComponent(encoded!)).toBe(subtitleSrt);
    expect(html).toContain('download="原生成片.srt"');
    expect(html).toContain("字幕文件会与视频分开下载。");
});

test("timeline result defaults the filename and excludes empty subtitle downloads", () => {
    const html = renderToStaticMarkup(<TaskResultMedia taskType="timeline_render"
        value={JSON.stringify({ resourceId: "result-owned", subtitleSrt: "" })} />);
    expect(html).toContain('download="timeline.mp4"');
    expect(html).not.toContain("application/x-subrip");
});

test("malformed or missing timeline resources do not create download links", () => {
    for (const value of ["{", "null", "[]", JSON.stringify({ resourceId: "" }), JSON.stringify({ resourceId: 7 }),
        JSON.stringify({ resourceId: "result-owned", fileName: 7 })]) {
        const html = renderToStaticMarkup(<TaskResultMedia taskType="timeline_render" value={value} />);
        expect(html).not.toContain('download=');
    }
});

test("other task kinds do not interpret arbitrary resource IDs as timeline exports", () => {
    const html = renderToStaticMarkup(<TaskResultMedia taskType="text" value={JSON.stringify({ resourceId: "result-owned" })} />);
    expect(html).toBe("");
});

test("ordinary image and video result URLs keep their existing previews", () => {
    const html = renderToStaticMarkup(<TaskResultMedia taskType="image"
        value={JSON.stringify({ images: ["https://example.invalid/image.png"], videos: ["https://example.invalid/video.mp4"] })} />);
    expect(html).toContain('src="https://example.invalid/image.png"');
    expect(html).toContain('src="https://example.invalid/video.mp4"');
    expect(html).not.toContain('download=');
});
