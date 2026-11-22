import { expect, test } from "bun:test";
import { legacyMessagesFromNative } from "../src/i18n/locale-catalogs";
import { interfaceTranslator, loadInterfaceLocale } from "../src/lib/interface-locale";

test("French and German reuse existing native translations when the source wording changed", async () => {
    for (const [locale, connection, workspace] of [
        ["fr-FR", "Connexion", "Espace de travail"],
        ["de-DE", "Verbindung", "Arbeitsbereich"],
    ] as const) {
        await loadInterfaceLocale(locale);
        const t = interfaceTranslator(locale);
        expect(t("contextConnection")).toBe(connection);
        expect(t("toolbarWorkspace")).toBe(workspace);
    }
});

test("native translations preserve legacy argument names", () => {
    const messages = legacyMessagesFromNative(
        { reference: { back: "Zurück zu {{project}}" } },
        {
            legacy: { canvasToolbarBackProject: "Return to project {name}" },
            native: { reference: { back: "Return to project {{project}}" } },
        },
    );
    expect(messages.canvasToolbarBackProject).toBe("Zurück zu {name}");
});

test("ambiguous native translations remain unresolved", () => {
    const messages = legacyMessagesFromNative(
        { first: { back: "Projekt öffnen: {{project}}" }, second: { back: "Projekt verlassen: {{project}}" } },
        {
            legacy: { canvasToolbarBackProject: "Return to project {name}" },
            native: { first: { back: "Return to project {{project}}" }, second: { back: "Return to project {{project}}" } },
        },
    );
    expect(messages.canvasToolbarBackProject).toBeUndefined();
});

test("missing and changed placeholders cannot produce a misleading translation", () => {
    for (const translated of ["Zurück", "Zurück zu {{other}}", "Zurück zu {{project}} {{count}}"] ) {
        const messages = legacyMessagesFromNative(
            { reference: { back: translated } },
            {
                legacy: { canvasToolbarBackProject: "Return to project {name}" },
                native: { reference: { back: "Return to project {{project}}" } },
            },
        );
        expect(messages.canvasToolbarBackProject).toBeUndefined();
    }
});
