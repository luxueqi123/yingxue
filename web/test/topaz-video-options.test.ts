import { expect, test } from 'bun:test';
import { mapLtvTopazVideoOptions, topazVideoProviderOptions } from '../src/lib/canvas/ltv-topaz-video';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

test('原不插帧模式不把隐藏fps写成插帧；真实尺寸决定横竖屏输出', () => {
    const metadata = mapLtvTopazVideoOptions({ model: 'topaz-video-upscaler', specifiedModel: 'prob-4', resolution: '4K', fps: 30, slowmo: '1' }, { image: 0, video: 1, audio: 0 }, 1)!;
    const settings = JSON.parse(JSON.stringify(metadata.videoEnhancement));
    const { topazVideo } = topazVideoProviderOptions(settings, { width: 1470, height: 630, container: 'mp4' });
    expect(topazVideo.output.resolution).toEqual({ width: 3840, height: 1648 });
    expect(topazVideo.filters).toEqual([{ model: 'prob-4' }]);
    expect('frameRate' in topazVideo.output).toBe(false);
    expect(topazVideo.output.audioTransfer).toBe('Copy');
    expect(topazVideoProviderOptions({ ...settings, resolution: '2K' }, { width: 1080, height: 1920, container: 'mov' }).topazVideo.output.resolution).toEqual({ width: 1440, height: 2560 });
    expect(topazVideoProviderOptions(settings, { width: 5120, height: 2880, container: 'mp4' }).topazVideo.output.resolution).toEqual({ width: 5120, height: 2880 });
});

test('原插帧别名、帧率与慢放保留，不能只有插帧而失去放大', () => {
    const metadata = mapLtvTopazVideoOptions({ model: 'topaz-video-upscaler', specifiedModel: 'apf-2', resolution: '2K', frame_rate: 60, slowmo: '2' }, { image: 0, video: 1, audio: 0 }, 1)!;
    const { topazVideo } = topazVideoProviderOptions(metadata.videoEnhancement!, { width: 1920, height: 1080, container: 'mp4' });
    expect(topazVideo.filters).toEqual([{ model: 'prob-4' }, { model: 'apo-8', fps: 60, slowmo: 2 }]);
    expect(topazVideo.output.frameRate).toBe(60);
    expect(topazVideo.output.resolution).toEqual({ width: 2560, height: 1440 });
});

test('未知参数、多余输入及非插帧慢放歧义保持待适配，不降级为普通视频', () => {
    const source = { model: 'topaz-video-upscaler', specifiedModel: 'prob-4', slowmo: '2' };
    expect(mapLtvTopazVideoOptions(source, { image: 0, video: 1, audio: 0 }, 1)).toBeUndefined();
    expect(mapLtvTopazVideoOptions({ ...source, slowmo: 1, fps: 999 }, { image: 0, video: 1, audio: 0 }, 1)).toBeUndefined();
    expect(mapLtvTopazVideoOptions({ ...source, slowmo: 1 }, { image: 0, video: 1, audio: 1 }, 1)).toBeUndefined();
});

test('源工程导入保留完整视频增强设置，缺渠道不伪装成缺提示词', () => {
    const url = 'https://example.test/source.mp4';
    const result = adaptLtvNativeProject({ nodes: [
        {id:'original',type:'video',position:{x:0,y:0},data:{url:[url]}},
        {id:'enhance',type:'video',position:{x:400,y:0},data:{action:'video_generate',generatorType:'enhance',params:{model:'topaz-video-upscaler',resolution:'4K',specifiedModel:'prob-4',fps:30,slowmo:'1',videoList:[{nodeId:'original',url}]}}}
    ], edges:[{id:'edge',source:'original',target:'enhance'}] }, {channels:[]}, 'fixture', '视频增强');
    const node=result.project.nodes.find(node=>node.id==='enhance');
    expect(node?.metadata?.videoEnhancement).toEqual({provider:'topaz-video-enhance',model:'prob-4',resolution:'4K',fps:30,slowmo:1});
    expect(result.issues.some(issue=>issue.nodeId==='enhance' && issue.code==='empty-prompt')).toBe(false);
    expect(result.issues.some(issue=>issue.code==='channel-configuration-required')).toBe(true);
});
