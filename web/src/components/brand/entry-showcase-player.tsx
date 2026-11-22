import { lazy, Suspense, useState } from "react";
import { entryShowcaseWorks, type EntryShowcaseWork } from "@/lib/entry-showcase";
import { FilmDetail } from "@/components/production/film-detail";
import { FilmCaseActions } from "@/components/production/film-case-actions";
import { useProductionLaunch } from "@/hooks/use-production-launch";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

const CaseProjectViewer = lazy(() => import("@/components/production/case-project-preview").then(module => ({ default: module.CaseProjectViewer })));

export function EntryShowcasePlayer({ work, onClose }: { work: EntryShowcaseWork; onClose: () => void }) {
    const [selectedId, setSelectedId] = useState(work.id);
    const [canvasOpen, setCanvasOpen] = useState(false);
    const actions = useProductionLaunch();
    const { t } = useInterfaceTranslation();
    const selected = entryShowcaseWorks.find(entry => entry.id === selectedId) || work;
    const id = `case-${selected.id}`;
    return <FilmDetail work={selected} works={entryShowcaseWorks} onSelect={id => { setSelectedId(id); setCanvasOpen(false); }} onClose={canvasOpen ? () => setCanvasOpen(false) : onClose}
        process={canvasOpen ? <Suspense fallback={<div role="status">{t("galleryOpeningProcess")}</div>}><CaseProjectViewer key={id} id={id} title={selected.title} author={selected.author} onClose={() => setCanvasOpen(false)} onCopy={() => actions.caseProject({ id })} /></Suspense> : undefined}
        actions={<FilmCaseActions key={id} caseId={id} onViewProcess={() => setCanvasOpen(true)} />} />;
}
