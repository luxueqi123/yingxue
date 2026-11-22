import io,os,re,subprocess,sys,json
BUN=r"D:\天琊书客\项目\天琊映雪无限画布\.local\bun-runtime\oven\package\bin\bun.exe"
files=[l.strip() for l in io.open("_failfiles.txt",encoding="utf-8") if l.strip()]
out=io.open("_faillog.txt","w",encoding="utf-8")
for rel in files:
    p=subprocess.run([BUN,"test",rel],cwd="web",capture_output=True,text=True,encoding="utf-8",errors="replace")
    s=(p.stdout or "")+(p.stderr or "")
    out.write("\n\n========== FILE: "+rel+" ==========\n")
    # split by (fail)
    parts=re.split(r"(?m)^\(fail\)\s*", s)
    for part in parts[1:]:
        title=part.split("\n",1)[0].strip()
        out.write("\n--- FAIL: "+title+"\n")
        body=part
        # capture error blocks
        for m in re.finditer(r"(?m)^error: .*(?:\n(?![a-z]*\s*at ).*)*", body):
            out.write(m.group(0)[:900]+"\n")
        for m in re.finditer(r"at .*?\((.*?)\)", body):
            out.write("    AT "+m.group(1)+"\n")
            break
        for m in re.finditer(r"AT .*", body):
            pass
    out.flush()
out.close()
print("done")
