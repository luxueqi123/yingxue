import assert from "node:assert/strict";
import test from "node:test";

// Bun 直接执行 TypeScript 测试时需要保留扩展名；生产 tsconfig 不包含 test/。
import { defaultModelCapabilityConfig, modelCapabilityConfigFor, normalizeVideoValue } from "../src/lib/model-capabilities.ts";

test("switching to MiniMax H3 replaces an unsupported 720p value with 768P", () => {
    const profile = defaultModelCapabilityConfig("minimax-video", "MiniMax-H3").video!;

    assert.deepEqual(normalizeVideoValue(profile, { seconds: "11", ratio: "16:9", resolution: "720" }), {
        seconds: "11",
        ratio: "16:9",
        resolution: "768P",
    });
});

test("image quality follows the enabled logical price tiers", () => {
    const capabilityConfig = defaultModelCapabilityConfig(undefined, "gpt-image-2");
    capabilityConfig.image!.quality = {
        supported: true,
        values: ["auto", "low", "medium", "high"],
        default: "auto",
    };
    const profile = modelCapabilityConfigFor(
        {
            channels: [
                {
                    id: "system",
                    models: ["gpt-image-2"],
                    modelCosts: [
                        {
                            model: "gpt-image-2",
                            capabilityConfig,
                            logicalPriceTiers: [
                                { selector: { quality: "1k" } },
                                { selector: { quality: "2k" } },
                                { selector: { quality: "4k" } },
                            ],
                        },
                    ],
                },
            ],
        },
        "system::gpt-image-2",
    );

    assert.deepEqual(profile.image!.quality.values, ["1k", "2k", "4k"]);
    assert.equal(profile.image!.quality.default, "1k");
});

test("image quality follows price tiers even without an explicit capability config", () => {
    const profile = modelCapabilityConfigFor(
        {
            channels: [
                {
                    id: "system",
                    models: ["gpt-image-2"],
                    modelCosts: [
                        {
                            model: "gpt-image-2",
                            logicalPriceTiers: [{ selector: { quality: "1k" } }, { selector: { quality: "2k" } }],
                        },
                    ],
                },
            ],
        },
        "system::gpt-image-2",
    );

    assert.deepEqual(profile.image!.quality.values, ["1k", "2k"]);
    assert.equal(profile.image!.quality.default, "1k");
});
