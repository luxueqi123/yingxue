import { test } from "node:test";
import assert from "node:assert/strict";
import { readLtvParameterLayers } from "../src/lib/canvas/ltv-parameter-layers";

test("advanced fields override settings without discarding false or zero", () => {
    const result = readLtvParameterLayers({ duration: 5, settings: { duration: 18, enableSound: "on" }, advancedSettings: { duration: 30, enableSound: "off", search_enabled: 0 } });
    assert.equal(result.fields.duration, 30);
    assert.equal(result.fields.enableSound, "off");
    assert.ok(result.advancedKeys.includes("search_enabled"));
    assert.equal(result.fields.search_enabled, 0);
});
test("text inputs retain independent array structure and whitespace", () => {
    const source = { prompt: "原提示词", textList: [{ content: " 第一段 " }, { content: ["第二段", "", 3, "第三段"] }, null], advancedSettings: { _pending: true } };
    const result = readLtvParameterLayers(source);
    assert.equal(result.fields.prompt, "原提示词");
    assert.deepEqual(result.texts, [" 第一段 ", "第二段", "", "第三段"]);
    assert.deepEqual(result.advancedKeys, []);
    assert.equal(result.fields._pending, undefined);
    assert.equal(source.textList[0]?.content, " 第一段 ");
});
