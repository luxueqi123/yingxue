import subprocess,json,io
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
p="plugin-packages/newapi-video-generations-v1/manifest.json"
for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
    b=blob(rev,p)
    if b is None: print(rev,"absent"); continue
    d=json.loads(b.decode("utf-8"))
    arr=d["contributes"]["providers"][0]["response"]["videos"]["$coalesce"]
    hasmap=any(isinstance(x,dict) and "$map" in x for x in arr)
    print(rev,"ver",d["version"],"hasMap",hasmap)
print("---- test file case presence ----")
tp="backend/internal/protocol/official_catalog_test.go"
for rev in ["HEAD","MERGE_HEAD"]:
    b=blob(rev,tp)
    s=b.decode("utf-8")
    i=s.find("func TestNewAPIVideoGenerationsParsesNestedVideoResults")
    seg=s[i:i+1600] if i>=0 else ""
    print(rev,"hasFunc",i>=0,"hasDataArrayCase", "provider data array URL" in seg)
