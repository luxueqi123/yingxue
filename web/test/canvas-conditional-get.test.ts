import { afterEach, describe, expect, test } from "bun:test";

import { getCanvasHistoryEntry, getRemoteCanvasProject, getRemoteUserDataSnapshot, upsertRemoteCanvasProject } from "../src/services/api/user-data";
import { apiClient } from "../src/services/api/request";
import type { CanvasProject } from "../src/stores/canvas/use-canvas-store";

const originalAdapter = apiClient.defaults.adapter;

afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
});

describe("conditional canvas reads", () => {
    test("history and full snapshot reads reject malformed collections too", async () => {
        const invalid = { id: "bad", nodes: [], connections: [], chatSessions: [{ id: "s", messages: null }] };
        apiClient.defaults.adapter = async (config) => ({ config, status: 200, statusText: "OK", headers: {},
            data: { code: 0, data: config.url?.includes("snapshot") ? { projects: [invalid], assets: [] } : { project: invalid }, msg: "" } });
        await expect(getCanvasHistoryEntry("bad", "history-id")).rejects.toThrow("chatSessions[0].messages");
        await expect(getRemoteUserDataSnapshot()).rejects.toThrow("chatSessions[0].messages");
    });

    test("invalid local writes never reach the HTTP adapter", () => {
        let calls = 0;
        apiClient.defaults.adapter = async () => { calls++; throw new Error("unexpected HTTP write"); };
        expect(() => upsertRemoteCanvasProject({ id: "bad", nodes: [], connections: [] } as unknown as CanvasProject)).toThrow("chatSessions");
        expect(calls).toBe(0);
    });

    test("304 cannot turn an invalid cached canvas into verified editor data", async () => {
        apiClient.defaults.adapter = async (config) => ({ config, status: 304, statusText: "Not Modified", headers: {}, data: null });
        const invalid = { id: "bad", revision: 1, nodes: [], connections: [], chatSessions: [null] } as unknown as CanvasProject;
        await expect(getRemoteCanvasProject("bad", invalid)).rejects.toThrow("chatSessions");
    });

    test("valid server content is preserved without dropping unknown extension fields", async () => {
        const project = { id: "valid", revision: 1, nodes: [], connections: [], chatSessions: [], extension: { content: "原文 {name}" } };
        apiClient.defaults.adapter = async (config) => ({ config, status: 200, statusText: "OK", headers: {},
            data: { code: 0, data: { project }, msg: "" } });
        const before = JSON.stringify(project);
        expect((await getRemoteCanvasProject("valid")).project).toEqual(project);
        expect(JSON.stringify(project)).toBe(before);
    });
    test("rejects corrupt remote sessions before they can enter the editor store", async () => {
        apiClient.defaults.adapter = async (config) => ({ config, status: 200, statusText: "OK", headers: {},
            data: { code: 0, data: { project: { id: "bad", nodes: [], connections: [], chatSessions: [null] } }, msg: "" } });
        await expect(getRemoteCanvasProject("bad")).rejects.toThrow("chatSessions");
    });
    test("reuses a verified project when the server returns 304", async () => {
        const known = {
            id: "canvas-1",
            title: "Cached canvas",
            revision: 4,
            updatedAt: "2026-09-28T12:00:00.000Z",
            nodes: [], connections: [], chatSessions: [],
        } as CanvasProject;
        let requestEtag = "";
        apiClient.defaults.adapter = async (config) => {
            const headers = config.headers as { get?: (name: string) => string | undefined; [key: string]: unknown } | undefined;
            requestEtag = String(headers?.get?.("If-None-Match") ?? headers?.["If-None-Match"] ?? "");
            return { config, status: 304, statusText: "Not Modified", headers: {}, data: null };
        };

        const result = await getRemoteCanvasProject(known.id, known);
        expect(result).toEqual({ project: known, notModified: true });
        expect(result.project).toBe(known);
        expect(requestEtag).toBe('"canvas-4"');
    });

    for (const mode of ["get", "conditional", "not-modified", "snapshot"] as const) {
        test(`${mode}: normalizes omitted sessions at the read boundary without mutating the response`, async () => {
            const raw = { id: "canvas-1", revision: 4, nodes: [], connections: [] } as unknown as CanvasProject;
            apiClient.defaults.adapter = async (config) => ({
                config,
                status: mode === "not-modified" ? 304 : 200,
                statusText: "OK",
                headers: {},
                data: mode === "not-modified" ? null : { code: 0, data: mode === "snapshot" ? { projects: [raw], assets: [] } : { project: raw } },
            });
            const project = mode === "snapshot" ? (await getRemoteUserDataSnapshot()).projects[0] : (await getRemoteCanvasProject(raw.id, mode === "get" ? undefined : raw)).project;
            expect(project.chatSessions).toEqual([]);
            expect(raw.chatSessions).toBeUndefined();
            expect(project.nodes).toBe(raw.nodes);
        });

        test(`${mode}: rejects corrupt non-array sessions`, async () => {
            const raw = { id: "canvas-1", revision: 4, chatSessions: {} } as unknown as CanvasProject;
            apiClient.defaults.adapter = async (config) => ({
                config,
                status: mode === "not-modified" ? 304 : 200,
                statusText: "OK",
                headers: {},
                data: mode === "not-modified" ? null : { code: 0, data: mode === "snapshot" ? { projects: [raw], assets: [] } : { project: raw } },
            });
            await expect(mode === "snapshot" ? getRemoteUserDataSnapshot() : getRemoteCanvasProject(raw.id, mode === "get" ? undefined : raw)).rejects.toThrow("画布会话数据格式无效");
        });
    }

    test("keeps an existing sessions array and its contents unchanged", async () => {
        const sessions = [{ id: "chat", title: "会话", messages: [{ role: "user", content: "保留内容" }] }];
        const project = { id: "canvas-1", nodes: [], connections: [], chatSessions: sessions } as unknown as CanvasProject;
        apiClient.defaults.adapter = async (config) => ({ config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data: { project } } });
        expect((await getRemoteCanvasProject(project.id)).project.chatSessions).toBe(sessions);
    });
});
