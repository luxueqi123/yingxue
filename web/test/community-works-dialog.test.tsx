import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../src/i18n";
import { apiClient } from "../src/services/api/request";
import type { CommunityWork } from "../src/services/api/community-works";

const dom = new Window({ url: "https://canvas.example/my/works" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement,
    SVGElement: dom.SVGElement,
    Element: dom.Element,
    ShadowRoot: dom.ShadowRoot,
    ResizeObserver: dom.ResizeObserver,
    MutationObserver: dom.MutationObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, ConfigProvider } = await import("antd");
const { WorkPublishDialog } = await import("../src/pages/works/work-publish-dialog");
const settle = async () => {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
    });
};
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("real publishing form prompts for permission before sending, then resubmits selected resources", async () => {
    const adapter = apiClient.defaults.adapter;
    const requests: { url: string; method: string; body?: Record<string, unknown> }[] = [];
    const work: CommunityWork = {
        id: "work-existing",
        title: "成片",
        description: "作品描述",
        category: "drama",
        tags: [],
        author: "创作者",
        kind: "video",
        mediaResourceId: "a".repeat(32),
        coverResourceId: "b".repeat(32),
        mediaUrl: "/media.mp4",
        coverUrl: "/cover.png",
        hasProject: false,
        status: "published",
        featured: false,
        createdAt: "",
        updatedAt: "",
    };
    apiClient.defaults.adapter = async (config) => {
        requests.push({ url: config.url!, method: config.method!, body: config.data ? JSON.parse(config.data) : undefined });
        return { status: 200, statusText: "OK", headers: {}, config, data: { code: 0, data: config.method === "put" ? { ...work, status: "pending" } : config.url === "/assets" ? { assets: [], hasMore: false } : { projects: [] } } };
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let saved = 0;
    try {
        await act(async () => {
            root.render(
                <I18nextProvider i18n={i18n}>
                    <QueryClientProvider client={client}>
                        <ConfigProvider theme={{ token: { motion: false } }}>
                            <App>
                                <WorkPublishDialog
                                    work={work}
                                    onClose={() => {}}
                                    onSaved={() => {
                                        saved++;
                                    }}
                                />
                            </App>
                        </ConfigProvider>
                    </QueryClientProvider>
                </I18nextProvider>,
            );
        });
        const submit = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.type === "submit")!;
        expect(submit.disabled).toBe(false);
        expect(document.body.textContent).toContain("重新投稿后需再次审核");
        await act(async () => {
            submit.click();
        });
        await settle();
        expect(document.body.textContent).toContain("请先勾选发布授权声明");
        expect(requests.filter((request) => request.method === "put")).toHaveLength(0);
        await act(async () => {
            document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
        });
        await act(async () => {
            submit.click();
        });
        await settle();
        const writes = requests.filter((request) => request.method === "put");
        expect(writes).toHaveLength(1);
        expect(writes[0].url).toBe("/works/work-existing");
        expect(writes[0].body?.rightsConfirmed).toBe(true);
        expect(writes[0].body?.mediaResourceId).toBe(work.mediaResourceId);
        expect(writes[0].body?.coverResourceId).toBe(work.coverResourceId);
        expect(saved).toBe(1);
    } finally {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        client.clear();
        apiClient.defaults.adapter = adapter;
    }
});
