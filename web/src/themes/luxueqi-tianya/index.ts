import { registerThemePack } from "../registry";
import type { ThemePack } from "../types";
import { LUXUEQI_CANVAS_PRESETS, LUXUEQI_CANVAS_THEMES } from "./canvas";
import { BambooSignalArt, LuxueqiOrb, SwordCreditMark, TianyaNotFoundEmblem } from "./marks";
import { LUXUEQI_TIANYA_SKIN, LUXUEQI_TIANYA_SKIN_ID } from "./skin";
import "./theme.css";

export const luxueqiTianyaTheme: ThemePack = {
    id: LUXUEQI_TIANYA_SKIN_ID,
    name: "陆雪琪 · 天琊",
    skin: LUXUEQI_TIANYA_SKIN,
    agentOrb: LuxueqiOrb,
    signalArt: BambooSignalArt,
    creditMark: SwordCreditMark,
    notFound: { emblem: TianyaNotFoundEmblem },
    canvas: { themes: LUXUEQI_CANVAS_THEMES, presets: LUXUEQI_CANVAS_PRESETS },
    copy: {
        assetsEmptyFrames: [
            { src: "/themes/luxueqi-tianya/empty-bamboo.webp", caption: "" },
            { src: "/themes/luxueqi-tianya/empty-snow.webp", caption: "" },
        ],
        sealGlyph: "雪",
    },
};

registerThemePack(luxueqiTianyaTheme);
export default luxueqiTianyaTheme;
