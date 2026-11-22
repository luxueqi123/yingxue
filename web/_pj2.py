import io
p="src/pages/canvas/project.tsx"
s=io.open(p,encoding="utf-8",newline="").read()
i=s.find("<CanvasNodePromptPanel")
seg=s[i:i+4000]
j=seg.find("onInsert")
print("onInsert found at offset", j)
print(seg[max(0,j-700):j+700] if j>=0 else "NOT FOUND in block")
