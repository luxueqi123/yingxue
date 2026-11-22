import { afterEach, describe, expect, test } from "bun:test";

import { apiClient } from "../src/services/api/request";
import { listPaymentOrders, listPaymentProviders } from "../src/services/api/payments";

const originalRequest = apiClient.request;

afterEach(() => {
    apiClient.request = originalRequest;
});

describe("wallet payment integration", () => {
    test.each([
        ["alipay-page-pay", null, ["alipay"]],
        ["wechat-native", null, ["wxpay"]],
        ["alipay-page-pay", undefined, ["alipay"]],
        ["cloudcat-epay", ["alipay", "wxpay"], ["alipay", "wxpay"]],
        ["epay", ["wxpay"], ["wxpay"]],
        ["unknown-provider", null, []],
    ])("exposes usable methods for %s before the wallet starts checkout", async (id, paymentMethods, expected) => {
        apiClient.request = (async () => ({
            data: {
                code: 0,
                data: { providers: [{ id, paymentMethods, enabled: true, configured: true, pluginEnabled: true }] },
                msg: "ok",
            },
            status: 200,
            headers: {},
        })) as typeof apiClient.request;

        const { providers } = await listPaymentProviders();
        expect(providers[0].paymentMethods).toEqual(expected);
        expect(() => providers[0].paymentMethods.find((method) => method === "alipay" || method === "wxpay")).not.toThrow();
    });

    test("loads the signed-in user's paginated top-up orders from the collection route", async () => {
        let requestConfig: Record<string, unknown> | undefined;
        apiClient.request = (async (config: Record<string, unknown>) => {
            requestConfig = config;
            return {
                data: {
                    code: 0,
                    data: { items: [], page: 2, pageSize: 10, total: 0, totalPages: 0 },
                    msg: "ok",
                },
                status: 200,
                headers: {},
            };
        }) as typeof apiClient.request;

        await expect(listPaymentOrders({ page: 2, pageSize: 10, status: "pending" })).resolves.toEqual({
            items: [],
            page: 2,
            pageSize: 10,
            total: 0,
            totalPages: 0,
        });
        expect(requestConfig).toMatchObject({
            method: "get",
            url: "/payments/topup-orders",
            params: { page: 2, pageSize: 10, status: "pending" },
        });
    });

    test("keeps provider methods, resumable orders, and provider close policy in the wallet UI", async () => {
        const source = await Bun.file(new URL("../src/pages/wallet/index.tsx", import.meta.url)).text();

        expect(source).toContain("ordersResult.items");
        expect(source).toContain('availablePaymentMethods.map((method) =>');
        expect(source).toContain('paymentMethod={method}');
        expect(source).toContain('["created", "pending", "create_failed"].includes(order.status)');
        expect(source).toContain("continuePayment(order)");
        expect(source).toContain('t("storageUi.continuePayment")');
        expect(source).toContain("paymentOrder.canClose === false");
    });
});
