import zipfile
for p in ["plugin-packages/newapi-video-generations-v1.yingce-plugin","plugin-packages/volcengine-ark-seedance.yingce-plugin"]:
    try:
        z=zipfile.ZipFile(p); print(p,"entries",len(z.namelist()),z.namelist()[:5])
    except Exception as e: print(p,"ERR",e)
