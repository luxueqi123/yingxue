import subprocess
def git(ref,p): return subprocess.run(["git","show",f"{ref}:{p}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
p="web/src/pages/canvas/project.tsx"
B=git("01a2d171",p); H=git("HEAD",p); O=git("MERGE_HEAD",p)
def show(tag,ls):
    print("=====",tag)
    for i,l in enumerate(ls):
        if "angleNode?.metadata?.content" in l or "lightingNode?.metadata?.content" in l or "emotionNode?.metadata?.content" in l:
            print(" ",i+1,l.strip()[:110])
            for j in range(i,i+8): print("     ",j+1,ls[j].strip()[:105])
show("BASE",B); show("HEAD",H); show("ORIG",O)
