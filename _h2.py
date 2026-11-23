from pathlib import Path
t = Path('web/src/stores/use-config-store.ts').read_text(encoding='utf-8').split('\n')
for i, l in enumerate(t, 1):
    if 'projectDesktopLocalChannelRuntime' in l or 'export function effectiveConfigWithDreamina' in l or 'export function resolveModelRequestConfig' in l:
        print(i, l)
