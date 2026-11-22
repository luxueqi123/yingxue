import type { AppLocale } from "./locales";

type Messages = { skin: string; avatar: string; site: string; classic: string; whale: string; orb: string; luxueqi: string; ink: string; crane: string };
export const personalAppearanceMessages: Record<AppLocale, Messages> = {
    "zh-CN": { skin: "界面主题", avatar: "助手形象", site: "跟随站点", classic: "经典", whale: "鲸鱼娘", orb: "主题精灵", luxueqi: "陆雪琪 · 天琊", ink: "龙影水墨", crane: "云鹤仙观" },
    "zh-HK": { skin: "介面主題", avatar: "助手形象", site: "跟隨網站", classic: "經典", whale: "鯨魚娘", orb: "主題精靈", luxueqi: "陸雪琪 · 天琊", ink: "龍影水墨", crane: "雲鶴仙觀" },
    "zh-TW": { skin: "介面主題", avatar: "助手外觀", site: "跟隨網站", classic: "經典", whale: "鯨魚娘", orb: "主題精靈", luxueqi: "陸雪琪 · 天琊", ink: "龍影水墨", crane: "雲鶴仙觀" },
    "en-US": { skin: "Interface theme", avatar: "Assistant appearance", site: "Site default", classic: "Classic", whale: "Whale girl", orb: "Theme sprite", luxueqi: "Lu Xueqi · Tianya", ink: "Ink Dragon", crane: "Cloud Crane" },
    "ja-JP": { skin: "画面テーマ", avatar: "アシスタントの外見", site: "サイトの設定に従う", classic: "クラシック", whale: "クジラ娘", orb: "テーマの精霊", luxueqi: "陸雪琪 · 天琊", ink: "龍影水墨", crane: "雲鶴仙観" },
    "ko-KR": { skin: "화면 테마", avatar: "도우미 외형", site: "사이트 기본값", classic: "클래식", whale: "고래 소녀", orb: "테마 요정", luxueqi: "육설기 · 천야", ink: "수묵 용", crane: "구름 학" },
    "es-ES": { skin: "Tema de la interfaz", avatar: "Aspecto del asistente", site: "Predeterminado del sitio", classic: "Clásico", whale: "Chica ballena", orb: "Espíritu del tema", luxueqi: "Lu Xueqi · Tianya", ink: "Dragón de tinta", crane: "Grulla entre nubes" },
    "pt-BR": { skin: "Tema da interface", avatar: "Aparência do assistente", site: "Padrão do site", classic: "Clássico", whale: "Garota-baleia", orb: "Espírito do tema", luxueqi: "Lu Xueqi · Tianya", ink: "Dragão de tinta", crane: "Grou das nuvens" },
    "fr-FR": { skin: "Thème de l’interface", avatar: "Apparence de l’assistant", site: "Réglage du site", classic: "Classique", whale: "Fille baleine", orb: "Esprit du thème", luxueqi: "Lu Xueqi · Tianya", ink: "Dragon d’encre", crane: "Grue des nuages" },
    "de-DE": { skin: "Oberflächendesign", avatar: "Aussehen des Assistenten", site: "Website-Standard", classic: "Klassisch", whale: "Walmädchen", orb: "Designgeist", luxueqi: "Lu Xueqi · Tianya", ink: "Tuschdrache", crane: "Wolkenkranich" },
};
