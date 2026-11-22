import io,json,zipfile,os
def norm(b): return b.replace(b"\r\n",b"\n")
for pid in ["newapi-video-generations-v1","volcengine-ark-seedance"]:
    z=zipfile.ZipFile("plugin-packages/%s.yingce-plugin"%pid)
    inner=norm(z.read("manifest.json"))
    src=norm(open("plugin-packages/%s/manifest.json"%pid,"rb").read())
    rd=z.read("README.md").decode("utf-8"); itf=z.read("docs/interface.md").decode("utf-8")
    m=json.loads(inner.decode("utf-8"))
    print("%-32s ver=%s selfconsistent=%s docs=%s"%(pid,m["version"],inner==src,m["documentation"].strip()==(rd.strip()+"\n\n---\n\n"+itf.strip())))
