"""Exercise the real POSIX publisher without starting nginx or touching a live site."""
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]


def shell_path(path):
    value = path.resolve().as_posix()
    return f'/mnt/{value[0].lower()}{value[2:]}' if os.name == 'nt' else value


class PublicationTests(unittest.TestCase):
    def setUp(self):
        cache = REPO / '.local/cache/web-publication-tests'
        cache.mkdir(parents=True, exist_ok=True)
        self.root = Path(tempfile.mkdtemp(prefix='fixture-', dir=cache))
        self.addCleanup(shutil.rmtree, self.root)
        self.release = self.root / 'release'
        self.html = self.root / 'html'
        self.bin = self.root / 'bin'
        for folder in [self.release / 'assets', self.html / 'assets', self.bin]:
            folder.mkdir(parents=True)
        self.put(self.release / 'index.html', 'new index')
        self.put(self.html / 'index.html', 'old index')
        self.put(self.release / 'assets/current.js', 'new chunk')
        self.put(self.html / 'assets/previous.js', 'previous chunk')
        self.put(self.html / '.canvas-assets-current', 'assets/previous.js\n')
        self.put(self.root / 'entrypoint.sh', (REPO / 'docker/canvas-web-entrypoint.sh').read_text('utf8'))
        self.put(self.bin / 'nginx', '#!/bin/sh\nexit 0\n')
        self.put(self.bin / 'cp', '''#!/bin/sh
if test "${FAIL_COPY:-0}" = 1; then
  for arg do
    case "$arg" in *fail-copy.txt|*/release/.) exit 73;; esac
  done
fi
/bin/cp "$@" || exit $?
for dir in "$CANVAS_WEB_HTML_DIR"/.canvas-stage.*; do
  test -d "$dir" || continue
  du -sk "$dir" >> "$STAGE_USAGE_LOG"
done
''')

    def put(self, path, value):
        with path.open('w', encoding='utf8', newline='\n') as output:
            output.write(value)

    def run_publisher(self, fail_copy=False, trailing_slash=False, restrictive_umask=False):
        env = {'CANVAS_WEB_RELEASE_DIR': shell_path(self.release) + ('/' if trailing_slash else ''), 'CANVAS_WEB_HTML_DIR': shell_path(self.html),
               'STAGE_USAGE_LOG': shell_path(self.root / 'stage-usage.log'), 'FAIL_COPY': '1' if fail_copy else '0',
               'PATH': f'{shell_path(self.bin)}:/usr/bin:/bin'}
        script = f'chmod +x {shlex.quote(shell_path(self.bin))}/*; '
        if restrictive_umask:
            script += 'umask 077; '
        script += 'exec env ' + ' '.join(shlex.quote(f'{k}={v}') for k, v in env.items())
        script += ' sh ' + shlex.quote(shell_path(self.root / 'entrypoint.sh'))
        command = ['wsl.exe', '--exec', 'sh', '-c', script] if os.name == 'nt' else ['sh', '-c', script]
        return subprocess.run(command, capture_output=True, text=True, encoding='utf8', timeout=90)

    def test_unchanged_files_do_not_use_staging_space(self):
        data = 'x' * (1024 * 1024)
        self.put(self.release / 'unchanged.bin', data)
        self.put(self.html / 'unchanged.bin', data)
        result = self.run_publisher()
        self.assertEqual(result.returncode, 0, result.stderr)
        peak = max(int(line.split()[0]) for line in (self.root / 'stage-usage.log').read_text().splitlines())
        self.assertLess(peak, 64, f'Unchanged 1 MiB asset was staged: peak {peak} KiB')
        self.assertEqual((self.html / 'unchanged.bin').read_text(), data)
        self.assertEqual((self.html / 'index.html').read_text(), 'new index')

    def test_copy_failure_preserves_old_site_and_releases_lock(self):
        self.put(self.release / 'fail-copy.txt', 'failure injection')
        result = self.run_publisher(fail_copy=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.html / 'index.html').read_text(), 'old index')
        self.assertFalse((self.html / 'assets/current.js').exists())
        self.assertFalse((self.html / '.canvas-publish-lock').exists())
        self.assertFalse(list(self.html.glob('.canvas-stage.*')))

    def test_trailing_release_separator_preserves_destination_paths(self):
        result = self.run_publisher(trailing_slash=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.html / 'assets/current.js').read_text(), 'new chunk')
        self.assertFalse((self.html / 'mnt').exists())

    def test_existing_publication_lock_is_not_removed(self):
        (self.html / '.canvas-publish-lock').mkdir()
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.html / '.canvas-publish-lock').is_dir())
        self.assertEqual((self.html / 'index.html').read_text(), 'old index')

    @unittest.skipIf(os.name == 'nt', 'POSIX mode checks require the Linux publisher runtime')
    def test_public_assets_remain_readable_under_restrictive_deploy_umask(self):
        for root in [self.release, self.html]:
            (root / 'previs').mkdir(mode=0o700)
            self.put(root / 'previs/mannequin.glb', 'unchanged model')
            os.chmod(root / 'previs/mannequin.glb', 0o600)
        (self.release / 'ecommerce-models').mkdir()
        self.put(self.release / 'ecommerce-models/new.glb', 'new model')
        os.chmod(self.release / 'ecommerce-models/new.glb', 0o600)
        result = self.run_publisher(restrictive_umask=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for relative in ['previs', 'ecommerce-models']:
            self.assertEqual((self.html / relative).stat().st_mode & 0o777, 0o755)
        for relative in ['previs/mannequin.glb', 'ecommerce-models/new.glb', 'index.html']:
            self.assertEqual((self.html / relative).stat().st_mode & 0o777, 0o644)
        self.assertEqual((self.html / 'previs/mannequin.glb').read_text(), 'unchanged model')

    def test_current_previous_and_non_asset_data_are_preserved(self):
        self.put(self.html / 'assets/stale.js', 'old unused chunk')
        self.put(self.html / 'user-data.json', 'preserve me')
        for name in ['previous.js', 'stale.js']:
            os.utime(self.html / 'assets' / name, (1, 1))
        result = self.run_publisher()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.html / 'assets/current.js').is_file())
        self.assertTrue((self.html / 'assets/previous.js').is_file())
        self.assertFalse((self.html / 'assets/stale.js').exists())
        self.assertEqual((self.html / 'user-data.json').read_text(), 'preserve me')
        self.assertEqual((self.html / '.canvas-assets-previous').read_text(), 'assets/previous.js\n')


if __name__ == '__main__':
    unittest.main(verbosity=2)
