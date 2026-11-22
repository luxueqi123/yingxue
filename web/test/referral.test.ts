import { afterEach, expect, test } from "bun:test";
import { apiClient, ApiError } from "../src/services/api/request";
import { getAdminReferralSetting, getReferralOverview, listReferralCommissions, listReferralInvitees, referralLink, updateAdminReferralSetting } from "../src/services/api/referral";
import { useUserStore } from "../src/stores/use-user-store";

const originalAdapter = apiClient.defaults.adapter;
afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    useUserStore.getState().clearSession();
});

test("referral reads use the shared authenticated client and unwrap the business envelope", async () => {
    const calls: Array<{ url?: string; method?: string; params?: unknown }> = [];
    apiClient.defaults.adapter = async (config) => {
        calls.push({ url: config.url, method: config.method, params: config.params });
        expect(config.withCredentials).toBe(true);
        return { status: 200, statusText: "OK", headers: {}, config, data: { code: 0, data: { total: 3, code: "ABCDEFGH" }, msg: "ok" } };
    };
    expect((await getReferralOverview()).code).toBe("ABCDEFGH");
    expect((await listReferralInvitees({ page: 2, pageSize: 20 })).total).toBe(3);
    expect((await listReferralCommissions({ page: 3, pageSize: 20 })).total).toBe(3);
    expect(calls).toEqual([
        { url: "/referral", method: "get", params: undefined },
        { url: "/referral/invitees", method: "get", params: { page: 2, pageSize: 20 } },
        { url: "/referral/commissions", method: "get", params: { page: 3, pageSize: 20 } },
    ]);
});

test("admin settings persist only on the explicit patch call", async () => {
    const calls: Array<{ method?: string; body: unknown }> = [];
    const setting = { enabled: false, mode: "all" as const, commissionRateBasisPoints: 1000 };
    apiClient.defaults.adapter = async (config) => {
        calls.push({ method: config.method, body: config.data });
        return { status: 200, statusText: "OK", headers: {}, config, data: { code: 0, data: { setting }, msg: "ok" } };
    };
    expect((await getAdminReferralSetting()).setting).toEqual(setting);
    expect(calls).toEqual([{ method: "get", body: undefined }]);
    expect((await updateAdminReferralSetting(setting)).setting).toEqual(setting);
    expect(calls[1]).toEqual({ method: "patch", body: JSON.stringify(setting) });
});

test("business failure is surfaced even with HTTP 200", async () => {
    apiClient.defaults.adapter = async (config) => ({ status: 200, statusText: "OK", headers: {}, config, data: { code: 403, data: null, msg: "推广中心未开放" } });
    await expect(getReferralOverview()).rejects.toBeInstanceOf(ApiError);
    await expect(getReferralOverview()).rejects.toThrow("推广中心未开放");
});

test("referral availability starts closed and is cleared with the account session", () => {
    expect(useUserStore.getState().referralAvailable).toBe(false);
    useUserStore.getState().setReferralAvailable(true);
    expect(useUserStore.getState().referralAvailable).toBe(true);
    useUserStore.getState().clearSession();
    expect(useUserStore.getState().referralAvailable).toBe(false);
    expect(useUserStore.getState().runtimeLimits.sessionUploadMB).toBe(32);
});

test("invitation links encode the code and target registration", () => {
    expect(referralLink("AB CD&", "https://example.test")).toBe("https://example.test/register?ref=AB%20CD%26");
});
