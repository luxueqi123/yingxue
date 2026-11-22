"""生成 create/index.tsx 的冲突块替换规格（并集裁决）。"""

import json
import subprocess
from pathlib import Path

CREATE = "web/src/pages/create/index.tsx"


def git(ref: str, path: str) -> list[str]:
    return subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True).stdout.decode("utf-8").split("\n")


head = git("HEAD", CREATE)
orig = git("MERGE_HEAD", CREATE)


def h(start: int, end: int) -> list[str]:
    """HEAD 的 1-based 闭区间行。"""
    return head[start - 1 : end]


def o(start: int, end: int) -> list[str]:
    return orig[start - 1 : end]


spec = {}

# B1 imports：映雪 antd/lucide 大头 + 上游 motion/react 与 useLayoutEffect。
spec[1] = [
    'import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FocusEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";',
    h(3, 3)[0],
    'import { AnimatePresence, Reorder, motion, useReducedMotion } from "motion/react";',
    h(5, 5)[0],
    h(6, 6)[0],
]

# B2：仅 cn（映雪首页不用 brandName）。
spec[2] = ['import { cn } from "@/lib/utils";']

# B3：import 并集。本地已定义的同名符号不重复 import。
refs = h(67, 67)[0].replace(
    "creationReferenceMetadata, displayCreationPrompt, expandCreationPrompt,",
    "creationReferenceMetadata, displayCreationPrompt, expandCreationPrompt, reconcileCreationAttachmentLimit, replaceCreationAttachmentReference,",
)
assets = h(68, 68)[0].replace("creationVideoAsset, splitCreationAttachments", "creationVideoAsset, removeCreationAttachment, splitCreationAttachments")
spec[3] = [
    refs,
    assets,
    'import { defaultCreationMode, type CreationShotRailEntry } from "./creation-types";',
    'import { creationShotRail, creationVideoShotOrdinal } from "./creation-conversations";',
    'import { CreationFeaturedWorks, CreationModeTabs } from "./creation-workspace";',
    'import { CreationAgentEntry } from "./creation-agent-entry";',
    'import { createCreationSubmitGate } from "./creation-submit-gate";',
    'import { useCreationPreferencesStore } from "@/stores/use-creation-preferences-store";',
    h(69, 69)[0],
    h(70, 70)[0],
    h(71, 71)[0],
]

# B4：模块级常量与运行时装载器 + 映雪签名 + agentMode。
spec[4] = [
    'const TEXT_STREAMING_PREF_KEY = "creation.composer.text-streaming";',
    'const TEXT_THINKING_PREF_KEY = "creation.composer.text-thinking";',
    'function readComposerPref(key: string, fallback: boolean): boolean {',
    '    try {',
    '        const stored = window.localStorage.getItem(key);',
    '        return stored === null ? fallback : stored === "1";',
    '    } catch {',
    '        return fallback;',
    '    }',
    '}',
    'function writeComposerPref(key: string, value: boolean) {',
    '    try {',
    '        window.localStorage.setItem(key, value ? "1" : "0");',
    '    } catch {',
    '        // 存储不可用（隐私模式/禁用）：仅当前会话生效，忽略',
    '    }',
    '}',
    '',
    'const loadCreationRuntime = () => import("./creation-runtime");',
    'type CreationRuntime = Awaited<ReturnType<typeof loadCreationRuntime>>;',
    '',
] + h(142, 170) + ['    const [agentMode, setAgentMode] = useState(false);']

# B5：上游偏好水合所需的 store 绑定 + 文本流式开关 + 参考图替换忙态。
spec[5] = [
    '    const composerPreferencesHydrated = useCreationPreferencesStore((state) => state.hydrated);',
    '    const rememberMode = useCreationPreferencesStore((state) => state.rememberMode);',
    '    const rememberImageSettings = useCreationPreferencesStore((state) => state.rememberImageSettings);',
    '    const rememberVideoSettings = useCreationPreferencesStore((state) => state.rememberVideoSettings);',
    '    const initialComposerPreferences = useCreationPreferencesStore.getState().preferences;',
    '    const [mode, setMode] = useState<CreationMode>(() => initialComposerPreferences.mode || defaultCreationMode);',
    '    const [textStreaming, setTextStreaming] = useState(() => readComposerPref(TEXT_STREAMING_PREF_KEY, true));',
    '    const [textThinking, setTextThinking] = useState(() => readComposerPref(TEXT_THINKING_PREF_KEY, false));',
    '    const [referenceReplacementBusy, setReferenceReplacementBusy] = useState(false);',
    '    const [composerPreferencesInitialized, setComposerPreferencesInitialized] = useState(false);',
]

# B6：待恢复任务键 + 空首页从顶部开始的滚动策略。
spec[6] = [
    h(285, 285)[0],
    '',
    '    // 空首页从顶部开始；有消息的对话由跟随消息逻辑管理滚动。',
    '    useLayoutEffect(() => {',
    '        if (!hydrated || !isEmpty) return;',
    '        const frame = window.requestAnimationFrame(() => {',
    '            threadScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });',
    '        });',
    '        return () => window.cancelAnimationFrame(frame);',
    '    }, [activeId, hydrated, isEmpty]);',
]

# B7：文本开关持久化 + 偏好水合 + 映雪的模型默认参数优先。
spec[7] = [
    '    useEffect(() => {',
    '        writeComposerPref(TEXT_STREAMING_PREF_KEY, textStreaming);',
    '        writeComposerPref(TEXT_THINKING_PREF_KEY, textThinking);',
    '    }, [textStreaming, textThinking]);',
    '',
    '    useEffect(() => {',
    '        if (!composerPreferencesHydrated || composerPreferencesInitialized) return;',
    '        const saved = useCreationPreferencesStore.getState().preferences;',
    '        const nextMode = saved.mode || defaultCreationMode;',
    '        rememberMode(nextMode);',
    '        setMode(nextMode);',
    '        setComposerPreferencesInitialized(true);',
    '    }, [composerPreferencesHydrated, composerPreferencesInitialized, rememberMode]);',
    '',
    '    useEffect(() => {',
    '        if (agentIntent || mode !== "image") return;',
    '        // 前台逻辑模型的默认参数优先于旧的全局创作参数；否则旧的合法值会一直覆盖后台刚配置的默认值。',
]

# B8：创作简报直通画布 + 上游视频时长校验。
spec[8] = h(714, 719) + o(721, 724)

# B9：附件正文注入（映雪）与运行时技能上下文（上游）并集。
spec[9] = h(748, 764) + [
    '        const skillReferences = references.flatMap((reference) => (reference.skill ? [reference.skill] : []));',
    '        let runtime: CreationRuntime;',
    '        try {',
    '            runtime = await loadCreationRuntime();',
    '        } catch (error) {',
    '            toast.error(error instanceof Error ? error.message : "生成运行时加载失败");',
    '            releaseRetryLock();',
    '            releaseSubmitGate();',
    '            return;',
    '        }',
    '        let skillExecution: Awaited<ReturnType<typeof runtime.skillRuntime.prepare>>;',
    '        try {',
    '            skillExecution = await runtime.skillRuntime.prepare({',
    '                profile: "creation",',
    '                prompt: expandedPrompt,',
    '                skills: skillReferences,',
    '                selectedSkillIds: skillReferences.map((skill) => skill.skillId),',
    '            });',
    '        } catch (error) {',
    '            toast.error(error instanceof Error ? error.message : "技能上下文加载失败");',
    '            releaseRetryLock();',
    '            releaseSubmitGate();',
    '            return;',
]

# B10：映雪空态横幅与首页引导。
spec[10] = h(1230, 1234)

payload = {CREATE: {str(k): v for k, v in spec.items()}}
Path("_spec_create.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print("blocks:", sorted(spec))
for key, value in sorted(spec.items()):
    print(f"  B{key}: {len(value)} lines")
