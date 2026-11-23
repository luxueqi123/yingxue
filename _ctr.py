import io,json,re
START="<!-- YINGCE_MANIFEST_CONTRACT_START -->"; END="<!-- YINGCE_MANIFEST_CONTRACT_END -->"
PH="<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
for pid in ["newapi-video-generations-v1","volcengine-ark-seedance"]:
    man=json.load(io.open("plugin-packages/%s/manifest.json"%pid,encoding="utf-8"))
    itf=io.open("plugin-packages/%s/docs/interface.md"%pid,encoding="utf-8").read().replace("\r\n","\n")
    i=itf.find(START); j=itf.find(END,i)
    if i<0 or j<0: print(pid,"NO CONTRACT"); continue
    seg=itf[i+len(START):j]
    m=re.search(r"```json\n(.*)\n```",seg,re.S)
    if not m: print(pid,"no json fenced block"); continue
    emb=json.loads(m.group(1))
    exp=json.loads(json.dumps(man)); exp["documentation"]=PH
    print("%-34s contract==manifest: %s"%(pid, json.dumps(emb,sort_keys=True,ensure_ascii=False)==json.dumps(exp,sort_keys=True,ensure_ascii=False)))
