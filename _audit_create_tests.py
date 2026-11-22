import os,re,json
files=['web/test/create-canvas-handoff.test.ts','web/test/create-library-button.test.ts','web/test/generation-task-local.test.ts','web/test/local-cli-settings.test.ts']
idx=open('web/src/pages/create/index.tsx',encoding='utf-8').read()
ws=open('web/src/pages/create/creation-workspace.tsx',encoding='utf-8').read()
head_idx=open('.local/cache/_head_create.tsx',encoding='utf-8').read()
orig_idx=open('.local/cache/_orig_create.tsx',encoding='utf-8').read()
head_ws=open('.local/cache/_head_ws.tsx',encoding='utf-8').read()
orig_ws=open('.local/cache/_orig_ws.tsx',encoding='utf-8').read()

def sources_in(s):
    # map var name -> target file name
    m={}
    for mm in re.finditer(r'const\s+(\w+)\s*=\s*(?:await\s+)?(?:Bun\.file\(new URL\("([^"]+)"[^)]*\)\)\.text\(\)|readFileSync\(resolve\(import\.meta\.dir,\s*"([^"]+)"\)[^)]*\))',s):
        var=mm.group(1); target=mm.group(2) or mm.group(3)
        m[var]=target
    return m

rows=[]
for p in files:
    s=open(p,encoding='utf-8').read()
    m=sources_in(s)
    for mm in re.finditer(r'expect\((\w+)(\)?)\.?(not)?\.?toContain\(\s*(["\'])(.*?)\4',s,re.S):
        var=mm.group(1); neg=bool(mm.group(3)); lit=mm.group(5)
        tgt=m.get(var)
        if not tgt: continue
        rows.append((os.path.basename(p),var,tgt,('NOT ' if neg else '')+lit))

seen=set()
for f,var,tgt,lit in rows:
    key=(f,var,lit)
    if key in seen: continue
    seen.add(key)
    short=tgt.replace('../src/','')
    cand={'idx':idx,'ws':ws,'head_idx':head_idx,'orig_idx':orig_idx,'head_ws':head_ws,'orig_ws':orig_ws}
    keyf={'pages/create/index.tsx':'idx','pages/create/creation-workspace.tsx':'ws'}.get(short)
    res=[]
    for name,content in cand.items():
        res.append(f'{name}={"Y" if lit.replace("\\\\","\\") in content else "n"}')
    print(f'{f[:26]:27} {short:34} {" ".join(res)}  {lit[:90]}')
