import { expect, test } from "bun:test";
import { isCancelledError, QueryClient, QueryObserver } from "@tanstack/react-query";
import { clearUserQueryCache } from "../src/lib/query-client";

test("session recovery preserves active public catalogs and cancels private data", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finishCatalog!: (value: string[]) => void;
    const publicRequest = client.fetchQuery({ queryKey: ["production-library"], queryFn: () =>
        new Promise<string[]>(resolve => { finishCatalog = resolve; }) });
    const observer = new QueryObserver(client, { queryKey: ["production-library"] });
    const unsubscribe = observer.subscribe(() => {});
    client.setQueryData(["ltv-home-catalog"], ["published-skill"]);
    client.setQueryData(["assets", "previous-user"], ["private-asset"]);
    client.setQueryData(["production-library", "previous-user"], ["private-variant"]);
    client.getMutationCache().build(client, { mutationKey: ["previous-user-write"] });
    let aborted = false;
    const privateRequest = client.fetchQuery({
        queryKey: ["private-pending"], queryFn: ({ signal }) => {
            signal.addEventListener("abort", () => { aborted = true; });
            return new Promise<never>(() => {});
        },
    }).catch(error => error);
    try {
        clearUserQueryCache(client);
        expect(aborted).toBe(true);
        expect(isCancelledError(await privateRequest)).toBe(true);
        expect(client.getQueryData(["assets", "previous-user"])).toBeUndefined();
        expect(client.getQueryData(["production-library", "previous-user"])).toBeUndefined();
        expect(client.getMutationCache().getAll()).toHaveLength(0);
        finishCatalog(["published-case"]);
        expect(await publicRequest).toEqual(["published-case"]);
        expect(observer.getCurrentResult().data).toEqual(["published-case"]);
        expect(client.getQueryData(["ltv-home-catalog"])).toEqual(["published-skill"]);
    } finally {
        unsubscribe();
        client.clear();
    }
});

test("session recovery lets the visible registration agreement finish loading", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const agreement = { agreementTitle: "映雪服务协议", agreementContent: "已发布的注册服务条款" };
    let finishTerms!: (value: typeof agreement) => void;
    const termsRequest = client.fetchQuery({
        queryKey: ["public-legal-terms"],
        queryFn: () => new Promise<typeof agreement>(resolve => { finishTerms = resolve; }),
    }).then(data => ({ data }), error => ({ canceled: isCancelledError(error) }));
    const observer = new QueryObserver(client, { queryKey: ["public-legal-terms"] });
    const unsubscribe = observer.subscribe(() => {});
    client.setQueryData(["public-legal-terms", "previous-user"], { private: true });
    client.setQueryData(["account", "previous-user"], { private: true });
    try {
        expect(observer.getCurrentResult().isPending).toBe(true);
        clearUserQueryCache(client);
        finishTerms(agreement);
        expect(await termsRequest).toEqual({ data: agreement });
        expect(observer.getCurrentResult().isSuccess).toBe(true);
        expect(observer.getCurrentResult().data).toEqual(agreement);
        expect(client.getQueryData(["public-legal-terms", "previous-user"])).toBeUndefined();
        expect(client.getQueryData(["account", "previous-user"])).toBeUndefined();
    } finally {
        unsubscribe();
        client.clear();
    }
});
