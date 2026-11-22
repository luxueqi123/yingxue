import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Offline audit: inputs are existing files. No model, network or production writes.
globalThis.fetch = () => { throw new Error('Network disabled in inspiration audit'); };
const [assetRoot, cacheRoot, catalogPath, outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error('Usage: node web/scripts/audit-inspiration-library.mjs <ltv-assets> <snapshot-cache> <safe-model-catalog> <output>');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const esbuild = require(resolve(root, 'canvas-agent/node_modules/esbuild'));
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function module(path) {
 const result = await esbuild.build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false });
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { buildLtvReferencePlan } = await module('web/src/lib/canvas/ltv-reference-plan.ts');
const { readLtvParameterLayers } = await module('web/src/lib/canvas/ltv-parameter-layers.ts');
const { assessLtvGenerationCase } = await module('web/src/lib/canvas/ltv-generation-compatibility.ts');
const originalPath = resolve(assetRoot, '04_画布模板库/_画布模板总表1024条_含成片链接.json');
const originals = await json(originalPath);
const index = await json(resolve(cacheRoot, 'snapshot-results.json'));
const sourceSpecs = await json(resolve(cacheRoot, 'source-tool-spec.json'));
const catalog = await json(catalogPath);
const publicCatalog = await json(resolve(root, 'web/public/production-library/published-catalog.json'));
const allCatalog = await json(resolve(root, 'web/public/production-library/catalog.json'));
const support = await json(resolve(root, 'web/src/lib/production-case-support.json'));
const byId = new Map(index.map(x => [x.id, x]));
const approved = new Map(support.map(x => [x.id, x]));
// Runtime loadProductionCatalog intersects the static catalog with caseSupport.
const published = new Map(publicCatalog.items.filter(x => x.kind === 'case' && approved.has(x.id)).map(x => [x.id, x]));
const metadata = new Map(allCatalog.items.filter(x => x.kind === 'case').map(x => [x.id, x]));
if (new Set(originals.map(x => x.templateUuid)).size !== originals.length || byId.size !== index.length) throw new Error('Duplicate catalog ID');
const schemas = new Map();
const schemaErrors = [];
for (const spec of sourceSpecs.data.tools) {
 try { schemas.set(`${spec.type}:${spec.toolKey}`, JSON.parse(spec.metadata)); }
 catch { schemaErrors.push(`${spec.type}:${spec.toolKey}`); }
}
const contracts = new Map(), mediaDependencies = new Map(), reports = [];
const count = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const strings = value => Array.isArray(value) ? value.filter(x => typeof x === 'string') : typeof value === 'string' && value ? [value] : [];
const validMedia = value => { try { const u = new URL(value); return ['http:', 'https:', 'data:'].includes(u.protocol); } catch { return false; } };
for (const source of originals) {
 const id = `case-${source.templateUuid}`, cached = byId.get(id), local = metadata.get(id), entry = approved.get(id);
 const row = { id, name: source.name, published: published.has(id), snapshotStatus: cached?.status || 'index-missing', nodes: 0, edges: 0, generationNodes: 0,
  models: [], actions: {}, parameterNodes: 0, referencePlansPassed: 0, mediaDependencyCount: 0, issues: [], parameterReview: [], contracts: [], staticImport: 'not-published' };
 const add = (code, nodeId = '', detail = '') => row.issues.push({ code, nodeId, detail });
 if (!local) add('catalog-item-missing');
 else {
  if (local.cover !== source.coverUrl) add('cover-source-mismatch');
  if (local.media !== source.finalOutput) add('preview-source-mismatch');
  if ((local.sourceProjectId || local.projectId) !== source.projectUuid) add('project-source-mismatch');
 }
 if (!source.coverUrl) add('source-cover-missing');
 if (!source.finalOutput) add('source-preview-missing');
 if (row.published && !entry) add('published-without-import-support');
 let snapshot;
 if (cached?.file && basename(cached.file) === cached.file) {
  try {
   const bytes = await readFile(resolve(cacheRoot, cached.file)); row.snapshotSha256 = hash(bytes);
   const response = JSON.parse(bytes); if ('code' in response && response.code !== 0) throw new Error('source business error');
   snapshot = JSON.parse(response.data.detail.snapshotData);
   if (snapshot && !Object.keys(snapshot).length) snapshot = { nodes: [], edges: [] };
   if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) throw new Error('invalid graph');
  } catch { snapshot = undefined; add('snapshot-unavailable', '', '缓存无有效工程，无法静态证明内部功能'); }
 } else add('snapshot-unavailable', '', '缺少工程快照；保留来源目录记录');
 if (snapshot) {
  row.nodes = snapshot.nodes.length; row.edges = snapshot.edges.length;
  const nodes = new Map(snapshot.nodes.map(n => [n.id, n]));
  const resources = new Map(snapshot.nodes.map(n => [n.id, { kind: n.type, urls: strings(n.data?.url) }]));
  if (!row.nodes) add('empty-graph');
  if (nodes.size !== row.nodes) add('duplicate-node-id');
  const edges = new Set();
  for (const e of snapshot.edges) {
   if (!nodes.has(e.source) || !nodes.has(e.target)) add('dangling-edge', '', e.id || '');
   if (e.source === e.target) add('self-edge', e.source);
   if (e.id && edges.has(e.id)) add('duplicate-edge-id', '', e.id); edges.add(e.id);
  }
  const caseMedia = new Set();
  for (const n of snapshot.nodes) {
   const d = n.data || {}, p = d.params, action = String(d.action || '');
   row.actions[action || '(none)'] = (row.actions[action || '(none)'] || 0) + 1;
   if (!n.id || typeof n.id !== 'string') add('invalid-node-id');
   if (!n.position || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y)) add('invalid-position', n.id);
   if (n.parentId && !nodes.has(n.parentId)) add('missing-parent', n.id);
   const visited = new Set([n.id]); let parent = n.parentId;
   while (parent && nodes.has(parent)) { if (visited.has(parent)) { add('parent-cycle', n.id); break; } visited.add(parent); parent = nodes.get(parent).parentId; }
   if (!['image', 'video', 'audio', 'text', 'group'].includes(n.type)) add('special-node-adapter-required', n.id, String(n.type));
   for (const url of strings(d.url)) {
    caseMedia.add(url); if (!validMedia(url)) add('invalid-media-address', n.id);
    if (!mediaDependencies.has(url)) mediaDependencies.set(url, { sha256: hash(url), kind: n.type, cases: new Set(), nodes: 0, protocol: url.split(':')[0], localFileVerified: false });
    const dep = mediaDependencies.get(url); dep.cases.add(id); dep.nodes++;
   }
   if (action.endsWith('_resource') && ['image', 'video', 'audio'].includes(n.type) && !strings(d.url).length) add('resource-content-missing', n.id);
   if (action.endsWith('_generate')) row.generationNodes++;
   if (!p || typeof p !== 'object' || Array.isArray(p)) { if (action.endsWith('_generate')) add('generation-params-missing', n.id); continue; }
   row.parameterNodes++;
   const layers = readLtvParameterLayers(p), fields = layers.fields, model = String(fields.model || ''), schema = schemas.get(`${n.type}:${model}`);
   if (model && !row.models.includes(model)) row.models.push(model);
   const key = `${n.type}|${action}|${model}|${fields.modeType || ''}`;
   if (!contracts.has(key)) contracts.set(key, { type: n.type, action, sourceModel: model, sourceModelName: schema?.modelName || '', mode: fields.modeType || '', nodes: 0, cases: new Set(), fields: new Map(), schemaAvailable: Boolean(schema),
    targetNodeAvailable: ['image','video','audio','text','group'].includes(n.type),
    targetAdapter: action.endsWith('_resource') ? '素材导入路径；另检内容/引用/保存限制' : model === 'star-video2.5' ? '已有引用及NewAPI参数适配；搜索/textList/认证与真实下载仍有缺口' : '未建立该源合同的等价映射；不按模型名称猜测',
    sourceCode: '01_前端完整工程（源tool_spec/list及保存快照）', targetCode: action.endsWith('_resource') ? 'web/src/services/production-case-project.ts' : 'web/src/lib/canvas/ltv-generation-compatibility.ts' });
   const contract = contracts.get(key); contract.nodes++; contract.cases.add(id); row.contracts.push(key);
   for (const field of Object.keys(fields)) count(contract.fields, field);
   if (action.endsWith('_generate') && !schema) add('source-model-schema-missing', n.id, model);
   const entries = Object.entries(schema?.properties || {});
   const review = { nodeId: n.id, model, mode: fields.modeType || '', keys: Object.keys(fields), advancedKeys: layers.advancedKeys, textInputs: layers.texts.length, nonSchemaKeys: [], enumReview: [], requiredAdapters: [] };
   for (const [key, value] of Object.entries(fields)) {
    const prop = entries.find(([name, spec]) => name === key || spec.originalField === key)?.[1];
    if (!prop) { if (!key.startsWith('_')) review.nonSchemaKeys.push(key); continue; }
    if (Array.isArray(prop.enum) && ['string', 'number', 'boolean'].includes(typeof value)) {
     const choices = prop.enum.map(x => x && typeof x === 'object' ? x.value : x);
     if (!choices.includes(value)) review.enumReview.push(key); // Conditional source schemas require review, not an automatic rejection.
    }
   }
   for (const key of ['search_enabled', 'searchEnabled', 'searchable', 'autoCompliance']) {
    const prop = entries.find(([name, spec]) => name === key || spec.originalField === key)?.[1];
    if (fields[key] !== undefined || prop?.default !== undefined) {
     const effective = fields[key] ?? prop?.default;
     review.requiredAdapters.push({ field: key, origin: fields[key] === undefined ? 'source-default' : 'saved', enabled: effective === 1 || effective === true || effective === 'on', value: effective });
    }
   }
   if (layers.texts.length) review.requiredAdapters.push({ field: 'textList', count: layers.texts.length });
   if (fields.cameraControl?.enabled) review.requiredAdapters.push({ field: 'cameraControl' });
   if (fields.count !== undefined && Number(fields.count) !== 1) review.requiredAdapters.push({ field: 'count', value: fields.count });
   if (Object.keys(p).some(k => /List(?:Order)?$/.test(k)) || /\{\{(?:Image|Video|Audio|Mixed|Portrait)/.test(String(fields.prompt || ''))) {
    try { buildLtvReferencePlan({ ...p, prompt: fields.prompt }, resources); row.referencePlansPassed++; }
    catch (error) { add('reference-plan-invalid', n.id, error.message); }
   }
   for (const ref of Array.isArray(p.textList) ? p.textList : []) {
    if (ref.nodeId && (!nodes.has(ref.nodeId) || nodes.get(ref.nodeId).type !== 'text')) add('text-reference-missing-or-wrong-type', n.id, String(ref.nodeId));
   }
   row.parameterReview.push(review);
  }
  row.mediaDependencyCount = caseMedia.size;
  try {
   const assessment = assessLtvGenerationCase(snapshot, catalog);
   row.compatibilityIssues = assessment.issues;
   row.routeCandidates = assessment.routes.map(({ nodeId, model, issues }) => ({ nodeId, model, issues }));
   row.compatibilityStaticPassed = assessment.executable;
  } catch { add('compatibility-check-error'); }
  if (entry) {
   try {
    const bytes = await readFile(resolve(root, `web/public${entry.snapshotPath}`)); const converted = JSON.parse(bytes);
    if (hash(bytes) !== entry.sha256 || converted.id !== id || converted.nodes.length !== entry.nodeCount || converted.connections.length !== entry.connectionCount) throw new Error('published hash/count');
    if (snapshot.nodes.length !== converted.nodes.length || snapshot.edges.length !== converted.connections.length) throw new Error('source node/edge count');
    const sourceNodes = new Map(snapshot.nodes.map(n => [n.id,n]));
    const groups = new Map(snapshot.nodes.filter(n=>n.type==='group').flatMap(n=>(n.data?.childNodeIds || []).map(child=>[child,n.id])));
    for (const n of converted.nodes) {
     const original = sourceNodes.get(n.metadata?.importSource?.nodeKey);
     if (!original || n.id !== original.id || n.type !== (original.type==='group'?'frame':original.type)) throw new Error('source identity/type');
     const d = original.data || {}, content = original.type === 'text' ? (d.content || [''])[0] : (d.url || [''])[0];
     if ((n.metadata?.content || '') !== (content || '') || n.title !== (d.name || original.type)) throw new Error('source content/title');
     if (n.parentId !== (original.parentId || groups.get(original.id))) throw new Error('source group membership');
     for (const axis of ['x','y']) if (n.position[axis] !== original.position[axis] + (original.parentId ? sourceNodes.get(original.parentId).position[axis] : 0)) throw new Error('source position');
    }
    row.staticImport = 'hash-and-count-pass';
   } catch { row.staticImport = 'failed'; add('published-engineering-integrity-failed'); }
  }
 }
 row.contracts = [...new Set(row.contracts)];
 row.issueCodes = [...new Set([...row.issues.map(x => x.code), ...(row.compatibilityIssues || []).map(x => x.code)])];
 row.classification = !snapshot ? '快照缺失或错误' : !row.nodes ? '空工程' : row.issues.some(x => ['dangling-edge','duplicate-node-id','invalid-node-id','missing-parent','parent-cycle'].includes(x.code)) ? '工程结构需修复' : row.generationNodes ? '生成链路待适配' : row.published && row.staticImport !== 'failed' && !row.issues.length ? '已公开素材画布' : '非生成工程待核对';
 reports.push(row);
}
if (reports.length !== originals.length || reports.some(x => !x.classification)) throw new Error('Incomplete audit coverage');
const classes = {}, blockers = {};
for (const row of reports) { classes[row.classification] = (classes[row.classification] || 0) + 1; for (const code of row.issueCodes) blockers[code] = (blockers[code] || 0) + 1; }
const contractRows = [...contracts.values()].map(x => ({ ...x, cases: [...x.cases], fields: Object.fromEntries(x.fields) }));
const sourceFiles = ['web/src/components/production/inspiration-gallery.tsx','web/src/services/production-library.ts','web/src/lib/verified-production-assets.ts','web/src/services/production-case-project.ts','web/src/hooks/use-production-launch.ts','web/src/services/user-data-sync.ts','web/src/services/api/user-data.ts','backend/internal/handler/user_data.go','web/src/lib/canvas/ltv-reference-plan.ts','web/src/lib/canvas/ltv-parameter-layers.ts','web/src/lib/canvas/ltv-runtime-references.ts','web/src/components/canvas/canvas-node-generation.ts','web/src/services/api/video-provider-newapi.ts','backend/internal/app/provider_protocol.go','plugin-packages/newapi-video-generations-v1/manifest.json','web/vite-plugins/ltv-case-library.ts','nginx.conf'];
const sourceCodeHashes = [];
for (const path of sourceFiles) sourceCodeHashes.push({path,sha256:hash(await readFile(resolve(root,path)))});
const summary = { sourceCases: originals.length, auditedCases: reports.length, omittedCases: 0, paidGenerationCalls: 0, networkCalls: 0, classifications: classes, blockers,
 nodes: reports.reduce((a,x) => a+x.nodes,0), parameterNodes: reports.reduce((a,x) => a+x.parameterNodes,0), generationNodes: reports.reduce((a,x) => a+x.generationNodes,0),
 uniqueMediaDependencies: mediaDependencies.size, sharedContracts: contracts.size, sourceSchemaCount: schemas.size, schemaErrors,
 originalCatalogSha256: hash(await readFile(originalPath)), modelCatalogSha256: hash(await readFile(catalogPath)),
 boundary: '全量离线静态查验完成；远端素材当前可访问性和生成质量未由静态审计证明。未修改公开名单。候选渠道不等于模型质量等价。' };
await mkdir(outputPath, { recursive: true });
await writeFile(resolve(outputPath,'summary.json'),JSON.stringify(summary,null,2));
await writeFile(resolve(outputPath,'cases.json'),JSON.stringify(reports));
await writeFile(resolve(outputPath,'shared-contracts.json'),JSON.stringify(contractRows,null,2));
await writeFile(resolve(outputPath,'code-evidence.json'),JSON.stringify(sourceCodeHashes,null,2));
await writeFile(resolve(outputPath,'media-dependencies.json'),JSON.stringify([...mediaDependencies.values()].map(x=>({...x,cases:[...x.cases]}))));
const csv = x => `"${String(x ?? '').replaceAll('"','""')}"`;
const columns = ['id','name','classification','published','nodes','edges','generationNodes','parameterNodes','referencePlansPassed','mediaDependencyCount','models','issueCodes'];
await writeFile(resolve(outputPath,'逐项查验.csv'),'\uFEFF'+[columns.map(csv).join(','),...reports.map(x=>columns.map(k=>csv(Array.isArray(x[k])?x[k].join('；'):x[k])).join(','))].join('\r\n'));
const compact = reports.map(({id,name,classification,published,nodes,edges,generationNodes,models,issueCodes,staticImport})=>({id,name,classification,published,nodes,edges,generationNodes,models,issueCodes,staticImport}));
await writeFile(resolve(outputPath,'灵感广场全量查验.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>灵感广场全量查验</title><style>body{font:15px system-ui;background:#101319;color:#eee;margin:32px auto;max-width:1300px;padding:0 20px}h1{font-size:26px}p{color:#c5cbd5;line-height:1.7}input,select{padding:12px;background:#202631;color:white;border:1px solid #465164;border-radius:8px;margin:0 12px 20px 0}input{width:340px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:14px 10px;border-bottom:1px solid #303844;vertical-align:top}small{color:#abb6c5}details{max-width:450px}summary{cursor:pointer}code{overflow-wrap:anywhere}a{color:#a7c4ff}</style><h1>灵感广场 · 1024条全量查验</h1><p>全部逐项检查，付费生成请求 0。检查原始目录、工程结构、参数分层、模型规格、素材引用与共用协议。静态结论不冒充成片质量验收。未变更线上公开名单。</p><p>${Object.entries(classes).map(([k,v])=>`${k}：${v}`).join('　｜　')}</p><p><a href="逐项查验.csv">完整CSV</a> · <a href="cases.json">节点级参数与缺口JSON</a> · <a href="shared-contracts.json">共用功能合同</a></p><input id="q" placeholder="搜索名称、ID、模型、问题代码"><select id="s"><option value="">全部状态</option>${Object.keys(classes).map(k=>`<option>${k}</option>`).join('')}</select><span id="count"></span><table><thead><tr><th>案例</th><th>查验结论</th><th>工程</th><th>模型与缺口</th></tr></thead><tbody id="rows"></tbody></table><script>const data=${JSON.stringify(compact).replaceAll('<','\\u003c')};const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function render(){const q=document.querySelector('#q').value.toLowerCase(),s=document.querySelector('#s').value;const list=data.filter(x=>(!s||x.classification===s)&&JSON.stringify(x).toLowerCase().includes(q));document.querySelector('#count').textContent=list.length+' 条';document.querySelector('#rows').innerHTML=list.map(x=>'<tr><td>'+esc(x.name)+'<br><small>'+esc(x.id)+'</small></td><td>'+esc(x.classification)+(x.published?' · 线上保留':'')+'</td><td>'+x.nodes+' 节点 / '+x.edges+' 连线<br>'+x.generationNodes+' 生成节点</td><td><details><summary>'+x.models.length+' 个模型 / '+x.issueCodes.length+' 类缺口</summary><p>'+esc(x.models.join('、'))+'</p><code>'+esc(x.issueCodes.join('；'))+'</code></details></td></tr>').join('')}document.querySelector('#q').oninput=render;document.querySelector('#s').onchange=render;render();</script></html>`);
console.log(JSON.stringify(summary,null,2));
