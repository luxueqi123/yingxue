import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ltv_author_aliases import apply_item_aliases, build_author_map, resolve_imported_authors, resolve_catalog_authors


class LtvAuthorAliasesTest(unittest.TestCase):
    def test_distinct_stable_names_and_append_only_registry(self):
        authors = [f'原作者{i}' for i in range(1000)]
        first = build_author_map(authors)
        self.assertEqual(len(set(first.values())), 1000)
        self.assertEqual(first, build_author_map(reversed(authors)))
        extended = build_author_map(authors + ['新作者'], first)
        self.assertTrue(all(extended[k] == v for k, v in first.items()))
        self.assertFalse(set(first) & set(first.values()))

    def test_only_imported_author_fields_change(self):
        source = {'items': [
            {'id': 'case-a', 'source': 'LibTV', 'kind': 'case', 'author': '旧名', 'projectId': 'graph-1', 'owner_uid': 'keep'},
            {'id': 'own', 'source': 'native', 'kind': 'case', 'author': '真实用户'},
            {'id': 'voice', 'source': 'LibTV', 'kind': 'voice', 'author': '音色资料'},
        ], 'stats': {'cases': 2}}
        original = copy.deepcopy(source)
        result, count = apply_item_aliases(source, {'case-a': '林见山'})
        self.assertEqual(count, 1)
        self.assertEqual(source, original)
        expected = copy.deepcopy(source)
        expected['items'][0]['author'] = '林见山'
        self.assertEqual(result, expected)
        self.assertEqual(apply_item_aliases(result, {'case-a': '林见山'})[0], result)

    def test_missing_mapping_stops_the_candidate(self):
        with self.assertRaises(ValueError):
            apply_item_aliases({'items': [{'id': 'case-a', 'kind': 'case', 'source': 'LibTV'}]}, {})

    def test_rebuilding_renamed_assets_preserves_original_identity(self):
        prior = [{'id': 'case-a', 'originalAuthor': '旧名', 'replacementAuthor': '林见山'}]
        self.assertEqual(resolve_imported_authors([{'id': 'case-a', 'author': '林见山'}], prior), {'case-a': '旧名'})
        self.assertEqual(resolve_imported_authors([{'id': 'case-a', 'author': '旧名'}], prior), {'case-a': '旧名'})
        with self.assertRaises(ValueError):
            resolve_imported_authors([{'id': 'case-a', 'author': '意外变更'}], prior)
        self.assertEqual(resolve_imported_authors([{'id': 'case-b', 'author': '新作者'}], prior), {'case-b': '新作者'})

    def test_reserve_only_authors_are_included_without_renaming_existing_aliases(self):
        documents = [
            {'items': [{'id': 'case-a', 'source': 'LibTV', 'kind': 'case', 'author': '林见山'}]},
            {'entries': [
                {'id': 'case-a', 'source': 'LibTV', 'kind': 'case', 'author': '旧名'},
                {'id': 'case-b', 'source': 'LibTV', 'kind': 'case', 'author': '替补作者'},
                {'id': 'voice-a', 'source': 'LibTV', 'kind': 'voice', 'author': '音色资料'},
                {'id': 'native-a', 'source': 'native', 'kind': 'case', 'author': '本机用户'},
            ]},
        ]
        prior = [{'id': 'case-a', 'originalAuthor': '旧名', 'replacementAuthor': '林见山'}]
        self.assertEqual(resolve_catalog_authors(documents, prior, {'旧名': '林见山'}),
                         {'case-a': '旧名', 'case-b': '替补作者'})
        documents[1]['entries'][0]['author'] = '意外变更'
        with self.assertRaises(ValueError):
            resolve_catalog_authors(documents, prior, {'旧名': '林见山'})


if __name__ == '__main__':
    unittest.main()
