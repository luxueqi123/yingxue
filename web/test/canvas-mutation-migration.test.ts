import { beforeEach, expect, mock, test } from "bun:test";
import { deleteDB, openDB } from "idb";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

const legacy = new Map<string, string>();
mock.module("@/lib/localforage-storage", () => ({ localForageStorageForScope: (scope: string) => ({
    getItem: async (key: string) => key === "yingce:canvas-mutation-journal" ? legacy.get(scope) ?? null : null,
}) }));
const { readCanvasMutationJournal, persistCanvasMutation, removeCanvasMutation } = await import("../src/services/canvas-mutation-journal");
const database = "yingce-canvas-mutations";
const snapshot = (title: string) => ({ id: "canvas", title, nodes: [], connections: [] }) as unknown as CanvasProject;
const entry = (mutationId = "pending") => ({
    projectId: "canvas", baseline: snapshot("Old"), prepared: snapshot("New"),
    request: { mutationId, baseRevision: 3, operations: [{ type: "set_field", field: "title", value: "New", beforeValue: "Old" }] },
    createdAt: "2026-11-08T00:00:00Z",
});
beforeEach(async () => { await deleteDB(database); legacy.clear(); });

test("upgrade imports the exact unsent native request and both original snapshots", async () => {
    const original = { ...entry(), localPrepared: snapshot("Local media"), rebaseSource: snapshot("Before rebase"), remainingOperations: [{ type: "set_field", field: "title", value: "Later", beforeValue: "New" }], editVersions: { node: 2 }, editSession: "session" };
    const raw = JSON.stringify([original]); legacy.set("user-a", raw);
    const result = await readCanvasMutationJournal("user-a");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ ...original, scope: "user-a", localBaseline: original.rebaseSource, journalVersion: 1 });
    expect(result[0]!.request).toEqual(original.request);
    expect(legacy.get("user-a")).toBe(raw);
});

test("old snapshots without a local projection recover their original prepared content", async () => {
    legacy.set("user-a", JSON.stringify([entry()]));
    const [result] = await readCanvasMutationJournal("user-a");
    expect(result!.localPrepared).toEqual(entry().prepared);
    expect(result!.baseline).toEqual(entry().baseline);
});

test("concurrent tabs import once and do not resurrect a confirmed request", async () => {
    legacy.set("user-a", JSON.stringify([entry()]));
    const reads = await Promise.all([readCanvasMutationJournal("user-a"), readCanvasMutationJournal("user-a")]);
    expect(reads.map(items => items.length)).toEqual([1, 1]);
    await removeCanvasMutation(reads[0]![0]!);
    expect(await readCanvasMutationJournal("user-a")).toEqual([]);
    // A still-open older tab may append another native request.
    legacy.set("user-a", JSON.stringify([entry(), entry("later")]));
    expect((await readCanvasMutationJournal("user-a")).map(item => item.request.mutationId)).toEqual(["later"]);
});

test("the same native mutation ID in two accounts never shares imported records", async () => {
    legacy.set("user-a", JSON.stringify([entry()])); legacy.set("user-b", JSON.stringify([entry()]));
    const a = await readCanvasMutationJournal("user-a"), b = await readCanvasMutationJournal("user-b");
    expect(a).toHaveLength(1); expect(b).toHaveLength(1);
    expect(a[0]!.journalId).not.toBe(b[0]!.journalId);
    await removeCanvasMutation(a[0]!);
    expect(await readCanvasMutationJournal("user-a")).toEqual([]);
    expect(await readCanvasMutationJournal("user-b")).toHaveLength(1);
});

test.each(["{}", "invalid json", JSON.stringify([entry(), { ...entry("broken"), prepared: null }])])("malformed legacy data is retained and no partial batch is imported: %s", async raw => {
    legacy.set("user-a", raw);
    await expect(readCanvasMutationJournal("user-a")).rejects.toThrow();
    expect(legacy.get("user-a")).toBe(raw);
    legacy.delete("user-a");
    expect(await readCanvasMutationJournal("user-a")).toEqual([]);
});

test("schema upgrade preserves existing atomic journals and their compare-and-set versions", async () => {
    const current = { ...entry("atomic"), journalId: "current", scope: "user-a", localPrepared: snapshot("Existing atomic draft"), journalVersion: 5 };
    const oldDB = await openDB(database, 1, { upgrade(db) { db.createObjectStore("mutations", { keyPath: "journalId" }).createIndex("scope", "scope"); } });
    await oldDB.put("mutations", current); oldDB.close();
    legacy.set("user-a", JSON.stringify([entry()]));
    const rows = await readCanvasMutationJournal("user-a");
    expect(rows).toHaveLength(2);
    const atomic = rows.find(row => row.journalId === "current")!;
    expect(atomic).toEqual(current);
    const stale = structuredClone(atomic);
    await persistCanvasMutation(atomic);
    await expect(removeCanvasMutation(stale)).rejects.toThrow("另一个标签页");
});

test("an interrupted import rolls back entries and receipts together before a retry", async () => {
    await readCanvasMutationJournal("user-a");
    const collisionId = JSON.stringify(["legacy", "user-a", "canvas", "collision"]);
    const collision = { ...entry("other"), journalId: collisionId, scope: "user-a", localPrepared: snapshot("Existing data"), journalVersion: 8 };
    const db = await openDB(database);
    await db.put("mutations", collision); db.close();
    const raw = JSON.stringify([entry(), entry("collision")]); legacy.set("user-a", raw);
    await expect(readCanvasMutationJournal("user-a")).rejects.toThrow("冲突");
    expect(legacy.get("user-a")).toBe(raw);
    legacy.delete("user-a");
    expect(await readCanvasMutationJournal("user-a")).toEqual([collision]);
    await removeCanvasMutation(collision);
    legacy.set("user-a", raw);
    expect((await readCanvasMutationJournal("user-a")).map(row => row.request.mutationId).sort()).toEqual(["collision", "pending"]);
});

test("duplicate native identities are retained for review rather than silently overwritten", async () => {
    const raw = JSON.stringify([entry(), { ...entry(), prepared: snapshot("Conflicting snapshot") }]);
    legacy.set("user-a", raw);
    await expect(readCanvasMutationJournal("user-a")).rejects.toThrow("重复");
    expect(legacy.get("user-a")).toBe(raw);
    legacy.delete("user-a");
    expect(await readCanvasMutationJournal("user-a")).toEqual([]);
});
