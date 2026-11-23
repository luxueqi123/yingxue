import io
p="web/src/services/api/generation-task.ts"
s=io.open(p,encoding="utf-8",newline="").read()
n=s.replace("const prepared = await prepareGenerationReferences({ config, referenceImages, referenceVideos, referenceAudios, mask });",
            "const prepared = await prepareGenerationReferences({ config, mode, referenceImages, referenceVideos, referenceAudios, mask });")
assert n!=s
io.open(p,"w",encoding="utf-8",newline="").write(n)
print("ok")
