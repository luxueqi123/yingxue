from pathlib import Path
t = Path('web/src/stores/use-config-store.ts').read_text(encoding='utf-8').split('\n')
for i, l in enumerate(t, 1):
    if 'allowLocalChannel' in l or 'publicAlias' in l or 'export type ModelChannel' in l or 'export type RunningHubConfig' in l:
        print(i, l)
