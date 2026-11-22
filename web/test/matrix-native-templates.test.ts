import { expect, test } from "bun:test";
import { adaptMatrixTemplates, parseMatrixMarkdown, type MatrixSourceInfo } from "../scripts/adapt-matrix-templates";

const qa = "Preserve identity.";
const Xa = "No text.";
const nv = "Fill edge to edge.";
const fixture = [
    "# fixture",
    "",
    "```javascript",
    `const qa = ${JSON.stringify(qa)};`,
    `const Xa = ${JSON.stringify(Xa)};`,
    `const nv = ${JSON.stringify(nv)};`,
    "```",
    "",
    ...Array.from({ length: 12 }, (_, index) => {
        const number = index + 1;
        const scene = `scene-${number}`;
        const title = `中文模板 ${number}`;
        const ratio = number <= 9 ? "\n  ratio: \"16:9\"," : "";
        return [
            `### ${number}. ${title} (\`${scene}\`)`,
            "```javascript",
            "{",
            `  scene: \"${scene}\",${ratio}`,
            "  prompt: [\"Prompt body.\", nv, qa, Xa].join(\" \")",
            "}",
            "```",
            "",
        ].join("\n");
    }),
].join("\n");

const source: MatrixSourceInfo = {
    path: "E:/source/matrix.md",
    sha256: "a".repeat(64),
};

test("安全解析 12 组原生矩阵，展开白名单字面量并保留源标题顺序", () => {
    const parsed = parseMatrixMarkdown(fixture);
    expect(parsed).toHaveLength(12);
    expect(parsed.map(item => item.title)).toEqual(Array.from({ length: 12 }, (_, index) => `中文模板 ${index + 1}`));
    expect(parsed[0].prompt).toBe(`Prompt body. ${nv} ${qa} ${Xa}`);
    expect(parsed[0].ratio).toBe("16:9");
    expect(parsed[11].ratio).toBeUndefined();
});

test("输出原生可复制制作模板：上传原图、制作输出、说明节点与完整输入边", () => {
    const results = adaptMatrixTemplates(fixture, source);
    const first = results[0];
    expect(first.source.sha256).toBe(source.sha256);
    expect(first.source.snippet).toContain("scene-1");
    expect(first.publication.status).toBe("template");
    expect(first.project).toMatchObject({ version: 1, id: "native-matrix-scene-1", title: "中文模板 1" });
    expect(first.project.nodes).toHaveLength(3);
    const input = first.project.nodes.find(node => node.id.endsWith(":input"))!;
    const output = first.project.nodes.find(node => node.id.endsWith(":output"))!;
    const note = first.project.nodes.find(node => node.id.endsWith(":notice"))!;
    expect(input).toMatchObject({ type: "image", title: expect.stringContaining("上传原图"), metadata: { content: "", status: "idle" } });
    expect(output).toMatchObject({ type: "image", title: expect.stringContaining("制作输出"), metadata: {
        content: "", status: "idle", generationMode: "image", prompt: `Prompt body. ${nv} ${qa} ${Xa}`,
        composerContent: `Prompt body. ${nv} ${qa} ${Xa}`, generationInputRequirements: { image: 1 },
        size: "16:9", strictGenerationOptions: ["size"],
    } });
    expect(output.metadata?.model).toBeUndefined();
    expect(output.metadata?.ltvExecutionContract).toBeUndefined();
    expect(first.project.connections).toEqual([{ id: `${input.id}->${output.id}`, fromNodeId: input.id, toNodeId: output.id }]);
    expect(note.metadata?.content).toContain("未生成");
    expect(note.metadata?.content).toContain(source.sha256);
    expect(note.metadata?.content).toContain(first.source.snippet);
    expect(JSON.stringify(first.project)).not.toMatch(/[A-Za-z]:[\\/]/);
});

test("保持无比例后三组不伪造 size，并拒绝未知变量或表达式", () => {
    const results = adaptMatrixTemplates(fixture, source);
    const lastOutput = results[11].project.nodes.find(node => node.id.endsWith(":output"))!;
    expect(lastOutput.metadata?.size).toBeUndefined();
    expect(lastOutput.metadata?.strictGenerationOptions).toBeUndefined();
    expect(() => parseMatrixMarkdown(fixture.replace("[\"Prompt body.\", nv, qa, Xa]", "[\"Prompt body.\", unknownVariable]"))).toThrow(/未知|不支持|表达式/);
    expect(() => parseMatrixMarkdown(fixture.replace("[\"Prompt body.\", nv, qa, Xa]", "[qa + Xa]"))).toThrow(/表达式|不支持/);
});
