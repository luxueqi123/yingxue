import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { App } from "antd";
import CreatePage from "../src/pages/create";
import { useUserStore } from "../src/stores/use-user-store";

test("public creation tools and input remain visible before session or history restoration", () => {
    const before = useUserStore.getState();
    useUserStore.setState({ hydrated: false, user: null });
    try {
        const html = renderToString(<MemoryRouter><App><CreatePage embedded /></App></MemoryRouter>);
        expect(html).toMatch(/class="[^"]*\bcreation-chat-composer\b/);
        expect(html).toContain('/create/tools/script-creation');
        expect(html).toContain('/create/tools/director-guide');
        expect(html).toContain('/create/tools/portrait-studio');
        expect(html).toContain('/create/tools/creative-title');
        expect(html).not.toContain('ant-spin-spinning');
        expect(html).not.toContain('featured-creations');
    } finally {
        useUserStore.setState(before, true);
    }
});
