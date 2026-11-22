h=open('_p_head.txt',encoding='utf-8').read().replace('\r\n','\n').split('\n')
o=open('_p_orig.txt',encoding='utf-8').read().replace('\r\n','\n').split('\n')
w=open('web/src/pages/canvas/project.tsx',encoding='utf-8').read().replace('\r\n','\n').split('\n')
keys=['<CanvasOverlayLayerProvider','</CanvasOverlayLayerProvider>','canvas-editor-shell','relative flex min-h-0 min-w-0 flex-1','relative min-w-0 flex-1 overflow-hidden','<section data-canvas-editor','</section>','<main id="canvas-main"','</main>','<>','</>','<div className={versions.open ? "hidden" : "contents"}>']
for tag,ls in [('HEAD',h),('ORIG',o),('WORK',w)]:
    print('=====',tag)
    for i,l in enumerate(ls):
        s=l.strip()
        if any(k in s for k in keys) and (len(l)-len(l.lstrip()))<=32:
            print(' ',i+1,len(l)-len(l.lstrip()),s[:80])
