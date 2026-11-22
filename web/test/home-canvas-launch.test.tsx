import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { HomeCanvasLaunch } from "../src/pages/create/home-canvas-launch";
import { HomeSpecialTools } from "../src/pages/create/home-special-tools";
import { creativeToolEntries, creativeToolPath, findCreativeTool } from "../src/pages/create/creative-tool-entries";

test("canvas entry uses the existing canvas route, not a pretend project creation", () => {
    const html = renderToStaticMarkup(<MemoryRouter><HomeCanvasLaunch /></MemoryRouter>);
    expect(html).toContain('href="/canvas"');
    expect(html).toContain('aria-label="打开无限画布"');
    expect(html).toContain("进入我的画布");
    expect(html).not.toContain("新建成功");
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html.match(/<rect\b/g)).toHaveLength(4);
    expect(html).toContain('class="canvas-preview-flow"');
    expect(html).toContain('class="home-canvas-dots" aria-hidden="true"');
});

test("special tools expose native entry paths with decorative previews", () => {
    const html = renderToStaticMarkup(<MemoryRouter><HomeSpecialTools /></MemoryRouter>);
    expect(html.match(/<a\b/g)).toHaveLength(5);
    expect(html).toContain('href="/canvas?tool=director"');
    expect(html).toContain('aria-label="打开 3D 导演台"');
    expect(creativeToolEntries.filter(item => item.skillId)).toHaveLength(3);
    for (const item of creativeToolEntries) {
        expect(html).toContain(`href="${creativeToolPath(item.id)}"`);
    }
    const previews = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
    expect(previews).toHaveLength(creativeToolEntries.length);
    for (const [index, preview] of previews.entries()) {
        expect(preview).toMatch(new RegExp(`src="[^"]*${creativeToolEntries[index].id}[^\"]*\\.webp"`));
        expect(preview).toContain('alt=""');
    }
    expect(html).not.toContain("部分接入");
    expect(findCreativeTool("creative-title")?.skillId).toBeNull();
    expect(findCreativeTool("__proto__")).toBeUndefined();
    expect(findCreativeTool(undefined)).toBeUndefined();
    expect(html).not.toContain("图像预处理");
    expect(html).not.toContain("媒体格式转换");
    expect(html).not.toContain("mode=new");
});
