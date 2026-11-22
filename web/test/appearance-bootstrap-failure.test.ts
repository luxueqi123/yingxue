import { expect, mock, test } from "bun:test";

const fallback = { brandName: "上游默认品牌" };
let current = { brandName: "当前映雪品牌" };
const applied: unknown[] = [];
mock.module("@/services/api/appearance", () => ({ getPublicAppearance: async () => { throw new Error("offline"); } }));
mock.module("@/stores/use-appearance-store", () => ({
    DEFAULT_PUBLIC_APPEARANCE: fallback,
    useAppearanceStore: { getState: () => ({ appearance: current }) },
    commitPublicAppearance: (appearance: typeof current) => { applied.push(appearance); current = appearance; return appearance; },
}));
const { bootstrapAppearance } = await import("../src/services/appearance-bootstrap");

test("网络失败不使用上游默认品牌覆盖当前页面", async () => {
    await bootstrapAppearance();
    expect(applied).toEqual([]);
    expect(current.brandName).toBe("当前映雪品牌");
});

test("成功返回的服务器配置仍正常应用", async () => {
    const appearance = { ...fallback, brandName: "映雪" } as Awaited<ReturnType<typeof bootstrapAppearance>>;
    await bootstrapAppearance(async () => appearance);
    expect(applied).toEqual([appearance]);
});
