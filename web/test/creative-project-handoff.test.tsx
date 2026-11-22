import { loadInterfaceLocale as preloadInterfaceLocale } from "../src/lib/interface-locale";
await preloadInterfaceLocale("en-US");

import { afterEach, expect, mock, test } from "bun:test";
import { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { creativeProjectTarget } from "../src/pages/create/creative-project-target";
import { useUserStore } from "../src/stores/use-user-store";
import { useInterfaceLocaleStore } from "../src/stores/use-interface-locale-store";
import { interfaceTranslator } from "../src/lib/interface-locale";
import { creativeToolEntries } from "../src/pages/create/creative-tool-entries";

const previous = useUserStore.getState();
const store = useUserStore;
mock.module("@/stores/use-user-store", () => ({ useUserStore: Object.assign((selector: (state: typeof previous) => unknown) => selector(store.getState()), store) }));
// SSR does not subscribe to Zustand's client snapshot; use the actual dictionary
// with an explicit locale fixture, as with the account fixture above.
const localeStore = useInterfaceLocaleStore;
mock.module("@/stores/use-interface-locale-store", () => ({
    useInterfaceLocaleStore: localeStore,
    INTERFACE_LOCALE_KEY: "yingxue:interface-locale:v1",
    useInterfaceTranslation: () => {
        const locale = localeStore.getState().locale;
        return { locale, t: interfaceTranslator(locale) };
    },
}));
const { default: CreativeProjectPicker } = await import("../src/pages/create/creative-project-picker");
const { default: CreativeToolPage } = await import("../src/pages/create/creative-tool-page");
const initialLocale = useInterfaceLocaleStore.getState().locale;
afterEach(() => { store.setState(previous, true); useInterfaceLocaleStore.getState().setLocale(initialLocale); });

function renderPicker(featureId: string, userId = "fixture-user", projects = [{ project: { id: "project-a", name: "测试剧集" }, unitCount: 2, assetCount: 4 }]) {
    useUserStore.setState({ user: { id: userId } as NonNullable<typeof previous.user>, features: { ...previous.features, shortDramaEnabled: true } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["creative-tool-projects", "fixture-user", 1], { projects, total: projects.length, page: 1, pageSize: 8, hasMore: false });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><CreativeProjectPicker featureId={featureId} /></MemoryRouter></QueryClientProvider>);
    client.clear();
    return html;
}

test("three tools open the existing project workflows, without pretending title editing is integrated", () => {
    expect(creativeProjectTarget("script-creation", "a")?.path).toBe("/projects/a/chapters");
    expect(creativeProjectTarget("director-guide", "a")?.path).toBe("/projects/a/workflow");
    expect(creativeProjectTarget("portrait-studio", "a")?.path).toBe("/projects/a/assets?category=character");
    expect(creativeProjectTarget("creative-title", "a")).toBeNull();
    expect(creativeProjectTarget("portrait-studio", " ")).toBeNull();
    expect(creativeProjectTarget("director-guide", "a/b?c")?.path).toBe("/projects/a%2Fb%3Fc/workflow");
});

test("project cards preserve names, project identity and native role filtering", () => {
    const html = renderPicker("portrait-studio");
    expect(html).toContain("测试剧集");
    expect(html).toContain('href="/projects/project-a/assets?category=character"');
    expect(html).toContain('href="/projects/legacy?create=1"');
    expect(html).toContain("编辑角色与音色");
    expect(html).not.toContain("生成成功");
});

test("another account never receives the previous account project cache", () => {
    const html = renderPicker("portrait-studio", "another-user");
    expect(html).not.toContain("测试剧集");
    expect(html).toContain("正在读取当前账号的项目");
});

test("empty project response remains actionable rather than silently creating data", () => {
    expect(renderPicker("script-creation", "fixture-user", [])).toContain("本页暂无项目");
});

test("feature disablement does not expose a fake project entry", () => {
    useUserStore.setState({ features: { ...previous.features, shortDramaEnabled: false } });
    const client = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><CreativeProjectPicker featureId="portrait-studio" /></MemoryRouter></QueryClientProvider>);
    expect(html).toContain("项目制作功能当前未开放");
    expect(html).not.toContain("新建项目");
    client.clear();
});

test("English project entry translates controls, not project names or routes", () => {
    useInterfaceLocaleStore.getState().setLocale("en-US");
    for (const [feature, label] of [["script-creation", "Edit story chapters"], ["director-guide", "Open storyboard production"], ["portrait-studio", "Edit characters and voices"]]) {
        const html = renderPicker(feature);
        expect(html).toContain(label);
        expect(html).toContain("Continue project production");
        expect(html).toContain("2 chapters · 4 assets");
        expect(html).toContain("Page 1");
        expect(html).toContain("测试剧集");
        expect(html).toContain(creativeProjectTarget(feature, "project-a")!.path.replaceAll("&", "&amp;"));
        expect(html).not.toContain("上一页");
    }
    expect(renderPicker("script-creation", "another-user")).toContain("Loading projects for this account");
    expect(renderPicker("script-creation", "fixture-user", [])).toContain("No projects on this page");
});

test("tool detail shells keep translated titles and leave engineering acceptance notes out of the product", () => {
    useInterfaceLocaleStore.getState().setLocale("en-US");
    const t = interfaceTranslator("en-US");
    for (const entry of creativeToolEntries) {
        const client = new QueryClient();
        const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/create/tools/${entry.id}`]}><Routes><Route path="/create/tools/:featureId" element={<Suspense fallback={null}><CreativeToolPage /></Suspense>} /></Routes></MemoryRouter></QueryClientProvider>);
        expect(html).toContain(`<h1>${t(entry.titleKey).replaceAll("&", "&amp;")}</h1>`);
        expect(html).not.toContain("Integration limits:");
        expect(html).toContain("Back to creative workspace");
        expect(html).not.toContain("接入边界：");
        client.clear();
    }
});
