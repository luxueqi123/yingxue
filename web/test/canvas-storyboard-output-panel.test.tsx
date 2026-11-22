import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CanvasScriptNodeContent } from '../src/components/canvas/canvas-script-node';
import { createCanvasNode, createStoryboardRow } from '../src/lib/canvas/canvas-project-domain';
import { deriveStoryboardPipelineProgress } from '../src/lib/canvas/canvas-storyboard-progress';
import { CanvasNodeType, type CanvasGenerationBatch, type CanvasGenerationBatchItemStatus } from '../src/types/canvas';

test.each([
    ['failed', 'succeeded', '成功 1/2 · 失败 1'],
    ['succeeded', 'failed', '成功 1/2 · 失败 1'],
    ['running', 'succeeded', '成功 1/2 · 生成中 1'],
    ['waiting', 'succeeded', '成功 1/2 · 等待 1'],
    ['succeeded', 'succeeded', '成功 2/2'],
] as const)('rendered row aggregates output states %s and %s', (first, second, expected) => {
    const row = createStoryboardRow(1);
    const script = createCanvasNode(CanvasNodeType.Script, { x: 0, y: 0 }, { storyboard: { rows: [row], visibleColumns: [], referenceNodeIds: [] } });
    script.height = 600;
    const item = (id: string, status: CanvasGenerationBatchItemStatus) => ({ id, nodeId: id, rowId: row.id, status, retryCount: 0 });
    const batch: CanvasGenerationBatch = { id: 'batch', projectId: 'fixture', sourceNodeId: script.id, mode: 'storyboard_image', status: 'partial_failed', items: [item('first', first), item('second', second)], createdAt: '', updatedAt: '' };
    const noop = () => {};
    const markup = renderToStaticMarkup(<CanvasScriptNodeContent node={script} nodes={[script]} batch={batch} pipeline={deriveStoryboardPipelineProgress(script, [script], [])}
        scale={1} mentionReferences={[]} onOpen={noop} onCreateImageNodes={noop} onCreateVideoNodes={noop} onGenerateImages={noop} onGenerateVideos={noop}
        onVideoInputModeChange={noop} onMergeVideos={noop} onCreateActionBoards={noop} onRetryBatch={noop} onRetryBatchItem={noop} onStopBatch={noop}
        onAddRow={noop} onRemoveRow={noop} onUpdateRow={noop} onPromptChange={noop} onGenerateScript={noop} onModelChange={noop} onImageModelChange={noop}
        onShotDurationChange={noop} onShotCountChange={noop} onComposerHeightChange={noop} onConnectStart={noop} onScrollTopChange={noop} />);
    expect([...markup.matchAll(/title="([^"]*)"/g)].map(match => match[1])).toContain(expected);
});
