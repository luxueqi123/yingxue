import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { HomeHighlights } from "../src/pages/home/home-highlights";

test("home highlights expose real destinations and individually selectable slides", () => {
    const html = renderToStaticMarkup(<MemoryRouter><HomeHighlights /></MemoryRouter>);
    expect(html).toContain('aria-roledescription="轮播"');
    expect(html).toContain('href="#ltv-show-title"');
    expect(html).toContain('href="/canvas"');
    expect(html).toContain('href="/skills"');
    expect(html).toContain('aria-label="上一张推荐"');
    expect(html).toContain('aria-label="下一张推荐"');
    expect(html.match(/aria-label="切换到推荐：/g)).toHaveLength(3);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).not.toContain("实时排名");
    expect(html).not.toContain("倒计时");
    expect(html.match(/<video\b/g)).toHaveLength(3);
    expect(html.match(/<video\b[^>]*aria-hidden="true"/g)).toHaveLength(3);
    expect(html.match(/inert=""/g)).toHaveLength(2);
    expect(html).toContain('home-motion-turning-page');
    expect(html).toContain('home-motion-heart');
    expect(html).toContain('home-motion-story');
});
