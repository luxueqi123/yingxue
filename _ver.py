import zipfile,hashlib
for p in ["plugin-packages/newapi-video-generations-v1.yingce-plugin","plugin-packages/volcengine-ark-seedance.yingce-plugin"]:
    z=zipfile.ZipFile(p); print(p,"entries",sorted(z.namelist()))
