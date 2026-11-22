import type { InterfaceLocale } from "@/lib/interface-locale-ids";

const chinese = {
    crop: "裁剪图片", applyCrop: "确认裁剪", inputImage: "原始图片", cropArea: "裁剪区域", cropHandle: "调整裁剪框 {direction}",
    ratios: "裁剪比例", original: "原图比例", lockRatio: "锁定比例", unlockRatio: "解除比例锁定", reset: "重置",
    output: "输出 {width} × {height} px", reading: "正在读取图片…", resize: "调整图片尺寸", applyResize: "生成放大图",
    longEdge: "目标长边", sampling: "插值方式", highQuality: "高质量", bilinear: "双线性", nearest: "最近邻",
    atMaximum: "图片已达到 4K，无需放大", chooseLarger: "请选择大于原图的目标尺寸",
};
type Messages = Record<keyof typeof chinese, string>;
const traditional: Messages = {
    crop: "裁切圖片", applyCrop: "確認裁切", inputImage: "原始圖片", cropArea: "裁切區域", cropHandle: "調整裁切框 {direction}",
    ratios: "裁切比例", original: "原圖比例", lockRatio: "鎖定比例", unlockRatio: "解除比例鎖定", reset: "重設",
    output: "輸出 {width} × {height} px", reading: "正在讀取圖片…", resize: "調整圖片尺寸", applyResize: "產生放大圖",
    longEdge: "目標長邊", sampling: "插值方式", highQuality: "高品質", bilinear: "雙線性", nearest: "最鄰近",
    atMaximum: "圖片已達到 4K，無需放大", chooseLarger: "請選擇大於原圖的目標尺寸",
};
export const imageToolMessages: Record<InterfaceLocale, Messages> = {
    "zh-CN": chinese, "zh-HK": traditional, "zh-TW": traditional,
    "en-US": {
        crop: "Crop image", applyCrop: "Apply crop", inputImage: "Original image", cropArea: "Crop area", cropHandle: "Resize crop {direction}",
        ratios: "Aspect ratios", original: "Original ratio", lockRatio: "Lock aspect ratio", unlockRatio: "Unlock aspect ratio", reset: "Reset",
        output: "Output {width} × {height} px", reading: "Loading image…", resize: "Resize image", applyResize: "Create resized image",
        longEdge: "Target long edge", sampling: "Interpolation", highQuality: "High quality", bilinear: "Bilinear", nearest: "Nearest neighbor",
        atMaximum: "The image is already 4K or larger", chooseLarger: "Choose a size larger than the original",
    },
    "fr-FR": {
        crop: "Recadrer l’image", applyCrop: "Appliquer le recadrage", inputImage: "Image d’origine", cropArea: "Zone de recadrage", cropHandle: "Redimensionner le cadre {direction}",
        ratios: "Rapports d’aspect", original: "Rapport d’origine", lockRatio: "Verrouiller le rapport", unlockRatio: "Déverrouiller le rapport", reset: "Réinitialiser",
        output: "Sortie {width} × {height} px", reading: "Chargement de l’image…", resize: "Redimensionner l’image", applyResize: "Créer l’image redimensionnée",
        longEdge: "Grand côté cible", sampling: "Interpolation", highQuality: "Haute qualité", bilinear: "Bilinéaire", nearest: "Plus proche voisin",
        atMaximum: "L’image atteint déjà 4K ou plus", chooseLarger: "Choisissez une taille supérieure à l’original",
    },
    "de-DE": {
        crop: "Bild zuschneiden", applyCrop: "Zuschnitt anwenden", inputImage: "Originalbild", cropArea: "Zuschnittbereich", cropHandle: "Zuschnitt ändern: {direction}",
        ratios: "Seitenverhältnisse", original: "Originalverhältnis", lockRatio: "Seitenverhältnis sperren", unlockRatio: "Seitenverhältnis entsperren", reset: "Zurücksetzen",
        output: "Ausgabe {width} × {height} px", reading: "Bild wird geladen…", resize: "Bildgröße ändern", applyResize: "Skaliertes Bild erstellen",
        longEdge: "Lange Zielkante", sampling: "Interpolation", highQuality: "Hohe Qualität", bilinear: "Bilinear", nearest: "Nächster Nachbar",
        atMaximum: "Das Bild ist bereits 4K oder größer", chooseLarger: "Wählen Sie eine größere Größe als das Original",
    },
    "ja-JP": {
        crop: "画像を切り抜く", applyCrop: "切り抜きを適用", inputImage: "元の画像", cropArea: "切り抜き範囲", cropHandle: "切り抜き枠を調整 {direction}",
        ratios: "縦横比", original: "元の比率", lockRatio: "縦横比を固定", unlockRatio: "縦横比の固定を解除", reset: "リセット",
        output: "出力 {width} × {height} px", reading: "画像を読み込み中…", resize: "画像サイズを変更", applyResize: "拡大画像を作成",
        longEdge: "目標の長辺", sampling: "補間方式", highQuality: "高品質", bilinear: "バイリニア", nearest: "最近傍",
        atMaximum: "画像はすでに4K以上です", chooseLarger: "元の画像より大きいサイズを選択してください",
    },
    "ko-KR": {
        crop: "이미지 자르기", applyCrop: "자르기 적용", inputImage: "원본 이미지", cropArea: "자르기 영역", cropHandle: "자르기 테두리 조절 {direction}",
        ratios: "가로세로 비율", original: "원본 비율", lockRatio: "비율 잠금", unlockRatio: "비율 잠금 해제", reset: "초기화",
        output: "출력 {width} × {height} px", reading: "이미지 불러오는 중…", resize: "이미지 크기 변경", applyResize: "확대 이미지 만들기",
        longEdge: "목표 긴 변", sampling: "보간 방식", highQuality: "고품질", bilinear: "이중 선형", nearest: "최근접 이웃",
        atMaximum: "이미지가 이미 4K 이상입니다", chooseLarger: "원본보다 큰 크기를 선택하세요",
    },
    "es-ES": {
        crop: "Recortar imagen", applyCrop: "Aplicar recorte", inputImage: "Imagen original", cropArea: "Área de recorte", cropHandle: "Ajustar recorte {direction}",
        ratios: "Relaciones de aspecto", original: "Proporción original", lockRatio: "Bloquear proporción", unlockRatio: "Desbloquear proporción", reset: "Restablecer",
        output: "Salida {width} × {height} px", reading: "Cargando imagen…", resize: "Cambiar tamaño", applyResize: "Crear imagen redimensionada",
        longEdge: "Lado largo de destino", sampling: "Interpolación", highQuality: "Alta calidad", bilinear: "Bilineal", nearest: "Vecino más cercano",
        atMaximum: "La imagen ya tiene 4K o más", chooseLarger: "Elige un tamaño mayor que el original",
    },
    "pt-BR": {
        crop: "Recortar imagem", applyCrop: "Aplicar recorte", inputImage: "Imagem original", cropArea: "Área de recorte", cropHandle: "Ajustar recorte {direction}",
        ratios: "Proporções", original: "Proporção original", lockRatio: "Bloquear proporção", unlockRatio: "Desbloquear proporção", reset: "Redefinir",
        output: "Saída {width} × {height} px", reading: "Carregando imagem…", resize: "Redimensionar imagem", applyResize: "Criar imagem redimensionada",
        longEdge: "Lado maior de destino", sampling: "Interpolação", highQuality: "Alta qualidade", bilinear: "Bilinear", nearest: "Vizinho mais próximo",
        atMaximum: "A imagem já tem 4K ou mais", chooseLarger: "Escolha um tamanho maior que o original",
    },
};
