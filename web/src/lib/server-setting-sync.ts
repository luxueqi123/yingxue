export type ServerSettingKey = "payment";

const serverSettingEventName = "yingxue:server-setting-updated";
const serverSettingStorageKey = "yingxue:server-setting-update";

type ServerSettingUpdate = {
    key: ServerSettingKey;
    updatedAt: number;
};

function isServerSettingUpdate(value: unknown): value is ServerSettingUpdate {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<ServerSettingUpdate>;
    return candidate.key === "payment" && typeof candidate.updatedAt === "number";
}

export function publishServerSettingUpdated(key: ServerSettingKey) {
    const detail: ServerSettingUpdate = { key, updatedAt: Date.now() };
    window.dispatchEvent(new CustomEvent<ServerSettingUpdate>(serverSettingEventName, { detail }));
    try {
        window.localStorage.setItem(serverSettingStorageKey, JSON.stringify(detail));
    } catch {
        // 同页事件仍然有效；浏览器禁用存储时由 focus/visibility 重新校验服务端状态。
    }
}

export function subscribeServerSettingUpdated(key: ServerSettingKey, listener: () => void) {
    const handleEvent = (event: Event) => {
        const detail = (event as CustomEvent<ServerSettingUpdate>).detail;
        if (isServerSettingUpdate(detail) && detail.key === key) listener();
    };
    const handleStorage = (event: StorageEvent) => {
        if (event.key !== serverSettingStorageKey || !event.newValue) return;
        try {
            const detail: unknown = JSON.parse(event.newValue);
            if (isServerSettingUpdate(detail) && detail.key === key) listener();
        } catch {
            // 忽略损坏的跨标签页通知，调用方仍会在窗口重新可见时读取服务端。
        }
    };

    window.addEventListener(serverSettingEventName, handleEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
        window.removeEventListener(serverSettingEventName, handleEvent);
        window.removeEventListener("storage", handleStorage);
    };
}
