import type { InterfaceLocale } from "@/lib/interface-locale-ids";

export const creationComposerMessages = {
    "zh-CN": { waitingForSync: "待同步", sendExactCost: "消耗 {credits} 积分，发送", qualitySpeed: "优先速度", qualityPriority: "优先质量", qualityHighestResolution: "最高清晰度" },
    "zh-HK": { waitingForSync: "待同步", sendExactCost: "消耗 {credits} 積分，傳送", qualitySpeed: "優先速度", qualityPriority: "優先品質", qualityHighestResolution: "最高清晰度" },
    "zh-TW": { waitingForSync: "待同步", sendExactCost: "消耗 {credits} 點數，傳送", qualitySpeed: "優先速度", qualityPriority: "優先品質", qualityHighestResolution: "最高清晰度" },
    "en-US": { waitingForSync: "Awaiting sync", sendExactCost: "Use {credits} credits, send", qualitySpeed: "Prioritize speed", qualityPriority: "Prioritize quality", qualityHighestResolution: "Highest resolution" },
    "ja-JP": { waitingForSync: "同期待ち", sendExactCost: "{credits} クレジットで送信", qualitySpeed: "速度を優先", qualityPriority: "品質を優先", qualityHighestResolution: "最高解像度" },
    "ko-KR": { waitingForSync: "동기화 대기", sendExactCost: "{credits} 크레딧으로 전송", qualitySpeed: "속도 우선", qualityPriority: "품질 우선", qualityHighestResolution: "최고 해상도" },
    "es-ES": { waitingForSync: "Pendiente de sincronizar", sendExactCost: "Usar {credits} créditos y enviar", qualitySpeed: "Priorizar velocidad", qualityPriority: "Priorizar calidad", qualityHighestResolution: "Resolución máxima" },
    "pt-BR": { waitingForSync: "Aguardando sincronização", sendExactCost: "Usar {credits} créditos e enviar", qualitySpeed: "Priorizar velocidade", qualityPriority: "Priorizar qualidade", qualityHighestResolution: "Resolução máxima" },
    "fr-FR": { waitingForSync: "En attente de synchronisation", sendExactCost: "Utiliser {credits} crédits et envoyer", qualitySpeed: "Privilégier la vitesse", qualityPriority: "Privilégier la qualité", qualityHighestResolution: "Résolution maximale" },
    "de-DE": { waitingForSync: "Synchronisierung ausstehend", sendExactCost: "Für {credits} Credits senden", qualitySpeed: "Geschwindigkeit bevorzugen", qualityPriority: "Qualität bevorzugen", qualityHighestResolution: "Höchste Auflösung" },
} satisfies Record<InterfaceLocale, { waitingForSync: string; sendExactCost: string; qualitySpeed: string; qualityPriority: string; qualityHighestResolution: string }>;
