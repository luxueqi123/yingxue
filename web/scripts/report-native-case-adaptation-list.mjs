// 把一次全量适配的 decisions.json 汇总成人可读的《适配清单》，供交付和复查使用。
// 输入：适配输出目录（含 decisions.json）。输出：同目录下的 适配清单.json 与 适配清单.md。
// 只读 decisions/receipt，不改变任何判据，也不写工程文件。
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = process.argv[2];
if (!directory) throw Error('Usage: <adaptation-output-directory>');

const read = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const decisions = await read(resolve(directory, 'decisions.json'));
const receipt = decisions.receipt;

const SOFT = new Set(['input', 'configuration']);
const hardOf = row => (row.readiness?.requirements || []).filter(issue => !SOFT.has(issue.category));
const codesOf = row => [...new Set(hardOf(row).map(issue => issue.code))].sort();
const inputGapsOf = row => [
  ...new Set((row.readiness?.requirements || []).filter(issue => issue.category === 'input').map(issue => issue.detail)),
].sort();

/** 该节点上报的宿主合同 / 源模型，两者口径不同：合同说明适配层已映射、只等渠道；源模型说明规格尚未映射。 */
const demandsOf = row => {
  const protocols = new Map(), models = new Map();
  for (const issue of row.issues || []) {
    if (issue.code === 'channel-configuration-required') {
      try { const protocol = JSON.parse(issue.detail).protocol; if (protocol) protocols.set(protocol, (protocols.get(protocol) || 0) + 1); } catch {}
    }
    if (issue.code === 'model-selection-required') {
      try { const model = JSON.parse(issue.detail).sourceModel; if (model) models.set(model, (models.get(model) || 0) + 1); } catch {}
    }
  }
  return [
    ...[...protocols].map(([key, count]) => ({ key, state: 'contract', count })),
    ...[...models].map(([key, count]) => ({ key, state: 'source-model', count })),
  ].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

const toRow = row => ({
  id: row.id,
  name: row.name,
  hardCodes: codesOf(row),
  configOnly: hardOf(row).length === 0,
  demands: demandsOf(row),
  inputGaps: inputGapsOf(row),
});

const pending = (decisions.pendingCases || []).map(toRow);
const discarded = (decisions.discardedCases || []).map(row => ({ id: row.id, name: row.name, family: row.decision, ground: row.reason }));

const familyLabels = {
  'discarded-source-data': '来源平台未提供工程快照、工程图或可恢复媒体地址，本地归档无法重建',
  'discarded-hostless-node': '使用 LTV 独有画布节点，映雪无对应节点与源工具定义，承接等同重建原编辑器',
  'discarded-hostless-supplier': '节点供应商在映雪完全无协议（OmniHuman、speech-2.8-hd/turbo、vocal-v3、motion-3.1）',
  'discarded-hostless-capability': '源模型专属参数无宿主协议（Midjourney 滑杆、liblib LoRA、volcano 视频增强与去字幕、参考音频操作）',
  'discarded-hostless-video-batch': '源视频节点保存了批量产出（2／4 条），映雪视频链路一次只提交一个任务且节点无数量入口',
  'discarded-hostless-ltv-editor': 'LTV 编辑器字段在映雪没有对应概念（可灵主体库 subjectList 含 klingId、nebula 区域 magicList 的 {{magic:uuid:N}}）',
  'discarded-hostless-hailuo': 'MiniMax Hailuo 节点保存了映雪 MiniMax 合同无法承接的 480P 档位或生成同步声音要求',
  'discarded-hostless-ltv-private-editor': 'LTV 私有图像编辑（擦除/重绘/打光/焦点）跑在 nebula／aurora／lib-image 上，宿主无该渠道也无 originImage／mark／focusRegion／UI_KeyLight 等参数',
  'discarded-hostless-multi-prompt': '可灵自定义分镜 multi_prompt：映雪 kling-omni-video 合同明文拒绝，要求 multiPrompt 为空',
  'discarded-hostless-topaz-scale': 'topaz-video-upscaler 节点保存了属于图片模型的 scale 字段，视频 schema 为 resolution／specifiedModel／fps／slowmo',
};

const byFamily = new Map();
for (const row of discarded) byFamily.set(row.family, (byFamily.get(row.family) || 0) + 1);

const codeCounts = new Map();
for (const row of pending) for (const code of row.hardCodes) codeCounts.set(code, (codeCounts.get(code) || 0) + 1);

const contractCounts = new Map(), modelCounts = new Map();
for (const row of pending) for (const demand of row.demands) {
  const target = demand.state === 'contract' ? contractCounts : modelCounts;
  target.set(demand.key, (target.get(demand.key) || 0) + 1);
}

const sortDesc = map => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

await writeFile(resolve(directory, '适配清单.json'), JSON.stringify({ receipt, familyLabels, kept: receipt.published, discarded: discarded.length, pending: pending.length, pendingCases: pending, discardedCases: discarded }, null, 2));

const lines = [];
lines.push('# 映雪案例适配清单');
lines.push('');
lines.push(`数据来源：\`${directory.replaceAll('\\', '/')}\`（receipt / decisions，均由适配脚本实测产出）。本轮只做适配层改动，不部署。`);
lines.push('');
lines.push('## 一、总账');
lines.push('');
lines.push('| 结果 | 条数 | 说明 |');
lines.push('| --- | --- | --- |');
lines.push(`| 已保留 | ${receipt.published} | ${receipt.generative} 条制作工程（${receipt.generationNodes} 个制作节点）＋ ${receipt.resourceOnly} 条素材整理工程；封面按原资产一一对应 |`);
lines.push(`| 已舍弃 | ${receipt.discarded} | 有证据确认无法承接，分族见下 |`);
lines.push(`| 待适配 | ${receipt.pending} | 映雪底座能承接，缺渠道配置、缺用户输入或参数映射未完成 |`);
lines.push('');
lines.push(`制作模板需要用户填写的：${receipt.inputTemplates} 条。付费调用：${receipt.paidCalls}。源后端调用：${receipt.sourceBackendCalls}。`);
lines.push('');
lines.push(`## 二、已舍弃 ${receipt.discarded} 条（分族）`);
lines.push('');
lines.push('| 舍弃族 | 条数 | 依据 |');
lines.push('| --- | ---: | --- |');
for (const [family, count] of sortDesc(byFamily)) lines.push(`| ${family.replace('discarded-', '')} | ${count} | ${familyLabels[family] || '—'} |`);
lines.push('');
lines.push(`## 三、待适配 ${receipt.pending} 条`);
lines.push('');
lines.push(`其中 ${pending.filter(row => row.configOnly).length} 条只有输入或配置类缺口，其余 ${pending.filter(row => !row.configOnly).length} 条含适配层或模型规格缺口。一条案例可命中多类。`);
lines.push('');
lines.push('| 缺口代码 | 案例数 |');
lines.push('| --- | ---: |');
for (const [code, count] of sortDesc(codeCounts)) lines.push(`| \`${code}\` | ${count} |`);
lines.push('');
lines.push('## 四、待适配里的宿主合同（适配层已映射，只等渠道）');
lines.push('');
lines.push('| 合同 | 案例数 |');
lines.push('| --- | ---: |');
for (const [key, count] of sortDesc(contractCounts)) lines.push(`| \`${key}\` | ${count} |`);
lines.push('');
lines.push('## 五、待适配里的源模型（规格尚未映射，需登记渠道并映射规格）');
lines.push('');
lines.push('| 源模型 | 案例数 |');
lines.push('| --- | ---: |');
for (const [key, count] of sortDesc(modelCounts)) lines.push(`| \`${key}\` | ${count} |`);
lines.push('');
lines.push('## 六、逐条明细');
lines.push('');
lines.push('### 待适配');
lines.push('');
for (const row of pending) {
  lines.push(`- ${row.name}（\`${row.id}\`）`);
  if (row.hardCodes.length) lines.push(`  - 硬缺口：${row.hardCodes.join('、')}`);
  if (row.demands.length) lines.push(`  - 需要的合同／模型：${row.demands.map(d => `${d.key}（${d.state === 'contract' ? '等渠道' : '规格待映射'}，${d.count} 节点）`).join('；')}`);
  if (row.inputGaps.length) lines.push(`  - 待补输入：${row.inputGaps.join('；')}`);
  if (!row.hardCodes.length && !row.inputGaps.length) lines.push('  - 仅待配置');
}
lines.push('');
lines.push('### 已舍弃');
lines.push('');
for (const row of discarded) lines.push(`- ${row.name}（\`${row.id}\`）— ${row.family.replace('discarded-', '')}：${row.ground}`);
lines.push('');

await writeFile(resolve(directory, '适配清单.md'), lines.join('\n'));
console.log(JSON.stringify({ receipt: { published: receipt.published, discarded: receipt.discarded, pending: receipt.pending }, pendingConfigOnly: pending.filter(row => row.configOnly).length, discardedFamilies: Object.fromEntries(sortDesc(byFamily)), lines: lines.length }));
