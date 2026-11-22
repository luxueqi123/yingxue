import glob, json, collections

files = glob.glob('web/public/production-library/case-projects/*.json')
markers = ['kling-v2-5', 'kling-v3-motion-control', 'viduq2', 'viduq3', 'pixverse',
           'wanxiang', 'star-video2.5', 'prompt_extend', 'extendPrompt',
           'dialogueLines', 'scenePayload', 'pictureEditLock', 'multiClip',
           'voice_setting', 'stability']
found = collections.defaultdict(list)
keys = collections.Counter()
for f in files:
    d = json.load(open(f, encoding='utf-8'))
    for n in d.get('nodes', []):
        md = n.get('metadata') or {}
        for k in md:
            keys[k] += 1
        for k in markers:
            if k in json.dumps(md, ensure_ascii=False):
                found[k].append(f.split('/')[-1])
print('published files', len(files))
for k in markers:
    print(k, len(found[k]), found[k][:4])
print()
print('metadata keys:', keys.most_common(40))
