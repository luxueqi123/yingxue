import type { InterfaceLocale } from "@/lib/interface-locale-ids";

const chinese = {
    viewCharacter: "查看角色详情", viewNode: "查看节点信息", nodeInfo: "节点信息", nodeManagement: "节点管理", regenerate: "重新生成", retryFailed: "重试失败项", retry: "重试",
    extractFrames: "提取画面", extractAudio: "提取音频", extractingAudio: "正在提取音频", assets: "素材", downloadAudio: "下载音频", downloadVideo: "下载视频", downloadImage: "下载图片", download: "下载",
    edit: "编辑", textGeneration: "文本生成", generationSettings: "生成设置", generationInfo: "生成信息", enlargeText: "放大编辑文本", enlarge: "放大编辑", generateFromText: "用文本生图", generateImage: "生图", generationConfig: "生成配置",
    zoomOut: "缩小", zoomIn: "放大", uploadImage: "上传图片", subtitles: "字幕", adopt: "采用到短剧", drama: "短剧", versionHistory: "版本历史", versionGroup: "版本",
};
type Messages = Record<keyof typeof chinese, string>;
const traditional: Messages = {
    viewCharacter: "查看角色詳情", viewNode: "查看節點資訊", nodeInfo: "節點資訊", nodeManagement: "節點管理", regenerate: "重新產生", retryFailed: "重試失敗項目", retry: "重試",
    extractFrames: "擷取畫面", extractAudio: "擷取音訊", extractingAudio: "正在擷取音訊", assets: "素材", downloadAudio: "下載音訊", downloadVideo: "下載影片", downloadImage: "下載圖片", download: "下載",
    edit: "編輯", textGeneration: "文字生成", generationSettings: "生成設定", generationInfo: "生成資訊", enlargeText: "放大編輯文字", enlarge: "放大編輯", generateFromText: "以文字生成圖片", generateImage: "生圖", generationConfig: "生成設定",
    zoomOut: "縮小", zoomIn: "放大", uploadImage: "上傳圖片", subtitles: "字幕", adopt: "採用到短劇", drama: "短劇", versionHistory: "版本記錄", versionGroup: "版本",
};
export const nodeToolCommonMessages: Record<InterfaceLocale, Messages> = {
    "zh-CN": chinese, "zh-HK": traditional, "zh-TW": traditional,
    "en-US": {
        viewCharacter: "View character details", viewNode: "View node information", nodeInfo: "Node information", nodeManagement: "Node management", regenerate: "Regenerate", retryFailed: "Retry failed items", retry: "Retry",
        extractFrames: "Extract frames", extractAudio: "Extract audio", extractingAudio: "Extracting audio", assets: "Assets", downloadAudio: "Download audio", downloadVideo: "Download video", downloadImage: "Download image", download: "Download",
        edit: "Edit", textGeneration: "Generate text", generationSettings: "Generation settings", generationInfo: "Generation information", enlargeText: "Expand text editor", enlarge: "Expand editor", generateFromText: "Generate image from text", generateImage: "Generate image", generationConfig: "Generation configuration",
        zoomOut: "Zoom out", zoomIn: "Zoom in", uploadImage: "Upload image", subtitles: "Subtitles", adopt: "Use in drama", drama: "Drama", versionHistory: "Version history", versionGroup: "Versions",
    },
    "fr-FR": {
        viewCharacter: "Voir les détails du personnage", viewNode: "Voir les informations du nœud", nodeInfo: "Informations du nœud", nodeManagement: "Gestion du nœud", regenerate: "Régénérer", retryFailed: "Réessayer les éléments en échec", retry: "Réessayer",
        extractFrames: "Extraire des images", extractAudio: "Extraire l’audio", extractingAudio: "Extraction de l’audio", assets: "Médias", downloadAudio: "Télécharger l’audio", downloadVideo: "Télécharger la vidéo", downloadImage: "Télécharger l’image", download: "Télécharger",
        edit: "Modifier", textGeneration: "Générer du texte", generationSettings: "Réglages de génération", generationInfo: "Informations de génération", enlargeText: "Agrandir l’éditeur de texte", enlarge: "Agrandir l’éditeur", generateFromText: "Générer une image à partir du texte", generateImage: "Générer une image", generationConfig: "Configuration de génération",
        zoomOut: "Réduire", zoomIn: "Agrandir", uploadImage: "Importer une image", subtitles: "Sous-titres", adopt: "Utiliser dans la série", drama: "Série", versionHistory: "Historique des versions", versionGroup: "Versions",
    },
    "de-DE": {
        viewCharacter: "Figurendetails anzeigen", viewNode: "Knoteninformationen anzeigen", nodeInfo: "Knoteninformationen", nodeManagement: "Knotenverwaltung", regenerate: "Neu erzeugen", retryFailed: "Fehlgeschlagene Elemente wiederholen", retry: "Erneut versuchen",
        extractFrames: "Bilder extrahieren", extractAudio: "Audio extrahieren", extractingAudio: "Audio wird extrahiert", assets: "Medien", downloadAudio: "Audio herunterladen", downloadVideo: "Video herunterladen", downloadImage: "Bild herunterladen", download: "Herunterladen",
        edit: "Bearbeiten", textGeneration: "Text erzeugen", generationSettings: "Erzeugungseinstellungen", generationInfo: "Erzeugungsinformationen", enlargeText: "Texteditor vergrößern", enlarge: "Editor vergrößern", generateFromText: "Bild aus Text erzeugen", generateImage: "Bild erzeugen", generationConfig: "Erzeugungskonfiguration",
        zoomOut: "Verkleinern", zoomIn: "Vergrößern", uploadImage: "Bild hochladen", subtitles: "Untertitel", adopt: "In Serie verwenden", drama: "Serie", versionHistory: "Versionsverlauf", versionGroup: "Versionen",
    },
    "ja-JP": {
        viewCharacter: "キャラクター詳細を表示", viewNode: "ノード情報を表示", nodeInfo: "ノード情報", nodeManagement: "ノード管理", regenerate: "再生成", retryFailed: "失敗した項目を再試行", retry: "再試行",
        extractFrames: "フレームを抽出", extractAudio: "音声を抽出", extractingAudio: "音声を抽出中", assets: "素材", downloadAudio: "音声をダウンロード", downloadVideo: "動画をダウンロード", downloadImage: "画像をダウンロード", download: "ダウンロード",
        edit: "編集", textGeneration: "テキスト生成", generationSettings: "生成設定", generationInfo: "生成情報", enlargeText: "テキストエディターを拡大", enlarge: "エディターを拡大", generateFromText: "テキストから画像を生成", generateImage: "画像生成", generationConfig: "生成構成",
        zoomOut: "縮小", zoomIn: "拡大", uploadImage: "画像をアップロード", subtitles: "字幕", adopt: "ドラマに採用", drama: "ドラマ", versionHistory: "バージョン履歴", versionGroup: "バージョン",
    },
    "ko-KR": {
        viewCharacter: "캐릭터 상세 보기", viewNode: "노드 정보 보기", nodeInfo: "노드 정보", nodeManagement: "노드 관리", regenerate: "다시 생성", retryFailed: "실패한 항목 다시 시도", retry: "다시 시도",
        extractFrames: "프레임 추출", extractAudio: "오디오 추출", extractingAudio: "오디오 추출 중", assets: "에셋", downloadAudio: "오디오 다운로드", downloadVideo: "동영상 다운로드", downloadImage: "이미지 다운로드", download: "다운로드",
        edit: "편집", textGeneration: "텍스트 생성", generationSettings: "생성 설정", generationInfo: "생성 정보", enlargeText: "텍스트 편집기 확대", enlarge: "편집기 확대", generateFromText: "텍스트로 이미지 생성", generateImage: "이미지 생성", generationConfig: "생성 구성",
        zoomOut: "축소", zoomIn: "확대", uploadImage: "이미지 업로드", subtitles: "자막", adopt: "드라마에 사용", drama: "드라마", versionHistory: "버전 기록", versionGroup: "버전",
    },
    "es-ES": {
        viewCharacter: "Ver detalles del personaje", viewNode: "Ver información del nodo", nodeInfo: "Información del nodo", nodeManagement: "Gestión del nodo", regenerate: "Regenerar", retryFailed: "Reintentar elementos fallidos", retry: "Reintentar",
        extractFrames: "Extraer fotogramas", extractAudio: "Extraer audio", extractingAudio: "Extrayendo audio", assets: "Recursos", downloadAudio: "Descargar audio", downloadVideo: "Descargar vídeo", downloadImage: "Descargar imagen", download: "Descargar",
        edit: "Editar", textGeneration: "Generar texto", generationSettings: "Ajustes de generación", generationInfo: "Información de generación", enlargeText: "Ampliar editor de texto", enlarge: "Ampliar editor", generateFromText: "Generar imagen a partir de texto", generateImage: "Generar imagen", generationConfig: "Configuración de generación",
        zoomOut: "Alejar", zoomIn: "Acercar", uploadImage: "Subir imagen", subtitles: "Subtítulos", adopt: "Usar en la serie", drama: "Serie", versionHistory: "Historial de versiones", versionGroup: "Versiones",
    },
    "pt-BR": {
        viewCharacter: "Ver detalhes do personagem", viewNode: "Ver informações do nó", nodeInfo: "Informações do nó", nodeManagement: "Gerenciar nó", regenerate: "Gerar novamente", retryFailed: "Tentar novamente os itens com falha", retry: "Tentar novamente",
        extractFrames: "Extrair quadros", extractAudio: "Extrair áudio", extractingAudio: "Extraindo áudio", assets: "Recursos", downloadAudio: "Baixar áudio", downloadVideo: "Baixar vídeo", downloadImage: "Baixar imagem", download: "Baixar",
        edit: "Editar", textGeneration: "Gerar texto", generationSettings: "Ajustes de geração", generationInfo: "Informações de geração", enlargeText: "Ampliar editor de texto", enlarge: "Ampliar editor", generateFromText: "Gerar imagem a partir de texto", generateImage: "Gerar imagem", generationConfig: "Configuração de geração",
        zoomOut: "Diminuir zoom", zoomIn: "Aumentar zoom", uploadImage: "Enviar imagem", subtitles: "Legendas", adopt: "Usar na série", drama: "Série", versionHistory: "Histórico de versões", versionGroup: "Versões",
    },
};
