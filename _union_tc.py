import io
h=io.open('.local/cache/_h_taskcenter.ts',encoding='utf-8').read().replace('\r\n','\n')
assert 'isLocalDreaminaTaskId' in h
# 1. textEventsSource option (upstream v1.5.5 agent event stream)
old="export type WaitForGenerationTaskOptions = {\n    signal?: AbortSignal;"
new="export type WaitForGenerationTaskOptions = {\n\ttextEventsSource?: \"task\" | \"agent\";\n    signal?: AbortSignal;"
assert h.count(old)==1, h.count(old)
h=h.replace(old,new)
# 2. agent replay cursor semantics
old="    let fullText = lastTask?.textDraft || \"\";"
new=("    // Agent subscriptions replay from cursor 0; an existing draft must not be\n"
     "    // prepended to the same persisted deltas when reopening a conversation.\n"
     "    let fullText = options.textEventsSource === \"agent\" ? \"\" : lastTask?.textDraft || \"\";")
assert h.count(old)==1
h=h.replace(old,new)
# 3. agent event stream path
old="            const response = await fetch(`${base}/tasks/${encodeURIComponent(id)}/text-events${cursor}`, {"
new=("            const path = options.textEventsSource === \"agent\" ? `/agent/runs/${encodeURIComponent(id)}/events` : `/tasks/${encodeURIComponent(id)}/text-events`;\n"
     "            const response = await fetch(`${base}${path}${cursor}`, {")
assert h.count(old)==1
h=h.replace(old,new)
# 4. union of safe task-log error codes (dreamina + provider)
old='const SAFE_TASK_LOG_ERROR_CODES = new Set([...Object.keys(DREAMINA_SUBMIT_ERROR_MESSAGES), "dreamina_query_failed", "dreamina_submission_unknown", "dreamina_reference_invalid"]);'
new='const SAFE_TASK_LOG_ERROR_CODES = new Set([...Object.keys(DREAMINA_SUBMIT_ERROR_MESSAGES), "dreamina_query_failed", "dreamina_submission_unknown", "dreamina_reference_invalid", "provider_query_failed", "provider_submission_unknown", "provider_reference_invalid"]);'
assert h.count(old)==1
h=h.replace(old,new)
old=r'for (const match of value.matchAll(/(?:dreamina|local_generation|model|provider)_[a-z0-9_]{2,80}/gi)) {'
assert h.count(old)==1
io.open('web/src/services/api/task-center.ts','w',encoding='utf-8',newline='\n').write(h)
print('written union task-center.ts lines', h.count('\n'))
