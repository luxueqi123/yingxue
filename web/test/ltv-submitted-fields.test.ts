import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectLtvSubmittedFields } from '../src/lib/canvas/ltv-parameter-layers';

test('source mode filtering preserves aliases shared by active fields and unknown requirements', () => {
    const schema = { properties: { ratio: {}, ratioAuto: { originalField: 'ratio' }, style: {}, search: { originalField: 'search_enabled' } }, config: { settings: { text2video: ['ratio'], frames2video: ['ratioAuto'] }, advancedSettings: { text2video: ['style', 'search'], frames2video: [] } } };
    const params = { modeType: 'frames2video', settings: { ratio: '16:9' }, advancedSettings: { style: 'anime', search_enabled: 1, unknownCreativeOption: 9 } };
    const before = JSON.stringify(params);
    const result = projectLtvSubmittedFields(params, schema, 'video');
    assert.equal(result.fields.ratio, '16:9');
    assert.equal(result.fields.unknownCreativeOption, 9);
    assert.deepEqual(result.removedFields, ['style', 'search_enabled']);
    assert.equal(JSON.stringify(params), before);
});

test('flat and grouped settings are retained, missing schema never discards parameters', () => {
    const params = { modeType: 'text2audio', advancedSettings: { voice_setting_speed: 1.4, custom: true } };
    const schema = { properties: { speed: { originalField: 'voice_setting_speed' } }, config: { advancedSettings: [{ fields: ['speed'] }] } };
    assert.equal(projectLtvSubmittedFields(params, schema, 'audio').fields.voice_setting_speed, 1.4);
    assert.equal(projectLtvSubmittedFields(params, undefined, 'audio').fields.custom, true);
});

test('image path does not apply a video-only source filter', () => {
    const params = { modeType: 'image2image', advancedSettings: { style: 'anime' } };
    const schema = { properties: { style: {} }, config: { advancedSettings: { text2video: ['style'], image2image: [] } } };
    assert.equal(projectLtvSubmittedFields(params, schema, 'image').fields.style, 'anime');
});

test('inactive source selectors are removed but selected model assets and layer overrides remain', () => {
    const source = { fineTuneType: 'template', fineTuneModels: [], multi_prompt: [{ prompt: 'old shot' }], settings: { multi_shot: false } };
    const before = JSON.stringify(source);
    const result = projectLtvSubmittedFields(source, undefined, 'image');
    assert.deepEqual(result.removedFields, ['fineTuneType', 'fineTuneModels', 'multi_prompt']);
    assert.equal(JSON.stringify(source), before);
    const selected = { ...source, fineTuneModels: [{ versionId: 'required-asset' }] };
    assert.deepEqual(projectLtvSubmittedFields(selected, undefined, 'image').fields.fineTuneModels, selected.fineTuneModels);
    assert.equal(projectLtvSubmittedFields({ ...source, settings: { multi_shot: true } }, undefined, 'video').fields.multi_prompt, source.multi_prompt);
    const nested = { ...source, advancedSettings: { fineTuneType: 'required', multi_prompt: ['active'] } };
    const projected = projectLtvSubmittedFields(nested, undefined, 'video');
    assert.equal(projected.fields.fineTuneType, 'required');
    assert.deepEqual(projected.fields.multi_prompt, ['active']);
    assert.deepEqual(projectLtvSubmittedFields({ fineTuneType: 'lora', fineTuneModels: 'invalid' }, undefined, 'image').fields.fineTuneModels, 'invalid');
});
