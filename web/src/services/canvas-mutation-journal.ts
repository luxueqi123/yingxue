import { openDB, type IDBPDatabase } from "idb";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { CanvasMutationBatchState } from "./canvas-mutation-batches";

export type PendingCanvasMutation = CanvasMutationBatchState & {
    journalId: string;
    scope: string;
    projectId: string;
    baseline?: CanvasProject;
    localBaseline?: CanvasProject;
    rebaseSource?: CanvasProject;
    clientId?: string;
    editVersions?: Record<string, number>;
    editSession?: string;
    prepared: CanvasProject;
    localPrepared: CanvasProject;
    createdAt: string;
    journalVersion?: number;
    rejectedReason?: string;
};

export class CanvasMutationJournalBusyError extends Error {
    constructor() {
        super("另一个标签页正在确认画布操作，正在等待重试");
        this.name = "CanvasMutationJournalBusyError";
    }
}

// One record per mutation: tabs never rewrite a shared read/modify/write array.
// Keep the journal's stable key when a batch advances to its next mutation ID.
function journalDatabase() {
    if (typeof indexedDB === "undefined") throw new Error("画布待同步记录无法持久化，请启用浏览器存储后重试");
    return openDB("yingce-canvas-mutations", 2, {
        upgrade(db, oldVersion) {
            if (oldVersion < 1) {
                const store = db.createObjectStore("mutations", { keyPath: "journalId" });
                store.createIndex("scope", "scope");
            }
            if (oldVersion < 2) db.createObjectStore("legacyImports", { keyPath: "journalId" });
        },
    });
}

async function importNativeJournal(db: IDBPDatabase, scope: string) {
    const raw = await localForageStorageForScope(scope).getItem("yingce:canvas-mutation-journal");
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("画布待同步记录格式无效，原记录已保留");
    const seen = new Set<string>();
    const entries = parsed.map((value): PendingCanvasMutation => {
        const entry = value as Partial<PendingCanvasMutation> & { rebaseSource?: CanvasProject };
        if (!entry || typeof entry.projectId !== "string" || !entry.projectId || typeof entry.request?.mutationId !== "string" || !entry.request.mutationId || !Array.isArray(entry.request.operations) || entry.prepared?.id !== entry.projectId || !Array.isArray(entry.prepared.nodes) || (entry.localPrepared && (entry.localPrepared.id !== entry.projectId || !Array.isArray(entry.localPrepared.nodes))) || typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt)) || (entry.remainingOperations !== undefined && !Array.isArray(entry.remainingOperations))) {
            throw new Error("画布待同步记录格式无效，原记录已保留");
        }
        const journalId = JSON.stringify(["legacy", scope, entry.projectId, entry.request.mutationId]);
        if (seen.has(journalId)) throw new Error("画布待同步记录重复，原记录已保留");
        seen.add(journalId);
        return { ...entry, journalId, scope, request: entry.request, projectId: entry.projectId, prepared: entry.prepared, localPrepared: entry.localPrepared ?? entry.prepared, localBaseline: entry.localBaseline ?? entry.rebaseSource ?? entry.baseline, createdAt: entry.createdAt, journalVersion: 1 };
    });
    if (!entries.length) return;
    const tx = db.transaction(["mutations", "legacyImports"], "readwrite");
    const committed = tx.done;
    try {
        for (const entry of entries) {
            if (await tx.objectStore("legacyImports").getKey(entry.journalId)) continue;
            if (await tx.objectStore("mutations").getKey(entry.journalId)) throw new Error("画布待同步记录冲突，原记录已保留");
            await tx.objectStore("mutations").add(entry);
            // Keep the receipt after replay removes the pending mutation. An older
            // tab's retained array must never resurrect an acknowledged request.
            await tx.objectStore("legacyImports").add({ journalId: entry.journalId, scope });
        }
        await committed;
    } catch (error) {
        try { tx.abort(); } catch { /* An IndexedDB request may already have aborted it. */ }
        await committed.catch(() => undefined);
        throw error;
    }
}

export async function readCanvasMutationJournal(scope: string): Promise<PendingCanvasMutation[]> {
    const db = await journalDatabase();
    try {
        await importNativeJournal(db, scope);
        const entries: PendingCanvasMutation[] = await db.getAllFromIndex("mutations", "scope", scope);
        for (const entry of entries) {
            if (entry.scope !== scope || !entry.journalId || !entry.projectId || !entry.request?.mutationId || !Array.isArray(entry.request.operations) || !Array.isArray(entry.prepared?.nodes) || !Array.isArray(entry.localPrepared?.nodes)) {
                throw new Error("画布待同步记录格式无效，原记录已保留");
            }
        }
        return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.journalId.localeCompare(right.journalId));
    } finally {
        db.close();
    }
}

export async function persistCanvasMutation(entry: PendingCanvasMutation) {
    const db = await journalDatabase();
    try {
        // A successful transaction completion is the durability boundary before HTTP.
        const tx = db.transaction("mutations", "readwrite");
        const stored: PendingCanvasMutation | undefined = await tx.store.get(entry.journalId);
        if (stored?.journalVersion !== entry.journalVersion || (!stored && entry.journalVersion !== undefined)) {
            await tx.done;
            throw new CanvasMutationJournalBusyError();
        }
        const journalVersion = (entry.journalVersion ?? 0) + 1;
        await tx.store.put({ ...entry, journalVersion });
        await tx.done;
        entry.journalVersion = journalVersion;
    } finally {
        db.close();
    }
}

export async function removeCanvasMutation(entry: PendingCanvasMutation) {
    const db = await journalDatabase();
    try {
        const tx = db.transaction("mutations", "readwrite");
        const stored: PendingCanvasMutation | undefined = await tx.store.get(entry.journalId);
        if (stored && stored.journalVersion !== entry.journalVersion) {
            await tx.done;
            throw new CanvasMutationJournalBusyError();
        }
        await tx.store.delete(entry.journalId);
        await tx.done;
    } finally {
        db.close();
    }
}
