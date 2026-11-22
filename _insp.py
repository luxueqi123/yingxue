import io,re
s=io.open("_bun_test.txt",encoding="utf-8",errors="replace").read()
i=s.find("test\\workspace-sidebar-storage.test.ts:")
print("found at", i, "len", len(s))
print(repr(s[max(0,i-600):i+300]))
