import { useEffect, useId, useRef } from "react";
import { Plus } from "lucide-react";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

// Ported from LTV 17ajyuf1oeuyk.js (eL / eP / eR / eM). The matching
// CSS modules retain their original names, geometry, timing and masks.
const dots = (name: string) => `CreateCanvasDotGrid-module__kaFbVq__${name}`;
const links = (name: string) => `CreateCanvasNodeLinks-module__wdS5GW__${name}`;
const flowPath = "M-56 0L0 0C34.472 0 52.167 16.6919 69.83 33.3837C87.493 50.0756 105.1245 66.7677 139.47 66.7677L175 66.7677";

function NativeDotGrid() {
    const root = useRef<HTMLDivElement>(null);
    const spotlight = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const grid = root.current;
        const light = spotlight.current;
        const parent = grid?.parentElement;
        if (!grid || !light || !parent) return;
        let frame = 0;
        let x = 0;
        let y = 0;
        let active = false;
        const paint = () => {
            frame = 0;
            if (active) {
                light.style.setProperty("--mx", `${x}px`);
                light.style.setProperty("--my", `${y}px`);
            }
        };
        const move = (event: MouseEvent) => {
            const bounds = grid.getBoundingClientRect();
            x = event.clientX - bounds.left;
            y = event.clientY - bounds.top;
            if (!active) { active = true; grid.dataset.hover = "true"; }
            if (!frame) frame = requestAnimationFrame(paint);
        };
        const leave = () => {
            active = false;
            grid.dataset.hover = "false";
            if (frame) { cancelAnimationFrame(frame); frame = 0; }
        };
        parent.addEventListener("mousemove", move);
        parent.addEventListener("mouseleave", leave);
        return () => {
            parent.removeEventListener("mousemove", move);
            parent.removeEventListener("mouseleave", leave);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);
    return <div ref={root} className={dots("root")} aria-hidden="true" data-hover="false">
        <span className={dots("base")} />
        <span className={dots("ripple")} />
        <span className={`${dots("ripple")} ${dots("rippleDelay2")}`} />
        <span ref={spotlight} className={dots("spotlight")} />
    </div>;
}

function NativeFlow({ lower = false }: { lower?: boolean }) {
    const id = useId().replace(/:/g, "");
    const mask = `${id}-flow-mask`;
    const blur = `${id}-flow-blur`;
    return <svg className={`${links("link")} ${links(lower ? "linkLower" : "linkUpper")}`} viewBox="0 0 139.47 66.7677" fill="none" aria-hidden="true">
        <defs>
            <filter id={blur} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="4" /></filter>
            <mask id={mask} className={links("flowMask")}>
                <path className={links("flowMaskPath")} pathLength={1} d={flowPath} filter={`url(#${blur})`} />
                <path className={`${links("flowMaskPath")} ${links("flowMaskPathDelay2")}`} pathLength={1} d={flowPath} filter={`url(#${blur})`} />
            </mask>
        </defs>
        <path className={links("linkBase")} d={flowPath} />
        <path className={links("linkFlow")} d={flowPath} mask={`url(#${mask})`} />
    </svg>;
}

function NativeNodes({ right = false }: { right?: boolean }) {
    return <span className={`${links("group")} ${links(right ? "groupRight" : "groupLeft")}`} aria-hidden="true">
        <span className={`${links("node")} ${links("nodeUpper")}`} />
        <span className={`${links("node")} ${links("nodeLower")}`} />
        <NativeFlow /><NativeFlow lower />
        <span className={links("dot")} />
    </span>;
}

export function NativeCanvasEntry({ disabled, onCreate }: { disabled: boolean; onCreate: () => void }) {
    const { t } = useInterfaceTranslation();
    return <button className="ltv-new-canvas" type="button" disabled={disabled} onClick={onCreate}>
        <NativeDotGrid />
        <span className="ltv-canvas-light" aria-hidden="true" />
        <span className="ltv-canvas-label">
            <span className={links("stage")}>
                <NativeNodes /><span className={links("center")}><span className="ltv-canvas-add"><Plus size={20.125} strokeWidth={1.75} /></span></span><NativeNodes right />
            </span>
            <span>{t("canvasLibraryNew")}</span>
        </span>
    </button>;
}
