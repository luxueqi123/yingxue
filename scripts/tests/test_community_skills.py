import importlib.util
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('community',ROOT/'import-community-skills.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CommunitySkillTests(unittest.TestCase):
    def row(self, identifier='1', body='作者甲的创作方法'):
        return {'skill_id':identifier,'skill_name':'创作技能','instruction':body,'effective_user':{'name':'作者甲'}}
    def test_self_contained_body_and_stable_alias(self):
        accepted,held,mapping=module.prepare([self.row()],{'作者甲':'Ellis Gray'})
        self.assertFalse(held);self.assertEqual(accepted[0]['author'],'Ellis Gray')
        self.assertIn('Ellis Gray的创作方法',accepted[0]['body']);self.assertNotIn('作者甲',accepted[0]['body'])
        self.assertEqual(accepted,module.prepare([self.row()],mapping)[0])
    def test_missing_dependencies_are_not_admitted(self):
        accepted,held,_=module.prepare([self.row(body='请读取 references/world.md')],{})
        self.assertFalse(accepted);self.assertEqual(held[0]['dependencies'],['references/world.md'])
    def test_duplicate_identity_rejected(self):
        with self.assertRaises(ValueError):module.prepare([self.row(),self.row()],{})
    def test_missing_body_rejected(self):
        with self.assertRaises(ValueError):module.prepare([self.row(body='')],{})

if __name__=='__main__':unittest.main()
