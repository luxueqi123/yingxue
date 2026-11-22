import io
p="web/src/pages/settings/index.tsx"
s=io.open(p,encoding="utf-8",newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
t=s.replace("\r\n","\n")

reps=[
# 1. lucide 图标加入 Brain
('import { ArrowLeft, Boxes, Bug, Cloud, MessageSquareText, MonitorUp, RadioTower, SlidersHorizontal, SquareTerminal, Workflow } from "lucide-react";',
 'import { ArrowLeft, Boxes, Brain, Bug, Cloud, MessageSquareText, MonitorUp, RadioTower, SlidersHorizontal, SquareTerminal, Workflow } from "lucide-react";'),
# 2. ConfigSectionKey 增加 agent-memory
('type ConfigSectionKey = "local-cli" | "channels" | "models" | "runninghub" | "comfyui" | "preferences" | "prompts" | "storage" | "diagnostics";',
 'type ConfigSectionKey = "local-cli" | "channels" | "models" | "runninghub" | "comfyui" | "preferences" | "prompts" | "agent-memory" | "storage" | "diagnostics";'),
# 3. 导航项加入 Agent 记忆（放在提示词偏好之后）
('    { key: "prompts", label: "提示词偏好", description: "按任务定制平台模板", icon: <MessageSquareText className="size-4" /> },',
 '    { key: "prompts", label: "提示词偏好", description: "按任务定制平台模板", icon: <MessageSquareText className="size-4" /> },\n    { key: "agent-memory", label: "Agent 记忆", description: "批准、添加、导出导入、压缩", icon: <Brain className="size-4" /> },'),
]
for a,b in reps:
    assert a in t, a[:70]
    t=t.replace(a,b,1)
    print("ok:", a[:64])
io.open(p,"w",encoding="utf-8",newline="").write(t.replace("\n",nl))
