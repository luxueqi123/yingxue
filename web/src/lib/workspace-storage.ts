import { openWorkspaceWallet } from "@/lib/workspace-wallet";

/** 打开存储扩容视图。 */
export function openStoragePurchase() {
    openWorkspaceWallet({ tab: "storage" });
}

/** 已超出容量或只读的错误原因，前端据此展示扩容入口。 */
export const STORAGE_LIMIT_REASONS = new Set(["storage_capacity_exceeded", "storage_read_only"]);
