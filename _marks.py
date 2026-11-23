import sys
markers=["creation-skill-picker","CreationSkillPicker","creation-input-policy","creationInputIssues","Reorder","creation-entry.css","creation-product.css","creationReferenceMetadata","displayCreationPrompt","creation-reference-stack-card","creation-reference-add-button","creation-chat-dock","useWorkspaceTopBarMount","creation-submit-cost","creationUserMessage","canvas-node-composer-submit-cost","creationEmptyBannerFrames","creationEmptySuggestions","creation-home-heading","creation-chat-intro","CreationFeaturedWorks","creation-inspirations","AgentEntry","creation-agent-entry"]
for p in sys.argv[1:]:
    s=open(p,encoding='utf-8',errors='ignore').read()
    print("== "+p)
    for m in markers:
        print(f'   {m:34s} {s.count(m)}')
