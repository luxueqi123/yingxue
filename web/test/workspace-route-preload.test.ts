import { beforeEach, describe, expect, mock, test } from "bun:test";

const loaded: string[] = [];
mock.module("@/pages/create", () => { loaded.push("create"); return { default: () => null }; });
mock.module("@/pages/home", () => { loaded.push("home"); return { default: () => null }; });
mock.module("@/pages/projects/detail", () => { loaded.push("projectDetail"); return { default: () => null }; });
const { preloadWorkspaceRoute } = await import("../src/lib/workspace-route-modules");
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
beforeEach(() => { loaded.length = 0; });

describe("工作区预加载边界", () => {
    test("认证页面不请求工作区页面", async () => {
        for (const path of ["/login", "/register"]) preloadWorkspaceRoute(path);
        await settle();
        expect(loaded).toEqual([]);
    });
    test("明确进入创作大厅仍加载原模块", async () => {
        for (const path of ["", "/", "/home"]) preloadWorkspaceRoute(path);
        await settle();
        expect(loaded).toContain("home");
        expect(loaded).not.toContain("create");
    });
    test("项目深链仍预加载项目详情", async () => {
        preloadWorkspaceRoute("/projects/example/storyboard");
        await settle();
        expect(loaded).toContain("projectDetail");
        expect(loaded).not.toContain("create");
    });
});
