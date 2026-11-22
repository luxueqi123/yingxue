import type { InterfaceLocale } from "@/lib/interface-locale-ids";
import type { PrevisSaveMessageKey } from "@/lib/canvas/previs/previs-save-wiring";

export const previsSaveMessages = {
    "zh-CN": {
        saved: "已保存到云端", saving: "正在保存…", unsaved: "有未保存修改",
        failedWithDraft: "云端保存失败 · 本地草稿已保留", failedWithoutDraft: "云端保存失败 · 本地草稿也未写入",
        confirmDraftExit: "云端保存失败，但本地草稿已保留，下次打开可恢复。离开导演台？",
        blocked: "云端保存失败，本地草稿也未写入。请重试保存后再离开。",
    },
    "zh-HK": {
        saved: "已儲存至雲端", saving: "正在儲存…", unsaved: "有未儲存修改",
        failedWithDraft: "雲端儲存失敗 · 本機草稿已保留", failedWithoutDraft: "雲端儲存失敗 · 本機草稿亦未寫入",
        confirmDraftExit: "雲端儲存失敗，但本機草稿已保留，下次開啟可還原。離開導演台？",
        blocked: "雲端儲存失敗，本機草稿亦未寫入。請重試儲存後再離開。",
    },
    "zh-TW": {
        saved: "已儲存至雲端", saving: "正在儲存…", unsaved: "有未儲存的變更",
        failedWithDraft: "雲端儲存失敗 · 本機草稿已保留", failedWithoutDraft: "雲端儲存失敗 · 本機草稿也未寫入",
        confirmDraftExit: "雲端儲存失敗，但本機草稿已保留，下次開啟可還原。離開導演工作台？",
        blocked: "雲端儲存失敗，本機草稿也未寫入。請重試儲存後再離開。",
    },
    "en-US": {
        saved: "Saved to cloud", saving: "Saving…", unsaved: "Unsaved changes",
        failedWithDraft: "Cloud save failed · Local draft kept", failedWithoutDraft: "Cloud save failed · Local draft could not be saved",
        confirmDraftExit: "The cloud save failed. A local draft is available to restore next time. Leave the director desk?",
        blocked: "Cloud and local draft saves failed. Retry saving before leaving.",
    },
    "ja-JP": {
        saved: "クラウドに保存済み", saving: "保存中…", unsaved: "未保存の変更あり",
        failedWithDraft: "クラウド保存に失敗 · ローカル下書きを保持", failedWithoutDraft: "クラウド保存に失敗 · ローカル下書きも保存できません",
        confirmDraftExit: "クラウド保存に失敗しました。ローカル下書きは次回復元できます。監督デスクを閉じますか？",
        blocked: "クラウドとローカル下書きの保存に失敗しました。保存を再試行してから閉じてください。",
    },
    "ko-KR": {
        saved: "클라우드에 저장됨", saving: "저장 중…", unsaved: "저장되지 않은 변경 사항",
        failedWithDraft: "클라우드 저장 실패 · 로컬 초안 보관됨", failedWithoutDraft: "클라우드 저장 실패 · 로컬 초안도 저장되지 않음",
        confirmDraftExit: "클라우드 저장에 실패했습니다. 로컬 초안은 다음에 복원할 수 있습니다. 감독 작업대를 나갈까요?",
        blocked: "클라우드와 로컬 초안 저장에 실패했습니다. 저장을 다시 시도한 후 나가세요.",
    },
    "es-ES": {
        saved: "Guardado en la nube", saving: "Guardando…", unsaved: "Cambios sin guardar",
        failedWithDraft: "Error al guardar en la nube · Borrador local conservado", failedWithoutDraft: "Error al guardar en la nube · No se pudo guardar el borrador local",
        confirmDraftExit: "No se pudo guardar en la nube. El borrador local se podrá restaurar al volver. ¿Salir de la mesa de dirección?",
        blocked: "No se pudo guardar en la nube ni el borrador local. Vuelve a intentar guardar antes de salir.",
    },
    "pt-BR": {
        saved: "Salvo na nuvem", saving: "Salvando…", unsaved: "Alterações não salvas",
        failedWithDraft: "Falha ao salvar na nuvem · Rascunho local mantido", failedWithoutDraft: "Falha ao salvar na nuvem · Não foi possível salvar o rascunho local",
        confirmDraftExit: "Falha ao salvar na nuvem. O rascunho local poderá ser restaurado na próxima vez. Sair da mesa de direção?",
        blocked: "Falha ao salvar na nuvem e o rascunho local. Tente salvar novamente antes de sair.",
    },
    "fr-FR": {
        saved: "Enregistré dans le cloud", saving: "Enregistrement…", unsaved: "Modifications non enregistrées",
        failedWithDraft: "Échec de l’enregistrement cloud · Brouillon local conservé", failedWithoutDraft: "Échec de l’enregistrement cloud · Brouillon local non enregistré",
        confirmDraftExit: "L’enregistrement cloud a échoué. Le brouillon local pourra être restauré à la prochaine ouverture. Quitter la table de réalisation ?",
        blocked: "L’enregistrement cloud et celui du brouillon local ont échoué. Réessayez avant de quitter.",
    },
    "de-DE": {
        saved: "In der Cloud gespeichert", saving: "Wird gespeichert…", unsaved: "Ungespeicherte Änderungen",
        failedWithDraft: "Cloud-Speicherung fehlgeschlagen · Lokaler Entwurf erhalten", failedWithoutDraft: "Cloud-Speicherung fehlgeschlagen · Lokaler Entwurf nicht gespeichert",
        confirmDraftExit: "Die Cloud-Speicherung ist fehlgeschlagen. Der lokale Entwurf kann beim nächsten Öffnen wiederhergestellt werden. Regiepult verlassen?",
        blocked: "Cloud und lokaler Entwurf konnten nicht gespeichert werden. Versuchen Sie es vor dem Verlassen erneut.",
    },
} satisfies Record<InterfaceLocale, Record<PrevisSaveMessageKey, string>>;
