import io
L=io.open("web/test/user-scoped-generation-persistence.test.ts",encoding="utf-8").read().split("\n")
for i,l in enumerate(L,1):
    if '"frontend"' in l or "模型目录" in l or "source" in l:
        print(i, l.strip()[:200])
