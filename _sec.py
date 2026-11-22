import io
p="web/src/pages/settings/index.tsx"
L=io.open(p,encoding="utf-8",newline="").read().replace("\r\n","\n").split("\n")
for i,l in enumerate(L,1):
    if ("ConfigSectionKey" in l or "sectionItems" in l or "key: \"" in l or "SECTIONS" in l
        or "Icon:" in l or "const configSections" in l or "\"preferences\":" in l or "prompts:" in l
        or "storage:" in l or "diagnostics:" in l or "\"prompts\"" in l or "Boxes" in l):
        print("%4d %s"%(i,l[:170]))
