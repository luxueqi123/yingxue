import { lazy, Suspense } from "react";
import { Link, useParams } from "react-router";
import { findCreativeTool } from "./creative-tool-entries";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useUserStore } from "@/stores/use-user-store";
import "./creative-tools.css";

const CreativeProductionStudio = lazy(() => import("./creative-production-studio"));
const CreativeCharacterStudio = lazy(() => import("./creative-character-studio"));
const CreativeTitleEditor = lazy(() => import("./creative-title-editor"));

export default function CreativeToolPage() {
    const { t } = useInterfaceTranslation();
    const { featureId } = useParams();
    const owner = useUserStore(state => state.user?.id || "guest");
    const entry = findCreativeTool(featureId);
    if (!entry) return <section className="creative-tool-detail"><h1>{t("toolNotFound")}</h1><Link to="/home">{t("toolBack")}</Link></section>;
    return <section className="creative-tool-detail">
        <Link to="/home">{t("toolBack")}</Link>
        <h1>{t(entry.titleKey)}</h1>
        <Suspense fallback={null}>
            {entry.id === "portrait-studio" ? <CreativeCharacterStudio key={owner} /> : <CreativeProductionStudio key={`${entry.id}:${owner}`} tool={entry.id} />}
        </Suspense>
        {entry.id === "creative-title" && <details className="studio-local-title"><summary>{t("titleHeading")}</summary><Suspense fallback={<p role="status">{t("toolTitleLoading")}</p>}><CreativeTitleEditor /></Suspense></details>}
    </section>;
}
