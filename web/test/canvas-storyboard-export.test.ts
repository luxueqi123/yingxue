import { expect, test } from "bun:test";
import { storyboardCsv } from "../src/lib/canvas/canvas-storyboard-export";
import { createCanvasNode, createStoryboardRow } from "../src/lib/canvas/canvas-project-domain";
import { CanvasNodeType } from "../src/types/canvas";
import { adaptLtvNativeProject } from "../src/lib/canvas/ltv-native-project";

test("分镜导出保持源列顺序、原标注、小数时长、人物及参考片段", () => {
    const image = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { content: "https://example.test/person.png" });
    const row = createStoryboardRow(1, {
        durationSeconds: 0.5, plotDescription: '推门,"雨夜"\n第二行',
        characters: [{ characterName: "映雪", characterDescription: "白衣", characterImageNodeId: image.id }],
        videoReference: { startTime: 1.25, endTime: 1.75, referenceFrameImage: "https://example.test/frame.png" },
        imageGenerationPrompt: "=原文不得作为表格公式执行", assetBindings: [{ nodeId: image.id, role: "character" }],
    });
    const script = createCanvasNode(CanvasNodeType.Script, { x: 0, y: 0 }, {
        storyboard: { rows: [row], visibleColumns: ["shotNumber"], referenceNodeIds: [] },
        ltvStoryboardSource: { columns: [{ field: "duration_seconds", label: "原始时长", description: "秒" }, { field: "plot_description", label: "原始描述", description: "" }] },
    });
    const csv = storyboardCsv(script, [script, image], [
        { label: "描述", value: "plotDescription" }, { label: "时长", value: "durationSeconds" },
        { label: "人物", value: "characters" }, { label: "参考", value: "videoReference" },
        { label: "提示词", value: "imageGenerationPrompt" }, { label: "素材", value: "assets" },
    ]);
    expect(csv.startsWith('\ufeff"原始时长","原始描述"')).toBe(true);
    expect(csv).toContain('"0.5","推门,""雨夜""\n第二行"');
    expect(csv).toContain('"映雪","白衣","https://example.test/person.png"');
    expect(csv).toContain('"1.25","1.75","https://example.test/frame.png"');
    expect(csv).toContain("'=原文不得作为表格公式执行");
    expect(row.imageGenerationPrompt).toBe("=原文不得作为表格公式执行");
    expect(csv).toContain(image.id);
    row.generationReferenceNodeIds={image:[image.id],video:[]};
    const withTracks=storyboardCsv(script,[script,image],[{label:'素材',value:'assets'}]);
    expect(withTracks).toContain('"生图参考","视频参考"');
    expect(withTracks).toContain(image.id);
});

test("视频故事 CSV 保留原列顺序、各自原值和原片秒级时序", () => {
    const source = { nodes: [
        { id: "source", type: "video", position: { x: 0, y: 0 }, data: { action: "video_resource", url: ["https://example.test/source.mp4"] } },
        { id: "story", type: "video-story", position: { x: 200, y: 0 }, data: { action: "video_story_resource", sourceVideoNodeId: "source", shotColumns: [
            { field: "start_time", label: "开始时间", description: "秒" }, { field: "end_time", label: "结束时间", description: "秒" },
            { field: "focal_depth", label: "景深", description: "" }, { field: "audio_music", label: "音乐", description: "" },
            { field: "audio_voice", label: "人声", description: "" }, { field: "frameUrl", label: "关键帧", description: "" },
        ], rows: [{ shot_number: 1, start_time: 1.25, end_time: 3.75, duration: 2.5, focal_depth: "浅景深", audio_music: "弦乐", audio_voice: "喘息", frameUrl: "https://example.test/frame.jpg" }] } },
    ], edges: [] };
    const adapted = adaptLtvNativeProject(source, { channels: [] }, "case", "视频故事");
    const story = adapted.project.nodes.find(node => node.id === "story")!;
    const csv = storyboardCsv(story, adapted.project.nodes, [{ label: "时长", value: "durationSeconds" }, { label: "镜头设计", value: "camera" }]);
    expect(csv.startsWith('\ufeff"开始时间","结束时间","景深","音乐","人声","关键帧"')).toBe(true);
    expect(csv).toContain('"1.25","3.75","浅景深","弦乐","喘息","https://example.test/frame.jpg"');
    expect(csv).toContain('"2.5","景深：浅景深"');
});
