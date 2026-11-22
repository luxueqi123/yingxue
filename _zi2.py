import zipfile
z=zipfile.ZipFile("plugin-packages/autodl-comfyui.yingce-plugin")
for i in z.infolist():
    print("%-24s comp=%s size=%d csize=%d date=%s attr=%s sys=%s extra=%r" % (i.filename,i.compress_type,i.file_size,i.compress_size,i.date_time,hex(i.external_attr),i.create_system,i.extra))
print("comment:",z.comment)
