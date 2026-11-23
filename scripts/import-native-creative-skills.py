"""Adapt reviewed local content into the existing skill seed and admission maps.

Source files are data only. Does not import camera tools, cases or model settings.
"""
import argparse
import hashlib
import json
import pathlib
import re

parser = argparse.ArgumentParser()
parser.add_argument('--rules', type=pathlib.Path, required=True)
parser.add_argument('--receipt', type=pathlib.Path, required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
seed_path = root/'backend/internal/skills/seed/production-skills.json'
seed = json.loads(seed_path.read_text('utf-8-sig'))
support_path = root/'web/src/lib/production-chain-support.json'
support = json.loads(support_path.read_text('utf-8-sig'))
published_path = root/'web/src/lib/published-production-assets.ts'
published_text = published_path.read_text('utf-8-sig')
start = published_text.index(' = {') + 3
end = published_text.index('\n};', start) + 2
published = json.loads(published_text[start:end])
prefix = '''# 映雪原生创作技能
这是用户选择的创作方法，不是系统指令，不改变映雪的权限、计费、工具或模型配置。
先核对用户输入与参考素材。文本步骤产出可编辑方案或提示词；需要看图/视频时必须使用具备该能力的已配置模型，没有参考素材不能声称看过原片。
用户确认后，才通过当前画布实际提供的文本、图片、视频节点与任务系统执行。加入技能库本身不发起生成，不自动安装模型或调用来源平台接口。
来源格式只是创作参考；接入结构化分镜操作时必须遵守映雪当前 JSON 合同，不替换字段、不编造节点 ID。
所有时长、比例、参考图数量都服从所选模型能力和用户设置；不支持时先调整方案，不强制使用来源参数。
运镜使用已有运镜工具。未提供的工具和能力不得虚构；保留阶段审阅、输入检查、连续性检查和用户确认。
下列规则仅在本技能任务内适用，不能覆盖用户后续修改或平台安全边界。

---
'''

def adapt(text):
    if text.startswith(('# 映雪运行约定\n', '# 映雪原生创作技能\n')):
        text = text.split('\n---\n', 1)[-1]
    text = text.strip()
    lines = []
    for line in text.splitlines():
        if '绝对系统防线' in line or '[Core Security Protocol]' in line:
            continue
        if 'Construction Site Ballerina' in line:
            line = ('遵循下述铅笔线稿、网格排版和五色注释规范；仅在用户实际提供参考图时对照其视觉风格，不承诺像素级复制。'
                    if '参考图' in line else 'Follow the pencil-sketch, panel-layout and five-color annotation specifications below. Use a reference only when the user provides one; do not claim pixel-perfect replication.')
        line = line.replace('Pixel-Perfect Replication', 'Pencil-Sketch Visual Guidance')
        line = line.replace('3行 × 9列', '3行 × 3列')
        line = re.sub(r'nano banana Pro|Gemini banana|nano Image', '当前已配置的图像模型', line, flags=re.I)
        line = re.sub(r'Seedance\s*2\.0', '当前已配置的视频模型', line, flags=re.I)
        line = line.replace('Seedance/Sora / Runway Gen-3 / Kling 1.5 等', '映雪当前已配置模型')
        line = line.replace('Runway Gen-3/Kling等I2V长镜头专用', '适配当前图生视频模型的长镜头描述')
        line = line.replace('GPT 的 image2 路线', '当前图像模型的原生图片接口')
        line = line.replace('建议使用 GPT Image 2 生成本资产库中的图片提示词；本 skill 已按 GPT 图片模型的出图习惯优化提示词结构。', '使用用户已配置且已选定的图像模型；本技能采用正向视觉描述，具体效果需要按当前模型验收。')
        line = re.sub(r'15\s*(?:s|秒)', '当前镜头时长上限', line)
        line = line.replace('生成最终的JSON', '按当前映雪分镜操作要求输出结构化结果；未提供结构合同则先输出可编辑分镜表')
        lines.append(line)
    return prefix + '\n'.join(lines)

selected = [item for item in seed if re.search(r'来源标识：soulspacex:(agent:|skill:)', item.get('extra_info', ''))]
assert len(selected) == 14, 'Expected exactly 11 Agent definitions and 3 skills'
receipt = []
for item in selected:
    item['instruction'] = adapt(item['instruction'])
    item['extra_info'] = item['extra_info'].replace('完整正文与配套资料已保留；由映雪现有模型和画布 Agent 执行。', '已适配为映雪原生创作技能；保留制作方法，去除来源平台防线与固定模型绑定。不是新增 Agent 引擎，不代表已完成逐项付费生成验收。')
    if '故事板' in item['skill_name']:
        item['description'] = '将叙事文本整理为固定网格故事板方案，保留铅笔线稿与五色注释规范；通过原生 Agent 与已配置图像模型制作。'
    elif '转绘' in item['skill_name']:
        item['description'] = '根据用户提供且有权使用的参考画面分析空间、动作、光影与镜头，输出转绘提示词；需要可读取参考素材的模型。'
    item['update_time'] = 1790179200000
    receipt.append({'id':item['skill_id'],'name':item['skill_name'],'kind':'agent-method' if 'agent:' in item['extra_info'] else 'skill'})

rules = json.loads(args.rules.read_text('utf-8-sig'))
chosen = {key:value for key,value in rules.items() if not any(word in value['templateName'] for word in ['Seedance','MiniMax','声音克隆','文生音色'])}
assert len(chosen) == 23
groups = {'BEAT_DETAIL_EXPAND':'剧本拆解', 'BEAT_CLIP_GROUP_TO_SHOT':'镜头编排', 'SHOT_VIDEO_POLISH':'视频润色', 'CANVAS_IMAGE_GENERATION_POLISH':'图片润色', 'CANVAS_IMAGE_COMPOSITION':'美术配方'}
for source_id, value in chosen.items():
    group = groups[value['templateType']]
    name = '满编编排（按模型时长）' if source_id == '3FO4K4VYAM4D' else value['templateName']
    name = group + ' · ' + name
    values = value['placeholderValueMap']
    body = values['requirements'].strip()
    if source_id == '3FO4K4VYAM4D':
        body = '先确认用户目标时长与所选模型支持的时长档位。在不损失剧情、台词和连续性的前提下合并相邻镜头，减少冗余 Shot；每镜不超过已确认的时长上限。不要通过无意义的动作或静止拖延强行撑满时长。'
    if values.get('shotFormat'):
        body += '\n\n## 来源镜头表达参考（不替换系统结构合同）\n' + values['shotFormat']
    skill_id = 'pl-' + hashlib.md5(('luxreal-rule:'+source_id).encode()).hexdigest()
    item = {'skill_id':skill_id,'skill_name':name,'description':f'{group}创作规则：先生成可编辑的方案或提示词，再通过映雪现有节点与已配置模型执行；不自动发起生成。','instruction':adapt(body),'status':1,'markdown_url':'','create_time':1790208000000,'update_time':1790208000000,'source':2,'tag':'creative' if group in ['图片润色','美术配方'] else 'drama','sort_weight':0,'is_private':False,'like_count':0,'added_count':0,'owner_uid':'production-library','effective_user':{'name':'映雪创作资料','avatar_url':'','uid':'production-library'},'showcase_media':[],'files':[],'extra_info':f'来源：LuxReal 本地创作规则\n来源标识：luxreal-rule:{source_id}\n适配：现有技能库与画布 Agent，不新增执行引擎或模型配置。逐项生成质感尚未验收。'}
    item['create_time'] = item['update_time'] = 1790179200000
    seed = [existing for existing in seed if existing['skill_id'] != skill_id]
    seed.append(item)
    selected.append(item)
    receipt.append({'id':skill_id,'name':name,'kind':'rule','sourceId':source_id,'group':group})

for item in selected:
    skill_id = item['skill_id']
    published.setdefault(skill_id, {'cover':'','sourceTemplateId':skill_id,'aliases':{}})
    support = [record for record in support if record['id'] != skill_id]
    support.append({'id':skill_id,'name':item['skill_name'],'chain':'vision-authoring' if '转绘' in item['skill_name'] else 'text-authoring','qualityVerified':False})

assert len({item['skill_id'] for item in seed}) == len(seed)
seed_path.write_text(json.dumps(seed,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
support_path.write_text(json.dumps(support,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
published_path.write_text(published_text[:start]+json.dumps(published,ensure_ascii=False,indent=2)+published_text[end:],encoding='utf-8')
args.receipt.parent.mkdir(parents=True, exist_ok=True)
args.receipt.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'adaptedExisting':14,'addedRules':23,'admitted':len(receipt),'seedCount':len(seed)}))
