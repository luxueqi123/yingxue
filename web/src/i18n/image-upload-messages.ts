import type { InterfaceLocale } from "@/lib/interface-locale-ids";

export const imageUploadMessages = {
    "zh-CN": { decodeFailed: "无法读取图片，请检查文件是否损坏或格式是否受支持", accountChanged: "账号已变化，本次图片上传已停止", requestFailed: "图片读取失败（{{status}}）" },
    "zh-HK": { decodeFailed: "無法讀取圖片，請檢查檔案是否損壞或格式是否受支援", accountChanged: "帳戶已變更，本次圖片上傳已停止", requestFailed: "圖片讀取失敗（{{status}}）" },
    "zh-TW": { decodeFailed: "無法讀取圖片，請檢查檔案是否損毀或格式是否支援", accountChanged: "帳號已變更，本次圖片上傳已停止", requestFailed: "圖片讀取失敗（{{status}}）" },
    "en-US": { decodeFailed: "Unable to read the image. Check for file damage or an unsupported format", accountChanged: "The account changed. This image upload was stopped", requestFailed: "Unable to retrieve the image ({{status}})" },
    "fr-FR": { decodeFailed: "Impossible de lire l’image. Vérifiez que le fichier n’est pas endommagé et que son format est pris en charge", accountChanged: "Le compte a changé. L’envoi de cette image a été arrêté", requestFailed: "Impossible de récupérer l’image ({{status}})" },
    "de-DE": { decodeFailed: "Das Bild kann nicht gelesen werden. Prüfen Sie die Datei auf Beschädigung und ein unterstütztes Format", accountChanged: "Das Konto wurde gewechselt. Dieser Bild-Upload wurde gestoppt", requestFailed: "Das Bild konnte nicht abgerufen werden ({{status}})" },
    "ja-JP": { decodeFailed: "画像を読み込めません。ファイルの破損や対応形式を確認してください", accountChanged: "アカウントが変更されたため、この画像のアップロードを停止しました", requestFailed: "画像を取得できませんでした（{{status}}）" },
    "ko-KR": { decodeFailed: "이미지를 읽을 수 없습니다. 파일 손상 여부와 지원 형식을 확인하세요", accountChanged: "계정이 변경되어 이 이미지 업로드를 중지했습니다", requestFailed: "이미지를 가져오지 못했습니다({{status}})" },
    "es-ES": { decodeFailed: "No se puede leer la imagen. Comprueba si el archivo está dañado o si el formato no es compatible", accountChanged: "La cuenta ha cambiado. Se ha detenido esta carga de imagen", requestFailed: "No se pudo obtener la imagen ({{status}})" },
    "pt-BR": { decodeFailed: "Não foi possível ler a imagem. Verifique se o arquivo está corrompido ou se o formato é compatível", accountChanged: "A conta mudou. O envio desta imagem foi interrompido", requestFailed: "Não foi possível obter a imagem ({{status}})" },
} satisfies Record<InterfaceLocale, { decodeFailed: string; accountChanged: string; requestFailed: string }>;
