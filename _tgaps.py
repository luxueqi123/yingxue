import io,os,re
s=io.open("_faillog.txt",encoding="utf-8").read()
blocks=re.split(r"\n--- FAIL: ",s)
root=os.getcwd()
for b in blocks[1:]:
    title=b.split("\n",1)[0].split(" [")[0].strip()
    m=re.search(r"AT ([A-Za-z]:\\\\[^:]+?|.*?)(\d+):(\d+)", b.replace("\\\\","\\"))
    path=None;ln=None
    for mm in re.finditer(r"AT\s+(.+?):(\d+):(\d+)", b):
        p=mm.group(1).strip()
        if "\\web\\test\\" in p or "/web/test/" in p:
            path=p; ln=int(mm.group(2)); break
    if not path:
        for mm in re.finditer(r"AT\s+(.+?):(\d+):(\d+)", b):
            p=mm.group(1).strip()
            path=p; ln=int(mm.group(2)); break
    if not path or ln is None:
        print("### %s   (no line)" % title); continue
    p=path.replace("D:\\天琊书客\\项目\\yingxue-upstream-v129-integration-20260912\\","").replace("\\","/")
    try:
        lines=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n").split("\n")
        seg=lines[max(0,ln-3):ln+2]
        print("### %s\n    %s:%s" % (title,p,ln))
        for i,l in enumerate(seg): print("      %4d| %s" % (max(0,ln-3)+i+1, l.strip()[:200]))
    except Exception as e:
        print("### %s\n    %s:%s  ERR %s" % (title,p,ln,e))
