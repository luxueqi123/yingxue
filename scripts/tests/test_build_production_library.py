import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[2]


class ProductionLibraryCompilerTest(unittest.TestCase):
    def test_compiled_skills_reach_the_current_embedded_seed_owner(self):
        cache = REPO / '.local/cache'
        cache.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='skill-compiler-test-', dir=cache) as temporary:
            root = Path(temporary)
            source, target = root / 'source', root / 'target'
            primary = source / '无限画布与AI影视创作平台'

            def write(relative, value):
                path = source / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(value, ensure_ascii=False), 'utf-8')

            skill = {'templateUuid': '0123456789abcdef0123456789abcdef', 'name': '测试分镜',
                     'snapshotData': json.dumps({'markdownContent': '# 分镜制作\n保持角色一致。', 'skillFiles': []}, ensure_ascii=False)}
            base = primary.relative_to(source).as_posix()
            write(base + '/03_官方Skill技能库/详情_完整定义/skill.json', {'data': {'skill': skill}})
            write(base + '/03_官方Skill技能库/_技能总表1145条.json', [skill])
            write(base + '/04_画布模板库/_画布模板总表1024条_含成片链接.json', [])
            write(base + '/05_官方音色库/_音色总表327条.json', [])
            write('一句成片AI影视创作平台/06_登录后API原生资产/01_agents.json', [])
            for name in ['AI影视分镜与资产系统/01_运镜控制体系/运镜动作全量定义.md',
                         'AI影视分镜与资产系统/02_分镜与连续性提示词矩阵/连续性提示词矩阵.md']:
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('# 制作规范\n保留输入。', 'utf-8')
            subprocess.run([sys.executable, str(REPO / 'scripts/build-production-library.py'), str(source), '--repo', str(target)], check=True, capture_output=True)
            owner = target / 'backend/internal/skills/seed/production-skills.json'
            self.assertTrue(owner.is_file(), 'Compiled definitions must reach the file embedded by internal/skills/skills_seed.go')
            rows = json.loads(owner.read_text('utf-8'))
            expected = 'pl-' + hashlib.sha256(('libtv:' + skill['templateUuid']).encode()).hexdigest()[:32]
            imported = next(row for row in rows if row['skill_id'] == expected)
            self.assertIn('保持角色一致。', imported['instruction'])
            self.assertEqual(len(rows), 3)
            self.assertFalse((target / 'backend/internal/service/seed/production-skills.json').exists())


if __name__ == '__main__':
    unittest.main()
