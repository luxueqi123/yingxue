# -*- coding: utf-8 -*-
import os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
def apply(path, reps):
    p = os.path.join(REPO, path.replace("/", os.sep))
    raw = open(p,"rb").read(); crlf = b"\r\n" in raw
    lines = raw.decode("utf-8").replace("\r\n","\n").split("\n")
    blks,i = [],0
    while i < len(lines):
        if lines[i].startswith("<<<<<<< "):
            s=i;j=i;mid=None
            while not lines[j].startswith(">>>>>>> "):
                if lines[j].startswith("=======") and mid is None: mid=j
                j+=1
            blks.append((s,mid,j)); i=j+1
        else: i+=1
    for idx in sorted(reps, reverse=True):
        s,mid,e = blks[idx]; lines[s:e+1]=reps[idx]
    t="\n".join(lines); d=t.encode("utf-8")
    if crlf: d=d.replace(b"\r\n",b"\n").replace(b"\n",b"\r\n")
    open(p+".tmpmerge","wb").write(d); os.replace(p+".tmpmerge",p)
    print("OK",path,"blocks",len(blks))

# repository/finance.go —— 三方并集：映雪缓存写入 + 上游 usage_source
apply("backend/internal/repository/finance.go", {
 0: [
  '\t\t\t\t"cache_write_tokens": usage.CacheWriteTokens, "cache_write_tokens_available": usage.CacheWriteTokensAvailable,',
  '\t\t\t\t"usage_available": usageSource == billingUsageSourceProvider, "usage_source": usageSource}',
 ],
 1: [
  '\t\t\t"cached_tokens": observedUsage.CachedTokens, "usage_available": observedUsageSource == billingUsageSourceProvider,',
  '\t\t\t"cache_write_tokens": observedUsage.CacheWriteTokens, "cache_write_tokens_available": observedUsage.CacheWriteTokensAvailable,',
  '\t\t\t"usage_source": observedUsageSource, "updated_at": time.Now(),',
 ],
 2: [
  '\t\t\torderUpdates["cache_write_tokens"] = usage.CacheWriteTokens',
  '\t\t\torderUpdates["cache_write_tokens_available"] = usage.CacheWriteTokensAvailable',
  '\t\t\torderUpdates["usage_available"] = usageSource == billingUsageSourceProvider',
  '\t\t\torderUpdates["usage_source"] = usageSource',
 ],
})

# provider_protocol.go —— 保留映雪的原片上传/恢复整段（上游无对应实现）
p = os.path.join(REPO, "backend/internal/app/provider_protocol.go")
raw = open(p,"rb").read(); crlf = b"\r\n" in raw
lines = raw.decode("utf-8").replace("\r\n","\n").split("\n")
s = [i for i,l in enumerate(lines) if l.startswith("<<<<<<< ")][0]
e = [i for i,l in enumerate(lines) if l.startswith(">>>>>>> ")][0]
mid = [i for i in range(s,e) if lines[i].startswith("=======")][0]
ours = lines[s+1:mid]
assert ours[0].strip().startswith("if needsUpload {"), ours[0]
assert ours[-1].strip().startswith("if createdProviderTask &&"), ours[-1]
lines[s:e+1] = ours
t = "\n".join(lines); d = t.encode("utf-8")
if crlf: d=d.replace(b"\r\n",b"\n").replace(b"\n",b"\r\n")
open(p+".tmpmerge","wb").write(d); os.replace(p+".tmpmerge",p)
print("OK provider_protocol.go kept ours", len(ours), "lines")
