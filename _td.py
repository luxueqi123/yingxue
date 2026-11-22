import subprocess,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n","\n")
up=L(blob("MERGE_HEAD","web/src/pages/tasks/index.tsx")).decode("utf-8","replace").split("\n")
dk=L(open("web/src/pages/tasks/index.tsx","rb").read()).decode("utf-8","replace").split("\n")
# find the toolbar region in disk
for i,l in enumerate(dk,1):
    if "ListToolbar" in l or "task-collection-toolbar" in l or "collection-toolbar" in l:
        print("disk %4d %s"%(i,l[:150]))
