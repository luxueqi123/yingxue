function record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Source 0zme995kos_wy.js normalizes enhancement aliases before its request is sent. */
export function normalizeLtvVideoEnhancementFields(fields: Record<string, unknown>): Record<string, unknown> {
    if (fields.model !== 'topaz-video-upscaler') return fields;
    const result = { ...fields };
    if (result.fps == null && result.frameRate != null) result.fps = result.frameRate;
    if (result.fps == null && result.frame_rate != null) result.fps = result.frame_rate;
    delete result.frameRate;
    delete result.frame_rate;
    if (result.specifiedModel === 'apf-2') result.specifiedModel = 'apo-8';
    return result;
}

/** Image retry dispatch in source 0wllgknwomk2u.js uses the saved request envelope. */
export function resolveLtvSourceModel(nodeValue: unknown) {
    const node = record(nodeValue), data = record(node.data), retry = record(data._retryMeta);
    if (node.type === "image" && data.action === "image_generate" && (retry.taskType === undefined || retry.taskType === "image")
        && typeof retry.model === "string" && retry.model.trim()) return retry.model.trim();
    const model = readLtvParameterLayers(data.params).fields.model;
    return typeof model === "string" ? model : "";
}

/** Saved switches may be JSON booleans, numeric flags or serialized form values. */
export function readLtvSwitch(value: unknown): boolean {
    if (value === undefined || value === false || value === 0 || value === '0' || value === 'off' || value === 'false') return false;
    if (value === true || value === 1 || value === '1' || value === 'on' || value === 'true') return true;
    throw new Error('原开关参数不是有效的开关值');
}

function publicFields(value: unknown) {
    return Object.fromEntries(Object.entries(record(value)).filter(([key]) => !key.startsWith("_")));
}

/** Source 0zme995kos_wy.js merges base/settings/advanced before schema-specific filtering. */
export function readLtvParameterLayers(value: unknown) {
    const params = record(value);
    const { settings, advancedSettings, textList, ...base } = params;
    const fields = { ...base, ...publicFields(settings), ...publicFields(advancedSettings) };
    // Source normalizeTextContentField preserves string array order and empty array entries.
    const texts = Array.isArray(textList) ? textList.flatMap(item => {
        const content = record(item).content;
        return typeof content === "string" ? content.length ? [content] : [] : Array.isArray(content) ? content.filter((part): part is string => typeof part === "string") : [];
    }) : [];
    return { fields, texts, advancedKeys: Object.keys(publicFields(advancedSettings)) };
}

/** Matches stripFlatParamsDisallowedBySchema in source 1di1-3y--egfx.js.
 * Only fields declared in another mode are removed. Unknown fields stay visible to the audit.
 */
export function projectLtvSubmittedFields(value: unknown, schemaValue: unknown, modality: string) {
    const layers = readLtvParameterLayers(value);
    const fields = { ...layers.fields };
    const schema = record(schemaValue), config = record(schema.config), properties = record(schema.properties);
    const removedFields: string[] = [];
    const params = record(value), settings = record(params.settings), advanced = record(params.advancedSettings);
    const removeBaseField = (key: string) => {
        if (Object.hasOwn(settings, key) || Object.hasOwn(advanced, key) || !Object.hasOwn(fields, key)) return;
        delete fields[key];
        removedFields.push(key);
    };
    // Source 0zme995kos_wy.js destructures the selector; effects exist only with selected models.
    // Retain nonempty/malformed selections for adaptation, never replace a LoRA with its preview.
    if (params.fineTuneModels === undefined || (Array.isArray(params.fineTuneModels) && params.fineTuneModels.length === 0)) {
        removeBaseField('fineTuneType');
        removeBaseField('fineTuneModels');
    }
    // The source drops stale base shot prompts before merging settings and advanced settings.
    if (settings.multi_shot !== true) removeBaseField('multi_prompt');
    if (modality !== "video" && modality !== "audio") return { ...layers, fields, removedFields };
    const flatten = (value: unknown): string[] => {
        if (!Array.isArray(value)) return [];
        return value.flatMap(item => typeof item === "string" ? [item] : Array.isArray(record(item).fields) ? (record(item).fields as unknown[]).filter((key): key is string => typeof key === "string") : []);
    };
    const storeKeys = (keys: string[]) => keys.flatMap(key => {
        if (!properties[key]) return [];
        const original = record(properties[key]).originalField;
        return [typeof original === "string" ? original : key];
    });
    for (const section of [config.settings, config.advancedSettings]) {
        if (!section) continue;
        const modes = record(section);
        const all = Array.isArray(section) ? flatten(section) : Object.values(modes).flatMap(flatten);
        const selected = Array.isArray(section) ? flatten(section) : flatten(fields.modeType === undefined ? Object.values(modes).find(Array.isArray) ?? [] : modes[String(fields.modeType)] ?? modes.text2video ?? []);
        const allowed = new Set(storeKeys(selected));
        for (const key of new Set(storeKeys(all))) {
            if (!allowed.has(key) && Object.hasOwn(fields, key)) {
                delete fields[key];
                removedFields.push(key);
            }
        }
    }
    return { ...layers, fields, advancedKeys: layers.advancedKeys.filter(key => Object.hasOwn(fields, key)), removedFields };
}
