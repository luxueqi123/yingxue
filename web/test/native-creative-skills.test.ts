import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { publishedSkills } from "../src/lib/published-production-assets";
import { isVerifiedProductionSkill } from "../src/lib/verified-production-assets";

type Seed = { skill_id: string; skill_name: string; instruction: string; extra_info: string };
const seed: Seed[] = JSON.parse(readFileSync(new URL("../../backend/internal/skills/seed/production-skills.json", import.meta.url), "utf8"));
const rules = seed.filter((item) => item.extra_info.includes("来源标识：luxreal-rule:"));
const methods = seed.filter((item) => /来源标识：soulspacex:(agent:|skill:)/.test(item.extra_info));

test("23通用规则及11Agent方法、3技能通过原生技能库双重准入，不借用封面", () => {
    expect(rules).toHaveLength(23);
    expect(methods).toHaveLength(14);
    for (const item of [...rules, ...methods]) {
        expect(publishedSkills[item.skill_id]).toBeDefined();
        expect(isVerifiedProductionSkill(item.skill_id)).toBe(true);
        expect(item.instruction).toContain("当前 JSON 合同");
        expect(item.instruction).not.toMatch(/绝对系统防线|Core Security Protocol|Construction Site Ballerina|Seedance\s*2\.0|nano banana Pro/);
    }
});

test("不重复接入运镜工具、专用模型及音色；时长遵从现有能力", () => {
    expect(rules.map((item) => item.skill_name).join(" ")).not.toMatch(/Seedance|MiniMax|声音克隆|文生音色|运镜/);
    const duration = rules.find((item) => item.skill_name.includes("满编编排"));
    expect(duration?.instruction).toContain("所选模型支持的时长档位");
    expect(duration?.instruction).not.toContain("撑满15");
    const nine = methods.find((item) => item.skill_name.includes("9宫格") && item.skill_name.includes("中文版"));
    expect(nine?.instruction).toContain("3行 × 3列 = 9格");
    expect(nine?.instruction).not.toContain("3行 × 9列");
});
