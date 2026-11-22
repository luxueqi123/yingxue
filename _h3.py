from pathlib import Path
t = Path('web/src/stores/use-config-store.ts').read_text(encoding='utf-8')
for name in ['allowLocalChannel?: boolean;', 'publicAlias?: string;', 'transport?: "backend-channel" | "local-runtime";', 'localModels?: DreaminaLocalModel[];', 'export function effectiveConfigWithDreamina', 'comfyBridge: ComfyBridgeConfig;']:
    print('%-55s count=%d' % (name, t.count(name)))
