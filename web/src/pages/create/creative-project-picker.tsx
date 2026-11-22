import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import { Link } from "react-router";
import { listProjects } from "@/services/api/projects";
import { useUserStore } from "@/stores/use-user-store";
import { creativeProjectTarget } from "./creative-project-target";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export default function CreativeProjectPicker({ featureId }: { featureId: string }) {
    const { t } = useInterfaceTranslation();
    const userId = useUserStore(state => state.user?.id);
    const enabled = useUserStore(state => state.features.shortDramaEnabled);
    const [page, setPage] = useState(1);
    const query = useQuery({
        queryKey: ["creative-tool-projects", userId, page],
        queryFn: () => listProjects({ page, pageSize: 8 }),
        enabled: Boolean(userId) && enabled,
    });
    if (!enabled) return <p role="status">{t("toolProjectsDisabled")}</p>;
    if (!userId) return null;
    return <section className="creative-project-picker" aria-label={t("toolProjectPicker")}>
        <header><h2>{t("toolContinueProject")}</h2><Link to="/projects/legacy?create=1">{t("toolNewProject")}</Link></header>
        {query.isPending ? <p role="status">{t("toolProjectsLoading")}</p> : query.isError ? <div role="alert"><p>{t("toolProjectsError")}</p><Button onClick={() => void query.refetch()}>{t("toolProjectsRetry")}</Button></div> : <>
            {query.data?.projects.length === 0 && <p role="status">{t("toolProjectsEmpty")}</p>}
            <ul>{query.data?.projects.map(({ project, unitCount, assetCount }) => {
                const target = creativeProjectTarget(featureId, project.id);
                return target && <li key={project.id}><Link to={target.path}><strong>{project.name}</strong><span>{t("toolProjectCounts", { units: unitCount, assets: assetCount })}</span><span>{t(target.labelKey)} →</span></Link></li>;
            })}</ul>
            <nav aria-label={t("toolProjectPages")}><Button disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t("galleryPrevious")}</Button><span>{t("toolProjectPage", { page })}</span><Button disabled={!query.data?.hasMore} onClick={() => setPage(value => value + 1)}>{t("galleryNext")}</Button></nav>
        </>}
    </section>;
}
