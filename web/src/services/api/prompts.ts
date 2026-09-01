import { compactApiParams, serializeApiParams, type ApiParams } from "@/services/api/request";
import { apiClient, request } from "@/services/api/request";

export type PromptScope = "public" | "mine" | "created" | "favorites" | "history";
export type PromptSort = "popular" | "new" | "favorites" | "history";
export type PromptMode = "image" | "video" | "text" | "audio";

export type Prompt = {
    id: string;
    title: string;
    prompt?: string;
    description: string;
    coverUrl: string;
    referenceImageUrl?: string;
    tags: string[];
    category: string;
    mode: PromptMode;
    modelHint: string;
    sourceUrl?: string;
    license?: string;
    visibility: "public" | "private" | string;
    status: number;
    featured: boolean;
    curationRank?: number;
    useCount: number;
    favoriteCount: number;
    isFavorite: boolean;
    lastUsedAt?: string;
    authorName: string;
    ownerId?: string;
    isOwner: boolean;
    createdAt: number;
    updatedAt: number;
};

export type PromptCategory = { value: string; label: string };
export type PromptModeOption = { value: PromptMode; label: string };

export type PromptList = {
    prompts: Prompt[];
    totalCount: number;
    hasMore: boolean;
    page: number;
    pageSize: number;
    categories: PromptCategory[];
    modes: PromptModeOption[];
    tags: string[];
};

export type ListPromptsInput = {
    page?: number;
    pageSize?: number;
    scope?: PromptScope;
    sort?: PromptSort;
    search?: string;
    tag?: string;
    category?: string;
    mode?: PromptMode;
};

export type PromptMutationInput = {
    title: string;
    prompt: string;
    description: string;
    coverUrl: string;
    referenceImageUrl: string;
    tags: string[];
    category: string;
    mode: PromptMode;
    modelHint: string;
    sourceUrl: string;
    license: string;
    visibility: "public" | "private";
};

const api = apiClient;

export function listPrompts(input: ListPromptsInput = {}) {
    const params = serializeApiParams(compactApiParams(input as ApiParams));
    return request<PromptList>(api.get(`/prompts?${params.toString()}`));
}

export function getPrompt(id: string) {
    return request<{ prompt: Prompt }>(api.get(`/prompts/${encodeURIComponent(id)}`));
}

export function createPrompt(input: PromptMutationInput) {
    return request<{ prompt: Prompt }>(api.post("/prompts", input));
}

export function updatePrompt(id: string, input: PromptMutationInput) {
    return request<{ prompt: Prompt }>(api.put(`/prompts/${encodeURIComponent(id)}`, input));
}

export function deletePrompt(id: string) {
    return request<{ deleted: boolean }>(api.delete(`/prompts/${encodeURIComponent(id)}`));
}

export function favoritePrompt(id: string) {
    return request<{ prompt: Prompt }>(api.post(`/prompts/${encodeURIComponent(id)}/favorite`));
}

export function unfavoritePrompt(id: string) {
    return request<{ prompt: Prompt }>(api.delete(`/prompts/${encodeURIComponent(id)}/favorite`));
}

export function usePrompt(id: string) {
    return request<{ prompt: Prompt }>(api.post(`/prompts/${encodeURIComponent(id)}/use`));
}
