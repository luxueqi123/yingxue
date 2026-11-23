"""Inventory only: one generation job per admitted item; never calls a provider."""
import argparse
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    out = pathlib.Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    text = (ROOT / 'web/src/lib/published-production-assets.ts').read_text(encoding='utf-8')
    published = json.loads(text[text.index('= {') + 2:text.rindex('};') + 1])
    admitted = json.loads((ROOT / 'web/src/lib/production-chain-support.json').read_text(encoding='utf-8'))
    seed = {item['skill_id']: item for item in json.loads((ROOT / 'backend/internal/skills/seed/production-skills.json').read_text(encoding='utf-8'))}
    items = [{'id': item['id'], 'kind': 'skill', 'name': seed[item['id']]['skill_name'], 'description': seed[item['id']]['description']} for item in admitted if item['id'] in published and (not published[item['id']]['cover'] or published[item['id']]['cover'].startswith('/production-library/editorial-covers/'))]
    native = json.loads((ROOT / 'web/src/lib/native-production-assets.json').read_text(encoding='utf-8'))
    items += [{key: entry['item'][key] for key in ['id', 'kind', 'name', 'description']} for entry in native['entries'] if entry['item']['kind'] == 'template']
    workflows = (ROOT / 'web/src/lib/production-workflows.ts').read_text(encoding='utf-8')
    items += [{'id': 'workflow-' + match[0], 'kind': 'workflow', 'name': match[1], 'description': match[2]} for match in re.findall(r'\{ id: "([^"]+)", title: "([^"]+)", description: "([^"]+)"', workflows)]
    assert len({item['id'] for item in items}) == len(items)
    jobs = []
    for index, item in enumerate(items):
        prompt = (
            '为映雪AI影视创作平台制作一张原创、高端、主题准确的独立封面。'
            f"该条目名称：{item['name']}。用途说明：{item['description']}。"
            '将这条技能或模板的特定创作主题转化为一个具有明确主角、场景与叙事瞬间的完整画面，'
            '不可只画电脑、提示词窗口、机械大脑、图标或空泛的胶片；不抄已有封面，不拼贴多张图。'
            '电影美术指导级别构图，精确材质、细腻光影、明确前中后景，克制且有视觉冲击力的配色，'
            '画面中心适配16:9裁剪。按照条目本身选择写实电影、动画、商品摄影或相应绘画风格，'
            '不同条目必须有不同的主体与构图，不仅换颜色。不要文字、字母、标题、水印、商标、UI、边框。'
            '封面是创作主题的原创视觉表达，不是冒充已生成的视频成片。最高质量。'
        )
        item.update({'status': 'pending_generation', 'target': f"/production-library/editorial-covers/{item['id']}.webp", 'prompt': prompt})
        jobs.append({'prompt': prompt, 'out': item['id'] + '.png', 'model': 'gpt-image-2.5', 'quality': 'high', 'size': '1536x1024'})
    (out / 'cover-inventory.json').write_text(json.dumps({'version': 1, 'items': items}, ensure_ascii=False, indent=2), encoding='utf-8')
    (out / 'cover-jobs.jsonl').write_text('\n'.join(json.dumps(job, ensure_ascii=False) for job in jobs) + '\n', encoding='utf-8')
    print(json.dumps({'total': len(items), 'byKind': {kind: sum(item['kind'] == kind for item in items) for kind in ['skill', 'template', 'workflow']}, 'generated': 0}))

if __name__ == '__main__':
    main()
