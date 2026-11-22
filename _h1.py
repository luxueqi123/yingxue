from pathlib import Path
h = Path('.local/cache/_h_cfg.ts').read_text(encoding='utf-8')
print('has channelLabel:', 'channelLabel' in h)
print('has agent-plan base:', 'volcengine-ark-agent-plan-image' in h)
for i, l in enumerate(h.split('\n'), 1):
    if 'displayName?: string;' in l or 'dashscope-wanx-video' in l:
        print(i, l)
