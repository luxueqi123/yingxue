s=open("web/src/pages/create/index.tsx",encoding="utf-8").read().replace("\r\n","\n")
print("<<<",s.count("<<<<<<<"),"|||",s.count("|||||||"),"===",s.count("======="),">>>",s.count(">>>>>>>"))
print("len",len(s))
