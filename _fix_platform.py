import pathlib
base = pathlib.Path(r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912\backend\internal\platform")

def rw(name, subs):
    p = base / name
    s = p.read_text(encoding="utf-8")
    for old, new, cnt in subs:
        c = s.count(old)
        assert c == cnt, (name, repr(old[:60]), c, cnt)
        s = s.replace(old, new)
    p.write_text(s, encoding="utf-8", newline="\n")
    print("ok", name)

rw("runtime_policy.go", [
    ("type RuntimeResourcePolicy struct {\n\tResourceUploadMB        int64 `json:\"resourceUploadMB\"`\n",
     "type RuntimeResourcePolicy struct {\n\tResourceUploadMB        int64 `json:\"resourceUploadMB\"`\n\tSessionUploadMB         int64 `json:\"sessionUploadMB\"`\n", 1),
    ("\tAssetCount              int64 `json:\"assetCount\"`\n\tCanvasCount             int64 `json:\"canvasCount\"`\n",
     "\tAssetCount              int64 `json:\"assetCount\"`\n\tCanvasCount             int64 `json:\"canvasCount\"`\n\tSessionCount            int64 `json:\"sessionCount\"`\n", 1),
    ("type RuntimeRequestPolicy struct {\n\tTaskCreatePerMinute        int   `json:\"taskCreatePerMinute\"`\n",
     "type RuntimeRequestPolicy struct {\n\tTaskCreatePerMinute        int   `json:\"taskCreatePerMinute\"`\n\tSessionCreatePerMinute     int   `json:\"sessionCreatePerMinute\"`\n", 1),
    ("\tResourceImportPerMinute    int   `json:\"resourceImportPerMinute\"`\n",
     "\tResourceImportPerMinute    int   `json:\"resourceImportPerMinute\"`\n\tSessionFilePerMinute       int   `json:\"sessionFilePerMinute\"`\n", 1),
    ("type PublicRuntimeLimits struct {\n\tActiveTaskLimit         int   `json:\"activeTaskLimit\"`\n\tResourceUploadMB        int64 `json:\"resourceUploadMB\"`\n",
     "type PublicRuntimeLimits struct {\n\tActiveTaskLimit         int   `json:\"activeTaskLimit\"`\n\tResourceUploadMB        int64 `json:\"resourceUploadMB\"`\n\tSessionUploadMB         int64 `json:\"sessionUploadMB\"`\n", 1),
    ("\t\t\tResourceUploadMB:        50,\n", "\t\t\tResourceUploadMB:        50,\n\t\t\tSessionUploadMB:         32,\n", 1),
    ("\t\t\tCanvasCount:             1_000,\n", "\t\t\tCanvasCount:             1_000,\n\t\t\tSessionCount:            1_000,\n", 1),
    ("\t\t\tTaskCreatePerMinute:        30,\n", "\t\t\tTaskCreatePerMinute:        30,\n\t\t\tSessionCreatePerMinute:     20,\n", 1),
    ("\t\t\tResourceImportPerMinute:    30,\n", "\t\t\tResourceImportPerMinute:    30,\n\t\t\tSessionFilePerMinute:       30,\n", 1),
    ("\t\tResourceUploadMB: maxRuntimeUploadMB, GeneratedFileMB: maxRuntimeUploadMB,",
     "\t\tResourceUploadMB: maxRuntimeUploadMB, SessionUploadMB: maxRuntimeUploadMB, GeneratedFileMB: maxRuntimeUploadMB,", 1),
    ("\t\tTaskDataGB: maxRuntimeStorageGB, AssetCount: maxRuntimeCount, CanvasCount: maxRuntimeCount,\n\t\tTaskCount: maxRuntimeCount, APICallLogCount: maxRuntimeCount,",
     "\t\tTaskDataGB: maxRuntimeStorageGB, AssetCount: maxRuntimeCount, CanvasCount: maxRuntimeCount,\n\t\tSessionCount: maxRuntimeCount, TaskCount: maxRuntimeCount, APICallLogCount: maxRuntimeCount,", 1),
    ("\t\tTaskCreatePerMinute:     maxRuntimeRate,\n",
     "\t\tTaskCreatePerMinute: maxRuntimeRate, SessionCreatePerMinute: maxRuntimeRate,\n", 1),
    ("\t\tAssetWritePerMinute: maxRuntimeRate, CanvasWritePerMinute: maxRuntimeRate,",
     "\t\tSessionFilePerMinute: maxRuntimeRate, AssetWritePerMinute: maxRuntimeRate, CanvasWritePerMinute: maxRuntimeRate,", 1),
    ("\t\tActiveTaskLimit: policy.Task.ActiveTaskLimit, ResourceUploadMB: policy.Resource.ResourceUploadMB,\n",
     "\t\tActiveTaskLimit: policy.Task.ActiveTaskLimit, ResourceUploadMB: policy.Resource.ResourceUploadMB,\n\t\tSessionUploadMB:         policy.Resource.SessionUploadMB,\n", 1),
    ("\t\t\"普通资源单文件\": resource.ResourceUploadMB,\n\t\t\"单个生成资源\":  resource.GeneratedFileMB,",
     "\t\t\"普通资源单文件\": resource.ResourceUploadMB, \"Agent 会话附件\": resource.SessionUploadMB,\n\t\t\"单个生成资源\": resource.GeneratedFileMB,", 1),
    ("\tif resource.ResourceUploadMB > storedMB || resource.GeneratedFileMB > storedMB {",
     "\tif resource.ResourceUploadMB > storedMB || resource.SessionUploadMB > storedMB || resource.GeneratedFileMB > storedMB {", 1),
    ("\t\t\"素材数量\": resource.AssetCount, \"画布数量\": resource.CanvasCount,",
     "\t\t\"素材数量\": resource.AssetCount, \"画布数量\": resource.CanvasCount, \"Agent 会话数量\": resource.SessionCount,", 1),
    ("\t\t\"任务创建频控\": request.TaskCreatePerMinute,",
     "\t\t\"任务创建频控\": request.TaskCreatePerMinute, \"会话创建频控\": request.SessionCreatePerMinute,", 1),
    ("\t\t\"素材写入频控\": request.AssetWritePerMinute,",
     "\t\t\"会话附件频控\": request.SessionFilePerMinute, \"素材写入频控\": request.AssetWritePerMinute,", 1),
])

rw("host.go", [
    ("\tAppendAudit(actor *model.User, action, targetType, targetID, summary string, metadata any) error\n",
     "\tAppendAudit(actor *model.User, action, targetType, targetID, summary string, metadata any) error\n\tDesktopLocalChannelsEnabled() bool\n", 1),
    ("\treturn nil\n}\nfunc (nopHost) ChannelConcurrencyLimit(string) (int, error) {",
     "\treturn nil\n}\nfunc (nopHost) DesktopLocalChannelsEnabled() bool { return false }\nfunc (nopHost) ChannelConcurrencyLimit(string) (int, error) {", 1),
])
