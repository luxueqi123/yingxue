import io,json,os,zipfile
def check(pid):
    src="plugin-packages/"+pid
    rd=io.open(os.path.join(src,"README.md"),encoding="utf-8").read() if os.path.isfile(os.path.join(src,"README.md")) else None
    itf=io.open(os.path.join(src,"docs/interface.md"),encoding="utf-8").read()
    man=json.load(io.open(os.path.join(src,"manifest.json"),encoding="utf-8"))
    if rd is None: return "no README"
    want=rd.strip()+"\n\n---\n\n"+itf.strip()
    return "src docs consistent: %s" % (man.get("documentation","").strip()==want)
for pid in ["newapi-video-generations-v1","volcengine-ark-seedance","official-payment-xunhupay","autodl-comfyui"]:
    try: print("%-34s %s"%(pid,check(pid)))
    except FileNotFoundError as e: print("%-34s missing %s"%(pid,e.filename))
print()
# verify a known-good artifact's internal consistency
for pid in ["official-payment-xunhupay","deepseek-chat"]:
    z=zipfile.ZipFile("plugin-packages/%s.yingce-plugin"%pid)
    rd=z.read("README.md").decode("utf-8"); itf=z.read("docs/interface.md").decode("utf-8")
    man=json.loads(z.read("manifest.json").decode("utf-8"))
    want=rd.strip()+"\n\n---\n\n"+itf.strip()
    print("%-34s artifact docs consistent: %s"%(pid, man["documentation"].strip()==want))
