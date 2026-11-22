import type { CreationLaunchMode } from "@/lib/creation-launch";

export type ShowcaseWork = {
    id: string;
    title: string;
    category: "影像" | "设计" | "电商" | "角色" | "人物";
    caption: string;
    description: string;
    tags: string[];
    prompt: string;
    mode: CreationLaunchMode;
    portrait?: boolean;
    video?: string;
};

export const showcaseImage = (id: string) => `/showcase/${id}.webp`;

export const showcaseWorks: ShowcaseWork[] = [
    { id: "cosmos", title: "在世界之外，想象另一种辽阔", category: "影像", caption: "幻想影像 · 镜头运动", description: "苍茫地表、环绕的行星与缓缓移动的镜头，让一个超现实世界真正流动起来。", tags: ["幻想世界", "镜头运动", "影像氛围"], prompt: "荒凉星球的地表，巨大的行星悬在远方，镜头缓慢向前推进，壮阔的电影构图、细腻的地表纹理与自然光线。", mode: "video", video: "/showcase/cosmos.mp4" },
    { id: "beauty", title: "把温柔的光，留给产品", category: "电商", caption: "商品场景 · 品牌视觉", description: "柔和日光、轻盈材质与自然色彩，让商品成为画面的主角。继续延展主图、细节图与品牌视觉。", tags: ["产品构图", "自然光", "成套视觉"], prompt: "为护肤产品设计一组春日品牌视觉：温柔的自然日光、浅粉色背景、原木展台与干花，保持商品为画面主角，光影细腻，留出文案空间。", mode: "image", portrait: true },
    { id: "film", title: "月下，故事还没有结束", category: "角色", caption: "东方幻想 · 人物设定", description: "用服饰、神态与月夜光线建立角色气质，再将人物放进不同镜头，让故事逐渐完整。", tags: ["东方幻想", "人物气质", "故事分镜"], prompt: "设计一个东方幻想故事的女性角色：月夜、层叠深色衣袍、风中的发丝、克制而坚定的眼神，电影感光线与完整的人物设定。", mode: "image", portrait: true },
    { id: "city", title: "霓虹里，藏着另一个世界", category: "影像", caption: "城市氛围 · 场景创意", description: "从色彩、光线和空间开始，构建一座有故事的城市，展开镜头、角色和下一段情节。", tags: ["夜色城市", "氛围构图", "故事场景"], prompt: "雨夜的霓虹城市，密集的建筑与招牌，潮湿街道映出暖色灯光，镜头从高处缓慢下降，展现富有故事感的城市夜景。", mode: "video" },
    { id: "piano", title: "让看不见的音乐，有了形状", category: "设计", caption: "概念视觉 · 超现实表达", description: "以钢琴为起点，探索光粒、流动与消散的视觉语言，为音乐找到有想象力的表达。", tags: ["概念海报", "超现实", "音乐视觉"], prompt: "一架黑色三角钢琴在金色光粒中逐渐消散，深色背景，细腻材质，光线像旋律一样流动，超现实音乐海报，构图优雅而有张力。", mode: "image" },
    { id: "car", title: "速度，成为一道光", category: "影像", caption: "动感创意 · 广告画面", description: "将光线、运动轨迹和产品形态结合，探索有冲击力的广告画面与动态镜头。", tags: ["动感构图", "光线效果", "广告创意"], prompt: "一辆由蓝色光线与闪电勾勒的跑车，在雨夜中向前行驶，低机位跟拍，湿润地面反射车身光芒，富有动感的汽车广告镜头。", mode: "video" },
    { id: "portrait", title: "日常里，也有电影的一刻", category: "人物", caption: "自然写真 · 社媒灵感", description: "用自然光与克制的色调，保留人物的情绪和生活质感，延展写真、封面与社媒内容。", tags: ["自然写真", "生活方式", "封面表达"], prompt: "自然窗光下的人物生活写真，轻松姿态、细腻肤质、温暖而克制的色调，真实生活氛围，富有呼吸感的电影构图。", mode: "image", portrait: true },
    { id: "perfume", title: "让气味，拥有自己的光影", category: "电商", caption: "香氛广告 · 品牌质感", description: "琥珀光泽、深色瓶身与流动材质，让香气转化为可感知的视觉体验。", tags: ["香氛广告", "材质光影", "品牌表达"], prompt: "深色香水瓶的高端广告视觉，琥珀色液体、金属瓶盖、流动的金色光线与花瓣，深色背景，强调玻璃、金属与液体的精致质感。", mode: "image", portrait: true },
    { id: "lemon", title: "把夏天，装进这一口清爽", category: "设计", caption: "饮品海报 · 视觉张力", description: "鲜明色彩、动态构图和有节奏的文字，让一张饮品海报带着温度与活力。", tags: ["海报设计", "动感排版", "成套广告"], prompt: "设计一张柠檬茶广告海报：明亮柠檬黄、飞溅水花、新鲜柠檬、动感饮品瓶，大胆醒目的文字排版，清爽有活力。", mode: "image", portrait: true },
];

export const showcaseScenes = [
    { id: "design", title: "图片与设计", image: "piano", category: "设计", description: "海报、概念视觉与成套设计", mode: "image" },
    { id: "video", title: "视频与影像", image: "city", category: "影像", description: "从一个画面，展开一段影像", mode: "video" },
    { id: "story", title: "短剧与漫剧", image: "film", category: "角色", description: "故事、角色、场景与镜头", mode: "text" },
    { id: "brand", title: "电商与品牌", image: "beauty", category: "电商", description: "让商品成为画面的主角", mode: "image" },
    { id: "portrait", title: "社媒与写真", image: "portrait", category: "人物", description: "找到你的内容与表达风格", mode: "image" },
    { id: "audio", title: "声音与配音", image: "", category: "全部", description: "从旁白脚本到声音表达", mode: "text" },
] as const;

export const showcaseAssistants = [
    { title: "分镜导演", image: "storyboard", description: "把故事拆成镜头，让情绪与节奏有迹可循。", action: "从一个故事开始", prompt: "请作为分镜导演，帮我把故事拆成镜头，整理景别、运镜、画面和情绪：" },
    { title: "商品视觉师", image: "beauty", description: "找到商品的美感，延展主图、场景与套图。", action: "从一件商品开始", prompt: "请作为商品视觉设计师，为我的产品策划主图、细节图和场景图，并给出可执行的图像提示词：" },
    { title: "品牌创意搭档", image: "perfume", description: "让一句品牌表达，生长出一整套视觉语言。", action: "从一个品牌开始", prompt: "请作为品牌创意设计师，帮我确定品牌表达、视觉风格、构图和成套内容方向：" },
    { title: "社媒内容搭档", image: "portrait", description: "整理内容角度，让封面、文案与画面一起出彩。", action: "从一个主题开始", prompt: "请作为社媒内容策划，围绕这个主题给我封面方向、文案与配图建议：" },
];
