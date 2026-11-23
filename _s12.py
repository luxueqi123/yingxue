w=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
def d(a,b):
    for i in range(a-1,b):
        l=w[i]; print(i+1, len(l)-len(l.lstrip()), repr(l.strip()[:95]))
print("--- 2796..2806")
d(2796,2806)
print("--- 2840..2862")
d(2840,2862)
print("--- 2902..2912")
d(2902,2912)
print("--- 3316..3326")
d(3316,3326)
print("--- 3368..3380")
d(3368,3380)
