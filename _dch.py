import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
s=blob("MERGE_HEAD","backend/internal/app/desktop_local_channel.go")
print("UP has desktop_local_channel.go:", s is not None)
s2=blob("HEAD","backend/internal/app/desktop_local_channel.go")
print("HEAD has:", s2 is not None)
s3=blob("MERGE_HEAD","backend/internal/app/host.go")
print("UP host.go exists:", s3 is not None)
