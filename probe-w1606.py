import re

s = open('D:/天琊书客/项目/天琊映雪无限画布/.local/cache/ltv-original/recovered/2nkeqbyl30agw.js', encoding='utf-8', errors='ignore').read()
print('len', len(s))
for pat in [r'"text2video","mixed2video"', r'text2video.{0,40}mixed2video']:
    hits = list(re.finditer(pat, s))
    print('=== pat', pat, len(hits))
    for m in hits[:4]:
        a = max(0, m.start() - 700)
        b = min(len(s), m.end() + 700)
        print('-----', m.start())
        print(s[a:b])
