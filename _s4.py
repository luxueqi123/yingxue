h=open('_p_head.txt',encoding='utf-8').read().replace('\r\n','\n').split('\n')
o=open('_p_orig.txt',encoding='utf-8').read().replace('\r\n','\n').split('\n')
w=open('web/src/pages/canvas/project.tsx',encoding='utf-8').read().replace('\r\n','\n').split('\n')
print('=== HEAD CanvasScriptEditor at:')
for i,l in enumerate(h):
    if 'CanvasScriptEditor' in l: print('  ',i+1,len(l)-len(l.lstrip()),l.strip()[:70])
print('=== ORIG CanvasScriptEditor at:')
for i,l in enumerate(o):
    if 'CanvasScriptEditor' in l: print('  ',i+1,len(l)-len(l.lstrip()),l.strip()[:70])
print('=== HEAD around its block 3290-3330')
for i in range(3289,3330): print(i+1,len(h[i])-len(h[i].lstrip()),h[i].strip()[:80])
print('=== WORK 3300-3325')
for i in range(3299,3325): print(i+1,len(w[i])-len(w[i].lstrip()),w[i].strip()[:80])
