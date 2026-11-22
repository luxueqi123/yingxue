import { apiClient } from "../src/services/api/request";
import { clearResourceAccessCache } from "../src/services/api/resources";

// Exercise the production resource resolver without issuing real network requests.
export function installResourceAccessFixture(urls: Record<string, string>) {
    const previous = apiClient.defaults.adapter;
    clearResourceAccessCache();
    apiClient.defaults.adapter = async (config) => {
        if (config.url !== "/resources/access" || config.method !== "post") {
            throw new Error(`Unexpected fixture request: ${config.method} ${config.url}`);
        }
        const requests = JSON.parse(String(config.data)) as { resourceId: string; variant: string }[];
        const items = requests.map(({ resourceId, variant }) => {
            const url = urls[resourceId];
            if (!url) throw new Error(`Missing resource access fixture: ${resourceId}`);
            return {
                resourceId,
                access: {
                    resourceId,
                    url,
                    delivery: "platform-local",
                    requestedVariant: variant,
                    actualVariant: variant,
                    issuedAt: new Date().toISOString(),
                    expiresAt: null,
                    refreshAt: new Date(Date.now() + 60_000).toISOString(),
                    revision: "fixture",
                },
            };
        });
        return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data: { items }, msg: "ok" } };
    };
    return () => {
        apiClient.defaults.adapter = previous;
        clearResourceAccessCache();
    };
}
