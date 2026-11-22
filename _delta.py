"""Measure the 映雪-only feature delta that would have to be ported if we
adopt upstream's modular index.tsx + creation-workspace.tsx skeleton."""

import re
import subprocess
from pathlib import Path

BASE = '01a2d171f5b2a6854a987ba2022a8d960d9107b4'
DIR = 'web/src/pages/create/'
FILES = ['index.tsx', 'creation-workspace.tsx', 'creation-types.ts', 'creation-conversations.ts',
         'creation-assets.ts', 'creation-references.ts', 'creation-input-policy.ts',
         'creation-agent-entry.tsx', 'creation-submit-gate.ts', 'creation-runtime.ts',
         'creation-inspirations.ts', 'creation-product.css', 'creation-scrollbars.css',
         'creation-entry.css']


def txt(ref, p):
    if ref == 'WORK':
        f = Path(p)
        return f.read_text(encoding='utf-8') if f.exists() else None
    r = subprocess.run(['git', 'show', ref + ':' + p], capture_output=True)
    return r.stdout.decode('utf-8') if r.returncode == 0 else None


decl = re.compile(r'^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|type|interface|class|enum)\s+([A-Za-z_$][\w$]*)')

head_idx = txt('HEAD', DIR + 'index.tsx')
head_syms = [m.group(1) for m in (decl.match(l) for l in head_idx.split('\n')) if m]
head_syms = sorted(set(head_syms))

merged_blob = '\n'.join(filter(None, [txt('MERGE_HEAD', DIR + f) for f in FILES]))
merged_base = '\n'.join(filter(None, [txt(BASE, DIR + f) for f in FILES]))

missing = []
for s in head_syms:
    if not re.search(r'\b' + re.escape(s) + r'\b', merged_blob):
        missing.append(s)

print('映雪 index.tsx declared symbols:', len(head_syms))
print('absent from upstream(MERGE_HEAD) create/* :', len(missing))
for s in missing:
    inbase = bool(re.search(r'\b' + re.escape(s) + r'\b', merged_base))
    print('   %-36s in_base=%s' % (s, inbase))

print()
print('## 映雪-only strings required by tests (index.tsx readers)')
for s in ['copyText(visiblePrompt', 'aria-label="复制提示词"', '上传后保存到素材库', '个素材已上传到素材库并自动选中',
          'onUpload: uploadLibraryAssets', 'creation-canvas-brief', 'handoffMode', 'onContinueCanvas',
          'creation-chat-intro', 'CreationEmptyBanner', 'creation-entry.css', 'readCreationDocument']:
    print('   %-44s idxHEAD=%d MERGE_all=%d' % (s, head_idx.count(s), merged_blob.count(s)))
