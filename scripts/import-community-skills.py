"""Stage self-contained community skills; apply only after provenance validation."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from ltv_author_aliases import build_author_map

WRAPPER = """# 映雪运行约定
以下为导入的创作技能指令。仅通过当前用户已配置的模型及宿主实际提供的工具执行；导入和选择技能不发起付费生成。
正文提及的模型或工具未配置时，明确保留待执行项，不把提示词、示例或静态成片说成已生成结果。权限、费用与资源保存遵循映雪现有流程。

---

"""

def prepare(rows, authors):
    if not rows or len({str(x['skill_id']) for x in rows}) != len(rows):
        raise ValueError('Empty source or duplicate identity')
    mapping = build_author_map([x['effective_user']['name'] for x in rows], authors)
    accepted, held = [], []
    for row in rows:
        body = row.get('instruction', '')
        if not isinstance(body, str) or not body.strip():
            raise ValueError('Missing instruction: '+str(row['skill_id']))
        origin = 'community-site:'+str(row['skill_id'])
        identifier = 'pl-'+hashlib.sha256(origin.encode()).hexdigest()[:29]
        dependencies = sorted(set(re.findall(r'(?:references|scripts|assets)/[^\s`<>）)\]，。；]+', body)))
        if dependencies:
            held.append({'origin':origin,'name':row['skill_name'],'reason':'referenced-files-missing','dependencies':dependencies})
            continue
        author = mapping[row['effective_user']['name']]
        cleaned = body
        for old, new in sorted(mapping.items(), key=lambda x:len(x[0]), reverse=True):
            if old in {r['effective_user']['name'] for r in rows}:
                cleaned = cleaned.replace(old, new)
        instruction = WRAPPER+cleaned
        accepted.append({'id':identifier,'origin':origin,'name':row['skill_name'],
            'description':row.get('description',''),'author':author,'category':row.get('tag') or 'others',
            'version':str(row.get('version') or '1'),'body':instruction,
            'sourceBodySha256':hashlib.sha256(body.encode()).hexdigest(),
            'bodySha256':hashlib.sha256(instruction.encode()).hexdigest()})
    return accepted, held, mapping

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--author-registry',type=Path,required=True)
    p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--evidence',type=Path,required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
    read=lambda f:json.loads(f.read_text(encoding='utf-8'))
    rows=read(a.source);accepted,held,mapping=prepare(rows,read(a.author_registry)['authors'])
    out=a.evidence.resolve();repo=a.repo.resolve();assert out.is_relative_to(repo/'.local')
    out.mkdir(parents=True,exist_ok=True)
    public=repo/'web/public/production-library';seed_path=repo/'backend/internal/skills/seed/production-skills.json'
    seeds=read(seed_path);seed_ids={x['skill_id'] for x in seeds};ids={x['id'] for x in accepted}
    registry_path=repo/'web/src/lib/community-skill-support.json'
    prior=read(registry_path) if registry_path.exists() else []
    if ids & seed_ids and ids != {x['id'] for x in prior}:raise ValueError('Unowned seed ID collision')
    writes={};registry=[]
    for x in accepted:
        definition={'id':x['id'],'body':x['body'],'files':[],'source':'群友站','origin':x['origin'],'version':x['version']}
        writes[public/'definitions'/(x['id']+'.json')]=definition
        registry.append({k:v for k,v in x.items() if k not in ['body','description','category','version'] } | {'cover':'','generationVerified':False,'packageComplete':True})
        seeds=[s for s in seeds if s['skill_id']!=x['id']]
        seeds.append({'skill_id':x['id'],'skill_name':x['name'],'description':x['description'],'instruction':x['body'],
            'status':1,'markdown_url':'','create_time':1790467200000,'update_time':1790467200000,'source':2,'tag':x['category'],
            'sort_weight':0,'is_private':False,'like_count':0,'added_count':0,'owner_uid':'production-library',
            'effective_user':{'name':x['author'],'avatar_url':'','uid':'production-library'},'showcase_media':[],'files':[],
            'extra_info':'来源：群友站 · '+x['author']+'\n已接入技能正文；模型执行与成片效果需另行验证。'})
    writes[seed_path]=seeds;writes[registry_path]=registry
    for name in ['catalog.json','published-catalog.json']:
        path=public/name;d=read(path);d['items']=[x for x in d['items'] if x['id'] not in ids]
        for x in accepted:d['items'].append({'id':x['id'],'kind':'skill','name':x['name'],'description':x['description'],
            'category':x['category'],'cover':'','source':'群友站','author':x['author'],'version':x['version'],'available':True,'fileCount':0})
        d['stats']['communitySkills']=len(accepted)
        writes[path]=d
    write=lambda f,d:f.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    write(out/'skill-intake.json',{'accepted':[{k:v for k,v in x.items() if k!='body'} for x in accepted],'held':held,'applied':a.apply,'productionChanged':False})
    write(out/'author-map.private.json',mapping)
    if a.apply:
        for path,data in writes.items():
            backup=out/'before'/path.relative_to(repo)
            if path.exists() and not backup.exists():backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,backup)
            path.parent.mkdir(parents=True,exist_ok=True);write(path,data)
    print(json.dumps({'accepted':len(accepted),'held':len(held),'applied':a.apply,'seedTotal':len(seeds),'productionChanged':False}))

if __name__=='__main__':main()
