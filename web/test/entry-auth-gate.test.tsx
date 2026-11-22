import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { RequireAuth } from "../src/components/auth/require-auth";
import { useUserStore } from "../src/stores/use-user-store";

test("public lobby renders before session recovery while private content stays gated", () => {
    expect(useUserStore.getInitialState().hydrated).toBe(false);
    const renderEntry = (allowAnonymous: boolean) => renderToStaticMarkup(
        <MemoryRouter initialEntries={["/"]}>
            <RequireAuth allowAnonymous={allowAnonymous}><main>entry-content</main></RequireAuth>
        </MemoryRouter>,
    );
    const lobby = renderEntry(true);
    expect(lobby).toContain("entry-content");
    expect(lobby).not.toContain("data-full-screen-loader");
    const privatePage = renderEntry(false);
    expect(privatePage).not.toContain("entry-content");
    expect(privatePage).not.toContain("data-full-screen-loader");
});
