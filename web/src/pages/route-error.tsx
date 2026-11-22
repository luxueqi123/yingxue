import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { Button } from "antd";
import { Home, RefreshCw } from "lucide-react";
import { useNavigate, useRouteError } from "react-router";

import { WorkspaceSignalIcon } from "@/components/ui/aceternity/workspace-signal-icon";
import { reloadAfterChunkFailure } from "@/lib/chunk-recovery";

export default function RouteErrorPage() {
    const { t } = useInterfaceTranslation();
    const error = useRouteError();
    const navigate = useNavigate();
    const message = error instanceof Error ? error.message : t("followupUi.pageUnavailable");

    return (
        <main className="app-workspace-page grid h-dvh place-items-center px-6 text-foreground">
            <section className="w-full max-w-md text-center">
                <WorkspaceSignalIcon variant="error" size="lg" className="mx-auto" />
                <p className="text-xs font-medium text-muted-foreground">{t("followupUi.pageError")}</p>
                <h1 className="mt-3 text-2xl font-semibold">{t("followupUi.pageNotLoaded")}</h1>
                <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">{message}</p>
                <div className="mt-6 flex justify-center gap-3">
                    <Button icon={<RefreshCw className="size-4" />} onClick={reloadAfterChunkFailure}>{t("galleryRetry")}</Button>
                    <Button type="primary" icon={<Home className="size-4" />} onClick={() => navigate("/home")}>{t("workspaceHomeHint")}</Button>
                </div>
            </section>
        </main>
    );
}
