from pathlib import Path
p = Path('web/src/stores/use-config-store.ts')
lines = p.read_text(encoding='utf-8').split('\n')
# effectiveConfigWithDreamina: lines index 686 ('    return projectDesktop...{') -> '    return {'
assert lines[686].strip() == 'return projectDesktopLocalChannelRuntime({', lines[686]
lines[686] = '    return {'
assert lines[695].strip() == '};', lines[695]
lines[695] = '    };'
# resolveModelRequestConfig: line index 947 '    return {' -> wrapper ; 958 '    });' -> '    };'
assert lines[947].strip() == 'return {', lines[947]
lines[947] = '    return projectDesktopLocalChannelRuntime({'
assert lines[958].strip() == '});', lines[958]
lines[958] = '    });'
# remove the stray closing that we left in effective... check
p.write_text('\n'.join(lines), encoding='utf-8')
print('ok')
