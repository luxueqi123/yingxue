import { cn } from "@/lib/utils";
import type { ThemeAgentOrbProps, ThemeSignalArtProps } from "../types";

export function TianyaSword({ className }: { className?: string }) {
    return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M24 3 29 12 26 31 24 35 22 31 19 12Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M24 5V35M15 31Q24 27 33 31M24 35V42M21 43H27" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M13 17Q8 25 14 33M35 17Q40 25 34 33" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.2" strokeLinecap="round" />
    </svg>;
}

export function LuxueqiOrb({ size, state, className }: ThemeAgentOrbProps) {
    return <span className={cn("lxq-agent-orb", `is-${state}`, size < 40 && "is-small", className)} style={{ width: size, height: size }} aria-hidden="true">
        {size < 40 ? <TianyaSword /> : <img src="/themes/luxueqi-tianya/portrait.webp" alt="" width={281} height={265} draggable={false} />}
        <span className="lxq-agent-orb-ring" />
        {state === "done" && <svg className="lxq-agent-orb-done" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" /><path d="m4.5 8 2.3 2.4 4.8-5" /></svg>}
    </span>;
}

export function BambooSignalArt({ path, dot, error }: ThemeSignalArtProps) {
    return <>
        <circle cx="24" cy="24" r="21" className="lxq-signal-wash" />
        <path d="M9 38 14 10M10 29 7 23M12 21 18 16M35 39 33 18M34 28 40 24" className="lxq-signal-bamboo" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        <path d={path} className="lxq-signal-line" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={dot[0]} cy={dot[1]} r="2.6" className={error ? "lxq-signal-dot is-error" : "lxq-signal-dot"} />
    </>;
}

export function SwordCreditMark({ className }: { className?: string }) {
    return <span className={cn("app-workspace-credit-gift lxq-credit-mark", className)}><TianyaSword /></span>;
}

export function TianyaNotFoundEmblem() {
    return <span className="lxq-not-found-emblem"><TianyaSword /><span /></span>;
}
