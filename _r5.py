import io, os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
def apply(path, reps):
    p = os.path.join(REPO, path.replace("/", os.sep))
    raw = open(p,"rb").read(); crlf = b"\r\n" in raw
    lines = raw.decode("utf-8").replace("\r\n","\n").split("\n")
    blks,i = [],0
    while i < len(lines):
        if lines[i].startswith("<<<<<<< "):
            s=i;j=i;mid=None
            while not lines[j].startswith(">>>>>>> "):
                if lines[j].startswith("=======") and mid is None: mid=j
                j+=1
            blks.append((s,mid,j)); i=j+1
        else: i+=1
    for idx in sorted(reps, reverse=True):
        s,mid,e = blks[idx]; lines[s:e+1]=reps[idx]
    t="\n".join(lines); d=t.encode("utf-8")
    if crlf: d=d.replace(b"\r\n",b"\n").replace(b"\n",b"\r\n")
    open(p+".tmpmerge","wb").write(d); os.replace(p+".tmpmerge",p)
    print("OK",path,"blocks",len(blks))

# ---- main.tsx: 保留映雪 stale-release 恢复 + 本地运行时引导 ----
apply("web/src/main.tsx", {0: [
'const staleReleaseRecoveryKey = "yingxue:stale-release-recovery-at";',
'const staleReleaseRecoveryWindowMs = 60_000;',
'',
'window.addEventListener("vite:preloadError", (event) => {',
'    event.preventDefault();',
'',
'    const now = Date.now();',
'    let lastRecoveryAt = 0;',
'    try {',
'        lastRecoveryAt = Number(window.sessionStorage.getItem(staleReleaseRecoveryKey) || "0");',
'    } catch {',
'        // Storage may be unavailable in restricted browser contexts; reload recovery must still work.',
'    }',
'    if (Number.isFinite(lastRecoveryAt) && now - lastRecoveryAt < staleReleaseRecoveryWindowMs) {',
'        return;',
'    }',
'',
'    try {',
'        window.sessionStorage.setItem(staleReleaseRecoveryKey, String(now));',
'    } catch {',
'        // The reload below remains the safe fallback when the marker cannot be persisted.',
'    }',
'    window.location.reload();',
'});',
'',
'window.setTimeout(() => {',
'    try {',
'        window.sessionStorage.removeItem(staleReleaseRecoveryKey);',
'    } catch {',
'        // Ignore storage cleanup failures in restricted browser contexts.',
'    }',
'}, staleReleaseRecoveryWindowMs);',
'',
'runLocalRuntimeBootstrap(',
'    {',
'        get href() {',
'            return window.location.href;',
'        },',
'        replaceUrl(url) {',
'            window.history.replaceState(window.history.state, "", url);',
'        },',
'        removeStorageItem(key) {',
'            window.localStorage.removeItem(key);',
'        },',
'    },',
'    () => {',
'        // Keep the public film page independent of workspace and appearance requests.',
'        if (/^\\/welcome\\/?$/.test(window.location.pathname)) void import("./welcome-application");',
'        else {',
'            const appearanceReady = bootstrapAppearance();',
'            const applicationReady = import("./application");',
'            // 公开首页使用已确认的独立电影主题，外观接口不应阻塞展示和登录入口。',
'            if (window.location.pathname === "/") void applicationReady.then(module => module.mountApplication());',
'            else void appearanceReady.finally(async () => (await applicationReady).mountApplication());',
'        }',
'    },',
');',
]})

# ---- vite.config.ts: 合并 chunks 分组（保留映雪 motion-runtime + 上游 vendor 分组） ----
apply("web/vite.config.ts", {0: [
'                    // 动画库的共享初始化不能被分进画布路由，否则大厅也会下载整个编辑器。',
'                    // Keep route-level lazy imports isolated. Recursively merging dependencies',
'                    // pulls unrelated pages into the initial modulepreload graph.',
'                    includeDependenciesRecursively: false,',
'                    minSize: 40 * 1024,',
'                    groups: [',
'                        { name: "motion-runtime", test: /node_modules[\\\\/](?:motion|framer-motion|motion-dom|motion-utils)[\\\\/]/ },',
'                        {',
'                            // Shared interop helpers must not be emitted into a route entry:',
'                            // AntD would import that entry back and execute its bootstrap early.',
'                            name: "vendor-babel-runtime",',
'                            minSize: 0,',
'                            test: /node_modules[\\\\/]@babel[\\\\/]runtime[\\\\/]/,',
'                            priority: 40,',
'                        },',
'                        {',
'                            name: "vendor-react",',
'                            test: /node_modules[\\\\/](?:react(?:-dom|-router|-router-dom)?|scheduler|zustand|use-sync-external-store|@tanstack[\\\\/](?:query-core|react-query))[\\\\/]/,',
'                            priority: 30,',
'                        },',
'                        {',
'                            name: "vendor-icons",',
'                            test: /node_modules[\\\\/](?:lucide-react|@ant-design[\\\\/]icons)[\\\\/]/,',
'                            priority: 20,',
'                            entriesAware: true,',
'                            entriesAwareMergeThreshold: 48 * 1024,',
'                        },',
'                        {',
'                            name: "vendor-antd",',
'                            test: /node_modules[\\\\/](?:antd|@ant-design|@rc-component|rc-[^\\\\/]+|dayjs)[\\\\/]/,',
'                            priority: 10,',
'                            entriesAware: true,',
'                            entriesAwareMergeThreshold: 80 * 1024,',
'                        },',
'                    ],',
]})
