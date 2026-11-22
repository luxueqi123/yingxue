import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { AuthLoginForm } from "../src/components/auth/auth-login-form";
import { i18n } from "../src/i18n";
import { githubLoginURL, type AuthSettings } from "../src/services/api/auth";
import { loginMethodLabels } from "../src/pages/admin/login-logs/login-log-display";

const dom = new Window({ url: "https://canvas.example/login" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element,
    ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom),
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
afterAll(() => {
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
    dom.happyDOM.abort();
});

const settings: AuthSettings = {
    firstUser: false, registrationEnabled: true, linuxdoEnabled: false, googleEnabled: false,
    githubEnabled: true, emailEnabled: false, emailCodeRequired: false,
    smsBindingAvailable: false, emailBindingAvailable: false, loginMode: "modal",
    smsLogin: false, emailLogin: false, smsRegistration: false, emailRegistration: false, smsAndEmailRegistration: false,
};

function render(overrides: Partial<AuthSettings> = {}) {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>
        <AuthLoginForm settings={{ ...settings, ...overrides }} settingsFailed={false} onReloadSettings={() => {}}
            next="/canvas/project?view=storyboard" onAuthenticated={() => {}} onViewChange={() => {}} />
    </I18nextProvider>);
}

describe("GitHub login uses the real authentication form", () => {
    test("account binding labels are translated in every supported locale", async () => {
        const previous = i18n.language;
        try {
            for (const locale of ["zh-CN", "zh-TW", "zh-HK", "en-US", "ja-JP", "ko-KR", "es-ES", "pt-BR", "de-DE", "fr-FR"]) {
                await i18n.changeLanguage(locale);
                for (const key of ["link", "linked", "notLinked", "loadFailed", "linkFailed", "cancelled"]) {
                    const message = i18n.t(`profileGitHub.${key}`, { username: "@creator" });
                    expect(message).not.toContain("profileGitHub.");
                    expect(message).not.toContain("{username}");
                }
            }
        } finally { await i18n.changeLanguage(previous); }
    });
    test("configured entry preserves destination and starts without implicit terms consent", () => {
        const html = render();
        expect(html).toContain("使用 GitHub 登录");
        expect(html).toContain("/auth/github/start?");
        expect(html).toContain("acceptedTerms=false");
        expect(html).toContain(encodeURIComponent("/canvas/project?view=storyboard"));
    });
    test("unconfigured entry stays hidden and Google remains available independently", () => {
        const html = render({ githubEnabled: false, googleEnabled: true });
        expect(html).not.toContain("/auth/github/start?");
        expect(html).toContain("使用 Google 登录");
    });
    test("existing identities can still use the entry after registration closes", () => {
        expect(render({ registrationEnabled: false })).toContain("使用 GitHub 登录");
    });
    test("explicit consent is serialized without losing reserved characters in destination", () => {
        const next = "/canvas/p?name=a&view=storyboard#shots";
        const url = new URL(githubLoginURL(next, true), "https://canvas.example");
        expect(url.pathname).toBe("/api/auth/github/start");
        expect(url.searchParams.get("next")).toBe(next);
        expect(url.searchParams.get("acceptedTerms")).toBe("true");
    });
    test("login audit identifies GitHub", () => {
        expect(loginMethodLabels.github).toBe("GitHub");
    });
});
