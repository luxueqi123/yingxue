import io, os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
def apply(path, reps):
    p = os.path.join(REPO, path.replace("/", os.sep))
    raw = open(p,"rb").read(); crlf = b"\r\n" in raw
    lines = raw.decode("utf-8").replace("\r\n","\n").split("\n")
    blks,i = [],0
    while i < len(lines):
        if lines[i].startswith("<<<<<<< "):
            s=i;j=i;mid=None
            while not lines[j].startswith(">>>>>>> "):
                if lines[j].startswith("=======") and mid is None: mid=j
                j+=1
            blks.append((s,mid,j)); i=j+1
        else: i+=1
    for idx in sorted(reps, reverse=True):
        s,mid,e = blks[idx]; lines[s:e+1]=reps[idx]
    t="\n".join(lines); d=t.encode("utf-8")
    if crlf: d=d.replace(b"\r\n",b"\n").replace(b"\n",b"\r\n")
    open(p+".tmpmerge","wb").write(d); os.replace(p+".tmpmerge",p)
    print("OK",path,"blocks",len(blks))

# 主题：统一用上游 useActiveTheme()（画布/工作台双主题），映雪用例改为该 hook
apply("web/src/components/canvas/canvas-node-mask-edit-dialog.tsx", {
 0: [
  'import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";',
 ],
 1: [
  '    const [advancedOpen, setAdvancedOpen] = useState(true);',
  '    const theme = canvasThemes[useActiveTheme()];',
  '    const outpaint = useMemo(() => {',
  '        if (!image) return { geometry: null, error: "" };',
  '        try { return { geometry: resolveOutpaintGeometry(image.width, image.height, padding), error: "" }; }',
  '        catch (error) { return { geometry: null, error: error instanceof Error ? error.message : "扩图范围无效" }; }',
  '    }, [image, padding]);',
 ],
})

# skills 卡片：保留映雪选中态 class
apply("web/src/pages/skills/index.tsx", {0: [
  '        <article style={style} className={`product-collection-card library-card library-card-surface skill-library-card group${skill.isAdded ? " is-selected is-added" : ""}`}>',
  '            {cover ? <button type="button" className="skill-card-cover" onClick={onOpen} aria-label={`查看${skill.skillName}`}><img src={cover} alt={skill.skillName} loading="lazy" decoding="async" /></button> : <span className="skill-card-cover skill-card-cover-fallback">原资产暂无封面</span>}',
]})
