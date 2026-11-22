import zipfile
for p in ["plugin-packages/newapi-video-generations-v1.yingce-plugin","plugin-packages/official-payment-xunhupay.yingce-plugin"]:
    z=zipfile.ZipFile(p)
    print(p)
    for i in z.infolist():
        print("   %-28s comp=%s size=%d csize=%d date=%s" % (i.filename, i.compress_type, i.file_size, i.compress_size, i.date_time))
        print("      attr=%s create_system=%s extra=%r comment=%r" % (hex(i.external_attr), i.create_system, i.extra, i.comment))
