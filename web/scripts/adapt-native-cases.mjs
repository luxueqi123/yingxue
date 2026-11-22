import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),esbuild=require('../../canvas-agent/node_modules/esbuild');
const [cache,models,output]=process.argv.slice(2);if(!output)throw Error('Usage: <snapshot-cache> <safe-models> <output>');
const read=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const compiled=await esbuild.build({entryPoints:['web/src/lib/canvas/ltv-native-project.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {adaptLtvNativeProject}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const readinessBuild=await esbuild.build({entryPoints:['web/src/lib/canvas/ltv-case-readiness.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {summarizeLtvReadiness,collectLtvRequiredInputs}=await import(`data:text/javascript;base64,${Buffer.from(readinessBuild.outputFiles[0].text).toString('base64')}`);
const catalog=await read(models),index=await read(resolve(cache,'snapshot-results.json'));
const sourceTools=await read(resolve(cache,'source-tool-spec.json')),sourceSchemas={};
for(const tool of sourceTools.data.tools){
 if(!tool.metadata)continue;
 let schema;try{schema=typeof tool.metadata==='string'?JSON.parse(tool.metadata):tool.metadata;}catch{continue;}
 if(schema&&typeof schema==='object')sourceSchemas[`${tool.type}:${tool.toolKey}`]=schema;
}
await mkdir(resolve(output,'projects'),{recursive:true});
const reports=[],support=[];const blockers={};
for(const row of index){
 let result,snapshot;
 try{if(!row.file||!/^\w+\.json$/.test(row.file))throw Error('no snapshot');const v=await read(resolve(cache,row.file));snapshot=JSON.parse(v.data.detail.snapshotData);}
 catch{result={supported:false,issues:[{code:'snapshot-unavailable',detail:'无有效本地工程'}]};}
 // A converter crash must fail the audit, never masquerade as missing source data.
 if(!result)result=adaptLtvNativeProject(snapshot,catalog,row.id,row.name,sourceSchemas);
 for(const code of new Set(result.issues.map(i=>i.code)))blockers[code]=(blockers[code]||0)+1;
 const adoptable=result.adoptable??result.supported;
 reports.push({id:row.id,name:row.name,supported:result.supported,adoptable,readiness:result.readiness||summarizeLtvReadiness(result.issues),issues:result.issues,generationNodes:result.project?.adaptation.generationNodes||0});
 if(adoptable){const bytes=Buffer.from(JSON.stringify(result.project));await writeFile(resolve(output,'projects',row.id+'.json'),bytes);
 const inputs=collectLtvRequiredInputs(result.issues);
 const configuration=result.issues.filter(issue=>issue.code==='channel-configuration-required');
 support.push({id:row.id,snapshotPath:'/production-library/case-projects/'+row.id+'.json',sha256:createHash('sha256').update(bytes).digest('hex'),nodeCount:result.project.nodes.length,connectionCount:result.project.connections.length,generationNodeCount:result.project.adaptation.generationNodes,engine:'yingxue',...(inputs.length?{requiredInputs:inputs}:{}),...(configuration.length?{requiredConfiguration:configuration.map(issue=>({nodeId:issue.nodeId,...JSON.parse(issue.detail)}))}:{})});}
}
const statuses={},categories={};for(const row of reports){statuses[row.readiness.status]=(statuses[row.readiness.status]||0)+1;for(const category of new Set(row.readiness.requirements.map(x=>x.category)))categories[category]=(categories[category]||0)+1;}
const summary={total:reports.length,supported:reports.filter(x=>x.supported).length,adoptable:support.length,generative:support.filter(x=>x.generationNodeCount).length,resourceOnly:support.filter(x=>!x.generationNodeCount).length,inputTemplates:support.filter(x=>x.requiredInputs?.length).length,pending:reports.filter(x=>!x.adoptable).length,statuses,categories,permanentlyIncompatible:0,blockers,paidCalls:0,sourceBackendCalls:0};
await writeFile(resolve(output,'support.json'),JSON.stringify(support,null,2));await writeFile(resolve(output,'reports.json'),JSON.stringify(reports));await writeFile(resolve(output,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
