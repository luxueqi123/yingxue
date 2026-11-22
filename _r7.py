# -*- coding: utf-8 -*-
import subprocess, sys, json
sys.path.insert(0, r'.local\cache')
import _resolve

def show(rev, path):
    raw = subprocess.run(['git', 'show', rev + ':' + path], capture_output=True).stdout.decode('utf8')
    return [l.rstrip('\r') for l in raw.split('\n')]

path = 'backend/cmd/migrate-sqlite-postgres/main_test.go'
ours = show('HEAD', path)
theirs = show('origin/main', path)

def func(lines, name):
    s = next(i for i, l in enumerate(lines) if l.startswith('func ' + name))
    e = s
    while e < len(lines) and lines[e] != '}':
        e += 1
    return lines[s:e + 1]

a = func(ours, 'TestPaymentExportCoverageRejectsMixedPaymentHistoryWithoutWrites(')
b = func(theirs, 'TestCanvasHistoryCompositeKeyMigration(')

res = _resolve.resolve(path, {0: ['\t"gorm.io/driver/sqlite"'], 1: a + [''] + b})
print('blocks', res)
