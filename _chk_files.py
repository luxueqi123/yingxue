import subprocess
files = ["backend/internal/app/topaz_image_runtime_test.go","backend/internal/app/topaz_video_runtime_test.go",
         "backend/internal/app/provider_upload_runtime_test.go","backend/internal/app/provider_upload_checkpoint.go",
         "backend/internal/app/provider_upload_checkpoint_test.go","backend/internal/app/protocol_runtime_test.go"]
for f in files:
    r = {}
    for ref in ["01a2d171","98822b65","origin/main","HEAD"]:
        p = subprocess.run(["git","cat-file","-e",f"{ref}:{f}"], capture_output=True)
        r[ref] = (p.returncode == 0)
    print(f, r)
