import type { Asset, ImageAsset } from "@/stores/use-asset-store";

type IncludedStyle = {
    id: string;
    title: string;
    note: string;
    tags: string[];
    width: number;
    height: number;
    bytes: number;
};

const includedAt = "2026-08-28T00:00:00.000Z";
const includedSource = "映雪内置风格参考";
const includedNote = "随映雪站点发布的内置风格参考图，可保存到个人素材库作为创作参考。不是独立商用图库素材包。";

const styles: IncludedStyle[] = [
    { id: "black-white-noir", title: "黑白黑色电影", note: "高反差光影与悬疑叙事氛围。", tags: ["黑白", "悬疑", "电影感"], width: 1200, height: 800, bytes: 148000 },
    { id: "chinese-2d", title: "国风二维绘卷", note: "东方人物与柔和的手绘叙事。", tags: ["国风", "二维", "手绘"], width: 960, height: 1440, bytes: 99270 },
    { id: "clay-stop-motion", title: "黏土定格", note: "温暖、有触感的定格动画风格。", tags: ["黏土", "定格", "治愈"], width: 1200, height: 800, bytes: 84721 },
    { id: "comic-pop", title: "波普漫画", note: "高饱和色块与强节奏的镜头表达。", tags: ["漫画", "波普", "高饱和"], width: 1200, height: 800, bytes: 139231 },
    { id: "cyberpunk-neon", title: "赛博霓虹雨夜", note: "霓虹、雨幕与未来都市质感。", tags: ["赛博朋克", "霓虹", "都市"], width: 1200, height: 802, bytes: 303258 },
    { id: "fantasy-3d", title: "奇幻三维", note: "角色感明确的三维奇幻叙事。", tags: ["奇幻", "3D", "角色"], width: 960, height: 1452, bytes: 170745 },
    { id: "future-tech", title: "未来科技", note: "冷冽、克制的科技视觉基调。", tags: ["科技", "未来", "冷色"], width: 1200, height: 800, bytes: 143063 },
    { id: "ink-narrative", title: "水墨叙事", note: "留白与水墨笔触的东方镜头语言。", tags: ["水墨", "东方", "留白"], width: 800, height: 447, bytes: 60607 },
    { id: "nature-healing", title: "自然治愈", note: "柔光、植物与安静的日常气息。", tags: ["自然", "治愈", "柔光"], width: 1200, height: 799, bytes: 323918 },
    { id: "period-live-action", title: "古装实拍", note: "写实古风场景与人物关系。", tags: ["古装", "写实", "剧情"], width: 960, height: 640, bytes: 131301 },
    { id: "real-life", title: "现实生活流", note: "自然光与贴近生活的镜头质地。", tags: ["生活流", "写实", "自然光"], width: 960, height: 640, bytes: 168420 },
    { id: "retro-hong-kong", title: "复古港风", note: "密集城市纹理与复古彩色胶片感。", tags: ["港风", "复古", "都市"], width: 1200, height: 1800, bytes: 604649 },
    { id: "space-opera", title: "太空史诗", note: "宏大空间、文明想象与史诗镜头。", tags: ["太空", "史诗", "科幻"], width: 1200, height: 799, bytes: 198062 },
    { id: "storybook-fantasy", title: "童话奇境", note: "绘本般的梦幻空间与角色关系。", tags: ["童话", "绘本", "奇幻"], width: 1200, height: 1800, bytes: 429797 },
    { id: "surreal-dream", title: "超现实梦境", note: "非现实构图与朦胧情绪氛围。", tags: ["超现实", "梦境", "情绪"], width: 1200, height: 1816, bytes: 284014 },
    { id: "suspense-noir", title: "暗巷悬疑", note: "低照度、压迫感与悬疑动作表达。", tags: ["悬疑", "暗调", "动作"], width: 960, height: 640, bytes: 101156 },
    { id: "three-d-cartoon", title: "三维卡通", note: "明快角色动画与轻量故事表达。", tags: ["卡通", "3D", "动画"], width: 660, height: 400, bytes: 60744 },
    { id: "urban-live-action", title: "都市实拍", note: "当代城市环境与人物镜头参考。", tags: ["都市", "实拍", "人物"], width: 960, height: 1440, bytes: 93361 },
];

export const yingxueIncludedAssets: ImageAsset[] = styles.map((style) => {
    const url = `/short-drama-styles/${style.id}.jpg`;
    return {
        id: `yingxue-included-${style.id}`,
        kind: "image",
        title: style.title,
        coverUrl: url,
        tags: ["映雪内置", "风格参考", ...style.tags],
        category: "material",
        status: "confirmed",
        source: includedSource,
        note: `${style.note} ${includedNote}`,
        createdAt: includedAt,
        updatedAt: includedAt,
        metadata: {
            source: "yingxue-included-style-reference",
            catalog: "yingxue-included",
            usage: "reference-only",
        },
        data: {
            dataUrl: url,
            width: style.width,
            height: style.height,
            bytes: style.bytes,
            mimeType: "image/jpeg",
        },
    };
});

export function isYingxueIncludedAsset(asset: Asset) {
    return asset.id.startsWith("yingxue-included-");
}
