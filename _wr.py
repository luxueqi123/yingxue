import subprocess, io, sys, hashlib
def write_from_git(rev, path):
    raw = subprocess.run(["git","show","%s:%s"%(rev,path)],capture_output=True,check=True).stdout
    # git may apply smudge filters; force the blob bytes exactly
    blob = subprocess.run(["git","cat-file","blob","%s:%s"%(rev,path)],capture_output=True,check=True).stdout
    io.open(path,"wb").write(blob)
    return len(blob), hashlib.sha1(blob).hexdigest()
p="web/src/lib/generation-workflow-execution.ts"
n,h=write_from_git("98822b65",p)
print("wrote",n,h)
