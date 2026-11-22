const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

function requireObjectArray(value: unknown, field: string): asserts value is Record<string, unknown>[] {
    if (!Array.isArray(value) || !value.every(isRecord)) {
        throw new Error(`画布数据结构无效：${field} 必须是对象数组，请保留原文件并修正数据`);
    }
}

/** Validate collection boundaries without filling missing data or rewriting source content. */
export function assertCanvasProjectCollections(value: unknown): void {
    if (!isRecord(value)) throw new Error("画布数据结构无效：project 必须是对象");
    for (const field of ["nodes", "connections", "chatSessions"] as const) {
        requireObjectArray(value[field], field);
    }
    const sessions = value.chatSessions as Record<string, unknown>[];
    sessions.forEach((session, index) => requireObjectArray(session.messages, `chatSessions[${index}].messages`));
}
