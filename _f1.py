import io
p="web/src/stores/use-config-store.ts"
s=io.open(p,encoding="utf-8").read()
old='''        baseUrl: providedBaseUrl || (interfaceType ? defaultBaseUrlForChannelInterface(interfaceType) : defaultBaseUrlForApiFormat(apiFormat)),
        apiKey: channel?.apiKey || "",'''
new='''        baseUrl: providedBaseUrl || (interfaceType ? defaultBaseUrlForChannelInterface(interfaceType) : defaultBaseUrlForApiFormat(apiFormat)),
        allowLocalChannel: channel?.allowLocalChannel === true,
        apiKey: channel?.apiKey || "",'''
assert old in s
s=s.replace(old,new,1)
io.open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
