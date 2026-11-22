import io,subprocess,os,sys,difflib
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
def mt(p):
    r=subprocess.run(["git","cat-file","blob",MT+":"+p],capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8","replace").replace("\r\n","\n")
paths=[l.strip() for l in io.open("_mtcheck_input.txt",encoding="utf-8") if l.strip()]
for p in paths:
    m=mt(p)
    if m is None:
        print("== %s : NOT-IN-MT"%p); continue
    markers=m.count("<<<<<<<")+m.count(">>>>>>>")
    try: d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    except FileNotFoundError: d=None
    if d is None: print("== %s : NO-DISK (mt markers=%d)"%(p,markers)); continue
    dl=[l for l in difflib.unified_diff(m.split("\n"),d.split("\n"),"MT","disk",lineterm="",n=1)]
    print("== %s : conflictmarks=%d mtdiff=%d disk_lines=%d mt_lines=%d"%(p,markers,m.count("<<<<<<<")+m.count("=======")+m.count(">>>>>>>"),len(d.split("\n")),len(m.split("\n"))))
