import io,json,subprocess,os,re
BUN=r"D:\天琊书客\项目\天琊映雪无限画布\.local\bun-runtime\oven\package\bin\bun.exe"
root=r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912\web"
b=json.load(io.open("_iso_integrated.json",encoding="utf-8"))
files=[k for k,v in b.items() if v["fails"]]
out={}
for f in files:
    p=subprocess.run([BUN,"test",f],cwd=root,capture_output=True,text=True,encoding="utf-8",errors="replace")
    s=(p.stdout or "")+(p.stderr or "")
    errs=[]
    for ln in s.splitlines():
        t=ln.strip()
        if t.startswith("error:") or t.startswith("TypeError") or t.startswith("SyntaxError") or t.startswith("AssertionError"):
            if t not in errs: errs.append(t)
    out[f]=errs[:6]
    print("###",f)
    for e in out[f]: print("    ",e[:220])
json.dump(out, io.open("_errs.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
