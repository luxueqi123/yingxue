import type { Plugin } from "vite";

export function resilientPreload(): Plugin {
    return {
        name: "canvas-resilient-preload",
        apply: "build",
        enforce: "post",
        transform(code, id) {
            if (id !== "\0vite/preload-helper.js") return;
            const entry = "function preload(baseModule, deps, importerUrl) {";
            const seenCheck = "if (dep in seen) return;";
            const cssLoad = 'if (isCss) return new Promise((res, rej) => {';
            const cssError = /link\.addEventListener\("error", \(\) => rej\([\s\S]*?\);\s*\}\);/;
            if ([entry, seenCheck, cssLoad].some((part) => !code.includes(part)) || !cssError.test(code)) {
                // Rolldown can inline a helper variant that does not expose the
                // browser-side preload body. Keep the native helper in that case
                // instead of making the production build fail closed.
                return;
            }
            const cssErrorReplacement = 'link.addEventListener("error", () => { delete seen[dep]; link.remove(); rej(new PageResourceError(dep, "页面样式加载失败")); });';
            return {
                code:
                    'import { PageResourceError, warmPreloadResources } from "@/lib/module-preload";\n' +
                    'const supportsNativePreload = document.createElement("link").relList?.supports?.("modulepreload");\n' +
                    code.replace(
                        entry,
                        "async function preload(baseModule, deps, importerUrl) {\n" +
                            "if (!supportsNativePreload) {\n" +
                            "try {\n" +
                            "await warmPreloadResources((deps || []).map(dep => new URL(assetsURL(dep, importerUrl), importerUrl || import.meta.url).href));\n" +
                            "} catch (error) { return handlePreloadError(error); }\n" +
                            "}\n",
                    )
                        .replace(seenCheck, "if (dep in seen) return seen[dep] === true ? undefined : seen[dep];")
                        .replace(cssLoad, "if (isCss) return (seen[dep] = new Promise((res, rej) => {")
                        .replace(cssError, `${cssErrorReplacement}\n\t\t\t}));`),
                map: null,
            };
        },
    };
}
