"""Build the block-replacement spec for web/src/pages/create/index.tsx.

Line numbers are taken from each side's OWN blob (HEAD = 映雪, MERGE_HEAD =
上游 v1.5.5) so no offset guessing is involved.

  B1  imports          union (映雪 import set + useLayoutEffect + motion)
  B2  imports          only `cn` from 上游 (映雪 page needs it; no brandName)
  B3  imports/types    union of both import blocks; 映雪 local types/helpers
                       kept, the 7 duplicated option/data consts now come
                       from ./creation-types (test contract)
  B4  page signature   映雪 embedded/seed + 上游 agentMode
  B5  homepage mode    上游 image-first default + composer prefs state
  B6  pendingTaskKey   映雪 key + 上游 empty-home scroll reset
  B7  composer prefs   上游 persistence + hydration (映雪 agentIntent guard)
  B8  agent intent     映雪 creation-brief launch
  B9  附件正文 + skills 映雪 attachment text + 上游 skillRuntime.prepare
  B10 empty home       映雪 banner/intro, 上游 launchpad follows in plain area
"""

import json
import subprocess
from pathlib import Path

P = 'web/src/pages/create/index.tsx'


def lines(ref):
    raw = subprocess.run(['git', 'show', ref + ':' + P], capture_output=True).stdout
    return raw.decode('utf-8').replace('\r\n', '\n').split('\n')


H, O = lines('HEAD'), lines('MERGE_HEAD')


def h(a, b):
    return H[a - 1:b]


def o(a, b):
    return O[a - 1:b]


spec = {}

# --------------------------------------------------------------- B1 imports
b1 = list(h(1, 5))
b1[0] = ('import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, '
         'type ChangeEvent, type CSSProperties, type FocusEvent, type MouseEvent, '
         'type PointerEvent, type ReactNode, type RefObject } from "react";')
b1[2] = 'import { AnimatePresence, Reorder, motion, useReducedMotion } from "motion/react";'
spec[1] = b1

# --------------------------------------------------------------- B2 imports
spec[2] = ['import { cn } from "@/lib/utils";']

# ------------------------------------------------------- B3 imports + types
spec[3] = [
    'import { buildCreationMentionReferences, creationReferenceMetadata, displayCreationPrompt, '
    'expandCreationPrompt, reconcileCreationAttachmentLimit, removeCreationReferenceTokens, '
    'replaceCreationAttachmentReference, selectedCreationReferences, type CreationReference } '
    'from "./creation-references";',
    'import { creationAttachmentFromAsset, creationAttachmentFromAudio, '
    'creationAttachmentFromAudioAsset, creationAttachmentFromDocument, '
    'creationAttachmentFromExternalAsset, creationAttachmentFromImage, '
    'creationAttachmentFromVideo, creationAttachmentFromVideoAsset, creationAttachmentKind, '
    'creationAudioAsset, creationFileAccepted, creationImageAsset, creationMediaAspectRatio, '
    'creationUploadAccept, creationVideoAsset, removeCreationAttachment, '
    'splitCreationAttachments, type CreationAttachment } from "./creation-assets";',
    'import { creationInputIssues, creationInputLimits } from "./creation-input-policy";',
    'import { CreationSkillPicker } from "@/components/creation-skill-picker";',
    'import { CreationFeaturedWorks, CreationModeTabs } from "./creation-workspace";',
    'import { CreationAgentEntry } from "./creation-agent-entry";',
    'import { createCreationSubmitGate } from "./creation-submit-gate";',
    'import { countOptions, conversationTimeFormatter, defaultCreationMode, messageTimeFormatter, '
    'modeLabels, qualityOptions, ratioOptions, resolutionOptions, shotScriptLabels } '
    'from "./creation-types";',
    'import { useCreationPreferencesStore } from "@/stores/use-creation-preferences-store";',
    'import "./creation-entry.css";',
    '',
    'const loadCreationRuntime = () => import("./creation-runtime");',
    'type CreationRuntime = Awaited<ReturnType<typeof loadCreationRuntime>>;',
    '',
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
] + h(58, 87) + [''] + h(113, 118)

# ------------------------------------------------------- B4 page signature
spec[4] = h(143, 145) + ['    const [agentMode, setAgentMode] = useState(false);']

# --------------------------------------------- B5 homepage default + prefs
spec[5] = [
    '    const composerPreferencesHydrated = useCreationPreferencesStore((state) => state.hydrated);',
    '    const rememberMode = useCreationPreferencesStore((state) => state.rememberMode);',
    '    const rememberImageSettings = useCreationPreferencesStore((state) => state.rememberImageSettings);',
    '    const rememberVideoSettings = useCreationPreferencesStore((state) => state.rememberVideoSettings);',
    '    const initialComposerPreferences = useCreationPreferencesStore.getState().preferences;',
    '    const [mode, setMode] = useState<CreationMode>(() => initialComposerPreferences.mode || defaultCreationMode);',
    '    const [textStreaming, setTextStreaming] = useState(() => readComposerPref(TEXT_STREAMING_PREF_KEY, true));',
    '    const [textThinking, setTextThinking] = useState(() => readComposerPref(TEXT_THINKING_PREF_KEY, false));',
    '    const [composerPreferencesInitialized, setComposerPreferencesInitialized] = useState(false);',
]

# --------------------------------------------------------- B6 pendingTaskKey
spec[6] = h(247, 247) + [''] + o(162, 169)

# ------------------------------------------------------ B7 composer prefs
spec[7] = [
    '        writeComposerPref(TEXT_STREAMING_PREF_KEY, textStreaming);',
    '        writeComposerPref(TEXT_THINKING_PREF_KEY, textThinking);',
    '    }, [textStreaming, textThinking]);',
    '',
    '    useEffect(() => {',
    '        if (!composerPreferencesHydrated || composerPreferencesInitialized) return;',
    '        const saved = useCreationPreferencesStore.getState().preferences;',
    '        const nextMode = saved.mode || defaultCreationMode;',
    '        setMode(nextMode);',
    '        if (nextMode === "image" && saved.image) {',
    '            if (saved.image.ratio) setRatio(saved.image.ratio);',
    '            if (saved.image.quality) setQuality(saved.image.quality);',
    '            if (saved.image.count) setCount(saved.image.count);',
    '        }',
    '        if (nextMode === "video" && saved.video) {',
    '            if (saved.video.ratio) setRatio(saved.video.ratio);',
    '            if (saved.video.seconds) setSeconds(saved.video.seconds);',
    '            if (saved.video.videoQuality) setVideoQuality(saved.video.videoQuality);',
    '        }',
    '        setComposerPreferencesInitialized(true);',
    '    }, [composerPreferencesHydrated, composerPreferencesInitialized]);',
    '',
    '    useEffect(() => {',
    '        if (agentIntent || !composerPreferencesHydrated || !composerPreferencesInitialized || mode !== "image") return;',
    '        const saved = useCreationPreferencesStore.getState().preferences.image;',
    '        // 优先恢复用户上次选择；只有当前模型不支持该值时，normalizeImageValue 才回退到模型默认值。',
]

# ---------------------------------------------------------- B8 agent intent
spec[8] = h(629, 634) + ['            releaseSubmitGate();']

# ------------------------------------------------------ B9 attachment+skills
spec[9] = h(655, 671) + [
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

# ------------------------------------------------------------ B10 empty home
spec[10] = h(1088, 1092)

out = {P: {str(k): v for k, v in spec.items()}}
Path('_spec_create2.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
print('spec -> _spec_create2.json')
for k in sorted(spec):
    print('   B%-3d %4d lines | %s' % (k, len(spec[k]), (spec[k][0][:98] if spec[k] else '(empty)')))
