import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { useProductionLaunch } from "@/hooks/use-production-launch";
import { loadProductionCatalog } from "@/services/production-library";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { InspirationGallery } from "./inspiration-gallery";

export function FeaturedCreations() {
    const { t } = useInterfaceTranslation();
    const actions = useProductionLaunch();
    const catalog = useQuery({ queryKey: ["production-library"], queryFn: ({ signal }) => loadProductionCatalog(false, signal), staleTime: Infinity });
    return <section className="featured-creations" aria-label={t("galleryTitle")}>
        <header><h2>{t("galleryTitle")}</h2><Link to="/studio?tab=cases">{t("galleryBrowse")}<ChevronRight size={16} /></Link></header>
        <InspirationGallery items={catalog.data?.items || []} loading={catalog.isPending} error={catalog.error} mediaWarning={catalog.data?.mediaWarning} onRetry={() => void catalog.refetch()} compact onUseCase={actions.caseProject} />
    </section>;
}
