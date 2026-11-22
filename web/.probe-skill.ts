import {publishedSkills} from './src/lib/published-production-assets.ts';
import {supportedLtvSkillIds, verifiedLtvSkillIds, isVerifiedProductionSkill} from './src/lib/verified-production-assets.ts';
import catalog from './public/production-library/published-catalog.json';
import chain from './src/lib/production-chain-support.json';
const skills=(catalog as any).items.filter((i:any)=>i.kind==='skill');
const visible=skills.filter((i:any)=>Boolean((publishedSkills as any)[i.id])&&isVerifiedProductionSkill(i.id));
console.log(JSON.stringify({catalogSkills:skills.length,publishedSkillsEntries:Object.keys(publishedSkills).length,chainSupport:chain.length,supportedSet:supportedLtvSkillIds.size,verifiedExtra:verifiedLtvSkillIds.size,visibleSkills:visible.length},null,2));
console.log('chains=',JSON.stringify([...new Set(chain.map((c:any)=>c.chain))]));
