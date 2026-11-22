import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Skill } from "../src/services/api/skills";
import { interfaceLocales, interfaceTranslator, loadInterfaceLocale } from "../src/lib/interface-locale";

const dom = new Window({ url: "https://skills.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, Element: dom.Element, SVGElement: dom.SVGElement,
    ShadowRoot: dom.ShadowRoot, Node: dom.Node, MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true, __APP_VERSION__: "test", __APP_CHANGELOG__: "",
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { SkillCard } = await import("../src/pages/skills");
const { SkillMarkdown } = await import("../src/pages/skills/skill-detail-drawer");
const { useInterfaceLocaleStore } = await import("../src/stores/use-interface-locale-store");
const previous = useInterfaceLocaleStore.getState();
const skill: Skill = {
    skillId: "locale-skill", skillName: "原始技能 {name} <b>", description: "原始描述", versionId: "v1", version: "1.0.0",
    contentHash: "hash", fileCount: 1, totalBytes: 100, sourceType: "markdown", sourceUrl: "", sourceRef: "",
    sourceSubdir: "", sourceCommit: "", syncStatus: "synced", autoUpdate: false, status: 1, markdownUrl: "",
    createdAt: "", updatedAt: "", source: 0, tag: "drama", sortWeight: 0, isPrivate: false, likeCount: 0,
    isLike: false, ownerUid: "creator", effectiveUser: { name: "Creator", avatarUrl: "", uid: "creator" },
    originalSkillId: null, showcaseMedia: [], addedCount: 0, isTest: false, extraInfo: "", isAdded: false, isOwner: false,
};
const source = '---\nname: 原始技能\ndescription: "用户正文 {name} <b>"\nversion: 1.0.0\ncustom: 原始值\n---\n\n# Original body\n\nKeep user content unchanged.\n';
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
});
afterAll(async () => {
    await previous.setLocale(previous.locale, previous.preference);
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
    await dom.happyDOM.close();
});

for (const locale of interfaceLocales) {
    test(`${locale}: skill controls translate while source values and actions remain intact`, async () => {
        await loadInterfaceLocale(locale);
        expect(await useInterfaceLocaleStore.getState().setLocale(locale)).toBe(true);
        const t = interfaceTranslator(locale);
        host = document.createElement("div"); document.body.append(host);
        root = createRoot(host);
        let actions = 0;
        const render = async (isAdded: boolean) => act(async () => root!.render(<>
            <SkillCard skill={{ ...skill, isAdded }} categories={[]} libraryCategories={[]} canCategorize={false} loading={false}
                t={t} locale={locale} onOpen={() => {}} onAdd={() => actions++} onLike={() => {}} onEdit={() => {}}
                onOpenWorkbench={() => {}} onDelete={() => {}} onSetLibraryCategory={() => {}} />
            <SkillMarkdown source={source} currentPath="SKILL.md" filePaths={new Set(["SKILL.md"])} onNavigate={() => {}} />
        </>));
        await render(false);
        const add = host.querySelector<HTMLButtonElement>(".skill-tile-add")!;
        expect(add.getAttribute("aria-pressed")).toBe("false");
        expect(add.getAttribute("aria-label")).toBe(t("skillsUi.addToMineAria", { name: skill.skillName }));
        expect(add.textContent).toBe(t("skillsUi.addAction"));
        await act(async () => add.click());
        expect(actions).toBe(1);
        await render(true);
        const remove = host.querySelector<HTMLButtonElement>(".skill-tile-add")!;
        expect(remove.getAttribute("aria-pressed")).toBe("true");
        expect(remove.getAttribute("aria-label")).toBe(t("skillsUi.removeFromMineAria", { name: skill.skillName }));
        expect(remove.textContent).toBe(t("skillsUi.added"));
        await act(async () => remove.click());
        expect(actions).toBe(2);
        const metadata = host.querySelector(".skill-package-markdown > section")!;
        expect(metadata.getAttribute("aria-label")).toBe(t("skillsUi.metadata"));
        expect(metadata.querySelector("summary")!.textContent).toBe(t("skillsUi.otherFieldsCount", { count: 1 }));
        expect([...metadata.querySelectorAll("dd")].map(element => element.textContent)).toEqual(["原始技能", "用户正文 {name} <b>", "1.0.0", "原始值"]);
        expect(host.querySelector(".skill-package-markdown h1")!.textContent).toBe("Original body");
        expect(host.querySelector(".skill-package-markdown b")).toBeNull();
        if (!locale.startsWith("zh")) {
            expect(remove.textContent).not.toBe("已加入");
            expect(metadata.getAttribute("aria-label")).not.toBe("技能元数据");
        }
    });
}
