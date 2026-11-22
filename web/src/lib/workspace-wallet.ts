import { workspacePath, workspaceTeamId } from "./workspace-routes";

export const WORKSPACE_WALLET_OPEN_EVENT = "wallet:open";

export type WorkspaceWalletOpenDetail = {
    paymentOrderId?: string;
    paymentInvalid?: boolean;
    /** 打开后所在的视图，默认“会员方案”。 */
    tab?: "membership" | "unlimited" | "topup" | "storage" | "redeem" | "income" | "history" | "orders";
};

/** 从工作台打开积分商城。 */
export function openWorkspaceWallet(detail: WorkspaceWalletOpenDetail = {}) {
    if (workspaceTeamId) {
        window.location.assign(workspacePath("/wallet"));
        return;
    }
    window.dispatchEvent(new CustomEvent<WorkspaceWalletOpenDetail>(WORKSPACE_WALLET_OPEN_EVENT, { detail }));
}
