import io
p="web/src/components/canvas/canvas-node-prompt-panel.tsx"
s=io.open(p,encoding="utf-8",newline="").read()
reps=[
 ("onInsert={mediaEnhancement ? undefined : insertPromptReference}",
  "onInsert={insertPromptReference}"),
 ('title={onInsert ? `插入 @${reference.label}` : `预览 ${reference.label}`} onClick={() => onInsert ? onInsert(reference) : setImagePreview(reference)}',
  'title={`插入 @${reference.label}`} onClick={() => onInsert(reference)}'),
]
for a,b in reps:
    if a not in s: print("MISS:",a[:80])
    else: s=s.replace(a,b,1); print("ok:",a[:70])
io.open(p,"w",encoding="utf-8",newline="").write(s)
