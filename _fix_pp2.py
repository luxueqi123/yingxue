import io, os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
p = os.path.join(REPO, "backend/internal/app/provider_protocol.go")
raw = open(p,"rb").read(); crlf = b"\r\n" in raw
t = raw.decode("utf-8").replace("\r\n","\n")

# fix indentation of the needsUpload block inside create branch
t = t.replace("\t\t\tif needsUpload {\n\t\t\ttargets, err := uploader.BuildUploads",
              "\t\tif needsUpload {\n\t\t\ttargets, err := uploader.BuildUploads", 1)

# declare createdProviderTask alongside taskID
old = "\ttaskID := resumedProviderRequestID(ctx)\n\tuploader, needsUpload := adapter.(protocol.UploadAdapter)\n"
assert old in t
t = t.replace(old,
  "\ttaskID := resumedProviderRequestID(ctx)\n"
  "\tcreatedProviderTask := false\n"
  "\tuploader, needsUpload := adapter.(protocol.UploadAdapter)\n", 1)

d = t.encode("utf-8")
if crlf: d = d.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
open(p+".tmpmerge","wb").write(d); os.replace(p+".tmpmerge", p)
print("fixed")
