import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useState } from 'react';
import { Button, Modal } from 'antd';
import type { CanvasNodeMetadata } from '@/types/canvas';

export function ImageGroundingSources({ metadata }: { metadata: CanvasNodeMetadata | undefined }) {
    const { t } = useInterfaceTranslation();
    const [open, setOpen] = useState(false);
    const grounding = metadata?.groundingMetadata;
    const sources = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks.flatMap(chunk => {
        const uri = chunk?.web?.uri;
        if (typeof uri !== 'string') return [];
        try { if (!['http:', 'https:'].includes(new URL(uri).protocol)) return []; } catch { return []; }
        return [{ uri, title: chunk.web?.title || uri }];
    }) : [];
    if (!metadata?.imageGrounding && !grounding) return null;
    const suggestions = grounding?.searchEntryPoint?.renderedContent;
    return <div data-canvas-no-zoom data-canvas-wheel-scroll>
        <Button type="text" size="small" onClick={() => setOpen(true)}>{grounding ? t("canvasCompleteUi.webSources") : t("canvasCompleteUi.webGoogle")}</Button>
        <Modal title={t("canvasCompleteUi.imageWebAssistance")} open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden>
            <p>{grounding ? t("canvasCompleteUi.returnedSourcesHelp") : t("canvasCompleteUi.groundingHelp")}</p>
            {typeof suggestions === 'string' && suggestions ? <iframe title={t("canvasCompleteUi.googleSuggestions")} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={suggestions} className="w-full min-h-40 border-0" /> : null}
            {sources.length ? <ul className="space-y-2">{sources.map((source, index) => <li key={`${index}:${source.uri}`}><a href={source.uri} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul> : null}
        </Modal>
    </div>;
}
