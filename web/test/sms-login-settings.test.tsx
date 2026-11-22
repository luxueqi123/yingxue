import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import type { SMSChannel } from "../src/services/api/sms";

const dom = new Window({ url: "https://sms-admin.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location,
    HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement,
    HTMLAnchorElement: dom.HTMLAnchorElement, HTMLBodyElement: dom.HTMLBodyElement,
    HTMLHtmlElement: dom.HTMLHtmlElement, HTMLButtonElement: dom.HTMLButtonElement,
    Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, ConfigProvider } = await import("antd");
const { http } = await import("../src/services/api/request");
const { useAuthSettingsStore } = await import("../src/stores/use-auth-settings-store");
const { default: SMSLoginSettings } = await import("../src/pages/admin/components/sms-login-settings");
const get = spyOn(http, "get"), put = spyOn(http, "put"), post = spyOn(http, "post");
const refresh = spyOn(useAuthSettingsStore.getState(), "load").mockResolvedValue(null);
const policy = { smsLogin: false, smsRegistration: false, smsAndEmailRegistration: false, emailLogin: true, emailRegistration: true };
const channel: SMSChannel = {
    id: "channel-1", name: "Existing SMS", provider: "aliyun-pns", enabled: true, priority: 42, dailyLimit: 60,
    signName: "恒创联众", appId: "", version: 7, templates: [], hasCredentials: true, pluginEnabled: true,
};
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
let dirty = false;
const onDirty = (value: boolean) => { dirty = value; };
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.replace(/\s/g, "") === label.replace(/\s/g, ""))!;
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); };

beforeEach(() => {
    dirty = false;
    get.mockImplementation(async (path) => {
        if (path === "/admin/sms/channels") return [channel];
        if (path === "/admin/settings/auth-policy") return policy;
        if (path === "/admin/plugins") return { plugins: [], states: { "official-sms-aliyun": { effectiveEnabled: true } } };
        throw new Error(`Unexpected GET ${path}`);
    });
});

async function render() {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(<ConfigProvider theme={{ token: { motion: false } }}><App><SMSLoginSettings onDirtyChange={onDirty} /></App></ConfigProvider>));
    await settle();
}

async function fill(id: string, value: string) {
    const input = document.getElementById(id) as HTMLInputElement;
    await act(async () => {
        Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new dom.Event("input", { bubbles: true }));
    });
}

afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; host?.remove(); get.mockReset(); put.mockReset(); post.mockReset();
});
afterAll(() => {
    get.mockRestore(); put.mockRestore(); post.mockRestore(); refresh.mockRestore(); dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("loading an existing SMS channel neither writes configuration nor sends messages", async () => {
    await render();
    expect((document.getElementById("name") as HTMLInputElement).value).toBe("Existing SMS");
    expect(put).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
    expect(dirty).toBe(false);
});

test("failed channel save preserves unsaved credentials and reports the server error", async () => {
    put.mockRejectedValue(new Error("渠道已被修改，请刷新后重试"));
    await render(); await fill("accessId", "test-access-id"); await fill("accessKey", "test-access-secret");
    await act(async () => button("保存渠道").click()); await settle();
    expect(put.mock.calls[0]?.[0]).toBe("/admin/sms/channels/channel-1");
    expect((document.getElementById("accessKey") as HTMLInputElement).value).toBe("test-access-secret");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("渠道已被修改");
    expect(dirty).toBe(true); expect(post).not.toHaveBeenCalled();
});

test("successful channel save uses optimistic version and clears credentials from the form", async () => {
    put.mockResolvedValue({ ...channel, version: 8 });
    await render(); await fill("accessId", "test-access-id"); await fill("accessKey", "test-access-secret");
    await act(async () => button("保存渠道").click()); await settle();
    const request = put.mock.calls[0]?.[1] as { provider: string; version: number; templates: Array<{ purpose: string; templateId: string }> };
    expect(request.provider).toBe("aliyun-pns"); expect(request.version).toBe(7);
    expect(request.templates.find((item) => item.purpose === "register")?.templateId).toBe("100001");
    expect(request.templates.find((item) => item.purpose === "bind")?.templateId).toBe("100004");
    expect((document.getElementById("accessKey") as HTMLInputElement).value).toBe("");
    expect((document.getElementById("accessId") as HTMLInputElement).value).toBe("");
    expect(dirty).toBe(false); expect(post).not.toHaveBeenCalled();
});

test("enabling phone registration retains every existing email and login policy", async () => {
    put.mockResolvedValue({ ...policy, smsRegistration: true });
    await render();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="手机号注册"]')!.click()); await settle();
    expect(put.mock.calls[0]?.[0]).toBe("/admin/settings/auth-policy");
    expect(put.mock.calls[0]?.[1]).toEqual({ ...policy, smsRegistration: true });
    expect(document.querySelector('[aria-label="手机号注册"]')?.getAttribute("aria-checked")).toBe("true");
});

test("rejected phone registration enablement remains disabled", async () => {
    put.mockRejectedValue(new Error("请先启用短信插件并配置对应场景的短信渠道"));
    await render();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="手机号注册"]')!.click()); await settle();
    expect(document.querySelector('[aria-label="手机号注册"]')?.getAttribute("aria-checked")).toBe("false");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("请先启用短信插件");
    expect(post).not.toHaveBeenCalled();
});
