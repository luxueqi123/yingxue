import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "antd";
import { AuthLoginForm } from "../src/components/auth/auth-login-form";
import { i18n } from "../src/i18n";
import { apiClient } from "../src/services/api/request";
import type { AuthSettings } from "../src/services/api/auth";

const dom = new Window({ url: "https://canvas.example/login" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const settings: AuthSettings = {
    firstUser: false, registrationEnabled: true, linuxdoEnabled: false, googleEnabled: true, githubEnabled: true,
    emailEnabled: false, emailCodeRequired: false, smsBindingAvailable: false, emailBindingAvailable: false,
    loginMode: "modal", smsLogin: true, emailLogin: false, smsRegistration: true, emailRegistration: false, smsAndEmailRegistration: false,
};
const adapter = apiClient.defaults.adapter;
const requests: string[] = [];
apiClient.defaults.adapter = async (config) => {
    requests.push(config.url ?? "");
    throw new Error("Isolated test: login rejected by server");
};
let root: Root | undefined;
let container: HTMLDivElement;

async function render(overrides: Partial<AuthSettings> = {}, settingsFailed = false) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root!.render(<I18nextProvider i18n={i18n}><App><AuthLoginForm settings={settingsFailed ? null : { ...settings, ...overrides }} settingsFailed={settingsFailed} onReloadSettings={() => {}} next="/" onAuthenticated={() => {}} onViewChange={() => {}} /></App></I18nextProvider>); });
    return container.querySelector("form")!;
}
afterEach(async () => {
    if (root) await act(async () => { root!.unmount(); });
    root = undefined;
    container?.remove();
    requests.length = 0;
});
afterAll(() => {
    apiClient.defaults.adapter = adapter;
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("login buttons stay clickable and show a reminder before agreement; submit events cannot bypass it", async () => {
    const form = await render();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(false);
    await act(async () => { submit.click(); });
    expect(document.body.textContent).toContain(i18n.t("auth.register.agreeFirst", { title: "映雪服务协议" }));
    expect(requests).toHaveLength(0);
    for (const provider of ["google", "github"]) {
        const link = form.querySelector<HTMLAnchorElement>(`a[href*="/auth/${provider}/start"]`)!;
        expect(link.getAttribute("aria-disabled")).not.toBe("true");
        const event = new dom.MouseEvent("click", { bubbles: true, cancelable: true });
        await act(async () => { link.dispatchEvent(event as unknown as Event); });
        expect(event.defaultPrevented).toBe(true);
    }
    await act(async () => { form.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    expect(requests).toHaveLength(0);
    const checkbox = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => { checkbox.click(); });
    expect(submit.disabled).toBe(false);
    expect(form.querySelector('a[href*="/auth/github/start"]')?.getAttribute("href")).toContain("acceptedTerms=true");
    await act(async () => { form.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    expect(requests).toEqual(["/auth/login"]);
    await act(async () => { checkbox.click(); });
    expect(submit.disabled).toBe(false);
});

test("password-only sites still require agreement", async () => {
    const form = await render({ googleEnabled: false, githubEnabled: false, smsLogin: false });
    expect(form.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    await act(async () => { form.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    expect(requests).toHaveLength(0);
});

test("failed authentication settings cannot fall through to password login", async () => {
    const form = await render({}, true);
    expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    await act(async () => { form.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    expect(requests).toHaveLength(0);
});
