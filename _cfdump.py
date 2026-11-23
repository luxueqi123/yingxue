import io,json,subprocess,os,re
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
plan=json.load(io.open("_mt_plan_final.json",encoding="utf-8"))
out=io.open("_CONFLICTS.txt","w",encoding="utf-8")
for p,dl,ml,tt,use in plan:
    r=subprocess.run(["git","cat-file","blob","%s:%s"%(MT,p)],capture_output=True)
    s=r.stdout.decode("utf-8","replace").replace("\r\n","\n")
    if "<<<<<<< " not in s: continue
    out.write("\n\n############################ %s\n"%p)
    lines=s.split("\n")
    i=0; idx=0
    while i<len(lines):
        if lines[i].startswith("<<<<<<<"):
            idx+=1
            j=i+1
            head=[]; up=[]
            while j<len(lines) and not lines[j].startswith("======="):
                head.append(lines[j]); j+=1
            j+=1
            while j<len(lines) and not lines[j].startswith(">>>>>>>"):
                up.append(lines[j]); j+=1
            out.write("\n----- 冲突块 #%d (%s 行内 %d 行 / 上游 %d 行)\n"%(idx,p,len(head),len(up)))
            out.write("  [映雪侧]\n")
            for l in head[:8]: out.write("    | "+l[:180]+"\n")
            if len(head)>8: out.write("    | ...(共 %d 行)\n"%len(head))
            out.write("  [上游侧]\n")
            for l in up[:8]: out.write("    | "+l[:180]+"\n")
            if len(up)>8: out.write("    | ...(共 %d 行)\n"%len(up))
            i=j+1
        else: i+=1
out.close()
print("written", os.path.getsize("_CONFLICTS.txt"))
