import { QueryClient } from "@tanstack/react-query";

export const appQueryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});

const publicCatalogKeys = new Set(["production-library", "ltv-home-catalog"]);
const publicQueryKeys = new Set([...publicCatalogKeys, "public-legal-terms"]);
for (const key of publicCatalogKeys) {
    // Published metadata is shared and small; returning from an editor must not
    // download the full catalog again after the normal five-minute collection.
    appQueryClient.setQueryDefaults([key], { staleTime: Infinity, gcTime: Infinity });
}

export function clearUserQueryCache(client: QueryClient) {
    // Public catalogs and registration terms are independent of the signed-in account.
    // Preserve active observers while canceling every account-scoped query.
    client.removeQueries({ predicate: ({ queryKey }) =>
        !(queryKey.length === 1 && typeof queryKey[0] === "string" && publicQueryKeys.has(queryKey[0])) });
    client.getMutationCache().clear();
}
