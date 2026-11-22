import type { AnyPluginManifest as PluginManifest } from "@/lib/plugins/plugin-types";
import { interfaceTranslator, type InterfaceMessageKey, type InterfaceTranslate } from "@/lib/interface-locale";
import { currentLocale } from "@/i18n";

const permissionLabels: Record<string, InterfaceMessageKey> = {
    "canvas.read": "pluginUi.permissionCanvasRead",
    "canvas.write": "pluginUi.permissionCanvasWrite",
    "asset.read": "pluginUi.permissionAssetRead",
    "asset.search": "pluginUi.permissionAssetSearch",
    "asset.import": "pluginUi.permissionAssetImport",
    "asset.upload": "pluginUi.permissionAssetUpload",
    "generation.run": "pluginUi.permissionGenerationRun",
    "ai.text": "pluginUi.permissionAiText",
    "external.open": "pluginUi.permissionExternalOpen",
};

export function pluginPermissionLabel(permission: string) {
    return permissionLabels[permission] ? interfaceTranslator(currentLocale())(permissionLabels[permission]) : permission;
}

export function getPluginDocumentation(manifest: PluginManifest, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    if (manifest.documentation?.trim()) return manifest.documentation.trim();

    const capabilities = manifest.permissions.map((permission) => (permissionLabels[permission] ? t(permissionLabels[permission]) : permission));
    const notDeclared = t("pluginUi.notDeclared");
    return [
        `# ${manifest.name}`,
        "",
        manifest.description || t("pluginUi.docNoDescription"),
        "",
        `## ${t("pluginUi.docHeading")}`,
        "",
        `- ${t("pluginUi.docAuthor")}: ${manifest.author || notDeclared}`,
        `- ${t("pluginUi.docVersion")}: ${manifest.version}`,
        `- ${t("pluginUi.docCapabilities")}: ${capabilities.join(", ") || notDeclared}`,
        "",
        manifest.contributes.providers?.length ? `> ${t("pluginUi.docNoApiDocs")}` : `> ${t("pluginUi.docNoUsageDocs")}`,
    ].join("\n");
}
