import { expect, test } from "bun:test";

import { createModelChannel, defaultConfig, type AiConfig } from "@/stores/use-config-store";
import { dramaChoiceKeys, dramaChoiceToModel, modelToDramaChoice } from "../src/lib/drama/model-choice";

const tokenPrice = { capability: "text" as const, billingMode: "token" as const, unitPriceMicrocredits: 0, inputTokenPriceMicrocredits: 1, outputTokenPriceMicrocredits: 1, cachedTokenPriceMicrocredits: 0 };
const channels = [
    createModelChannel({ id: "platform", name: "平台", scope: "system", models: ["writer"], modelCosts: [{ ...tokenPrice, model: "writer" }] }),
    createModelChannel({ id: "logical", name: "产品", scope: "system", models: ["family"], modelCosts: [{ ...tokenPrice, model: "family", logicalModelId: "logical-writer" }] }),
    createModelChannel({ id: "personal", name: "个人", scope: "user", models: ["private-writer"], apiKey: "browser-only", modelCosts: [{ ...tokenPrice, model: "private-writer" }] }),
];
const models = channels.flatMap((channel) => channel.models.map((model) => `${channel.id}::${model}`));
const config: AiConfig = { ...defaultConfig, channels, models, textModels: models };

test("drama selection preserves the exact platform channel and model key", () => {
    expect(modelToDramaChoice(config, "platform::writer")).toMatchObject({ channelId: "platform", modelKey: "writer" });
    expect(dramaChoiceToModel(config, "text", { channelId: "platform", modelKey: "writer" })).toBe("platform::writer");
});

test("logical model and platform catalog keys resolve to the same saved selection", () => {
    expect(modelToDramaChoice(config, "logical::family")).toMatchObject({ logicalModelId: "logical-writer" });
    expect(dramaChoiceKeys(config, "logical::family")).toEqual(["l:logical-writer", "c:logical:family"]);
    expect(dramaChoiceToModel(config, "text", { logicalModelId: "logical-writer" })).toBe("logical::family");
    expect(dramaChoiceToModel(config, "text", { channelId: "logical", modelKey: "family" })).toBe("logical::family");
});

test("browser-only personal channels cannot become unattended drama choices", () => {
    expect(modelToDramaChoice(config, "personal::private-writer")).toBeUndefined();
    expect(dramaChoiceKeys(config, "personal::private-writer")).toEqual([]);
    expect(dramaChoiceToModel(config, "text", { channelId: "personal", modelKey: "private-writer" })).toBe("");
    expect(dramaChoiceToModel(config, "text", { channelId: "removed", modelKey: "writer" })).toBe("");
});
