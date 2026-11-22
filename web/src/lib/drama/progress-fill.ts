import type { CSSProperties } from "react";

export function progressFillStyle(percent: number, extra?: CSSProperties): CSSProperties {
    const value = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
    return { ...extra, width: "100%", transform: `translateX(${value - 100}%)` };
}
