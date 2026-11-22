import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getNodeSpec } from "../src/constant/canvas";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

const REQUIRED_VARIABLES = new Set(["qa", "Xa", "nv"]);
const EXPECTED_TEMPLATE_COUNT = 12;

export type MatrixSourceInfo = {
    path: string;
    sha256: string;
};

export type MatrixTemplate = {
    index: number;
    title: string;
    scene: string;
    ratio?: string;
    prompt: string;
    /** Exact fenced source block, retained for provenance and shown in the note node. */
    snippet: string;
    sourceStart: number;
    sourceEnd: number;
};

type NativeGenerationInputRequirements = { image: 1 };
type NativeNodeMetadata = NonNullable<CanvasNodeData["metadata"]> & {
    /** Native-only field; the shared CanvasNodeMetadata contract is being extended by the main branch. */
    generationInputRequirements?: NativeGenerationInputRequirements;
};
type NativeNode = CanvasNodeData & { metadata: NativeNodeMetadata };

export type AdaptedMatrixTemplate = {
    source: MatrixSourceInfo & {
        kind: "native-matrix-template";
        title: string;
        scene: string;
        ratio?: string;
        snippet: string;
        sourceRange: { start: number; end: number };
    };
    publication: {
        status: "template";
        generated: false;
        paidCalls: 0;
        sourceBackendCalls: 0;
        blockers: ["requires-input-image", "not-generated"];
    };
    project: {
        version: 1;
        id: string;
        title: string;
        nodes: NativeNode[];
        connections: CanvasConnection[];
    };
};

export type MatrixCacheReceipt = {
    version: 1;
    count: number;
    generated: 0;
    paidCalls: 0;
    sourceBackendCalls: 0;
    source: MatrixSourceInfo;
    entries: Array<{
        id: string;
        title: string;
        scene: string;
        sourceSha256: string;
        file: string;
        nodeCount: number;
        connectionCount: number;
        status: "template";
    }>;
};

function fail(message: string): never {
    throw new Error(`矩阵源码解析失败：${message}`);
}

function skipString(text: string, start: number): number {
    if (text[start] !== '"') fail("只允许双引号字符串字面量");
    for (let index = start + 1; index < text.length; index += 1) {
        const char = text[index];
        if (char === "\\") {
            index += 1;
            continue;
        }
        if (char === '"') return index;
    }
    fail("字符串字面量未闭合");
}

function parseStringLiteral(expression: string, context: string): string {
    const value = expression.trim();
    if (!value.startsWith('"')) fail(`${context}必须是双引号字面量`);
    const end = skipString(value, 0);
    if (end !== value.length - 1) fail(`${context}不允许拼接或其它表达式`);
    try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== "string") fail(`${context}不是字符串`);
        return parsed;
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("矩阵源码解析失败：")) throw error;
        fail(`${context}不是有效字符串字面量`);
    }
}

function splitTopLevel(text: string, context: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let square = 0;
    let curly = 0;
    let paren = 0;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === '"') {
            index = skipString(text, index);
            continue;
        }
        if (char === "'" || char === "`") fail(`${context}不允许单引号、模板字符串或执行表达式`);
        if (char === "[") square += 1;
        else if (char === "]") {
            square -= 1;
            if (square < 0) fail(`${context}数组括号不匹配`);
        } else if (char === "{") curly += 1;
        else if (char === "}") {
            curly -= 1;
            if (curly < 0) fail(`${context}对象括号不匹配`);
        } else if (char === "(") paren += 1;
        else if (char === ")") {
            paren -= 1;
            if (paren < 0) fail(`${context}函数括号不匹配`);
        } else if (char === "," && square === 0 && curly === 0 && paren === 0) {
            parts.push(text.slice(start, index).trim());
            start = index + 1;
        }
    }
    if (square !== 0 || curly !== 0 || paren !== 0) fail(`${context}括号不匹配`);
    const tail = text.slice(start).trim();
    if (tail || parts.length > 0) parts.push(tail);
    return parts.filter(Boolean);
}

function splitProperty(segment: string): [string, string] {
    let colon = -1;
    let square = 0;
    let curly = 0;
    let paren = 0;
    for (let index = 0; index < segment.length; index += 1) {
        const char = segment[index];
        if (char === '"') {
            index = skipString(segment, index);
            continue;
        }
        if (char === "'" || char === "`") fail("对象字段不允许执行表达式");
        if (char === "[") square += 1;
        else if (char === "]") square -= 1;
        else if (char === "{") curly += 1;
        else if (char === "}") curly -= 1;
        else if (char === "(") paren += 1;
        else if (char === ")") paren -= 1;
        else if (char === ":" && square === 0 && curly === 0 && paren === 0) {
            if (colon !== -1) fail("对象字段含多个冒号");
            colon = index;
        }
    }
    if (colon <= 0) fail("对象字段缺少键和值");
    const key = segment.slice(0, colon).trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) fail(`不支持的对象键：${key}`);
    return [key, segment.slice(colon + 1).trim()];
}

function parsePromptExpression(expression: string, variables: Map<string, string>): string {
    const value = expression.trim();
    const suffix = '.join(" ")';
    if (!value.endsWith(suffix)) fail("prompt 只允许数组字面量加 .join(\" \")");
    const array = value.slice(0, -suffix.length).trim();
    if (!array.startsWith("[") || !array.endsWith("]")) fail("prompt 必须是数组字面量");
    const items = splitTopLevel(array.slice(1, -1), "prompt 数组");
    if (!items.length) fail("prompt 数组不能为空");
    return items.map((item) => {
        if (item.startsWith('"')) return parseStringLiteral(item, "prompt 数组项");
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(item)) fail(`prompt 含不支持的表达式：${item}`);
        if (!variables.has(item)) fail(`prompt 使用未知变量：${item}`);
        return variables.get(item)!;
    }).join(" ");
}

function parseObjectBlock(body: string, variables: Map<string, string>, index: number, title: string, sceneFromHeading: string, snippet: string, sourceStart: number, sourceEnd: number): MatrixTemplate {
    const value = body.trim();
    if (!value.startsWith("{") || !value.endsWith("}")) fail(`第 ${index} 组不是对象字面量`);
    const properties = new Map<string, string>();
    for (const segment of splitTopLevel(value.slice(1, -1), `第 ${index} 组对象`)) {
        const [key, expression] = splitProperty(segment);
        if (properties.has(key)) fail(`第 ${index} 组重复字段：${key}`);
        properties.set(key, expression);
    }
    for (const key of properties.keys()) if (!["scene", "ratio", "prompt"].includes(key)) fail(`第 ${index} 组含未知字段：${key}`);
    if (!properties.has("scene") || !properties.has("prompt")) fail(`第 ${index} 组缺少 scene 或 prompt`);
    const scene = parseStringLiteral(properties.get("scene")!, `第 ${index} 组 scene`);
    if (scene !== sceneFromHeading) fail(`第 ${index} 组 scene 与标题不一致`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scene)) fail(`第 ${index} 组 scene 不是稳定标识：${scene}`);
    const ratio = properties.has("ratio") ? parseStringLiteral(properties.get("ratio")!, `第 ${index} 组 ratio`) : undefined;
    const prompt = parsePromptExpression(properties.get("prompt")!, variables);
    if (!prompt.trim()) fail(`第 ${index} 组 prompt 为空`);
    return { index, title, scene, ...(ratio ? { ratio } : {}), prompt, snippet, sourceStart, sourceEnd };
}

type CodeBlock = { language: string; body: string; full: string; start: number; end: number };

function extractCodeBlocks(markdown: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const pattern = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
    for (const match of markdown.matchAll(pattern)) {
        const start = match.index ?? 0;
        blocks.push({ language: match[1].trim().toLowerCase(), body: match[2], full: match[0], start, end: start + match[0].length });
    }
    return blocks;
}

function findStatementEnd(text: string, start: number): number {
    for (let index = start; index < text.length; index += 1) {
        if (text[index] === '"') index = skipString(text, index);
        else if (text[index] === ";") return index;
    }
    fail("变量声明缺少分号");
}

function parseVariables(markdown: string): Map<string, string> {
    const variables = new Map<string, string>();
    for (const block of extractCodeBlocks(markdown).filter((item) => item.language === "javascript" || item.language === "js")) {
        if (/\b(?:let|var|function|class|import|export)\b/.test(block.body)) fail("源码含未允许的变量或执行语句");
        const declarations = /(?:^|\r?\n)\s*const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*/gm;
        for (const match of block.body.matchAll(declarations)) {
            const name = match[1];
            if (!REQUIRED_VARIABLES.has(name)) fail(`未知变量声明：${name}`);
            if (variables.has(name)) fail(`变量重复声明：${name}`);
            const expressionStart = (match.index ?? 0) + match[0].length;
            const end = findStatementEnd(block.body, expressionStart);
            variables.set(name, parseStringLiteral(block.body.slice(expressionStart, end), `变量 ${name}`));
        }
    }
    for (const name of REQUIRED_VARIABLES) if (!variables.has(name)) fail(`缺少变量字面量：${name}`);
    return variables;
}

type MatrixHeading = { index: number; title: string; scene: string; start: number; end: number };

function extractHeadings(markdown: string): MatrixHeading[] {
    const headings: MatrixHeading[] = [];
    const pattern = /^###\s+(\d+)\.\s+(.+?)\s+\(`([^`]+)`\)\s*$/gm;
    for (const match of markdown.matchAll(pattern)) {
        const start = match.index ?? 0;
        headings.push({ index: Number(match[1]), title: match[2].trim(), scene: match[3], start, end: start + match[0].length });
    }
    return headings;
}

export function parseMatrixMarkdown(markdown: string): MatrixTemplate[] {
    if (!markdown.trim()) fail("源码为空");
    const variables = parseVariables(markdown);
    const headings = extractHeadings(markdown);
    if (headings.length !== EXPECTED_TEMPLATE_COUNT) fail(`应有 ${EXPECTED_TEMPLATE_COUNT} 组模板，实际 ${headings.length} 组`);
    const templates = headings.map((heading, position) => {
        const expectedIndex = position + 1;
        if (heading.index !== expectedIndex) fail(`模板顺序缺失：期望第 ${expectedIndex} 组，得到第 ${heading.index} 组`);
        const nextStart = headings[position + 1]?.start ?? markdown.length;
        const sectionStart = heading.end;
        const section = markdown.slice(sectionStart, nextStart);
        const blocks = extractCodeBlocks(section).filter((item) => item.language === "javascript" || item.language === "js");
        if (blocks.length !== 1) fail(`第 ${heading.index} 组必须恰好有一个 JavaScript 对象片段`);
        const block = blocks[0];
        const sourceStart = sectionStart + block.start;
        return parseObjectBlock(block.body, variables, heading.index, heading.title, heading.scene, block.full, sourceStart, sourceStart + block.full.length);
    });
    for (const template of templates.slice(0, 9)) if (template.ratio !== "16:9") fail(`前九组必须保留原始比例 16:9：${template.scene}`);
    for (const template of templates.slice(9)) if (template.ratio !== undefined) fail(`后三组不能伪造比例：${template.scene}`);
    return templates;
}

function createNode(type: CanvasNodeType, id: string, title: string, x: number, y: number, metadata: NativeNodeMetadata): NativeNode {
    const spec = getNodeSpec(type);
    return {
        ...spec,
        id,
        type,
        title,
        position: { x, y },
        metadata: { ...(spec.metadata || {}), ...metadata } as NativeNodeMetadata,
    };
}

function displaySourcePath(sourcePath: string): string {
    const normalized = sourcePath.replaceAll("\\", "/");
    const packageName = "03_画板视觉矩阵提示词";
    const packageIndex = normalized.lastIndexOf(`${packageName}/`);
    if (packageIndex >= 0) return normalized.slice(packageIndex);
    return normalized.split("/").filter(Boolean).at(-1) || "原生画板12组视觉矩阵提示词源码.md";
}

export function adaptMatrixTemplate(template: MatrixTemplate, source: MatrixSourceInfo): AdaptedMatrixTemplate {
    if (!/^[a-f0-9]{64}$/.test(source.sha256)) fail("来源 SHA256 无效");
    if (!source.path.trim()) fail("来源路径为空");
    const id = `native-matrix-${template.scene}`;
    const inputId = `${id}:input`;
    const outputId = `${id}:output`;
    const noticeId = `${id}:notice`;
    const input = createNode(CanvasNodeType.Image, inputId, `上传原图 · ${template.title}`, 80, 80, {
        content: "",
        status: "idle",
        workflowKind: "reference_set",
        workflowTitle: template.title,
        workflowDescription: "请在此节点上传本模板对应的原始图片。",
    });
    const outputMetadata: NativeNodeMetadata = {
        content: "",
        status: "idle",
        generationMode: "image",
        prompt: template.prompt,
        composerContent: template.prompt,
        generationInputRequirements: { image: 1 },
        workflowKind: "reference_set",
        workflowTitle: template.title,
        ...(template.ratio ? { size: template.ratio, strictGenerationOptions: ["size"] } : {}),
    };
    const output = createNode(CanvasNodeType.Image, outputId, `制作输出 · ${template.title}`, 900, 80, outputMetadata);
    const ratioText = template.ratio
        ? `原始比例：${template.ratio}（已写入输出节点 size）`
        : "原始比例：源码未提供固定比例；复制后请先选择与原图对应的画幅，本模板不自动推断或保持比例，不预设 size";
    const noticeContent = [
        `模板说明：${template.title}`,
        "请先在“上传原图”节点导入对应原始图片，再使用“制作输出”节点。",
        "这是可复制的原生制作模板，不是已生成的成片案例；当前图片状态为未生成，也没有封面、模型、渠道或费用配置。",
        ratioText,
        `来源文件：${displaySourcePath(source.path)}`,
        `来源 SHA256：${source.sha256}`,
        "原始片段（仅作可追溯内容，不执行）：",
        template.snippet,
    ].join("\n");
    const notice = createNode(CanvasNodeType.Text, noticeId, `制作说明 · ${template.title}`, 80, 560, { content: noticeContent, status: "success", workflowTitle: template.title });
    const connections: CanvasConnection[] = [{ id: `${inputId}->${outputId}`, fromNodeId: inputId, toNodeId: outputId }];
    return {
        project: { version: 1, id, title: template.title, nodes: [input, output, notice], connections },
        source: {
            path: source.path,
            sha256: source.sha256,
            kind: "native-matrix-template",
            title: template.title,
            scene: template.scene,
            ...(template.ratio ? { ratio: template.ratio } : {}),
            snippet: template.snippet,
            sourceRange: { start: template.sourceStart, end: template.sourceEnd },
        },
        publication: { status: "template", generated: false, paidCalls: 0, sourceBackendCalls: 0, blockers: ["requires-input-image", "not-generated"] },
    };
}

export function adaptMatrixTemplates(markdown: string, source: MatrixSourceInfo): AdaptedMatrixTemplate[] {
    return parseMatrixMarkdown(markdown).map((template) => adaptMatrixTemplate(template, source));
}

function ensureCacheOutput(output: string, cacheRoot: string): string {
    const resolvedOutput = resolve(output);
    const resolvedCache = resolve(cacheRoot);
    const relativeOutput = relative(resolvedCache, resolvedOutput);
    if (!relativeOutput || relativeOutput.startsWith("..") || isAbsolute(relativeOutput)) fail("输出目录必须位于本工作树 .local/cache 子目录");
    mkdirSync(resolvedOutput, { recursive: true });
    const realOutput = realpathSync(resolvedOutput);
    const realCache = existsSync(resolvedCache) ? realpathSync(resolvedCache) : resolvedCache;
    const realRelative = relative(realCache, realOutput);
    if (!realRelative || realRelative.startsWith("..") || isAbsolute(realRelative)) fail("输出目录不能通过链接离开缓存范围");
    return realOutput;
}

export function writeMatrixCache(sourcePath: string, outputDirectory: string): MatrixCacheReceipt {
    const resolvedSource = realpathSync(resolve(sourcePath));
    const bytes = readFileSync(resolvedSource);
    const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
    const source: MatrixSourceInfo = { path: resolvedSource, sha256: sourceSha256 };
    const results = adaptMatrixTemplates(bytes.toString("utf8").replace(/^\uFEFF/, ""), source);
    const output = ensureCacheOutput(outputDirectory, resolve(dirname(fileURLToPath(import.meta.url)), "../../.local/cache"));
    const entries = results.map((result) => {
        const file = `${result.project.id}.json`;
        writeFileSync(resolve(output, file), `${JSON.stringify(result, null, 2)}\n`, "utf8");
        return {
            id: result.project.id,
            title: result.project.title,
            scene: result.source.scene,
            sourceSha256: result.source.sha256,
            file,
            nodeCount: result.project.nodes.length,
            connectionCount: result.project.connections.length,
            status: result.publication.status,
        };
    });
    const receipt: MatrixCacheReceipt = { version: 1, count: results.length, generated: 0, paidCalls: 0, sourceBackendCalls: 0, source, entries };
    writeFileSync(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    return receipt;
}

if (import.meta.main) {
    const [sourcePath, outputDirectory] = process.argv.slice(2);
    if (!sourcePath || !outputDirectory) throw new Error("用法：bun web/scripts/adapt-matrix-templates.ts <源码 markdown> <.local/cache 输出目录>");
    const receipt = writeMatrixCache(sourcePath, outputDirectory);
    console.log(JSON.stringify({ count: receipt.count, generated: receipt.generated, paidCalls: receipt.paidCalls, output: resolve(outputDirectory), sourceSha256: receipt.source.sha256 }));
}
