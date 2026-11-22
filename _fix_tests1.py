import io, os, re
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"

def patch(rel, subs):
    p = os.path.join(REPO, rel.replace("/", os.sep))
    raw = open(p,"rb").read(); crlf = b"\r\n" in raw
    t = raw.decode("utf-8").replace("\r\n","\n")
    for a, b in subs:
        if a not in t:
            raise SystemExit("MISSING in %s: %r" % (rel, a[:80]))
        t = t.replace(a, b)
    d = t.encode("utf-8")
    if crlf: d = d.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    open(p+".tmpmerge","wb").write(d); os.replace(p+".tmpmerge", p)
    print("patched", rel)

patch("backend/internal/app/provider_upload_runtime_test.go", [
 ("runProtocolAdapterTaskWithTiming(ctx, input, adapter, protocolPollTiming{})",
  "runProtocolAdapterTaskWithPolicy(ctx, input, adapter, fastVideoPollPolicy())"),
])
patch("backend/internal/app/topaz_video_runtime_test.go", [
 ("runProtocolAdapterTaskWithTiming(ctx, input, adapter, protocolPollTiming{})",
  "runProtocolAdapterTaskWithPolicy(ctx, input, adapter, fastVideoPollPolicy())"),
])
patch("backend/internal/app/topaz_image_runtime_test.go", [
 ("runProtocolAdapterTaskWithTiming(ctx, input, adapters[0], protocolPollTiming{PollInterval: time.Millisecond})",
  "runProtocolAdapterTaskWithPolicy(ctx, input, adapters[0], fastVideoPollPolicy())"),
])
