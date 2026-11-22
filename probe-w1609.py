path = 'D:/天琊书客/项目/天琊映雪无限画布/.local/cache/w1602-klingfail.txt'
blocks = open(path, encoding='utf-8').read().split('\n')
out = []
i = 0
while i < len(blocks):
    if blocks[i] and not blocks[i].startswith(' '):
        head = blocks[i]
        f = blocks[i+1] if i+1 < len(blocks) else ''
        c = blocks[i+2] if i+2 < len(blocks) else ''
        k = ''
        for j in range(i+3, min(i+6, len(blocks))):
            if blocks[j].startswith('  kling='):
                k = blocks[j]
                break
        out.append((head, f, c, k))
        i += 1
    else:
        i += 1
seen = set()
for head, f, c, k in out:
    key = head.split(' src=')[0]
    if key in seen:
        continue
    seen.add(key)
    sfx, nid = head.split(' src=')[0].split()
    print(sfx, nid[:12], '|', c.strip()[:110], '|', k.strip()[:70])
