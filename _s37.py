P="web/src/pages/create/index.tsx"
s=open(P,encoding="utf-8").read().replace("\r\n","\n").split("\n")
plain=[];i=0
while i<len(s):
    if s[i].startswith("<<<<<<<"):
        k=i+1
        while k<len(s) and not s[k].startswith(">>>>>>>"): k+=1
        i=k+1; continue
    plain.append(s[i]); i+=1
body="\n".join(plain)
print("plain lines:",len(plain))
syms=["lazy(","Suspense","AnimatePresence","motion.","useReducedMotion","useNavigate","Reorder","brandName","useAppearanceStore","cn(","creationShotRail","creationVideoShotOrdinal","defaultCreationMode","CreationShotRailEntry","CreationFeaturedWorks","CreationModeTabs","CreationAgentEntry","createCreationSubmitGate","useCreationPreferencesStore","creationInputIssues","creationInputLimits","CreationSkillPicker","newConversation","newMessage","shotsFromMessages","completedCreationGenerationTask","attachCreationTaskContexts","materializeCreationTaskResults","reconcileCreationTaskMessages","isImageAttachment","isVideoAttachment","conversationTimestamp","creationReferenceMetadata","reconcileCreationAttachmentLimit","replaceCreationAttachmentReference","removeCreationAttachment","displayCreationPrompt","expandCreationPrompt","creationAttachmentKind","readCreationDocument","createClientId","videoDurationAllowed","videoProfile","normalizeImageValue","normalizeVideoValue","videoResolutionLabel","VIDEO_RESOLUTION_OPTIONS","backendModelRuntimeRequired","loadCreationRuntime","skillRuntime","creationCanvasHandoffPath","continueCreationConversationOnCanvas","generationErrorMessage","generationErrorCode","creationResultAssetIds","getActiveUserScope","useExternalAssetSources","CreationEmptyBanner","CreationComposer","composerProps","CreationViewMode","shotScriptLabels","ratioOptions","qualityOptions","countOptions","resolutionOptions","AssetLibraryPickerModal","AssetLibraryPickerItem","useSearchParams","useNavigate","Link","Suspense","assetLaunch","agentLaunch","useCanvasCreationBrief","ProjectGenerationTaskResult","projectGenerationTaskResult","writeComposerPref","readComposerPref","TEXT_STREAMING_PREF_KEY","TEXT_THINKING_PREF_KEY","Tooltip","Spin","Drawer","Modal","Popover","Button","App","messageTimeFormatter","conversationTimeFormatter"]
for x in syms:
    c=body.count(x)
    if c: print("%-40s %d"%(x,c))
print("--- zero-count:")
print(", ".join(x for x in syms if body.count(x)==0))
