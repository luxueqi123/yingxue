import type { InterfaceLocale } from "@/lib/interface-locale-ids";

const zhCN = {
    categories: { furniture: "家具", structure: "空间结构", nature: "自然 / 外景", props: "道具" },
    items: { "sofa-1": "单人沙发", "sofa-3": "三人沙发", "dining-table": "餐桌", "coffee-table": "茶几", stool: "凳子", bed: "双人床", wall: "墙板", door: "门", window: "窗框", floor: "地面板", step: "台阶", hill: "山体", rock: "岩石", trunk: "树干", ground: "地面背板", car: "汽车轮廓", pillar: "柱子", crate: "箱子", ball: "球体道具" },
};
type PropLabels = { [K in keyof typeof zhCN]: Record<keyof (typeof zhCN)[K], string> };

export const previsPropMessages = {
    "zh-CN": zhCN,
    "zh-HK": {
        categories: { furniture: "傢俬", structure: "空間結構", nature: "自然 / 外景", props: "道具" },
        items: { "sofa-1": "單人梳化", "sofa-3": "三人梳化", "dining-table": "餐桌", "coffee-table": "茶几", stool: "凳", bed: "雙人床", wall: "牆板", door: "門", window: "窗框", floor: "地板", step: "台階", hill: "山體", rock: "岩石", trunk: "樹幹", ground: "地面背板", car: "汽車輪廓", pillar: "柱", crate: "箱", ball: "球體道具" },
    },
    "zh-TW": {
        categories: { furniture: "家具", structure: "空間結構", nature: "自然 / 外景", props: "道具" },
        items: { "sofa-1": "單人沙發", "sofa-3": "三人沙發", "dining-table": "餐桌", "coffee-table": "茶几", stool: "凳子", bed: "雙人床", wall: "牆板", door: "門", window: "窗框", floor: "地板", step: "台階", hill: "山體", rock: "岩石", trunk: "樹幹", ground: "地面背板", car: "汽車輪廓", pillar: "柱子", crate: "箱子", ball: "球體道具" },
    },
    "en-US": {
        categories: { furniture: "Furniture", structure: "Architecture", nature: "Nature / exteriors", props: "Props" },
        items: { "sofa-1": "Armchair", "sofa-3": "Three-seat sofa", "dining-table": "Dining table", "coffee-table": "Coffee table", stool: "Stool", bed: "Double bed", wall: "Wall panel", door: "Door", window: "Window frame", floor: "Floor panel", step: "Step", hill: "Hill", rock: "Rock", trunk: "Tree trunk", ground: "Ground plane", car: "Car silhouette", pillar: "Pillar", crate: "Crate", ball: "Sphere prop" },
    },
    "ja-JP": {
        categories: { furniture: "家具", structure: "建築・構造物", nature: "自然・屋外", props: "小道具" },
        items: { "sofa-1": "一人掛けソファ", "sofa-3": "三人掛けソファ", "dining-table": "ダイニングテーブル", "coffee-table": "ローテーブル", stool: "スツール", bed: "ダブルベッド", wall: "壁パネル", door: "ドア", window: "窓枠", floor: "床パネル", step: "段差", hill: "山", rock: "岩", trunk: "木の幹", ground: "地面パネル", car: "車のシルエット", pillar: "柱", crate: "木箱", ball: "球体の小道具" },
    },
    "ko-KR": {
        categories: { furniture: "가구", structure: "건축 구조물", nature: "자연 / 야외", props: "소품" },
        items: { "sofa-1": "1인용 소파", "sofa-3": "3인용 소파", "dining-table": "식탁", "coffee-table": "커피 테이블", stool: "스툴", bed: "더블 침대", wall: "벽 패널", door: "문", window: "창틀", floor: "바닥 패널", step: "계단", hill: "산", rock: "바위", trunk: "나무줄기", ground: "지면 패널", car: "자동차 실루엣", pillar: "기둥", crate: "상자", ball: "구형 소품" },
    },
    "es-ES": {
        categories: { furniture: "Muebles", structure: "Arquitectura", nature: "Naturaleza / exteriores", props: "Utilería" },
        items: { "sofa-1": "Sillón", "sofa-3": "Sofá de tres plazas", "dining-table": "Mesa de comedor", "coffee-table": "Mesa de centro", stool: "Taburete", bed: "Cama doble", wall: "Panel de pared", door: "Puerta", window: "Marco de ventana", floor: "Panel de suelo", step: "Escalón", hill: "Montaña", rock: "Roca", trunk: "Tronco", ground: "Plano de suelo", car: "Silueta de coche", pillar: "Pilar", crate: "Caja", ball: "Esfera" },
    },
    "pt-BR": {
        categories: { furniture: "Móveis", structure: "Arquitetura", nature: "Natureza / exteriores", props: "Objetos de cena" },
        items: { "sofa-1": "Poltrona", "sofa-3": "Sofá de três lugares", "dining-table": "Mesa de jantar", "coffee-table": "Mesa de centro", stool: "Banqueta", bed: "Cama de casal", wall: "Painel de parede", door: "Porta", window: "Moldura de janela", floor: "Painel de piso", step: "Degrau", hill: "Montanha", rock: "Rocha", trunk: "Tronco", ground: "Plano de chão", car: "Silhueta de carro", pillar: "Pilar", crate: "Caixote", ball: "Esfera" },
    },
    "fr-FR": {
        categories: { furniture: "Mobilier", structure: "Architecture", nature: "Nature / extérieurs", props: "Accessoires" },
        items: { "sofa-1": "Fauteuil", "sofa-3": "Canapé trois places", "dining-table": "Table à manger", "coffee-table": "Table basse", stool: "Tabouret", bed: "Lit double", wall: "Panneau mural", door: "Porte", window: "Cadre de fenêtre", floor: "Panneau de sol", step: "Marche", hill: "Montagne", rock: "Rocher", trunk: "Tronc", ground: "Plan de sol", car: "Silhouette de voiture", pillar: "Pilier", crate: "Caisse", ball: "Sphère" },
    },
    "de-DE": {
        categories: { furniture: "Möbel", structure: "Architektur", nature: "Natur / Außenbereich", props: "Requisiten" },
        items: { "sofa-1": "Sessel", "sofa-3": "Dreisitziges Sofa", "dining-table": "Esstisch", "coffee-table": "Couchtisch", stool: "Hocker", bed: "Doppelbett", wall: "Wandplatte", door: "Tür", window: "Fensterrahmen", floor: "Bodenplatte", step: "Stufe", hill: "Berg", rock: "Felsen", trunk: "Baumstamm", ground: "Bodenfläche", car: "Autosilhouette", pillar: "Säule", crate: "Kiste", ball: "Kugel" },
    },
} satisfies Record<InterfaceLocale, PropLabels>;
