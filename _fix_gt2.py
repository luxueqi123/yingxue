import io
p="web/src/services/api/generation-task.ts"
s=io.open(p,encoding="utf-8",newline="").read()
o=s
# A) allowLocalChannel (映雪本机渠道) —— 上游删掉了
old='''    return {
        channelId: requestConfig.channelId,
        apiFormat: requestConfig.apiFormat,
        interfaceType: requestConfig.interfaceType,
        baseUrl: requestConfig.baseUrl,
        apiKey: requestConfig.apiKey,'''
new='''    return {
        channelId: requestConfig.channelId,
        apiFormat: requestConfig.apiFormat,
        interfaceType: requestConfig.interfaceType,
        baseUrl: requestConfig.baseUrl,
        allowLocalChannel: requestConfig.allowLocalChannel === true,
        apiKey: requestConfig.apiKey,'''
assert old in s; s=s.replace(old,new)
# B) comfy bridge (映雪) —— 上游删掉了
old='''function workflowProviderConfig(config: AiConfig, requestConfig: ReturnType<typeof resolveModelRequestConfig>, workflow: GenerationWorkflowExecution) {
    const runningHubActive = workflow.provider === "runninghub";
    return {
        channelId: "",
        apiFormat: requestConfig.apiFormat,
        interfaceType: workflow.interfaceType,
        baseUrl: config.runningHub.baseUrl,
        apiKey: runningHubActive ? config.runningHub.apiKey : "",'''
new='''function workflowProviderConfig(config: AiConfig, requestConfig: ReturnType<typeof resolveModelRequestConfig>, workflow: GenerationWorkflowExecution) {
    const runningHubActive = workflow.provider === "runninghub";
    const comfyBridgeActive = workflow.provider === "comfyui-bridge";
    return {
        channelId: "",
        apiFormat: requestConfig.apiFormat,
        interfaceType: workflow.interfaceType,
        baseUrl: comfyBridgeActive ? "bridge://local" : config.runningHub.baseUrl,
        allowLocalChannel: false,
        apiKey: runningHubActive ? config.runningHub.apiKey : "",'''
assert old in s; s=s.replace(old,new)
old='''        workflowFields: workflow.workflowFields,
        runningHubUseWallet: false,'''
new='''        workflowFields: workflow.workflowFields,
        bridgeId: workflow.bridgeId,
        runningHubUseWallet: false,'''
assert old in s; s=s.replace(old,new)
io.open(p,"w",encoding="utf-8",newline="").write(s)
print("changed:", s!=o, "lines:", s.count("\n")+1)
