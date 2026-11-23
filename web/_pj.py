import io
p="src/pages/canvas/project.tsx"
s=io.open(p,encoding="utf-8",newline="").read()
i=s.find("<CanvasNodePromptPanel")
print(s[i:i+1400])
