import assert from "node:assert/strict";
import { test } from "node:test";
import { assertActiveAuthSession, safeAuthNext } from "../src/lib/auth-entry.ts";
import type { AuthSessionPayload } from "../src/services/api/auth.ts";

test("回跳保留内部工作区参数，拒绝外部地址、认证循环和越权后台目的地", () => {
    assert.equal(safeAuthNext("/create?launch=draft-1"), "/create?launch=draft-1");
    assert.equal(safeAuthNext("/canvas/a?view=director#shot"), "/canvas/a?view=director#shot");
    assert.equal(safeAuthNext("/admin/users", "admin"), "/admin/users");
    for (const target of ["https://outside.invalid", "//outside.invalid", "/\\outside.invalid", "/%2foutside.invalid", "/%5coutside.invalid", "/login", "/register", "/forgot-password", "/admin/users", "/bad%ZZ"]) {
        assert.equal(safeAuthNext(target, "user"), "/home", target);
    }
    assert.equal(safeAuthNext("/admin/users"), "/admin/users");
});

test("业务成功响应仍需有效会话，游客、停用和缺失账号 ID 不放行", () => {
    for (const user of [null, { id: "", status: "active" }, { id: "disabled", status: "disabled" }, { id: "unknown" }]) {
        assert.throws(() => assertActiveAuthSession({ user } as AuthSessionPayload), /会话未建立/);
    }
    assert.doesNotThrow(() => assertActiveAuthSession({ user: { id: "active-user", status: "active" } } as AuthSessionPayload));
});
