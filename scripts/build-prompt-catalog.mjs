import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const [sourceDirArg, outputPathArg] = process.argv.slice(2);
const sourceDir = sourceDirArg || process.env.PROMPT_SOURCE_DIR;
const outputPath = path.resolve(outputPathArg || "backend/internal/service/seed/prompts.json");

if (!sourceDir) {
    console.error("用法: node scripts/build-prompt-catalog.mjs <ai-image-prompts-skill/references> [output.json]");
    process.exit(2);
}

const resolvedSourceDir = path.resolve(sourceDir);
const manifest = JSON.parse(await readFile(path.join(resolvedSourceDir, "manifest.json"), "utf8"));
const existing = JSON.parse(await readFile(outputPath, "utf8"));
const custom = existing.filter((item) => String(item.id || "").startsWith("yingxue-prompt-"));

const categoryMap = {
    "profile-avatar": "portrait",
    "social-media-post": "cinematic",
    "infographic-edu-visual": "others",
    "youtube-thumbnail": "storyboard",
    "comic-storyboard": "storyboard",
    "product-marketing": "product",
    "ecommerce-main-image": "product",
    "game-asset": "anime",
    "poster-flyer": "cinematic",
    "app-web-design": "others",
    others: "others",
};

const categoryLabels = {
    cinematic: "电影感",
    portrait: "人物肖像",
    landscape: "风光场景",
    product: "产品商业",
    anime: "动漫插画",
    storyboard: "分镜叙事",
    others: "其他",
};

const sourceCategoryLabels = {
    "profile-avatar": "头像",
    "social-media-post": "社交媒体",
    "infographic-edu-visual": "信息图",
    "youtube-thumbnail": "视频封面",
    "comic-storyboard": "漫画分镜",
    "product-marketing": "产品营销",
    "ecommerce-main-image": "电商主图",
    "game-asset": "游戏素材",
    "poster-flyer": "海报传单",
    "app-web-design": "应用网页",
    others: "未分类素材",
};

// The category cover is only a resilient fallback. The UI must display each
// record's referenceImageUrl first so the catalogue does not collapse into
// one repeated cover per category when it is rebuilt.
const fallbackCoverByCategory = {
    cinematic: "/short-drama-styles/cyberpunk-neon.jpg",
    portrait: "/short-drama-styles/period-live-action.jpg",
    landscape: "/short-drama-styles/nature-healing.jpg",
    product: "/short-drama-styles/real-life.jpg",
    anime: "/short-drama-styles/chinese-2d.jpg",
    storyboard: "/short-drama-styles/suspense-noir.jpg",
    others: "/short-drama-styles/storybook-fantasy.jpg",
};

const orderedSources = manifest.categories.map((item) => item.file);
const allSourceFiles = await (await import("node:fs/promises")).readdir(resolvedSourceDir);
for (const file of allSourceFiles.filter((item) => item.endsWith(".json") && item !== "manifest.json").sort()) {
    if (!orderedSources.includes(file)) orderedSources.push(file);
}

const recordsByID = new Map();
const sourceStats = new Map();
for (const file of orderedSources) {
    const sourceCategory = path.basename(file, ".json");
    const records = JSON.parse(await readFile(path.join(resolvedSourceDir, file), "utf8"));
    sourceStats.set(sourceCategory, records.length);
    for (const record of records) {
        const id = String(record.id ?? "").trim();
        const content = String(record.content ?? "").trim();
        if (!id || !content || recordsByID.has(id)) continue;
        recordsByID.set(id, { ...record, sourceCategory });
    }
}

const highSignals = [
    ["luxury", 12], ["luxurious", 12], ["premium", 11], ["high-end", 11], ["editorial", 9],
    ["cinematic", 8], ["photorealistic", 8], ["commercial", 7], ["fashion", 7], ["architectural", 7],
    ["museum", 7], ["jewelry", 7], ["perfume", 7], ["studio lighting", 6], ["dramatic lighting", 6],
    ["professional", 5], ["film still", 5], ["golden hour", 5], ["moody", 4], ["elegant", 4],
    ["minimal", 3], ["3d", 3], ["realistic", 3], ["sharp focus", 3], ["material texture", 3],
];
const lowSignals = [
    ["meme", -12], ["emoji", -10], ["sticker", -9], ["blurry", -10], ["low quality", -10],
    ["screenshot", -5], ["nsfw", -24], ["gore", -16],
];

function scoreRecord(record) {
    const text = `${record.title || ""}\n${record.description || ""}\n${record.content || ""}`.toLowerCase();
    let score = Math.min(18, Math.floor(String(record.content || "").length / 500));
    for (const [signal, weight] of highSignals) if (text.includes(signal)) score += weight;
    for (const [signal, weight] of lowSignals) if (text.includes(signal)) score += weight;
    const category = categoryMap[record.sourceCategory] || "others";
    if (category === "product" || category === "portrait") score += 4;
    if (Array.isArray(record.sourceMedia) && record.sourceMedia.length > 0) score += 3;
    return score;
}

function uniqueTags(record, category) {
    const text = `${record.title || ""} ${record.description || ""} ${record.content || ""}`.toLowerCase();
    const tags = [categoryLabels[category], sourceCategoryLabels[record.sourceCategory] || "公开素材", "提示词案例", "光影", "构图"];
    if (/(portrait|face|person|people|woman|man|model|avatar)/.test(text)) tags.push("人物");
    if (/(product|advertis|brand|package|ecommerce|commercial|perfume|jewelry)/.test(text)) tags.push("商业");
    if (/(cinematic|film|movie|camera|lens|depth of field|bokeh)/.test(text)) tags.push("镜头语言");
    if (/(fashion|editorial|luxury|luxurious|premium)/.test(text)) tags.push("高级质感");
    if (/(chinese|japanese|ink|anime|manga|fantasy|myth)/.test(text)) tags.push("风格化");
    return [...new Set(tags)].slice(0, 8);
}

function trimRunes(value, limit) {
    const text = String(value || "").trim();
    return [...text].slice(0, limit).join("");
}

const candidates = [...recordsByID.values()].map((record) => {
    const category = categoryMap[record.sourceCategory] || "others";
    const referenceImageURL = Array.isArray(record.sourceMedia) ? String(record.sourceMedia[0] || "").trim() : "";
    const baseTitle = trimRunes(record.title || `${categoryLabels[category]}提示词 ${record.id}`, 150);
    const description = trimRunes(record.description || `${categoryLabels[category]}案例提示词，可直接用于图片生成并按主体、光线和构图继续调整。`, 520);
    return {
        id: `youmind-${record.sourceCategory}-${record.id}`,
        title: baseTitle || `提示词 ${record.id}`,
        prompt: trimRunes(record.content, 100000),
        description,
        coverUrl: fallbackCoverByCategory[category],
        referenceImageUrl: referenceImageURL.startsWith("http://") || referenceImageURL.startsWith("https://") ? referenceImageURL : "",
        tags: uniqueTags(record, category),
        category,
        mode: "image",
        modelHint: "通用图片模型；建议先按案例比例生成，再替换主体和风格",
        sourceUrl: "https://youmind.com/nano-banana-pro-prompts",
        license: "YouMind 公开社区整理；示例图与原作者内容请按来源页面许可使用",
        featured: false,
        curationRank: 0,
        useCount: 0,
        favoriteCount: 0,
        createdAt: 1787836800000,
        updatedAt: 1787836800000,
        sourceCategory: record.sourceCategory,
        score: scoreRecord(record),
    };
});

const categoryQuota = { product: 18, portrait: 18, cinematic: 15, landscape: 12, storyboard: 10, anime: 8, others: 6 };
const selected = [];
const selectedIDs = new Set();
for (const category of Object.keys(categoryQuota)) {
    const pool = candidates.filter((item) => item.category === category).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    for (const item of pool.slice(0, categoryQuota[category])) {
        selected.push(item);
        selectedIDs.add(item.id);
    }
}
for (const item of candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))) {
    if (selected.length >= 87) break;
    if (!selectedIDs.has(item.id)) {
        selected.push(item);
        selectedIDs.add(item.id);
    }
}
selected.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
for (let index = 0; index < selected.length; index += 1) {
    selected[index].featured = true;
    selected[index].curationRank = custom.length + index + 1;
}

const customWithRank = custom.map((item, index) => ({ ...item, featured: true, curationRank: index + 1 }));
const external = candidates.map(({ sourceCategory, score, ...item }) => item);
const output = [...customWithRank, ...selected.map(({ sourceCategory, score, ...item }) => item), ...external.filter((item) => !selectedIDs.has(item.id))];
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);

const categoryCounts = Object.fromEntries(Object.keys(categoryLabels).map((category) => [category, output.filter((item) => item.category === category).length]));
console.log(JSON.stringify({
    sourceFiles: sourceStats.size,
    sourceRows: [...sourceStats.values()].reduce((sum, value) => sum + value, 0),
    uniqueRows: candidates.length,
    customRows: custom.length,
    outputRows: output.length,
    featuredRows: selected.length + custom.length,
    categoryCounts,
    outputPath,
    generatedAt: new Date().toISOString(),
}, null, 2));
