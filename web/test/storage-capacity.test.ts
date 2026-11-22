import { afterEach, describe, expect, test } from "bun:test";

import { accountStorageMeter, accountStorageStateMessage } from "../src/lib/account-storage-usage";
import { paymentOrderGrantLabel } from "../src/lib/payment-order-grant";
import { apiClient } from "../src/services/api/request";
import type { AccountFileStorageUsage } from "../src/services/api/resources";
import { getAdminUserStorage, grantAdminUserStorage, listMyStorageGrants, revokeAdminStorageGrant, storageGrantActive, type UserStorageGrant } from "../src/services/api/storage-grants";

const GB = 1024 ** 3;
const originalAdapter = apiClient.defaults.adapter;
afterEach(() => { apiClient.defaults.adapter = originalAdapter; });

function usage(overrides: Partial<AccountFileStorageUsage> = {}): AccountFileStorageUsage {
    return { usedBytes: 8 * GB, totalBytes: 12 * GB, baseBytes: 10 * GB, purchasedBytes: 2 * GB, overLimit: false, readOnly: false, ...overrides };
}

describe("storage entitlement presentation", () => {
    test("capacity separates base and purchased storage and does not label a full account read-only", () => {
        const meter = accountStorageMeter(usage({ usedBytes: 12 * GB }));
        expect(meter.baseLabel).toBe("10 GB");
        expect(meter.purchasedLabel).toBe("2 GB");
        expect(meter.full).toBe(true);
        expect(meter.state).toBe("ok");
        expect(accountStorageStateMessage(meter)).toBe("容量已满，暂停上传和生成。");
    });

    test("server authority determines grace and read-only even when a client clock passes the deadline", () => {
        const pastDeadline = "2026-01-01T00:00:00Z";
        const grace = accountStorageMeter(usage({ usedBytes: 13 * GB, overLimit: true, readOnlyAt: pastDeadline }));
        expect(grace.state).toBe("grace");
        expect(grace.remainingBytes).toBe(0);
        expect(grace.percent).toBe(100);
        expect(accountStorageStateMessage(grace)).toContain("将进入只读状态");
        const readOnly = accountStorageMeter(usage({ usedBytes: 13 * GB, overLimit: true, readOnly: true, readOnlyAt: pastDeadline }));
        expect(readOnly.state).toBe("read_only");
        expect(accountStorageStateMessage(readOnly)).toContain("账号处于只读状态");
        expect(accountStorageMeter(usage()).state).toBe("ok");
    });

    test("revoked, not-yet-started and exactly-expired grants are not shown as active", () => {
        const now = Date.parse("2026-10-29T00:00:00Z");
        const grant: UserStorageGrant = { id: "grant", userId: "owner", source: "admin", bytes: GB, durationDays: 0, startsAt: "2026-10-28T00:00:00Z", createdAt: "2026-10-28T00:00:00Z" };
        expect(storageGrantActive(grant, now)).toBe(true);
        expect(storageGrantActive({ ...grant, revokedAt: "2026-10-28T12:00:00Z" }, now)).toBe(false);
        expect(storageGrantActive({ ...grant, startsAt: "2026-10-30T00:00:00Z" }, now)).toBe(false);
        expect(storageGrantActive({ ...grant, expiresAt: "2026-10-29T00:00:00Z" }, now)).toBe(false);
        expect(storageGrantActive({ ...grant, expiresAt: "2026-10-30T00:00:00Z" }, now)).toBe(true);
    });

    test("storage purchase receipts show capacity and term instead of zero credits", () => {
        expect(paymentOrderGrantLabel({ productKind: "storage", creditsMicrocredits: 0, storageBytes: 10 * GB, storageDurationDays: 30 })).toBe("10 GB 存储空间 · 1 个月");
        expect(paymentOrderGrantLabel({ productKind: "storage", creditsMicrocredits: 0, storageBytes: GB, storageDurationDays: 0 })).toBe("1 GB 存储空间 · 永久有效");
        expect(paymentOrderGrantLabel({ productKind: "credits", creditsMicrocredits: 1000000 })).toBe("1 积分");
    });
});

test("storage grants use existing authenticated API and encode account identifiers", async () => {
    const calls: Array<{ method?: string; url?: string; data?: unknown }> = [];
    apiClient.defaults.adapter = async (config) => {
        expect(config.withCredentials).toBe(true);
        calls.push({ method: config.method, url: config.url, data: config.data ? JSON.parse(config.data) : undefined });
        return { status: 200, statusText: "OK", headers: {}, config, data: { code: 0, data: { grants: [] }, msg: "ok" } };
    };
    await listMyStorageGrants();
    await getAdminUserStorage("owner/a");
    await grantAdminUserStorage("owner/a", { bytes: GB, durationDays: 0, note: "manual grant" });
    await revokeAdminStorageGrant("grant/a", "refund");
    expect(calls).toEqual([
        { method: "get", url: "/resources/storage-grants", data: undefined },
        { method: "get", url: "/admin/users/owner%2Fa/storage", data: undefined },
        { method: "post", url: "/admin/users/owner%2Fa/storage-grants", data: { bytes: GB, durationDays: 0, note: "manual grant" } },
        { method: "post", url: "/admin/storage-grants/grant%2Fa/revoke", data: { reason: "refund" } },
    ]);
});

test("a failed grant is rejected even when the server HTTP status is 200", async () => {
    apiClient.defaults.adapter = async (config) => ({ status: 200, statusText: "OK", headers: {}, config, data: { code: 40302, data: null, msg: "storage grant denied" } });
    await expect(grantAdminUserStorage("owner", { bytes: GB, durationDays: 30 })).rejects.toThrow("storage grant denied");
});
