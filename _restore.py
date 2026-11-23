import subprocess
for p in ["plugin-packages/newapi-video-generations-v1.yingce-plugin","plugin-packages/volcengine-ark-seedance.yingce-plugin"]:
    r=subprocess.run(["git","cat-file","blob",":"+p],capture_output=True)
    assert r.returncode==0 and len(r.stdout)>5000, (p, r.returncode, len(r.stdout))
    open(p,"wb").write(r.stdout)
    print("restored",p,len(r.stdout))
