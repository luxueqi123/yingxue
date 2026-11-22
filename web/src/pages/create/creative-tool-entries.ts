export const creativeToolEntries = [
    { id: "script-creation", titleKey: "scriptStudio", skillId: "pl-ec8e8394eff13b0cbca3831fbbc2a7cb", actionKey: "toolScriptAction", availableKey: "toolScriptAvailable", pendingKey: "toolScriptPending" },
    { id: "director-guide", titleKey: "directingStudio", skillId: "pl-8499bd7703530d075b790cb9de64b86d", actionKey: "toolPrevisAction", availableKey: "toolPrevisAvailable", pendingKey: "toolPrevisPending" },
    { id: "portrait-studio", titleKey: "characterStudio", skillId: "pl-2c77ed62e86c6d5c2af7772fdd830a97", actionKey: "toolCharacterAction", availableKey: "toolCharacterAvailable", pendingKey: "toolCharacterPending" },
    { id: "creative-title", titleKey: "titleStudio", skillId: null, actionKey: null, availableKey: "toolTitleAvailable", pendingKey: "toolTitlePending" },
] as const;

export function findCreativeTool(id: string | undefined) {
    return creativeToolEntries.find(item => item.id === id);
}

export function creativeToolPath(id: typeof creativeToolEntries[number]["id"]) {
    return `/create/tools/${id}`;
}
