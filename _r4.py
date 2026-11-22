import io, os
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

# handler/payment.go —— 保留映雪的 readPaymentNotificationPayload（GET query 也走同一护栏）
apply("backend/internal/handler/payment.go", {
 0: [
  '\tpaymentNotificationHandler := func(c *gin.Context) {',
  '\t\trawBody, err := readPaymentNotificationPayload(c.Writer, c.Request)',
 ],
 1: [
  '\tr.GET("/payments/notify/:providerId/:configId", paymentNotificationHandler)',
  '\tr.POST("/payments/notify/:providerId/:configId", paymentNotificationHandler)',
 ],
})

# provider_task_cancellation.go —— 声明式取消是映雪新增能力，全部保留
apply("backend/internal/app/provider_task_cancellation.go", {
 0: [
  '\tif isComfyBridgeInterface(input.Config.InterfaceType) {',
  '\t\t// 尚未领取的请求可以确定取消并退款；已经在本机执行的工作流只能丢弃迟到结果并转人工核对。',
  '\t\trequest, requestErr := s.repo.ComfyBridgeRequest(task.ProviderRequestID)',
  '\t\ts.CancelComfyBridgeRequest(task.ProviderRequestID)',
  '\t\tif requestErr == nil && request.Status == "queued" {',
  '\t\t\tif err := s.taskBilling().RefundBilling(task.BillingOrderID, "本地 ComfyUI Bridge 请求在领取前取消"); err != nil {',
  '\t\t\t\treturn s.markProviderCancellationUncertain(task, "Bridge 请求已取消，但积分退回失败："+err.Error())',
  '\t\t\t}',
  '\t\t\tnow := time.Now()',
  '\t\t\tif err := s.repo.UpdateTaskProviderCancellation(task.ID, model.ProviderCancelStatusRequested, model.ProviderCancelStatusConfirmed, "", nil, &now); err != nil {',
  '\t\t\t\treturn err',
  '\t\t\t}',
  '\t\t\treturn nil',
  '\t\t}',
  '\t\treturn s.markProviderCancellationUncertain(task, "本地 ComfyUI Bridge 不支持取消已领取工作流，执行状态待核对")',
  '\t}',
  '\tctx = withProtocolRegistry(ctx, s.protocolRegistry())',
  '\tif !supportsProviderCancellation(input.Config.InterfaceType) && !supportsDeclarativeCancellation(ctx, input.Config.InterfaceType) {',
 ],
 1: [
  '\tqueryCtx = withProviderOutboundPolicy(queryCtx, input.Config)',
  '\tqueryCtx = withProtocolRegistry(queryCtx, s.protocolRegistry())',
 ],
 2: [
  '\tif !supportsProviderCancellation(config.InterfaceType) && supportsDeclarativeCancellation(ctx, config.InterfaceType) {',
  '\t\tadapter, _ := declarativeProtocolAdapterForContext(ctx, config.InterfaceType)',
  '\t\tspec, err := adapter.BuildCancel(ctx, protocol.PollContext{Model: config.Model, TaskID: providerRequestID})',
  '\t\tif err != nil {',
  '\t\t\treturn err',
  '\t\t}',
  '\t\t_, err = executeProtocolRequest(ctx, config, spec)',
  '\t\treturn err',
  '\t}',
  '\tswitch {',
  '\tcase config.InterfaceType == string(model.ChannelInterfaceGeminiVeo):',
 ],
 3: [
  '\tif !supportsProviderCancellation(config.InterfaceType) && supportsDeclarativeCancellation(ctx, config.InterfaceType) {',
  '\t\tadapter, _ := declarativeProtocolAdapterForContext(ctx, config.InterfaceType)',
  '\t\tpoll := protocol.PollContext{Model: config.Model, TaskID: providerRequestID}',
  '\t\tspec, err := adapter.BuildPoll(ctx, poll)',
  '\t\tif err != nil {',
  '\t\t\treturn "", "", err',
  '\t\t}',
  '\t\tbody, err := executeProtocolRequest(ctx, config, spec)',
  '\t\tif err != nil {',
  '\t\t\treturn "", "", err',
  '\t\t}',
  '\t\tresult, err := adapter.ParsePoll(ctx, poll, body)',
  '\t\tif err != nil {',
  '\t\t\treturn "", "", err',
  '\t\t}',
  '\t\tswitch result.Status {',
  '\t\tcase protocol.StatusCancelled:',
  '\t\t\treturn providerCancellationConfirmed, string(result.Status), nil',
  '\t\tcase protocol.StatusSucceeded:',
  '\t\t\treturn providerCancellationSucceeded, string(result.Status), nil',
  '\t\tcase protocol.StatusFailed:',
  '\t\t\treturn providerCancellationFailed, string(result.Status), nil',
  '\t\tdefault:',
  '\t\t\treturn providerCancellationPending, string(result.Status), nil',
  '\t\t}',
  '\t}',
  '\tswitch {',
  '\tcase config.InterfaceType == string(model.ChannelInterfaceGeminiVeo):',
 ],
})
