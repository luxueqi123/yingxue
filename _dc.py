import io,subprocess,sys,re
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
def mt(p):
    r=subprocess.run(["git","cat-file","blob",MT+":"+p],capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8","replace").replace("\r\n","\n")
p=sys.argv[1]
s=mt(p)
if s is None: print("not in MT"); sys.exit()
lines=s.split("\n")
i=0; n=0
while i<len(lines):
    if lines[i].startswith("<<<<<<<"):
        n+=1
        start=max(0,i-8)
        j=i
        while j<len(lines) and not lines[j].startswith(">>>>>>>"): j+=1
        print("#### conflict #%d  (ctx lines %d-%d)"%(n,start+1,j+1))
        print("----- before -----")
        print("\n".join(lines[start:i]))
        print("----- block -----")
        print("\n".join(lines[i:j+1]))
        print("----- after -----")
        print("\n".join(lines[j+1:j+9]))
        i=j+1
    else: i+=1
