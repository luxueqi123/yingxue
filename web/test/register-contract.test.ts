import { expect, test } from "bun:test";

test("register page keeps the four-field Yingxue contract", async () => {
    const source = await Bun.file(new URL("../src/pages/auth/register.tsx", import.meta.url)).text();

    for (const label of ["用户名", "显示名称", "密码", "确认密码"]) {
        expect(source).toContain(`label="${label}"`);
    }
    expect(source).toContain("register({ username, displayName, password })");
    expect(source).not.toContain('label="邮箱"');
    expect(source).not.toContain('label="邮箱验证码"');
    expect(source).not.toContain("sendRegistrationEmailCode");
});
