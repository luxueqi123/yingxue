import type { CSSProperties } from "react";

/** 填充元素占满轨道，用 transform 隐藏未完成部分；轨道必须 overflow: hidden。 */
export function progressFillStyle(percent: number, extra?: CSSProperties): CSSProperties {
    const value = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
    return { ...extra, width: "100%", transform: `translateX(${value - 100}%)` };
}
