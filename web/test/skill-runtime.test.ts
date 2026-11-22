import { describe, expect, test } from "bun:test";

import type { Skill, SkillPackageFile, SkillPackageFileContent } from "../src/services/api/skills";
import { createSkillRuntime, resolveSkillMentions } from "../src/services/skill-runtime";

function skill(overrides: Partial<Skill> = {}): Skill {
    return {
        skillId: "director",
        skillName: "AI导演",
        description: "导演工作流",
        versionId: "version-2",
        version: "2.0.0",
        contentHash: "hash",
        fileCount: 5,
        totalBytes: 1024,
        sourceType: "zip",
        sourceUrl: "",
        sourceRef: "",
        sourceSubdir: "",
        sourceCommit: "",
        syncStatus: "synced",
        autoUpdate: false,
        lastCheckedAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-01-01T00:00:00.000Z",
        status: 1,
        markdownUrl: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        source: 0,
        tag: "影视",
        sortWeight: 0,
        isPrivate: true,
        likeCount: 0,
        isLike: false,
        ownerUid: "user",
        effectiveUser: { name: "用户", avatarUrl: "", uid: "user" },
        originalSkillId: null,
        showcaseMedia: [],
        addedCount: 1,
        isTest: false,
        extraInfo: "",
        isAdded: true,
        isOwner: true,
        ...overrides,
    };
}

function file(path: string, content: string, kind: SkillPackageFile["kind"] = "markdown"): SkillPackageFileContent {
    return {
        file: { path, kind, mimeType: "text/markdown", size: content.length, sha256: `sha-${path}` },
        content,
        binary: false,
    };
}

describe("skill runtime", () => {
    test("接口返回的原文件路径用于别名去重和来源记录", async () => {
        const entry = "必须读取 references/rules.md\n必须读取 rules.md";
        const body = "完整规则".repeat(4_000);
        const runtime = createSkillRuntime({
            getFile: async (_id, path) => ({ file: path === "SKILL.md" ? file(path, entry) : file("references/rules.md", body) }),
            listFiles: async () => ({ files: [file("references/rules.md", body).file, file("rules.md", body).file] }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });
        const result = await runtime.prepare({ profile: "canvas", prompt: "制作", skills: [skill()], selectedSkillIds: ["director"] });
        expect(result.prompt.split(body)).toHaveLength(2);
        expect(result.provenance.skillFiles.map((item) => item.path)).toEqual(["SKILL.md", "references/rules.md"]);
    });

    test("按文档位置解析相对引用和文本素材，缺失或越界依赖拒绝提交", async () => {
        const contents: Record<string, string> = {
            "SKILL.md": "必须读取 [流程](references/a.md)",
            "references/a.md": "Must read [模板](../assets/template.md) first.\n必须读取 ./b.md",
            "references/b.md": "最终参数",
            "assets/template.md": "完整模板",
        };
        const reads: string[] = [];
        const runtime = createSkillRuntime({
            getFile: async (_id, path) => { reads.push(path); return { file: file(path, contents[path]) }; },
            listFiles: async () => ({ files: Object.entries(contents).map(([path, text]) => file(path, text).file) }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });
        const input = { profile: "canvas" as const, prompt: "制作", skills: [skill()], selectedSkillIds: ["director"] };
        const result = await runtime.prepare(input);
        expect(result.prompt).toContain("完整模板");
        expect(result.prompt).toContain("最终参数");
        expect(reads).not.toContain("../assets/template.md");
        contents["references/a.md"] = "必须读取 [缺失](./missing.md)";
        await expect(runtime.prepare(input)).rejects.toThrow("不在技能包中");
        contents["references/a.md"] = "必须读取 ../../outside.md";
        await expect(runtime.prepare(input)).rejects.toThrow("不在技能包中");
        expect(reads).not.toContain("../../outside.md");
        contents["references/a.md"] = "资料 [官网](https://example.com/guide.md)";
        await expect(runtime.prepare(input)).resolves.toMatchObject({ delivery: "linked-context" });
        contents["references/a.md"] = "制作输出 `result.json`，参数 `0.15`、`--v 8.1`，视频命令 `ffprobe -i input.mp4`";
        await expect(runtime.prepare(input)).resolves.toMatchObject({ delivery: "linked-context" });
        contents["references/a.md"] = "必须读取 [模板](../assets/%74emplate.md)";
        expect((await runtime.prepare(input)).prompt).toContain("完整模板");
        contents["references/a.md"] = "必须读取 template.md\n文件索引: assets/template.md";
        expect((await runtime.prepare(input)).prompt).toContain("完整模板");
        contents["another/template.md"] = "不能混用的同名模板";
        contents["references/a.md"] = "必须读取 template.md\n文件索引: assets/template.md another/template.md";
        await expect(runtime.prepare(input)).rejects.toThrow("不在技能包中");
    });

    test("流程自建产物与外部 CLI 状态文件不算缺失依赖", async () => {
        const entry = "必须读取 references/a.md";
        const contents: Record<string, string> = {
            "SKILL.md": entry,
            "references/a.md": "先读取 references/b.md",
            "references/b.md": "基础规则",
        };
        const files = () => Object.entries(contents).map(([path, text]) => file(path, text).file);
        const runtime = createSkillRuntime({
            getFile: async (_id, path) => ({ file: file(path, contents[path]) }),
            listFiles: async () => ({ files: files() }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });
        const input = { profile: "canvas" as const, prompt: "制作", skills: [skill()], selectedSkillIds: ["director"] };

        // `write_file_v2` 建立 `X.md`、追加写入 `X.md` 都是流程自己的产物，不该要求包里预先存在。
        contents["references/b.md"] = "参数收集完成后，使用 `write_file_v2` 建立 `Final_Video_Spec.md`，写入：画幅、风格、视角。\n时长确认后，将最终时长补写入 `Final_Video_Spec.md`。";
        await expect(runtime.prepare(input)).resolves.toMatchObject({ delivery: "linked-context" });

        // 外部 CLI 写在工作目录的状态文件（隐藏目录）同样不是包内依赖。
        contents["references/b.md"] = "画布项目由 `-p` 指定，或读取当前目录 `.libtv/project.json` 的 `projectUuid`。";
        await expect(runtime.prepare(input)).resolves.toMatchObject({ delivery: "linked-context" });

        // 真正缺失的必读引用仍然拒绝，不因上面两类放行而被放过。
        contents["references/b.md"] = "必须读取 references/missing.md";
        await expect(runtime.prepare(input)).rejects.toThrow("不在技能包中");
    });

    test("必读嵌套引用完整加载，循环引用只读取一次，读取失败上抛", async () => {
        const contents: Record<string, string> = {
            "SKILL.md": "必须读取 references/a.md",
            "references/a.md": "必须读取 references/b.md",
            "references/b.md": "必须读取 references/a.md\n最终制作规则",
        };
        const reads: string[] = [];
        let fail = false;
        const runtime = createSkillRuntime({
            getFile: async (_id, path) => {
                reads.push(path);
                if (fail && path === "references/b.md") throw new Error("引用文件读取失败");
                return { file: file(path, contents[path]) };
            },
            listFiles: async () => ({ files: Object.entries(contents).map(([path, content]) => file(path, content).file) }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });
        const input = { profile: "canvas" as const, prompt: "制作", skills: [skill()], selectedSkillIds: ["director"] };
        const result = await runtime.prepare(input);
        expect(result.prompt).toContain("最终制作规则");
        expect(reads).toEqual(Object.keys(contents));
        expect(result.provenance.skillFiles).toHaveLength(3);
        fail = true;
        await expect(runtime.prepare(input)).rejects.toThrow("引用文件读取失败");
    });

    test("完整正文共享总预算，超限和第五项明确拒绝而非静默丢失", async () => {
        const entries = new Map([["long", "长".repeat(20_000) + "完整结尾"], ["short", "短".repeat(1_000)]]);
        let reads = 0;
        const runtime = createSkillRuntime({
            getFile: async (id, path) => { reads++; return { file: file(path, entries.get(id) || "正文") }; },
            listFiles: async () => ({ files: [] }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });
        const skills = ["long", "short", "three", "four", "five"].map((skillId) => skill({ skillId }));
        const prepare = (ids: string[]) => runtime.prepare({ profile: "canvas", prompt: "制作", skills, selectedSkillIds: ids });
        const result = await prepare(["long", "short"]);
        expect(result.prompt).toContain(entries.get("long")!);
        expect(result.metadata.skillIds).toEqual(["long", "short"]);
        entries.set("short", "短".repeat(20_000));
        await expect(prepare(["long", "short"])).rejects.toThrow("未截断技能内容");
        const before = reads;
        await expect(prepare(skills.map((item) => item.skillId))).rejects.toThrow("已选择 5 个");
        await expect(prepare(["unknown"])).rejects.toThrow("不存在或尚未加入");
        expect(reads).toBe(before);
    });

    test("查阅型附录超预算时列出路径交给渐进读取，必读引用仍整份内联", async () => {
        const mustRead = "必须读取 references/must.md";
        // 两份附录内容必须各不相同，否则"未内联的那份"会被另一份的相同正文误判成已内联。
        const appendixMarkers: Record<string, string> = {
            "references/terms.md": "术语速查唯一标记",
            "references/cards.md": "模板卡唯一标记",
        };
        const appendix = (marker: string) => `${marker}${"查阅型附录".repeat(4_000)}`;
        const entry = [`${mustRead}`, "术语速查见 `references/terms.md`\n模板卡见 `references/cards.md`"].join("\n");
        const contents: Record<string, string> = {
            "SKILL.md": entry,
            "references/must.md": "必读规则正文",
            "references/terms.md": appendix(appendixMarkers["references/terms.md"]),
            "references/cards.md": appendix(appendixMarkers["references/cards.md"]),
        };
        const files: SkillPackageFile[] = Object.entries(contents).map(([path, text]) => file(path, text).file);
        const runtime = createSkillRuntime({
            getFile: async (_id, path) => ({ file: file(path, contents[path]) }),
            listFiles: async () => ({ files }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });

        const result = await runtime.prepare({ profile: "canvas", prompt: "术语速查模板卡", skills: [skill()], selectedSkillIds: ["director"] });

        expect(result.prompt.length).toBeLessThanOrEqual(32_000);
        // 必读引用必须整份保留，不能被预算裁掉。
        expect(result.prompt).toContain("必读规则正文");
        expect(result.prompt).toContain('<skill-file path="references/must.md">');
        // 超出预算的查阅型附录只列路径，不内联半截正文。
        expect(result.prompt).toContain("<skill-reference-only>");
        expect(result.prompt).toContain("canvas_read_skill_file");
        const omitted = [...result.prompt.matchAll(/^- (.+)$/gmu)].map((match) => match[1]);
        const omittedReferences = omitted.filter((path) => path in appendixMarkers);
        expect(omittedReferences.length).toBe(1);
        const inlinedReference = Object.keys(appendixMarkers).find((path) => path !== omittedReferences[0])!;
        expect(result.prompt).toContain(appendixMarkers[inlinedReference]);
        for (const path of omittedReferences) expect(result.prompt).not.toContain(appendixMarkers[path]);
        // 来源记录只登记真正内联的文件，列出的附录不算已投递内容。
        expect(result.provenance.skillFiles.map((item) => item.path)).toContain(inlinedReference);
        expect(result.provenance.skillFiles.map((item) => item.path)).not.toContain(omittedReferences[0]);
        // 必读引用本身超出预算时仍然整份拒绝，不做静默截断。
        const heavy = createSkillRuntime({
            getFile: async (_id, path) => ({ file: file(path, path === "SKILL.md" ? "必须读取 references/must.md" : "必读".repeat(20_000)) }),
            listFiles: async () => ({ files: [file("references/must.md", "必读").file] }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });
        await expect(heavy.prepare({ profile: "canvas", prompt: "制作", skills: [skill()], selectedSkillIds: ["director"] })).rejects.toThrow("未截断技能内容");
    });

    test("长中文正文保留完整内容，仍能解析 Markdown、代码及中文路径引用", async () => {
        const body = "镜头与人物规则".repeat(2_000);
        const contents: Record<string, string> = {
            "SKILL.md": `${body}\n必须读取[流程](references/流程.md)\n必须读取 \`references/code.md\`\n必须读取 references/中文.md`,
            "references/流程.md": "流程正文",
            "references/code.md": "代码引用正文",
            "references/中文.md": "中文路径正文",
        };
        const runtime = createSkillRuntime({
            getFile: async (_id, path) => ({ file: file(path, contents[path]) }),
            listFiles: async () => ({ files: Object.entries(contents).map(([path, text]) => file(path, text).file) }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });
        const result = await runtime.prepare({ profile: "canvas", prompt: "制作", skills: [skill()], selectedSkillIds: ["director"] });
        expect(result.prompt).toContain(body);
        for (const path of Object.keys(contents)) expect(result.provenance.skillFiles.map(item => item.path)).toContain(path);
        for (const content of Object.values(contents)) expect(result.prompt).toContain(content);
    });

    test("四份必读引用均完整进入上下文和来源记录", async () => {
        const paths = Array.from({ length: 4 }, (_, i) => `references/required-${i}.md`);
        const entry = paths.map((path) => `必须读取 ${path}`).join("\n");
        const runtime = createSkillRuntime({
            getFile: async (_id, path) => ({ file: file(path, path === "SKILL.md" ? entry : `完整内容:${path}`) }),
            listFiles: async () => ({ files: paths.map((path) => file(path, "").file) }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });
        const result = await runtime.prepare({ profile: "canvas", prompt: "制作", skills: [skill()], selectedSkillIds: ["director"] });
        for (const path of paths) {
            expect(result.prompt).toContain(`完整内容:${path}`);
            expect(result.provenance.skillFiles).toContainEqual({ skillId: "director", path, sha256: `sha-${path}` });
        }
    });

    test("可检索首屏之外的技能并分页，不暴露未加入技能", async () => {
        const runtime = createSkillRuntime();
        const skills = Array.from({ length: 45 }, (_, index) => skill({ skillId: `skill-${index}`, skillName: `技能 ${index}`, description: index === 44 ? "商品构图" : "通用" }));
        skills.push(skill({ skillId: "hidden", description: "商品构图", isAdded: false }));
        const first = await runtime.executeAgentTool("onlineAgent", "canvas_list_skills", {}, skills);
        expect(first?.ok && first.data).toMatchObject({ total: 45, nextOffset: 40 });
        const found = await runtime.executeAgentTool("onlineAgent", "canvas_list_skills", { query: "商品" }, skills);
        expect(found?.ok && found.data).toMatchObject({ total: 1, nextOffset: null, items: [{ skillId: "skill-44" }] });
    });
    test("技能引用解析由统一规则同时支持稳定 token 和自然提及", () => {
        const director = skill();
        const storyboard = skill({ skillId: "storyboard", skillName: "小说转分镜" });

        expect(resolveSkillMentions("用 @[skill:director] 处理", [director, storyboard]).map((item) => item.skillId)).toEqual(["director"]);
        expect(resolveSkillMentions("请用 @小说转分镜。", [director, storyboard]).map((item) => item.skillId)).toEqual(["storyboard"]);
        expect(resolveSkillMentions("请用 /小说转分镜 处理。", [director, storyboard]).map((item) => item.skillId)).toEqual(["storyboard"]);
        expect(resolveSkillMentions("@AI导演增强版", [director])).toEqual([]);
        expect(resolveSkillMentions("/AI导演增强版", [director])).toEqual([]);
    });

    test("普通生成只加载入口和与当前任务最相关的直接引用文本", async () => {
        const entry = [
            "# AI导演",
            "视频提示词读取 `references/prompt_templates.md`。",
            "角色资产读取 [角色规则](references/character_assets.md)。",
            "维护脚本见 `scripts/audit_skill.py`。",
            "项目模板见 `assets/project-ledger-template.md`。",
        ].join("\n");
        const files: SkillPackageFile[] = [
            file("SKILL.md", entry).file,
            file("references/prompt_templates.md", "视频提示词模板正文").file,
            file("references/character_assets.md", "角色资产正文").file,
            file("scripts/audit_skill.py", "print('audit')", "code").file,
            file("assets/project-ledger-template.md", "台账模板").file,
        ];
        const readPaths: string[] = [];
        const runtime = createSkillRuntime({
            getFile: async (_id, path) => {
                readPaths.push(path);
                if (path === "SKILL.md") return { file: file(path, entry) };
                return { file: file(path, path.includes("prompt_templates") ? "视频提示词模板正文" : "角色资产正文") };
            },
            listFiles: async () => ({ files }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });

        const result = await runtime.prepare({ profile: "canvas", prompt: "@[skill:director] 帮我生成视频提示词", skills: [skill()] });

        expect(result.prompt).toContain('<skill-file path="SKILL.md">');
        expect(result.prompt).toContain('<skill-file path="references/prompt_templates.md">');
        expect(readPaths).not.toContain("references/character_assets.md");
        expect(readPaths).not.toContain("scripts/audit_skill.py");
        expect(readPaths).not.toContain("assets/project-ledger-template.md");
        expect(result.prompt).toContain("【用户任务】\n@AI导演 帮我生成视频提示词");
        expect(result.metadata.skillIds).toEqual(["director"]);
    });

    test("本地 Agent 通过同一 Runtime 投递完整原生技能包", async () => {
        const runtime = createSkillRuntime({
            getFile: async () => { throw new Error("不应读取单文件"); },
            listFiles: async () => ({ files: [] }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => ({
                bundle: {
                    skillId: "director",
                    name: "AI导演",
                    description: "导演工作流",
                    versionId: "version-2",
                    version: "2.0.0",
                    contentHash: "hash",
                    files: [{ path: "SKILL.md", mimeType: "text/markdown", contentBase64: "IyBBSuWvv+a8lA==" }],
                },
            }),
        });

        const result = await runtime.prepare({ profile: "localAgent", prompt: "@[skill:director] 开始", skills: [skill()] });

        expect(result.prompt).toBe("@AI导演 开始");
        expect(result.skills).toEqual([{ skillId: "director", name: "AI导演", description: "导演工作流", version: "2.0.0", files: [{ path: "SKILL.md", mimeType: "text/markdown", contentBase64: "IyBBSuWvv+a8lA==" }] }]);
    });

    test("在线 Agent 的技能工具由 Runtime 注册表统一执行", async () => {
        const runtime = createSkillRuntime({
            getFile: async () => ({ file: file("SKILL.md", "# AI导演") }),
            listFiles: async () => ({ files: [] }),
            searchFiles: async () => ({ results: [] }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });

        expect(runtime.agentToolNames("onlineAgent").has("canvas_get_skill")).toBe(true);
        const result = await runtime.executeAgentTool("onlineAgent", "canvas_get_skill", { skillId: "director" }, [skill()]);
        expect(result?.ok).toBe(true);
        expect(result && "data" in result ? result.data : null).toMatchObject({ skillId: "director", version: "2.0.0" });
    });

    test("在线 Agent 只允许读取已加入技能并保留来源", async () => {
        const runtime = createSkillRuntime({
            getFile: async () => ({ file: file("SKILL.md", "# AI导演") }),
            listFiles: async () => ({ files: [] }),
        });

        const denied = await runtime.executeAgentTool("onlineAgent", "canvas_get_skill", { skillId: "director" }, []);
        expect(denied?.ok).toBe(false);
        const allowed = await runtime.executeAgentTool("onlineAgent", "canvas_get_skill", { skillId: "director" }, [skill()]);
        expect(allowed?.ok).toBe(true);
        expect(allowed && "data" in allowed ? allowed.data : null).toMatchObject({ skillId: "director", version: "2.0.0" });
    });

    test("渐进读取列出的每个路径都能被在线 Agent 按路径读回", async () => {
        const appendix = `查阅型附录${"正文".repeat(20_000)}`;
        const contents: Record<string, string> = {
            "SKILL.md": "必须读取 references/must.md\n术语速查见 `references/terms.md`",
            "references/must.md": "必读规则正文",
            "references/terms.md": appendix,
        };
        const runtime = createSkillRuntime({
            getFile: async (_id, path) => ({ file: file(path, contents[path]) }),
            listFiles: async () => ({ files: Object.entries(contents).map(([path, text]) => file(path, text).file) }),
            searchFiles: async (_id, query) => ({ results: Object.entries(contents).filter(([, text]) => text.includes(query)).map(([path]) => ({ path, line: 1, snippet: "命中" })) }),
            getBundle: async () => { throw new Error("不应读取完整包"); },
        });
        const input = { profile: "canvas" as const, prompt: "术语速查", skills: [skill()], selectedSkillIds: ["director"] };
        const prepared = await runtime.prepare(input);
        const listed = [...(prepared.prompt.match(/<skill-reference-only>([\s\S]*?)<\/skill-reference-only>/) || [])[1]!.matchAll(/^- (.+)$/gmu)].map((match) => match[1].trim());
        expect(listed).toEqual(["references/terms.md"]);
        // 列出的路径必须真能按路径读回，否则提示就是空头支票。
        for (const path of listed) {
            const read = await runtime.executeAgentTool("onlineAgent", "canvas_read_skill_file", { skillId: "director", path }, [skill()]);
            expect(read?.ok).toBe(true);
            expect(JSON.stringify(read && "data" in read ? read.data : null)).toContain(contents[path]);
        }
        const found = await runtime.executeAgentTool("onlineAgent", "canvas_search_skill_files", { skillId: "director", query: "必读" }, [skill()]);
        expect(found?.ok).toBe(true);
    });
});
