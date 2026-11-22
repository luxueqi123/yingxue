from pathlib import Path
p = Path('web/src/stores/use-config-store.ts')
lines = p.read_text(encoding='utf-8').split('\n')

# effectiveConfigWithDreamina currently uses the desktop wrapper; revert that.
assert 'projectDesktopLocalChannelRuntime({' in lines[686], lines[686]
lines[686] = '    return {'
# its closing: find the first "    });" after 686 up to 700
for i in range(686, 705):
    if lines[i].strip() == '});':
        lines[i] = '    };'
        break
else:
    raise SystemExit('no close found')

# now apply wrapper to resolveModelRequestConfig
idx = next(i for i, l in enumerate(lines) if l.startswith('export function resolveModelRequestConfig(config: AiConfig, value: string) {'))
# find "    return {" after idx
j = next(i for i in range(idx, idx + 40) if lines[i] == '    return {')
lines[j] = '    return projectDesktopLocalChannelRuntime({'
k = next(i for i in range(j, j + 40) if lines[i] == '    };')
lines[k] = '    });'
p.write_text('\n'.join(lines), encoding='utf-8')
print('rebalanced')
