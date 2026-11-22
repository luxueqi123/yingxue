import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

export function compactCaseSupportModule(source: string, admissionOnly = false): { code: string; map: { version: 3; names: string[]; sources: string[]; mappings: string } } {
    const text = source.replace(/^\uFEFF/, "");
    const data = JSON.parse(text);
    // Strip only JSON whitespace. Re-serializing values would change -0 and large numeric tokens.
    const compact = admissionOnly
        ? JSON.stringify(data.map(({ id, generationNodeCount }: { id: string; generationNodeCount: number }) => ({ id, generationNodeCount })))
        : text.replace(/("(?:\\.|[^"\\])*")|\s+/g, (_match, quoted: string | undefined) => quoted ?? "");
    return {
        code: `export default JSON.parse(${JSON.stringify(compact)});`,
        map: { version: 3, names: [], sources: [], mappings: "" },
    };
}

export function caseSupportDataPlugin(webDirectory: string): Plugin {
    const target = resolve(webDirectory, "src/lib/production-case-support.json");
    const canonical = target.replaceAll("\\", "/");
    const virtualId = "\0yingxue-case-support-data";
    const admissionId = "\0yingxue-case-admission-data";
    return {
        name: "yingxue-case-support-data",
        enforce: "pre",
        resolveId(source, importer) {
            const [pathname, query = ""] = source.split("?", 2);
            const params = new URLSearchParams(query);
            if ([...params.keys()].some(key => !["import", "t", "v", "admission"].includes(key))) return null;
            const candidate = pathname === "/src/lib/production-case-support.json" ? target
                : pathname.startsWith(".") && importer ? resolve(dirname(importer.split("?", 1)[0]), pathname) : pathname;
            return candidate.replaceAll("\\", "/") === canonical ? params.has("admission") ? admissionId : virtualId : null;
        },
        async load(id) {
            const moduleId = id.split("?", 1)[0];
            if (moduleId !== virtualId && moduleId !== admissionId) return null;
            this.addWatchFile(target);
            return compactCaseSupportModule(await readFile(target, "utf8"), moduleId === admissionId);
        },
        handleHotUpdate(context) {
            if (resolve(context.file).replaceAll("\\", "/") !== canonical) return;
            // The watched JSON is loaded through a virtual ID, so Vite's file
            // module lookup does not invalidate the delivered registry itself.
            const modules = [virtualId, admissionId].flatMap(id => {
                const module = context.server.moduleGraph.getModuleById(id);
                if (!module) return [];
                context.server.moduleGraph.invalidateModule(module);
                return [module];
            });
            return [...new Set([...context.modules, ...modules])];
        },
    };
}
