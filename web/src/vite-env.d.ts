/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_CHANGELOG__: string;

declare module "*?admission" {
    const entries: { id: string; generationNodeCount: number }[];
    export default entries;
}

interface ImportMetaEnv {
    readonly VITE_APP_VERSION?: string;
    readonly VITE_BUILD_COMMIT?: string;
    readonly VITE_BUILD_TIME?: string;
}
