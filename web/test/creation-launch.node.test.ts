import assert from "node:assert/strict";
import { test } from "node:test";

import { consumeCreationLaunch, rememberCreationLaunch } from "../src/lib/creation-launch.ts";

function session() {
    const values = new Map<string, string>();
    return {
        get length() { return values.size; },
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
    };
}

test("登录往返仅携带草稿引用，正文和模式一次性恢复", () => {
    const storage = session();
    const draft = { prompt: "雨夜广告镜头 & 保留中文与标点", mode: "video" as const };
    const next = rememberCreationLaunch(draft, storage);
    assert.equal(next.includes(draft.prompt), false);
    const id = new URL(next, "https://yingxue.test").searchParams.get("launch")!;
    assert.deepEqual(consumeCreationLaunch(id, storage), draft);
    assert.equal(consumeCreationLaunch(id, storage), null);
    assert.equal(storage.length, 0);
});

test("过期、未来时间、未知模式与损坏数据不会进入创作表单", () => {
    const storage = session();
    const id = "12345678-1234-1234-1234-123456789012";
    for (const value of [
        { mode: "image", prompt: "old", createdAt: Date.now() - 31 * 60 * 1000 },
        { mode: "image", prompt: "future", createdAt: Date.now() + 60 * 1000 },
        { mode: "unknown", prompt: "invalid", createdAt: Date.now() },
        { mode: "image", prompt: "x".repeat(6001), createdAt: Date.now() },
    ]) {
        storage.setItem("yingxue:creation-launch:" + id, JSON.stringify(value));
        assert.equal(consumeCreationLaunch(id, storage), null);
        assert.equal(storage.length, 0);
    }
    storage.setItem("yingxue:creation-launch:" + id, "{broken");
    assert.equal(consumeCreationLaunch(id, storage), null);
});

test("存储不可用时读取安全失败，写入保留可感知错误", () => {
    const storage = session();
    storage.getItem = () => { throw new Error("blocked"); };
    storage.setItem = () => { throw new Error("blocked"); };
    assert.equal(consumeCreationLaunch("12345678-1234-1234-1234-123456789012", storage), null);
    assert.throws(() => rememberCreationLaunch({ mode: "text", prompt: "故事" }, storage), /blocked/);
});
