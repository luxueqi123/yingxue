import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillList } from "../src/services/api/skills";
import { AgentSkillCatalogStatus } from "../src/components/canvas/canvas-agent-skill-status";
import { isAgentSkillCatalogNotice } from "../src/lib/canvas/agent-skill-catalog-status";

const dom = new Window({ url: "https://canvas.example/admin/channels" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const result = (totalCount: number): SkillList => ({ skills: [], totalCount, hasMore: false, nextOffset: 0, page: 1, pageSize: 50, categories: [] });
let calls = 0;
let read = async (): Promise<SkillList> => result(0);
mock.module("@/services/api/skills", () => ({ listSkills: () => { calls++; return read(); } }));
const { useAgentCreatedSkills } = await import("../src/components/canvas/use-agent-created-skills");

let latest: ReturnType<typeof useAgentCreatedSkills>;
function Harness({ account, open }: { account?: string; open: boolean }) {
    latest = useAgentCreatedSkills(account, open);
    return <>
        <output>{latest.data?.totalCount ?? "pending"}</output>
        <AgentSkillCatalogStatus created error={latest.error} refreshing={latest.isFetching} onRetry={() => { void latest.refetch(); }} />
    </>;
}

let root: Root | undefined;
let container: HTMLDivElement;
let client: QueryClient;
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
async function render(account: string | undefined, open: boolean) {
    if (!root) {
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    }
    await act(async () => {
        root!.render(<QueryClientProvider client={client}><Harness account={account} open={open} /></QueryClientProvider>);
        await settle();
    });
    await act(settle);
    return container;
}

afterEach(async () => {
    if (root) await act(async () => { root!.unmount(); });
    root = undefined;
    client?.clear();
    container?.remove();
    calls = 0;
    read = async () => result(0);
});
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("closed or anonymous assistants do not start private skill requests", async () => {
    await render("account-a", false);
    expect(calls).toBe(0);
    await render(undefined, true);
    expect(calls).toBe(0);
    await render("account-a", true);
    expect(calls).toBe(1);
});

test("a failed catalog has a real retry control and clears its status after recovery", async () => {
    read = async () => { throw new Error("connection timed out"); };
    const view = await render("account-a", true);
    expect(view.querySelector('[role="status"]')?.textContent).toContain("自建技能读取失败");
    expect(view.textContent).toContain("connection timed out");
    let release!: (value: SkillList) => void;
    read = () => new Promise((resolve) => { release = resolve; });
    await act(async () => { view.querySelector("button")!.click(); await settle(); });
    expect(latest.isFetching).toBe(true);
    await act(async () => { release(result(3)); await settle(); });
    await act(settle);
    expect(view.querySelector('[role="status"]')).toBeNull();
    expect(view.querySelector("output")?.textContent).toBe("3");
    expect(calls).toBe(2);
});

test("a failed refresh retains the last confirmed catalog instead of inventing an empty success", async () => {
    read = async () => result(4);
    const view = await render("account-a", true);
    read = async () => { throw new Error("temporarily unavailable"); };
    await act(async () => { await latest.refetch(); await settle(); });
    await act(settle);
    expect(view.querySelector("output")?.textContent).toBe("4");
    expect(view.querySelector('[role="status"]')).not.toBeNull();
});

test("an old account response cannot replace the active account catalog", async () => {
    let release!: (value: SkillList) => void;
    read = () => new Promise((resolve) => { release = resolve; });
    await render("account-a", true);
    read = async () => result(2);
    const view = await render("account-b", true);
    await act(async () => { release(result(9)); await settle(); });
    await act(settle);
    expect(view.querySelector("output")?.textContent).toBe("2");
});

test("legacy read notices are hidden without mutating history or hiding run failures", () => {
    const messages = [
        { id: "created-skills-error", role: "error", text: "old timeout" },
        { id: "skills-load-error", role: "error", text: "old read failure" },
        { id: "submit-error-session", role: "error", text: "generation failed" },
        { id: "created-skills-error", role: "user", text: "user content" },
    ];
    expect(messages.filter((message) => !isAgentSkillCatalogNotice(message))).toEqual(messages.slice(2));
    expect(messages).toHaveLength(4);
});
