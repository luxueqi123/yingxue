import subprocess
P="web/src/pages/create/index.tsx"
def raw(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8")
H=raw("HEAD"); O=raw("MERGE_HEAD")
print("HEAD crlf count", H.count("\r\n"), "len", len(H))
print("ORIG crlf count", O.count("\r\n"))
hl=H.replace("\r\n","\n").split("\n")
for i in range(48,72): print("H",i+1,repr(hl[i][:150]))
print("---- orig")
ol=O.replace("\r\n","\n").split("\n")
for i in range(48,80): print("O",i+1,repr(ol[i][:150]))
