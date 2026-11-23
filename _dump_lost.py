import io,json
d=json.load(io.open("_yx_lost.json",encoding="utf-8"))
out=io.open("_yx_lost_dump.txt","w",encoding="utf-8")
for p,n,t,lost in d:
    out.write("\n########## %s   lost=%d/%d\n"%(p,n,t))
    for l in lost: out.write("   "+l[:200]+"\n")
out.close()
print("written")
