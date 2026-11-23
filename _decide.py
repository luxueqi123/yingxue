import subprocess
files = [
 'backend/internal/app/comfy_bridge.go',
 'backend/internal/app/desktop_local_channel.go',
 'backend/internal/app/session_creation.go',
 'backend/internal/app/session_upload.go',
 'backend/internal/app/storyboard.go',
 'backend/internal/app/storyboard_prompt.go',
 'backend/internal/app/storyboard_workflow.go',
 'backend/internal/handler/comfy_bridge.go',
 'backend/internal/model/models_bridge.go',
 'backend/internal/repository/comfy_bridge.go',
]
def blob(ref,p):
    r=subprocess.run(['git','rev-parse',ref+':'+p],capture_output=True,text=True,encoding='utf-8')
    return r.stdout.strip() if r.returncode==0 else None
for f in files:
    b=blob('01a2d171',f); h=blob('HEAD',f)
    rel = 'SAME-as-base (映雪未改)' if b==h else '映雪改过'
    print('%-52s %s' % (f, rel))
