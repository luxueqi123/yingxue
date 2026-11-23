import io
p="web/src/components/canvas/canvas-node-prompt-panel.tsx"
s=io.open(p,encoding="utf-8",newline="").read()
reps=[
 ("onInsert?: (reference: CanvasResourceReference) => void;",
  "onInsert: (reference: CanvasResourceReference) => void;"),
 ("onClick={() => (canPreview ? setImagePreview(reference) : onInsert?.(reference))}",
  "onClick={() => (canPreview ? setImagePreview(reference) : onInsert(reference))}"),
]
for a,b in reps:
    if a not in s: print("MISS:",a[:70]); continue
    s=s.replace(a,b,1); print("ok:",a[:60])
io.open(p,"w",encoding="utf-8",newline="").write(s)
