P="web/src/pages/create/index.tsx"
s=open(P,encoding="utf-8").read().replace("\r\n","\n").split("\n")
# plain region only
plain=[];i=0
while i<len(s):
    if s[i].startswith("<<<<<<<"):
        k=i+1
        while k<len(s) and not s[k].startswith(">>>>>>>"): k+=1
        i=k+1; continue
    plain.append(s[i]); i+=1
body="\n".join(plain)
for sym in ["lazy(","<Suspense","AnimatePresence","motion.","useReducedMotion","useNavigate","History","Maximize2","Sparkles","Reorder","brandName","useAppearanceStore","cn(","creationShotRail","creationVideoShotOrdinal","defaultCreationMode","CreationShotRailEntry","CreationFeaturedWorks","CreationModeTabs","CreationAgentEntry","createCreationSubmitGate","useCreationPreferencesStore","creationInputIssues","creationInputLimits","CreationSkillPicker","newConversation","newMessage","shotsFromMessages","completedCreationGenerationTask","attachCreationTaskContexts","materializeCreationTaskResults","reconcileCreationTaskMessages","isImageAttachment","isVideoAttachment","conversationTimestamp","creationReferenceMetadata","reconcileCreationAttachmentLimit","replaceCreationAttachmentReference","removeCreationAttachment","displayCreationPrompt","expandCreationPrompt","select","creationAttachmentKind","readCreationDocument","createClientId","videoDurationAllowed","videoProfile","normalizeImageValue","normalizeVideoValue","videoResolutionLabel","VIDEO_RESOLUTION_OPTIONS","backendModelRuntimeRequired","loadCreationRuntime","skillRuntime","onContinueCanvas","creationCanvasHandoffPath","continueCreationConversationOnCanvas","generationErrorMessage","generationErrorCode","creationResultAssetIds","getActiveUserScope","useExternalAssetSources","CreationEmptyBanner","CreationComposer","composerProps","CreationViewMode","shotScriptLabels","ratioOptions","qualityOptions","countOptions","resolutionOptions"]:
    print("%-38s %d"%(sym, body.count(sym)))
