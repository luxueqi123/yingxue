import subprocess

for ref in ["HEAD", "origin/main"]:
    text = subprocess.run(
        ["git", "show", f"{ref}:web/src/components/canvas/canvas-node-prompt-panel.tsx"],
        capture_output=True,
        text=True,
    ).stdout
    print("=" * 30, ref, "=" * 30)
    for probe in [
        "manualExpandedPromptHeight",
        "setManualExpandedPromptHeight",
        "expandedModalSize",
        "expandedModalRef",
        "measureExpandedModalSize",
        "clampExpandedModalSize",
        "PromptModalResizeHandle",
        "ImageGroundingSources",
        "mediaEnhancement",
        "onAddReference",
        "onBindCaseReferences",
        "preserveVideoOperation",
        "canonicalGenerationMetadata",
        "const imported =",
        "renderPromptEditor(true",
        "renderPromptEditor(false",
        "fill ?",
    ]:
        print(f"  {probe!r}: {text.count(probe)}")
    print("  lines:", len(text.splitlines()))
