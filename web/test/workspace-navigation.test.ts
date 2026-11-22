import { describe, expect, test } from "bun:test";
import { workspaceBackTarget } from "../src/lib/workspace-navigation";

describe("workspace return navigation", () => {
    test("returns to the exact source, retaining its preview and filters", () => {
        const returnState = { casePreview: { id: "case-18", process: true } };
        expect(workspaceBackTarget({ returnTo: "/studio?tab=cases#gallery", returnState }, "/canvas")).toEqual({ to: "/studio?tab=cases#gallery", state: returnState });
    });

    test("direct entries use the relevant parent instead of browser history", () => {
        for (const state of [null, undefined, {}, { returnTo: "/" }, { returnTo: "/login" }]) {
            expect(workspaceBackTarget(state, "/canvas")).toEqual({ to: "/canvas" });
        }
    });

    test("does not accept external or malformed return targets", () => {
        for (const returnTo of ["https://example.com", "//example.com/home", "/\\example.com", "/home\\example.com", "/home\n", 123]) {
            expect(workspaceBackTarget({ returnTo }, "/plugins")).toEqual({ to: "/plugins" });
        }
    });
});
