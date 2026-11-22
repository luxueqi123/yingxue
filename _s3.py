import io
p="web/src/pages/settings/index.tsx"
s=io.open(p,encoding="utf-8",newline="").read()
nl="\r\n" if "\r\n" in s else "\n"; t=s.replace("\r\n","\n")
reps=[
 ('import { RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";' if 'import { RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";' in t else 'import { COMFYUI_PLUGIN_ID, RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";',
  None),
]
# 1. 加 AgentMemoryPane import（放在 PromptPreferencesPane import 之后）
anchor=None
for cand in ['import { PromptPreferencesPane } from "./prompt-preferences-pane";',
             'import PromptPreferencesPane from "./prompt-preferences-pane";']:
    if cand in t: anchor=cand; break
print("prompt pane import anchor:",anchor)
if anchor:
    t=t.replace(anchor, anchor+'\nimport AgentMemoryPane from "./agent-memory-pane";',1)
    print("added AgentMemoryPane import")
# 2. 加 panes 条目
key='        prompts: <SettingsPane fill><PromptPreferencesPane /></SettingsPane>,'
assert key in t, "prompts pane anchor missing"
t=t.replace(key, key+'\n        "agent-memory": (\n            <SettingsPane>\n                <div className="settings-pane-header">\n                    <div className="min-w-0">\n                        <h2>Agent 记忆</h2>\n                        <p>只属于你。Agent 记下的先待批准；手动添加立刻生效。可导入导出，也可用文本模型压缩相近条目。</p>\n                    </div>\n                </div>\n                <div className="settings-section">\n                    <AgentMemoryPane />\n                </div>\n            </SettingsPane>\n        ),',1)
print("added agent-memory pane")
io.open(p,"w",encoding="utf-8",newline="").write(t.replace("\n",nl))
