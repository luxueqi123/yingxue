import type { CanvasFolderTheme } from "@/types/canvas";
import type { InterfaceMessageKey } from "@/lib/interface-locale";

export const CANVAS_FOLDER_THEME_OPTIONS: ReadonlyArray<{
    key: CanvasFolderTheme;
    label: string;
    labelKey: InterfaceMessageKey;
    cover: string;
}> = [
    { key: "aurora", label: "赤蓝流光", labelKey: "canvasCompleteUi.auroraFolder", cover: "/images/canvas/folder-default-cover.png" },
    { key: "obsidian", label: "曜石银蓝", labelKey: "canvasCompleteUi.obsidianFolder", cover: "/images/canvas/folder-theme-obsidian.png" },
    { key: "ember", label: "熔金赤焰", labelKey: "canvasCompleteUi.emberFolder", cover: "/images/canvas/folder-theme-ember.png" },
    { key: "pearl", label: "珍珠薄雾", labelKey: "canvasCompleteUi.pearlFolder", cover: "/images/canvas/folder-theme-pearl.png" },
];

export function resolveCanvasFolderTheme(value?: string): CanvasFolderTheme {
    return CANVAS_FOLDER_THEME_OPTIONS.some((theme) => theme.key === value) ? (value as CanvasFolderTheme) : "aurora";
}

export function resolveCanvasFolderThemeCover(theme?: string, customCover?: string) {
    const custom = customCover?.trim();
    if (custom) return custom;
    const resolved = resolveCanvasFolderTheme(theme);
    return CANVAS_FOLDER_THEME_OPTIONS.find((item) => item.key === resolved)!.cover;
}
