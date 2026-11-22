import { expect, test } from "bun:test";
import { refreshFeatureAvailability } from "@/lib/user-session";
import { apiClient } from "@/services/api/request";
import { useUserStore, defaultFeatureAvailability } from "@/stores/use-user-store";

test("concurrent feature reads share transport and never apply the previous account's response", async () => {
    const original = apiClient.defaults.adapter;
    const state = useUserStore.getState();
    const pending = Promise.withResolvers<void>();
    let calls = 0;
    apiClient.defaults.adapter = async (config) => {
        expect(config.url).toBe("/features");
        calls++;
        await pending.promise;
        return { config, status: 200, statusText: "OK", headers: {},
            data: { code: 0, msg: "ok", data: { features: { ...defaultFeatureAvailability, videoWorkbenchEnabled: true } } } };
    };
    try {
        useUserStore.setState({ user: { id: "account-before-switch" } as never });
        const first = refreshFeatureAvailability();
        expect(refreshFeatureAvailability()).toBe(first);
        const currentFeatures = { ...defaultFeatureAvailability, videoWorkbenchEnabled: false };
        useUserStore.setState({ user: { id: "account-after-switch" } as never, features: currentFeatures });
        pending.resolve();
        await first;
        expect(calls).toBe(1);
        expect(useUserStore.getState().features).toBe(currentFeatures);
    } finally {
        pending.resolve();
        apiClient.defaults.adapter = original;
        useUserStore.setState(state);
    }
});

test("a completed refresh updates its own account and the next refresh performs a fresh read", async () => {
    const original = apiClient.defaults.adapter;
    const state = useUserStore.getState();
    let calls = 0;
    apiClient.defaults.adapter = async (config) => ({ config, status: 200, statusText: "OK", headers: {},
        data: { code: 0, msg: "ok", data: { features: { ...defaultFeatureAvailability, videoWorkbenchEnabled: ++calls === 1 } } } });
    try {
        useUserStore.setState({ user: { id: "current-account" } as never });
        await refreshFeatureAvailability();
        expect(useUserStore.getState().features.videoWorkbenchEnabled).toBe(true);
        await refreshFeatureAvailability();
        expect(useUserStore.getState().features.videoWorkbenchEnabled).toBe(false);
        expect(calls).toBe(2);
    } finally {
        apiClient.defaults.adapter = original;
        useUserStore.setState(state);
    }
});
