import { lazy, Suspense, useState } from "react";
import { App, Button } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { copyCommunityWork, getWorkProject, type CommunityWork } from "@/services/api/community-works";
import { FilmDetail } from "./film-detail";
import { FilmCaseActions } from "./film-case-actions";
import { useUserStore } from "@/stores/use-user-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

const CaseProjectPreview = lazy(() => import("./case-project-preview").then((module) => ({ default: module.CaseProjectPreview })));

export function CommunityWorkPreview({ work, onClose, privatePreview = false }: { work: CommunityWork; onClose: () => void; privatePreview?: boolean }) {
    const { t } = useTranslation();
    const { t: interfaceT } = useInterfaceTranslation();
    const { message } = App.useApp();
    const userId = useUserStore((state) => state.user?.id);
    const location = useLocation();
    const navigate = useNavigate();
    const client = useQueryClient();
    const [process, setProcess] = useState(false);
    const [copying, setCopying] = useState(false);
    const project = useQuery({
        queryKey: ["community-work-project", work.id, privatePreview ? userId : "public", work.updatedAt],
        queryFn: ({ signal }) => getWorkProject(work.id, privatePreview, signal),
        enabled: process && work.hasProject,
        staleTime: 0,
    });
    const copy = async () => {
        if (!userId) {
            navigate(`/login?next=${encodeURIComponent(`/?case=${work.id}`)}`);
            return;
        }
        setCopying(true);
        try {
            const copied = await copyCommunityWork(work.id);
            if (useUserStore.getState().user?.id !== userId) throw new Error(t("communityWorks.changedAccount"));
            await client.invalidateQueries({ queryKey: ["canvas-projects"] });
            navigate(`/canvas/${encodeURIComponent(copied.project.id)}`, { state: { returnTo: location.pathname + location.search, returnState: location.state } });
        } catch (error) {
            void message.error(error instanceof Error ? error.message : t("communityWorks.failed"));
        } finally {
            setCopying(false);
        }
    };
    const processView = project.data ? (
        <Suspense fallback={null}>
            <CaseProjectPreview project={project.data.project} author={work.author} onClose={() => setProcess(false)} onCopy={!privatePreview ? copy : undefined} copying={copying} />
        </Suspense>
    ) : (
        <section className="case-project-preview case-project-preview-loading">
            <header className="case-project-preview-header">
                <strong>{work.title}</strong>
                <Button onClick={() => setProcess(false)}>{t("communityWorks.back")}</Button>
            </header>
            <div role={project.isError ? "alert" : "status"}>
                {project.isError ? (
                    <>
                        {project.error.message}
                        <Button onClick={() => void project.refetch()}>{t("communityWorks.retry")}</Button>
                    </>
                ) : (
                    t("communityWorks.loading")
                )}
            </div>
        </section>
    );
    return (
        <FilmDetail
            work={{ id: work.id, title: work.title, author: work.author, description: work.description, src: work.kind === "video" ? work.mediaUrl : undefined, poster: work.kind === "image" ? work.mediaUrl : work.coverUrl }}
            works={[]}
            onSelect={() => {}}
            onClose={process ? () => setProcess(false) : onClose}
            process={process ? processView : undefined}
            actions={
                privatePreview ? (
                    work.hasProject ? (
                        <button type="button" className="film-case-action" onClick={() => setProcess(true)}>
                            {interfaceT("galleryOpenCanvas")}
                        </button>
                    ) : undefined
                ) : (
                    <FilmCaseActions caseId={work.id} onViewProcess={work.hasProject ? () => setProcess(true) : undefined} />
                )
            }
        />
    );
}
