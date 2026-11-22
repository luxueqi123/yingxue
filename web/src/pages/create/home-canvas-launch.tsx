import { ArrowUpRight, Plus } from "lucide-react";
import { Link } from "react-router";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function HomeCanvasLaunch() {
    const { t } = useInterfaceTranslation();
    return <Link to="/canvas" className="home-canvas-launch" aria-label={t("openCanvas")}>
        <span className="home-canvas-dots" aria-hidden="true"><span /><span /></span>
        <span className="home-canvas-launch-heading"><span>{t("infiniteCanvas")}</span><ArrowUpRight size={18} /></span>
        <span className="home-canvas-launch-content">
        <span className="home-canvas-launch-art" aria-hidden="true">
            <svg viewBox="0 0 480 100" fill="none">
                <g className="canvas-preview-wires"><path d="M35 20H100C152 20 143 50 202 50M35 80H100C152 80 143 50 202 50M278 50C337 50 328 20 380 20H445M278 50C337 50 328 80 380 80H445" /></g>
                <g className="canvas-preview-flow"><path pathLength="100" d="M35 20H100C152 20 143 50 202 50" /><path pathLength="100" d="M35 80H100C152 80 143 50 202 50" /><path pathLength="100" d="M278 50C337 50 328 20 380 20H445" /><path pathLength="100" d="M278 50C337 50 328 80 380 80H445" /></g>
                <g className="canvas-preview-ports"><rect x="12" y="8" width="46" height="24" rx="6" /><rect x="12" y="68" width="46" height="24" rx="6" /><rect x="422" y="8" width="46" height="24" rx="6" /><rect x="422" y="68" width="46" height="24" rx="6" /></g>
            </svg>
            <span className="home-canvas-launch-plus"><Plus size={34} strokeWidth={1.5} /></span>
        </span>
        <span className="home-canvas-launch-copy"><strong>{t("canvasHeadline")}</strong><span>{t("canvasDescription")}</span></span>
        <span className="home-canvas-launch-action">{t("enterCanvas")}<ArrowUpRight size={14} /></span>
        </span>
    </Link>;
}
