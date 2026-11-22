// Display curation is independent of the captured source-feed rank.
export const featuredCreationIds = [
    "case-9f636a3c07e248a7a530e6aa4976fd53", // 夏が終わる前に
    "case-614c70ab1be04ef48f3972b473526aab", // 花间世界
    "case-2218cb4006b441e5b87aa7402c80080b", // Still You
    "case-83b01cd189ac434db70d2613c0c42693", // 没人知道
    "case-40c9bde2360246559b627ad3c5e617b5", // 秋日的风
    "case-10d20d70a9d04fba9d17ff0e8fce7a2c", // Porsche
    "case-0c08587e4f8144aabdbac9761189aab0", // DIOR
    "case-6af9f5f216d940d19307641eac931d96", // 伊甸园的回响
    "case-796515a4554443c883acd374d7fef3be", // 归于松弛
    "case-6b79788778eb487083505539638d5486", // 大疆
    "case-021ab4d7e49c4529a00269f827af6bc6", // 故乡·童年
    "case-8b786904346441058786a50c7a953423", // 独居治愈 VLOG
    "case-8765a66b7c664db797d75322fda11bfd", // 文明潮脉
    "case-262b7d312f1c454986b626fb5bad9840", // 爱在烟火间
    "case-217b8161911b4452a58de0fec28d17c8", // 岚图追光
    "case-e39f168f99f14bf098b5ccfe844295c9", // 韦斯安德森风格广告
] as const;

export const deferredCreationIds = [
    "case-2180f1ab1d4c4d4da547df21a5543317",
    "case-0c332142d6c54aedad1a504357957d16",
    "case-6bc8b8d159d04627a881c39bfa58a5fb",
    "case-974e4a0dd24a491987eb29657198302e",
    "case-fa7972764c9941c09ad99fa67e13bd43",
    "case-d8c60ca6d3114f00adfe82170138fd79",
    "case-59bedcd7257b4375ae23bc894dc05e7d",
    "case-911241862b984510a78ba0de6be590e2",
    "case-124497eb790146cd9c4d878bee318605",
    "case-2ecf3c93255d473dab56a7aee73116a2",
    "case-fe406b2f1ed24d5ba88ecd67f2ecbd64",
    "case-66ef851e303f4a029e513d0de71bc679",
    "case-9cc4c769e86c413291672eecac683c98",
    "case-d9acf0bdaa9a4e838583a7f3b05eacc7",
    "case-52e7fdebe45a4e088fb12636d4be41dc",
    "case-0a06056b853447bbbd7ed14bd5035b02",
] as const;

const first = new Map<string, number>(featuredCreationIds.map((id, index) => [id, index]));
const last = new Map<string, number>(deferredCreationIds.map((id, index) => [id, index]));
export function creationDisplayOrder(id: string): number {
    const key = id.startsWith("case-") ? id : `case-${id}`;
    return first.get(key) ?? (last.has(key) ? 20_000 + last.get(key)! : 10_000);
}
