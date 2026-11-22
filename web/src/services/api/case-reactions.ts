import { http } from "./request";

export type CaseReaction = { count: number; liked: boolean };

export function getCaseReaction(id: string, authenticated: boolean, signal?: AbortSignal) {
    return http.get<CaseReaction>(`${authenticated ? "" : "/public"}/cases/${encodeURIComponent(id)}/reaction`, { signal });
}

export function setCaseLiked(id: string, liked: boolean) {
    const url = `/cases/${encodeURIComponent(id)}/like`;
    return liked ? http.put<CaseReaction>(url) : http.delete<CaseReaction>(url);
}
