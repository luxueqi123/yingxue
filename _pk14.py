import subprocess
for pat in ['autodl-comfyui.yingce-plugin','newapi-video-generations-v1.yingce-plugin']:
    r=subprocess.run(["git","grep","-n","-I",pat,"HEAD","--","."],capture_output=True)
    print("### HEAD",pat)
    print(r.stdout.decode("utf-8",errors="replace")[:1500])
    r=subprocess.run(["git","grep","-n","-I",pat,"MERGE_HEAD","--","."],capture_output=True)
    print("### MERGE_HEAD",pat)
    print(r.stdout.decode("utf-8",errors="replace")[:1500])
