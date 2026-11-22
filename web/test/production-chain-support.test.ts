import { describe, it } from "node:test";
import assert from "node:assert/strict";
import support from "../src/lib/production-chain-support.json";
import { isVerifiedProductionSkill, verifiedLtvSkillIds } from "../src/lib/verified-production-assets";
import { publishedSkills } from "../src/lib/published-production-assets";

describe("LTV shared chain admission", () => {
    it("admits supported packages without requiring an individual generation", () => {
        const shared = support.find(item => !verifiedLtvSkillIds.has(item.id));
        assert.ok(shared);
        assert.equal(isVerifiedProductionSkill(shared.id), true);
        assert.equal(new Set(support.map(item => item.id)).size, support.length);
        for (const item of support) assert.ok(publishedSkills[item.id]);
    });
    it("keeps native skills and does not admit unresolved imported capabilities", () => {
        assert.equal(isVerifiedProductionSkill("user-created-skill"), true);
        assert.equal(isVerifiedProductionSkill("pl-2eeafb7ba12fca567c94139d57f96071"), false);
        assert.equal(isVerifiedProductionSkill("pl-unknown-package"), false);
    });
});
