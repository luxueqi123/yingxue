import { HardDrive } from "lucide-react";
import { Link } from "react-router";

import { useAccountFileStorageUsage } from "@/hooks/use-account-file-storage-usage";
import { accountStorageMeter, accountStorageStateMessage } from "@/lib/account-storage-usage";
import { cn } from "@/lib/utils";
import { preloadWorkspaceRoute } from "@/lib/workspace-route-modules";
import { progressFillStyle } from "@/lib/progress-fill";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

function StorageGlyph() {
    return (
        <span className="app-workspace-sidebar-storage-icon" aria-hidden="true">
            <HardDrive strokeWidth={1.75} />
        </span>
    );
}

export function WorkspaceSidebarStorageMeter({ collapsed }: { collapsed: boolean }) {
    const { locale, t } = useInterfaceTranslation();
    const query = useAccountFileStorageUsage();
    const meter = accountStorageMeter(query.data, locale);
    const usedText = query.data ? t("storageUi.usedCapacity", { value: meter.usedLabel }) : query.isError ? t("storageUi.capacityUnavailable") : t("storageUi.capacityCalculating");
    const remainingText = query.data
        ? meter.state === "read_only"
            ? t("storageUi.readOnlyText")
            : meter.state === "grace"
              ? t("storageUi.overCapacityText")
              : meter.full
                ? t("storageUi.capacityFullText")
                : t("storageUi.remainingCapacity", { value: meter.remainingLabel })
        : "";
    const totalText = query.data ? t("storageUi.totalCapacity", { value: meter.totalLabel }) : "";
    const summary = query.data ? t("storageUi.capacitySummary", { used: usedText, remaining: remainingText, total: totalText }) : usedText;
    const stateMessage = accountStorageStateMessage(meter, t);

    const track = (
        <span
            className="app-workspace-sidebar-storage-track"
            role="progressbar"
            aria-label={t("storageUi.capacityProgress")}
            aria-valuemin={0}
            aria-valuemax={query.data?.totalBytes ?? 0}
            aria-valuenow={query.data ? Math.min(query.data.usedBytes, query.data.totalBytes) : 0}
            aria-valuetext={summary}
        >
            <span style={progressFillStyle(meter.percent)} />
        </span>
    );

    if (query.isError && !query.data) {
        return (
            <div className={cn("app-workspace-sidebar-storage is-error", collapsed && "is-collapsed")}>
                {collapsed ? (
                    <button type="button" title={t("storageUi.capacityUnavailableRetryHint")} aria-label={t("storageUi.retryCapacityLoad")} onClick={() => void query.refetch()}>
                        <StorageGlyph />
                    </button>
                ) : (
                    <>
                        <StorageGlyph />
                        <span>{t("storageUi.capacityUnavailable")}</span>
                        <button type="button" onClick={() => void query.refetch()}>
                            {t("storageUi.retry")}
                        </button>
                    </>
                )}
            </div>
        );
    }

    return (
        <Link
            to="/assets"
            className={cn(
                "app-workspace-sidebar-storage",
                collapsed && "is-collapsed",
                meter.tone === "warn" && "is-warn",
                (meter.tone === "critical" || meter.state !== "ok") && "is-critical",
                query.data?.usedBytes ? "has-usage" : null,
                query.isPending && !query.data && "is-pending",
            )}
            title={t("storageUi.storageLinkTitle", { summary, scope: t("storageUi.storageIncludes"), state: stateMessage ? ` · ${stateMessage}` : "" })}
            aria-label={t("storageUi.accountStorageLabel", { summary })}
            aria-busy={query.isPending && !query.data}
            onFocus={() => preloadWorkspaceRoute("/assets")}
            onPointerEnter={() => preloadWorkspaceRoute("/assets")}
        >
            <StorageGlyph />
            {collapsed ? (
                track
            ) : (
                <span className="app-workspace-sidebar-storage-body">
                    <span className="app-workspace-sidebar-storage-copy">
                        <span className="app-workspace-sidebar-storage-meta">
                            <span className="app-workspace-sidebar-storage-used">{usedText}</span>
                            {totalText ? <span className="app-workspace-sidebar-storage-total">{totalText}</span> : null}
                        </span>
                    </span>
                    <span className="app-workspace-sidebar-storage-foot">
                        {track}
                        {remainingText ? <span className="app-workspace-sidebar-storage-remain">{remainingText}</span> : null}
                    </span>
                </span>
            )}
        </Link>
    );
}
