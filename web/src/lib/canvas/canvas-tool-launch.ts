export const canvasToolLabels = {
    director: "3D 导演台",
    batch: "分镜批处理",
    conversion: "图像预处理",
} as const;

export type CanvasToolLaunch = keyof typeof canvasToolLabels;

export function readCanvasToolLaunch(params: URLSearchParams): CanvasToolLaunch | null {
    const values = params.getAll("tool");
    const value = values[0];
    return values.length === 1 && Object.hasOwn(canvasToolLabels, value) ? value as CanvasToolLaunch : null;
}

export function canvasToolLaunchPath(tool: CanvasToolLaunch): string {
    return `/canvas?tool=${tool}`;
}
