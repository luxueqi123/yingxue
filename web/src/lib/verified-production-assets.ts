import chainSupport from "./production-chain-support.json";
import caseSupport from "./production-case-support.json?admission";
import communitySkills from "./community-skill-support.json";

// Package integrity and a supported shared chain permit release.
// Per-item generation evidence is kept separately and is not a release requirement.
// Original Yingxue skills are outside the LTV integration review.
export const supportedLtvSkillIds: ReadonlySet<string> = new Set(chainSupport.map(item => item.id));
export const verifiedLtvSkillIds: ReadonlySet<string> = new Set([
    // AI写短剧剧本: production text tasks and revision evidence in docs/overview/ltv-functional-review.
    "pl-aa008befea38a466fa648c706cf8f337",
]);
// 素材整理工程保留原文件，但不能作为可查看制作过程的案例准入。
export const verifiedLtvCaseIds: ReadonlySet<string> = new Set(caseSupport.filter(item => item.generationNodeCount > 0).map(item => item.id));
export function isVerifiedProductionSkill(id: string): boolean {
    return !id.startsWith("pl-") || supportedLtvSkillIds.has(id) || verifiedLtvSkillIds.has(id) || supportedCommunitySkillIds.has(id);
}
// Admission covers complete instructions on the existing skill execution path, not generated media quality.
const supportedCommunitySkillIds: ReadonlySet<string> = new Set(communitySkills.filter(item => item.packageComplete).map(item => item.id));
