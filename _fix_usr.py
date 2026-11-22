import io, subprocess
m = subprocess.run(['git','show','b9d60f98:web/src/stores/use-user-store.ts'],capture_output=True).stdout.decode('utf-8').replace('\r\n','\n')
reps = [
 ("    activeTaskLimit: number;\n    resourceUploadMB: number;\n    recycleBinRetentionDays?: number;\n",
  "    activeTaskLimit: number;\n    resourceUploadMB: number;\n    sessionUploadMB: number;\n    recycleBinRetentionDays?: number;\n"),
 ("    pluginCenterEnabled: boolean;\n    systemPluginsVisibleToUsers: boolean;\n    configured?: boolean;\n",
  "    pluginCenterEnabled: boolean;\n    systemPluginsVisibleToUsers: boolean;\n    desktopLocalChannelsEnabled: boolean;\n    configured?: boolean;\n"),
 ("    pluginCenterEnabled: true,\n    systemPluginsVisibleToUsers: true,\n};",
  "    pluginCenterEnabled: true,\n    systemPluginsVisibleToUsers: true,\n    desktopLocalChannelsEnabled: false,\n};"),
 ("runtimeLimits: { activeTaskLimit: 5, resourceUploadMB: 50, recycleBinRetentionDays: 30 }",
  "runtimeLimits: { activeTaskLimit: 5, resourceUploadMB: 50, sessionUploadMB: 32, recycleBinRetentionDays: 30 }"),
]
for old,new in reps:
    n = m.count(old)
    assert n >= 1, (n, old[:60])
    m = m.replace(old,new)
io.open('web/src/stores/use-user-store.ts','w',encoding='utf-8',newline='\n').write(m)
print('ok')
