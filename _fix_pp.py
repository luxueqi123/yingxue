# -*- coding: utf-8 -*-
import os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
p = os.path.join(REPO, "backend/internal/app/provider_protocol.go")
raw = open(p, "rb").read(); crlf = b"\r\n" in raw
t = raw.decode("utf-8").replace("\r\n", "\n")

start = t.index("\tif needsUpload {\n\t\t\ttargets, err := uploader.BuildUploads")
end = t.index("\tif createdProviderTask && input.Config.InterfaceType == string(model.ChannelInterfaceNewAPIChannel2) {")
new_upload = '''\t\tif needsUpload {
\t\t\ttargets, err := uploader.BuildUploads(ctx, protocol.RequestContext{BaseURL: input.Config.BaseURL, Request: request}, body)
\t\t\tif err != nil {
\t\t\t\treturn nil, err
\t\t\t}
\t\t\tuploadState = &providerUploadCheckpoint{TaskID: uploadTask.ID, UserID: uploadTask.UserID, ProviderID: taskID, InterfaceType: input.Config.InterfaceType, InputDigest: uploadDigest}
\t\t\tfor _, target := range targets {
\t\t\t\tif target.VideoIndex < 0 || target.VideoIndex >= len(request.Videos) {
\t\t\t\t\treturn nil, errors.New("上传视频引用不存在")
\t\t\t\t}
\t\t\t\tuploadState.Targets = append(uploadState.Targets, providerUploadTarget{URL: target.URL, VideoIndex: target.VideoIndex})
\t\t\t}
\t\t\tif err := uploadService.saveProviderUploadCheckpoint(uploadTask, *uploadState); err != nil {
\t\t\t\treturn nil, err
\t\t\t}
\t\t}
\t\tcreatedProviderTask = true
\t}
\t// 原片上传与轮询是同一个外部任务的两段：恢复时既不重建任务，也不重复上传已接收的分片。
\t// 上传完成前不进轮询循环，避免上游在素材未就绪时把任务判失败。
\tif needsUpload {
\t\tif !createdProviderTask && uploadState.Next < len(uploadState.Targets) {
\t\t\tpoll := protocol.PollContext{BaseURL: input.Config.BaseURL, Model: request.Model, Request: request, TaskID: taskID}
\t\t\tspec, err := adapter.BuildPoll(ctx, poll)
\t\t\tif err != nil {
\t\t\t\treturn nil, err
\t\t\t}
\t\t\tbody, err := executeProtocolRequest(withProviderRequestKind(ctx, "poll"), input.Config, spec)
\t\t\tif err != nil {
\t\t\t\treturn nil, err
\t\t\t}
\t\t\taccepted, err := uploader.ParseUploadedVideos(ctx, poll, body)
\t\t\tif err != nil {
\t\t\t\treturn nil, err
\t\t\t}
\t\t\tif accepted < uploadState.Next || accepted > len(uploadState.Targets) {
\t\t\t\treturn nil, errors.New("供应商上传进度与本地记录冲突")
\t\t\t}
\t\t\tif recovery, ok := adapter.(protocol.UploadRecoveryAdapter); ok {
\t\t\t\ttargets, err := recovery.RecoverUploads(ctx, poll, body)
\t\t\t\tif err != nil {
\t\t\t\t\treturn nil, err
\t\t\t\t}
\t\t\t\tif len(targets) != len(uploadState.Targets) {
\t\t\t\t\treturn nil, errors.New("供应商恢复上传数量与原片不匹配")
\t\t\t\t}
\t\t\t\tuploadState.Targets = make([]providerUploadTarget, len(targets))
\t\t\t\tfor index, target := range targets {
\t\t\t\t\tuploadState.Targets[index] = providerUploadTarget{URL: target.URL, VideoIndex: target.VideoIndex}
\t\t\t\t}
\t\t\t\tuploadState.Next = accepted
\t\t\t\tif err := uploadService.persistProviderUploadCheckpoint(uploadTask, *uploadState, true); err != nil {
\t\t\t\t\treturn nil, err
\t\t\t\t}
\t\t\t} else if accepted > uploadState.Next {
\t\t\t\tuploadState.Next = accepted
\t\t\t\tif err := uploadService.saveProviderUploadCheckpoint(uploadTask, *uploadState); err != nil {
\t\t\t\t\treturn nil, err
\t\t\t\t}
\t\t\t}
\t\t}
\t\tfor uploadState.Next < len(uploadState.Targets) {
\t\t\ttarget := uploadState.Targets[uploadState.Next]
\t\t\tif target.VideoIndex < 0 || target.VideoIndex >= len(request.Videos) {
\t\t\t\treturn nil, errors.New("恢复上传的视频引用不存在")
\t\t\t}
\t\t\tif err := putProtocolMediaUpload(ctx, input.Config, target.URL, request.Videos[target.VideoIndex]); err != nil {
\t\t\t\treturn nil, err
\t\t\t}
\t\t\tuploadState.Next++
\t\t\tif err := uploadService.saveProviderUploadCheckpoint(uploadTask, *uploadState); err != nil {
\t\t\t\treturn nil, err
\t\t\t}
\t\t}
\t}
'''
t = t[:start] + new_upload + t[end:]

old_delay = '''\tif createdProviderTask && input.Config.InterfaceType == string(model.ChannelInterfaceNewAPIChannel2) {
\t\tif err := sleepContext(ctx, timing.InitialDelay); err != nil {
\t\t\treturn nil, err
\t\t}
\t}

'''
assert old_delay in t, "delay block missing"
t = t.replace(old_delay, "", 1)

d = t.encode("utf-8")
if crlf:
    d = d.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
open(p + ".tmpmerge", "wb").write(d); os.replace(p + ".tmpmerge", p)
print("provider_protocol.go merged")
