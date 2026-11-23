import io,subprocess,re,sys
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob","%s:%s"%(rev,p)],capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8","replace").replace("\r\n","\n")
p=sys.argv[1]
def symbols(s):
    if s is None: return set()
    return set(re.findall(r"^export (?:async )?(?:function|const|type|class)\s+([A-Za-z0-9_]+)", s, re.M))
h=symbols(blob("HEAD",p)); u=symbols(blob("MERGE_HEAD",p)); d=symbols(io.open(p,encoding="utf-8").read())
print("HEAD 映雪导出:", len(h)); print("UP 导出:", len(u)); print("disk 导出:", len(d))
print("\n只在 HEAD(映雪) 有，disk 缺:"); print(sorted(h-d))
print("\n只在 UP 有，disk 缺:"); print(sorted(u-d))
print("\ndisk 独有:"); print(sorted(d-h-u))
