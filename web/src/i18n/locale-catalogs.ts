import type { InterfaceLocale } from "@/lib/interface-locale-ids";
import legacyChinese from "@/lib/locales/zh-CN";
import chineseBase from "./catalogs/zh-CN";
import { previsToolbarMessages } from "./previs-toolbar-messages";
import { nativeControlMessages } from "./native-control-messages";
import { canvasEntryActions, canvasEntryMessages } from "./canvas-entry-messages";
import { canvasControlsMessages } from "./canvas-controls-messages";
import { previsDockMessages } from "./previs-dock-messages";
import { imageUploadMessages } from "./image-upload-messages";
import { storyboardAssetsMessages } from "./storyboard-assets-messages";
import { poseLibraryMessages } from "./pose-library-messages";
import { nodeToolMessages } from "./node-tool-messages";
import { imageToolMessages } from "./image-tool-messages";
import { previsOnboardingMessages } from "./previs-onboarding-messages";
import { previsPropMessages } from "./previs-prop-messages";
import { previsShotMessages } from "./previs-shot-messages";
import { previsSaveMessages } from "./previs-save-messages";
import { creationComposerMessages } from "./creation-composer-messages";
import { imageParameterMessages } from "./image-parameter-messages";
import { storyboardStatusMessages } from "./storyboard-editor-messages";

export type LocaleCatalog = { [key: string]: string | LocaleCatalog };
const chinese: LocaleCatalog = { ...chineseBase, previsToolbar: previsToolbarMessages["zh-CN"], previsDock: previsDockMessages["zh-CN"], nativeControls: nativeControlMessages["zh-CN"], canvasEntry: { ...canvasEntryMessages["zh-CN"], ...canvasEntryActions["zh-CN"] }, canvasControls: canvasControlsMessages["zh-CN"], imageUpload: imageUploadMessages["zh-CN"], storyboardAssets: storyboardAssetsMessages["zh-CN"], poseLibrary: poseLibraryMessages["zh-CN"], nodeTools: nodeToolMessages["zh-CN"], imageTools: imageToolMessages["zh-CN"] };
const loaded = new Map<InterfaceLocale, LocaleCatalog>([["zh-CN", chinese]]);
chinese.previsGuide = previsOnboardingMessages["zh-CN"];
chinese.previsPropLabels = previsPropMessages["zh-CN"];
chinese.previsShot = previsShotMessages["zh-CN"];
chinese.previsSave = previsSaveMessages["zh-CN"];
chinese.creationComposer = creationComposerMessages["zh-CN"];
chinese.imageParameters = imageParameterMessages["zh-CN"];
chinese.storyboardStatus = storyboardStatusMessages["zh-CN"];
const pending = new Map<InterfaceLocale, Promise<LocaleCatalog>>();
const loaders: Partial<Record<InterfaceLocale, () => Promise<{ default: LocaleCatalog }>>> = {
    "en-US": () => import("./catalogs/en-US"),
    "fr-FR": () => import("./catalogs/fr-FR"),
    "de-DE": () => import("./catalogs/de-DE"),
    "ja-JP": () => import("./catalogs/ja-JP"),
    "ko-KR": () => import("./catalogs/ko-KR"),
};

function flatten(catalog: LocaleCatalog, prefix = "", result: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(catalog)) {
        const name = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") result[name] = value;
        else flatten(value, name, result);
    }
    return result;
}
const placeholders = /\{\{?(\w+)\}?\}/g;
const normalizedMessage = (text: string) => text.replace(placeholders, "{}").replace(/\s+/g, " ").trim();
const legacyByChinese = new Map<string, Array<[string, string]>>();
for (const [key, text] of Object.entries(legacyChinese)) {
    const normalized = normalizedMessage(text);
    legacyByChinese.set(normalized, [...(legacyByChinese.get(normalized) || []), [key, text]]);
}
function mapMessage(source: string, sourceTemplate: string, targetTemplate: string, doubled: boolean) {
    const from = [...source.matchAll(placeholders)].map(match => match[1]);
    const to = [...sourceTemplate.matchAll(placeholders)].map(match => match[1]);
    const target = [...targetTemplate.matchAll(placeholders)].map(match => match[1]);
    if (from.length !== to.length || JSON.stringify([...to].sort()) !== JSON.stringify(target.sort())) return undefined;
    const names = new Map(to.map((name, index) => [name, from[index]]));
    return targetTemplate.replace(placeholders, (whole, name: string) => {
        const mapped = names.get(name);
        return mapped ? doubled ? `{{${mapped}}}` : `{${mapped}}` : whole;
    });
}
function mapNativeCatalog(catalog: LocaleCatalog, legacy: Record<string, string | undefined>): LocaleCatalog {
    return Object.fromEntries(Object.entries(catalog).map(([key, value]) => {
        if (typeof value !== "string") return [key, mapNativeCatalog(value, legacy)];
        const candidates = legacyByChinese.get(normalizedMessage(value)) || [];
        const translated = candidates.flatMap(([name, original]) => {
            const target = legacy[name];
            return target ? [mapMessage(value, original, target, true)].filter((text): text is string => text !== undefined) : [];
        });
        // Reuse existing translations only when the result is unambiguous.
        return [key, translated.length && new Set(translated).size === 1 ? translated[0] : value];
    }));
}
export function getLoadedNativeLocale(locale: InterfaceLocale) { return loaded.get(locale); }
export function loadNativeLocale(locale: InterfaceLocale, legacy?: Record<string, string | undefined>): Promise<LocaleCatalog> {
    const cached = loaded.get(locale);
    if (cached) return Promise.resolve(cached);
    const request = pending.get(locale);
    if (request) return request;
    const loader = loaders[locale];
    if (!loader) {
        if (!legacy) return Promise.resolve(chinese);
        const mapped = { ...mapNativeCatalog(chinese, legacy), previsToolbar: previsToolbarMessages[locale], previsDock: previsDockMessages[locale], nativeControls: nativeControlMessages[locale], canvasEntry: { ...canvasEntryMessages[locale], ...canvasEntryActions[locale] }, canvasControls: canvasControlsMessages[locale], imageUpload: imageUploadMessages[locale], storyboardAssets: storyboardAssetsMessages[locale], poseLibrary: poseLibraryMessages[locale], nodeTools: nodeToolMessages[locale], imageTools: imageToolMessages[locale] };
        Object.assign(mapped, { previsGuide: previsOnboardingMessages[locale] });
        Object.assign(mapped, { previsPropLabels: previsPropMessages[locale] });
        Object.assign(mapped, { previsShot: previsShotMessages[locale] });
        Object.assign(mapped, { previsSave: previsSaveMessages[locale] });
        Object.assign(mapped, { creationComposer: creationComposerMessages[locale] });
        Object.assign(mapped, { imageParameters: imageParameterMessages[locale] });
        Object.assign(mapped, { storyboardStatus: storyboardStatusMessages[locale] });
        loaded.set(locale, mapped);
        return Promise.resolve(mapped);
    }
    const next = loader().then(module => {
        const catalog = { ...module.default, previsToolbar: previsToolbarMessages[locale], previsDock: previsDockMessages[locale], nativeControls: nativeControlMessages[locale], canvasEntry: { ...canvasEntryMessages[locale], ...canvasEntryActions[locale] }, canvasControls: canvasControlsMessages[locale], imageUpload: imageUploadMessages[locale], storyboardAssets: storyboardAssetsMessages[locale], poseLibrary: poseLibraryMessages[locale], nodeTools: nodeToolMessages[locale], imageTools: imageToolMessages[locale] };
        Object.assign(catalog, { previsGuide: previsOnboardingMessages[locale] });
        Object.assign(catalog, { previsPropLabels: previsPropMessages[locale] });
        Object.assign(catalog, { previsShot: previsShotMessages[locale] });
        Object.assign(catalog, { previsSave: previsSaveMessages[locale] });
        Object.assign(catalog, { creationComposer: creationComposerMessages[locale] });
        Object.assign(catalog, { imageParameters: imageParameterMessages[locale] });
        Object.assign(catalog, { storyboardStatus: storyboardStatusMessages[locale] });
        loaded.set(locale, catalog);
        return catalog;
    }, error => { pending.delete(locale); throw error; });
    pending.set(locale, next);
    return next;
}
export function nativeLocaleMessage(locale: InterfaceLocale, key: string): string | undefined {
    const read = (catalog: LocaleCatalog | undefined) => catalog?.[key] ?? key.split(".").reduce<string | LocaleCatalog | undefined>((node, name) => node && typeof node !== "string" ? node[name] : undefined, catalog);
    const value = read(loaded.get(locale)) ?? read(chinese);
    return typeof value === "string" ? value : undefined;
}
export function legacyMessagesFromNative(catalog: LocaleCatalog, english?: { legacy: Record<string, string>; native: LocaleCatalog }): Record<string, string> {
    const nativeChinese = flatten(chinese);
    const nativeTarget = flatten(catalog);
    const byChinese = new Map<string, Array<[string, string]>>();
    for (const [key, text] of Object.entries(nativeChinese)) {
        const normalized = normalizedMessage(text);
        byChinese.set(normalized, [...(byChinese.get(normalized) || []), [key, text]]);
    }
    const byEnglish = new Map<string, Array<[string, string]>>();
    for (const [key, text] of Object.entries(english ? flatten(english.native) : {})) {
        const normalized = normalizedMessage(text);
        byEnglish.set(normalized, [...(byEnglish.get(normalized) || []), [key, text]]);
    }
    return Object.fromEntries(Object.entries(legacyChinese).flatMap<[string, string]>(([key, source]) => {
        const direct = nativeTarget[key];
        if (direct) {
            const mapped = mapMessage(source, source, direct, false);
            if (mapped !== undefined) return [[key, mapped]];
        }
        let options = (byChinese.get(normalizedMessage(source)) || []).flatMap(([name, original]) => nativeTarget[name] ? [mapMessage(source, original, nativeTarget[name], false)].filter((value): value is string => value !== undefined) : []);
        const englishSource = english?.legacy[key];
        // Reuse the native copy when its English wording still matches; never guess
        // between distinct translations or accept a changed interpolation contract.
        if (!options.length && englishSource && mapMessage(source, source, englishSource, false) !== undefined) {
            options = (byEnglish.get(normalizedMessage(englishSource)) || []).flatMap(([name, original]) => nativeTarget[name] ? [mapMessage(englishSource, original, nativeTarget[name], false)].filter((value): value is string => value !== undefined) : []);
        }
        return options.length && new Set(options).size === 1 ? [[key, options[0]]] : [];
    }));
}
