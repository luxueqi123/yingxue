import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const [directory,specPath]=process.argv.slice(2);
if(!specPath)throw Error('Usage: <readiness-directory> <local-source-tool-spec>');
const read=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
const reports=await read(resolve(directory,'reports.json')),summary=await read(resolve(directory,'summary.json'));
const specBytes=await readFile(specPath),spec=JSON.parse(specBytes).data.tools;
assert.equal(reports.length,1024);
const sourceOptions=[];
for(const tool of spec){
 let metadata;try{metadata=JSON.parse(tool.metadata);}catch{continue;}
 for(const [key,value] of Object.entries(metadata.properties||{}))if(/search/i.test(key))sourceOptions.push({type:tool.type,model:tool.toolKey,key,...value});
}
const rows=reports.map(row=>{
 const grouped=new Map();
 for(const issue of row.readiness.requirements){
  const current=grouped.get(issue.code)||{category:issue.category,code:issue.code,count:0,example:issue.detail};current.count++;grouped.set(issue.code,current);
 }
 return {id:row.id,name:row.name,status:row.readiness.status,categories:[...new Set(row.readiness.requirements.map(x=>x.category))],requirements:[...grouped.values()]};
});
const audio={},search={};
for(const row of reports)for(const issue of row.issues){
 if(issue.code==='audio-adapter-required'){
  const detail=JSON.parse(issue.detail),key=JSON.stringify([detail.scene||'',detail.operation||'',detail.sourceModel||'']);
  const entry=audio[key]||={scene:detail.scene,operation:detail.operation,sourceModel:detail.sourceModel,nodes:0,cases:new Set()};entry.nodes++;entry.cases.add(row.id);
 }
 if(issue.code==='search-option-unmapped'){
  const detail=JSON.parse(issue.detail),key=detail.sourceModel||'';const entry=search[key]||={model:key,nodes:0,cases:new Set(),fields:new Set()};entry.nodes++;entry.cases.add(row.id);detail.fields.forEach(field=>entry.fields.add(field));
 }
}
const evidence={sourceSpecSha256:createHash('sha256').update(specBytes).digest('hex'),sourceOptions,
 audio:Object.values(audio).map(entry=>({...entry,cases:entry.cases.size})),
 search:Object.values(search).map(entry=>({...entry,cases:entry.cases.size,fields:[...entry.fields]})),
 boundaries:['搜索开关不等于独立搜索节点；未静默删除搜索参数','音频生成和存储在映雪存在；具体音乐、音色与参考参数仍须对应映射','各维度数量有交叉；未配置或尚未映射不等于永久不兼容','空提示词和空素材槽记为待补输入，不直接等同工程损坏']};
await writeFile(resolve(directory,'source-requirements.json'),JSON.stringify(evidence,null,2));
await writeFile(resolve(directory,'case-readiness.json'),JSON.stringify({summary,rows},null,2));
const payload=JSON.stringify({summary,rows,evidence}).replaceAll('<','\\u003c');
await writeFile(resolve(directory,'案例分层复核.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>映雪案例分层复核</title><style>body{font:15px/1.7 system-ui;margin:32px;background:#151619;color:#ececef}main{max-width:1400px;margin:auto}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #41434a;text-align:left;vertical-align:top}td:last-child{width:55%;overflow-wrap:anywhere}input,select,button{padding:10px;background:#25272c;border:1px solid #626570;color:inherit;border-radius:6px}input{width:min(420px,65%)}small{color:#bbb}h1{font-size:26px}.note{padding:14px;border-left:3px solid #b8a4f0;background:#22232a}nav{display:flex;gap:12px;align-items:center;margin:18px 0}summary{cursor:pointer}@media(max-width:650px){body{margin:12px}table{font-size:12px}}</style><main><h1>映雪案例分层复核</h1><p class="note">1024 条重新核对。渠道未配置、输入待补和转换器待适配分别记录，不再把 997 条称为“不能采用”。当前运行名单与待处理资产分开；本报告不代表新增案例已经上线。</p><p id="summary"></p><details><summary>搜索与音频的实际含义</summary><p>原工具规格中，搜索是图像/视频模型的参数开关，部分视频模型默认开启。仅凭这个开关不能断言下游依赖独立搜索工作流。音频包含配音、音乐、歌词成歌和参考音频等不同操作；映雪已有音频执行与保存链，剩余工作需按具体参数核对。</p><p>空提示词和空素材槽属于待补输入。缺快照、悬空连线等另列来源数据问题。多个维度可以同时存在，不按第一个问题整批淘汰。</p></details><nav><input id="q" placeholder="搜索案例、编号或具体缺口" aria-label="搜索案例"><select id="category" aria-label="筛选维度"><option value="">全部维度</option><option value="ready">已通过当前执行准入</option><option value="configuration">待配置</option><option value="input">待补输入</option><option value="adapter">待适配</option><option value="capability-review">待核对模型规格</option><option value="source-data">来源数据问题</option></select></nav><p id="count"></p><table><thead><tr><th>案例</th><th>状态</th><th>全部问题维度与示例</th></tr></thead><tbody id="rows"></tbody></table><nav><button id="prev">上一页</button><span id="page"></span><button id="next">下一页</button></nav></main><script type="application/json" id="data">${payload}</script><script>const data=JSON.parse(document.getElementById('data').textContent),labels={'source-data':'来源数据','configuration':'待配置','input':'待补输入','adapter':'待适配','capability-review':'模型规格待核对','ready':'当前已通过','configuration-required':'仅待配置','input-required':'仅待补输入','source-repair-required':'含来源数据问题','adaptation-required':'需适配','capability-review-required':'需核对模型规格'};let page=0;const q=document.getElementById('q'),category=document.getElementById('category');document.getElementById('summary').textContent='当前通过 '+data.summary.supported+' 条；待处理 '+data.summary.pending+' 条。已证明永久不兼容：0 条。维度统计有交叉：'+Object.entries(data.summary.categories).map(([k,v])=>labels[k]+' '+v).join('，');function render(){const query=q.value.toLowerCase(),items=data.rows.filter(r=>(!category.value||(category.value==='ready'?r.status==='ready':r.categories.includes(category.value)))&&JSON.stringify(r).toLowerCase().includes(query)),pages=Math.max(1,Math.ceil(items.length/40));page=Math.min(page,pages-1);const body=document.getElementById('rows');body.replaceChildren();for(const row of items.slice(page*40,page*40+40)){const tr=document.createElement('tr'),name=document.createElement('td'),status=document.createElement('td'),details=document.createElement('td');name.textContent=row.name;const id=document.createElement('small');id.textContent=row.id;name.append(document.createElement('br'),id);status.textContent=labels[row.status]||row.status;for(const item of row.requirements){const p=document.createElement('p');p.textContent=labels[item.category]+' · '+item.code+'（'+item.count+'处）：'+item.example;details.append(p);}tr.append(name,status,details);body.append(tr);}document.getElementById('count').textContent='匹配 '+items.length+' 条';document.getElementById('page').textContent=(page+1)+' / '+pages;document.getElementById('prev').disabled=page===0;document.getElementById('next').disabled=page+1>=pages;}q.oninput=category.onchange=()=>{page=0;render()};document.getElementById('prev').onclick=()=>{page--;render()};document.getElementById('next').onclick=()=>{page++;render()};render();</script></html>`);
console.log(JSON.stringify({total:rows.length,statuses:summary.statuses,categories:summary.categories,audioContracts:evidence.audio.length,searchModels:evidence.search.length,sourceSearchOptions:sourceOptions.length,paidCalls:0}));
