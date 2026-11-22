import { loadInterfaceLocale as preloadInterfaceLocale } from "../src/lib/interface-locale";
await preloadInterfaceLocale("en-US");

import { expect, mock, test } from "bun:test";
import { renderInLocale } from "./helpers/locale-render";
import { interfaceTranslator } from "../src/lib/interface-locale";
import { registerAddNodeMenuCommands, resolveAddNodeMenuCommands, type AddNodeMenuContext } from "../src/lib/canvas/tool-registry";
import "../src/lib/canvas/tool-registry/definitions/add-node-menu-tools";

mock.module("../src/stores/use-interface-locale-store", () => ({
    useInterfaceTranslation: () => ({ locale: "en-US", t: interfaceTranslator("en-US") }),
}));
const { CanvasCreateMenu } = await import("../src/components/canvas/canvas-create-menu");
const run = () => {};
const renderToStaticMarkup = (node: React.ReactNode) => renderInLocale(node, "en-US");
const ctx: AddNodeMenuContext = { workspaceMode: "professional", isProjectLinked: false,
    handlers: new Proxy({}, { get: () => run }) as AddNodeMenuContext["handlers"] };

test("creation labels translate without changing command order, handlers or applicability", () => {
    const original = resolveAddNodeMenuCommands(ctx);
    const english = resolveAddNodeMenuCommands({ ...ctx, locale: "en-US" });
    expect(english.map(c => c.id)).toEqual(original.map(c => c.id));
    expect(english.find(c => c.id === "text")?.label).toBe("Text");
    expect(english.find(c => c.id === "folder")?.badge).toBe("6 styles");
    expect(english.find(c => c.id === "script")?.badge).toBe("Core");
    english.forEach((command, index) => {
        expect(command.run).toBe(original[index].run);
        expect(command.applicable).toBe(original[index].applicable);
    });
    expect(original.find(c => c.id === "folder")?.label).toBe("文件夹");
    const simple = resolveAddNodeMenuCommands({ ...ctx, locale: "en-US", workspaceMode: "simple", isProjectLinked: true });
    expect(simple.some(c => c.id === "director")).toBe(false);
    expect(simple.some(c => c.id === "assets")).toBe(false);
    expect(simple.find(c => c.id === "project-character")?.label).toBe("Add character card");
});

test("extension labels and badges are not guessed from Chinese text or IDs", () => {
    registerAddNodeMenuCommands([{ id: "locale-plugin", label: "文件夹", badge: "核心", icon: null,
        section: "node", defaultOrder: 999, run }]);
    const extension = resolveAddNodeMenuCommands({ ...ctx, locale: "en-US" }).find(c => c.id === "locale-plugin")!;
    expect(extension.label).toBe("文件夹");
    expect(extension.badge).toBe("核心");
    expect(extension.run).toBe(run);
});

test("create menu translates section headings, retaining supplied command copy", () => {
    const html = renderToStaticMarkup(<CanvasCreateMenu commands={[{ id: "external", label: "插件原名 {name}", icon: null, section: "workflow", onClick: run }]} />);
    for (const label of ["Add node", "Creation nodes", "Workflows and imports", "插件原名 {name}"]) expect(html).toContain(label);
});
