import type { InterfaceLocale } from "@/lib/interface-locale-ids";

type Labels = {
    modelDefault: string; enabled: string; disabled: string; size: string; frame: string; ratio: string;
    speed: string; reference: string; seed: string; temperature: string; raw: string;
    mjQuality: string; stylize: string; chaos: string; weird: string; negativePrompt: string;
    tile: string; imageWeight: string; characterReference: string; styleReference: string;
    detailReference: string; characterWeight: string; styleWeight: string; detailWeight: string;
    hd: string; outputFormat: string; outputCompression: string;
};

export const imageParameterMessages = {
    "zh-CN": {
        frame: "画幅", ratio: "画幅比例",
        modelDefault: "跟随模型默认", enabled: "开启", disabled: "关闭", size: "画幅 / 尺寸",
        speed: "生成速度", reference: "参考方式", seed: "随机种子", temperature: "随机程度", raw: "原始风格",
        mjQuality: "细节质量", stylize: "风格化程度", chaos: "变化程度", weird: "奇异程度", negativePrompt: "排除内容",
        tile: "无缝平铺", imageWeight: "图片权重", characterReference: "角色参考", styleReference: "风格参考",
        detailReference: "细节参考", characterWeight: "角色权重", styleWeight: "风格权重", detailWeight: "细节权重",
        hd: "高清输出", outputFormat: "输出格式", outputCompression: "压缩质量",
    },
    "zh-HK": {
        frame: "畫幅", ratio: "畫幅比例",
        modelDefault: "跟隨模型預設", enabled: "開啟", disabled: "關閉", size: "畫幅 / 尺寸",
        speed: "生成速度", reference: "參考方式", seed: "隨機種子", temperature: "隨機程度", raw: "原始風格",
        mjQuality: "細節品質", stylize: "風格化程度", chaos: "變化程度", weird: "奇異程度", negativePrompt: "排除內容",
        tile: "無縫平鋪", imageWeight: "圖片權重", characterReference: "角色參考", styleReference: "風格參考",
        detailReference: "細節參考", characterWeight: "角色權重", styleWeight: "風格權重", detailWeight: "細節權重",
        hd: "高清輸出", outputFormat: "輸出格式", outputCompression: "壓縮品質",
    },
    "zh-TW": {
        frame: "畫幅", ratio: "畫幅比例",
        modelDefault: "使用模型預設值", enabled: "開啟", disabled: "關閉", size: "畫幅 / 尺寸",
        speed: "生成速度", reference: "參考方式", seed: "隨機種子", temperature: "隨機程度", raw: "原始風格",
        mjQuality: "細節品質", stylize: "風格化程度", chaos: "變化程度", weird: "奇異程度", negativePrompt: "排除內容",
        tile: "無縫平鋪", imageWeight: "圖片權重", characterReference: "角色參考", styleReference: "風格參考",
        detailReference: "細節參考", characterWeight: "角色權重", styleWeight: "風格權重", detailWeight: "細節權重",
        hd: "高畫質輸出", outputFormat: "輸出格式", outputCompression: "壓縮品質",
    },
    "en-US": {
        frame: "Aspect ratio", ratio: "Aspect ratio",
        modelDefault: "Use model default", enabled: "On", disabled: "Off", size: "Aspect ratio / size",
        speed: "Generation speed", reference: "Reference mode", seed: "Seed", temperature: "Randomness", raw: "Raw style",
        mjQuality: "Detail quality", stylize: "Stylization", chaos: "Variation", weird: "Weirdness", negativePrompt: "Exclude content",
        tile: "Seamless tiling", imageWeight: "Image weight", characterReference: "Character reference", styleReference: "Style reference",
        detailReference: "Detail reference", characterWeight: "Character weight", styleWeight: "Style weight", detailWeight: "Detail weight",
        hd: "HD output", outputFormat: "Output format", outputCompression: "Compression quality",
    },
    "ja-JP": {
        frame: "画角", ratio: "アスペクト比",
        modelDefault: "モデルの初期値を使用", enabled: "オン", disabled: "オフ", size: "アスペクト比 / サイズ",
        speed: "生成速度", reference: "参照方式", seed: "シード", temperature: "ランダム性", raw: "Rawスタイル",
        mjQuality: "ディテール品質", stylize: "スタイル強度", chaos: "変化の強度", weird: "奇抜さ", negativePrompt: "除外する内容",
        tile: "シームレスタイル", imageWeight: "画像の重み", characterReference: "キャラクター参照", styleReference: "スタイル参照",
        detailReference: "ディテール参照", characterWeight: "キャラクターの重み", styleWeight: "スタイルの重み", detailWeight: "ディテールの重み",
        hd: "HD出力", outputFormat: "出力形式", outputCompression: "圧縮品質",
    },
    "ko-KR": {
        frame: "화면 비율", ratio: "화면 비율",
        modelDefault: "모델 기본값 사용", enabled: "켜기", disabled: "끄기", size: "화면 비율 / 크기",
        speed: "생성 속도", reference: "참조 방식", seed: "시드", temperature: "무작위성", raw: "원본 스타일",
        mjQuality: "세부 품질", stylize: "스타일 강도", chaos: "변화 강도", weird: "독특함", negativePrompt: "제외할 내용",
        tile: "이음매 없는 타일링", imageWeight: "이미지 가중치", characterReference: "캐릭터 참조", styleReference: "스타일 참조",
        detailReference: "세부 참조", characterWeight: "캐릭터 가중치", styleWeight: "스타일 가중치", detailWeight: "세부 가중치",
        hd: "HD 출력", outputFormat: "출력 형식", outputCompression: "압축 품질",
    },
    "es-ES": {
        frame: "Relación de aspecto", ratio: "Relación de aspecto",
        modelDefault: "Usar valor predeterminado del modelo", enabled: "Activado", disabled: "Desactivado", size: "Relación de aspecto / tamaño",
        speed: "Velocidad de generación", reference: "Modo de referencia", seed: "Semilla", temperature: "Aleatoriedad", raw: "Estilo original",
        mjQuality: "Calidad de detalle", stylize: "Estilización", chaos: "Variación", weird: "Rareza", negativePrompt: "Contenido a excluir",
        tile: "Mosaico sin juntas", imageWeight: "Peso de imagen", characterReference: "Referencia de personaje", styleReference: "Referencia de estilo",
        detailReference: "Referencia de detalle", characterWeight: "Peso de personaje", styleWeight: "Peso de estilo", detailWeight: "Peso de detalle",
        hd: "Salida HD", outputFormat: "Formato de salida", outputCompression: "Calidad de compresión",
    },
    "pt-BR": {
        frame: "Proporção", ratio: "Proporção",
        modelDefault: "Usar padrão do modelo", enabled: "Ativado", disabled: "Desativado", size: "Proporção / tamanho",
        speed: "Velocidade de geração", reference: "Modo de referência", seed: "Semente", temperature: "Aleatoriedade", raw: "Estilo original",
        mjQuality: "Qualidade dos detalhes", stylize: "Estilização", chaos: "Variação", weird: "Excentricidade", negativePrompt: "Conteúdo a excluir",
        tile: "Repetição sem emendas", imageWeight: "Peso da imagem", characterReference: "Referência de personagem", styleReference: "Referência de estilo",
        detailReference: "Referência de detalhes", characterWeight: "Peso do personagem", styleWeight: "Peso do estilo", detailWeight: "Peso dos detalhes",
        hd: "Saída HD", outputFormat: "Formato de saída", outputCompression: "Qualidade de compressão",
    },
    "fr-FR": {
        frame: "Format", ratio: "Rapport largeur/hauteur",
        modelDefault: "Utiliser la valeur par défaut du modèle", enabled: "Activé", disabled: "Désactivé", size: "Format / dimensions",
        speed: "Vitesse de génération", reference: "Mode de référence", seed: "Graine aléatoire", temperature: "Aléatoire", raw: "Style brut",
        mjQuality: "Qualité des détails", stylize: "Stylisation", chaos: "Variation", weird: "Étrangeté", negativePrompt: "Contenu à exclure",
        tile: "Motif sans raccord", imageWeight: "Poids de l’image", characterReference: "Référence de personnage", styleReference: "Référence de style",
        detailReference: "Référence de détails", characterWeight: "Poids du personnage", styleWeight: "Poids du style", detailWeight: "Poids des détails",
        hd: "Sortie HD", outputFormat: "Format de sortie", outputCompression: "Qualité de compression",
    },
    "de-DE": {
        frame: "Bildformat", ratio: "Seitenverhältnis",
        modelDefault: "Modellstandard verwenden", enabled: "Ein", disabled: "Aus", size: "Seitenverhältnis / Größe",
        speed: "Generierungsgeschwindigkeit", reference: "Referenzmodus", seed: "Zufallsstartwert", temperature: "Zufälligkeit", raw: "Rohstil",
        mjQuality: "Detailqualität", stylize: "Stilisierung", chaos: "Variation", weird: "Ungewöhnlichkeit", negativePrompt: "Auszuschließender Inhalt",
        tile: "Nahtlose Kacheln", imageWeight: "Bildgewichtung", characterReference: "Charakterreferenz", styleReference: "Stilreferenz",
        detailReference: "Detailreferenz", characterWeight: "Charaktergewichtung", styleWeight: "Stilgewichtung", detailWeight: "Detailgewichtung",
        hd: "HD-Ausgabe", outputFormat: "Ausgabeformat", outputCompression: "Kompressionsqualität",
    },
} satisfies Record<InterfaceLocale, Labels>;
