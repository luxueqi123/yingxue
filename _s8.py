import re
for tag,p in [("HEAD","_p_head.txt"),("ORIG","_p_orig.txt"),("WORK","web/src/pages/canvas/project.tsx")]:
    ls=open(p,encoding="utf-8").read().replace("\r\n","\n").split("\n")
    print("=====",tag)
    for i,l in enumerate(ls[:480]):
        s=l.strip()
        if re.match(r"^\} = useCanvasProject|const \{ ?nodes|nodes,$|^const \{$", s) or ("useCanvasProject(" in s) or s.startswith("nodes,") :
            print(" ",i+1,s[:110])
