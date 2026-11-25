import { afterEach, expect, spyOn, test } from "bun:test";
import localforage from "localforage";
import { setActiveUserScope } from "../src/lib/user-scope";
import { loadCloudAgentConversations, loadCloudAgentPendingSubmission } from "../src/services/cloud-agent-conversations";

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const values = new Map<string, string>();

afterEach(() => {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    getMock?.mockRestore();
    setMock?.mockRestore();
    keysMock?.mockRestore();
    values.clear();
});

let getMock: ReturnType<typeof spyOn>;
let setMock: ReturnType<typeof spyOn>;
let keysMock: ReturnType<typeof spyOn>;

test("global history keeps old canvas chats and retry identities within the current account", async () => {
    let scope = "account-a";
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            localStorage: {
                getItem: () => scope,
                setItem: (_key: string, value: string) => { scope = value; },
            },
        },
    });
    getMock = spyOn(localforage, "getItem").mockImplementation((async (key: string) => values.get(key) ?? null) as typeof localforage.getItem);
    setMock = spyOn(localforage, "setItem").mockImplementation((async (key: string, value: string) => { values.set(key, value); return value; }) as typeof localforage.setItem);
    keysMock = spyOn(localforage, "keys").mockImplementation(async () => [...values.keys()]);
    const chat = { id: "chat-a", title: "原画布对话", messages: [{ id: "m1", role: "user", text: "原始内容" }], run: null, permissionMode: "auto", createdAt: "2026-10-28", updatedAt: "2026-10-29" };
    const oldKey = "cloud-agent-conversations-v1:canvas-a:user:account-a";
    const oldValue = JSON.stringify({ version: 1, activeId: chat.id, conversations: [chat] });
    values.set(oldKey, oldValue);
    values.set("cloud-agent-conversations-v1:pending:canvas-a:chat-a:user:account-a", JSON.stringify({ fingerprint: "original", key: "original-idempotency-key" }));
    values.set("cloud-agent-conversations-v1:canvas-b:user:account-b", JSON.stringify({ version: 1, activeId: "chat-b", conversations: [{ ...chat, id: "chat-b", title: "另一个账号" }] }));
    setActiveUserScope("account-a");
    const result = await loadCloudAgentConversations();
    expect(result.conversations).toEqual([chat]);
    expect(values.get(oldKey)).toBe(oldValue);
    expect(await loadCloudAgentPendingSubmission(chat.id)).toEqual({ fingerprint: "original", key: "original-idempotency-key", request: undefined, parentRunId: undefined, messageId: undefined });
    expect((await loadCloudAgentConversations()).conversations).toHaveLength(1);
    setActiveUserScope("account-b");
    expect((await loadCloudAgentConversations()).conversations.map(item => item.id)).toEqual(["chat-b"]);
});
