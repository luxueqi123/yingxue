import type { ThemeCanvasPatch, ThemePack } from "../types";

export const LUXUEQI_CANVAS_THEMES: Record<"light" | "dark", ThemeCanvasPatch> = {
    light: {
        connection: { stroke: "#8eafc9", beam: "#286b93" },
        canvas: { background: "#f1f6fb", dot: "rgba(45,87,120,.32)", line: "rgba(45,87,120,.24)", selectionFill: "rgba(40,107,147,.1)" },
        node: { label: "#536d83", agentUserMessage: "#e1eff9", fill: "#fbfdff", panel: "#fbfdff", stroke: "#ccdce9", edge: "rgba(45,87,120,.18)", shadow: "0 6px 18px rgba(25,52,75,.07)", hoverShadow: "0 10px 26px rgba(25,52,75,.12)", activeStroke: "#286b93", placeholder: "#71899d", text: "#19344b", muted: "#536d83", faint: "#71899d" },
        frame: { fill: "rgba(40,107,147,.025)", stroke: "rgba(45,87,120,.23)", activeFill: "rgba(40,107,147,.07)", activeStroke: "#286b93", preview: "rgba(251,253,255,.94)" },
        toolbar: { panel: "rgba(251,253,255,.96)", border: "rgba(45,87,120,.17)", item: "#375b77", itemHover: "#eaf3fb", activeBg: "#dbeafa", activeText: "#183c59" },
        spatial: { surface: "rgba(251,253,255,.94)", elevated: "rgba(255,255,255,.98)", dropzone: "rgba(241,246,251,.9)", glow: "rgba(40,107,147,.16)", glowStrong: "rgba(40,107,147,.35)", shadow: "rgba(25,52,75,.16)" },
        timeline: { trackFill: "#eaf1f8", trackBorder: "#ccdce9", clipVideo: "rgba(65,125,168,.16)", clipAudio: "rgba(48,120,95,.16)", clipSubtitle: "rgba(150,101,28,.15)", clipSelectedBorder: "#286b93", playhead: "#286b93", rulerLabel: "#536d83" },
        accent: { primary: "#235d85", primarySoft: "rgba(40,107,147,.1)", onPrimary: "#f9fcff", danger: "#b03d50" },
    },
    dark: {
        connection: { stroke: "#547b9a", beam: "#acd8f3" },
        canvas: { background: "#0b1522", dot: "rgba(173,213,243,.23)", line: "rgba(173,213,243,.18)", selectionFill: "rgba(154,205,239,.13)" },
        node: { label: "#abc1d5", agentUserMessage: "#203c56", fill: "#132337", panel: "#132337", stroke: "#2d4660", edge: "rgba(173,213,243,.19)", shadow: "0 6px 18px rgba(0,0,0,.2)", hoverShadow: "0 10px 26px rgba(0,0,0,.3)", activeStroke: "#acd8f3", placeholder: "#93b0c6", text: "#eff7ff", muted: "#abc1d5", faint: "#93b0c6" },
        frame: { fill: "rgba(154,205,239,.025)", stroke: "rgba(173,213,243,.23)", activeFill: "rgba(154,205,239,.08)", activeStroke: "#acd8f3", preview: "rgba(19,35,55,.96)" },
        toolbar: { panel: "rgba(19,35,55,.97)", border: "#2d4660", item: "#c4dbea", itemHover: "#20394f", activeBg: "#28475f", activeText: "#f3f9ff" },
        spatial: { surface: "rgba(19,35,55,.95)", elevated: "rgba(25,45,68,.98)", dropzone: "rgba(11,21,34,.94)", glow: "rgba(154,205,239,.14)", glowStrong: "rgba(154,205,239,.32)", shadow: "rgba(0,0,0,.35)" },
        timeline: { trackFill: "#14263a", trackBorder: "#2d4660", clipVideo: "rgba(154,205,239,.19)", clipAudio: "rgba(138,205,175,.18)", clipSubtitle: "rgba(233,193,132,.18)", clipSelectedBorder: "#acd8f3", playhead: "#acd8f3", rulerLabel: "#abc1d5" },
        accent: { primary: "#acd8f3", primarySoft: "rgba(154,205,239,.12)", onPrimary: "#122b40", danger: "#f29aab" },
    },
};

export const LUXUEQI_CANVAS_PRESETS = {
    light: { label: "月白", values: { baseTheme: "light", backgroundColor: "#F1F6FB", backgroundBrightness: 0, gridColor: "#2D5778", gridOpacity: 20 } },
    dark: { label: "竹夜", values: { baseTheme: "dark", backgroundColor: "#0B1522", backgroundBrightness: 0, gridColor: "#ADD5F3", gridOpacity: 18 } },
} satisfies NonNullable<NonNullable<ThemePack["canvas"]>["presets"]>;
