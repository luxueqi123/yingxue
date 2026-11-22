"""Prepare the selected LTV archive for the existing Yingxue homepage.

No source archive is modified. Media derivatives are for display only; skill
bodies are checked against the existing native import, never rewritten here.
"""
import argparse
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    source = args.source.resolve()
    repo = args.repo.resolve()
    output = repo / "web/public/ltv-home"
    output.mkdir(parents=True, exist_ok=True)
    cache = repo / ".local/cache/ltv-priority"
    existing = read_json(repo / "web/public/production-library/catalog.json")
    items_by_id = {item["id"]: item for item in existing["items"]}
    inventory = [{"path": str(p.relative_to(source)).replace("\\", "/"), "bytes": p.stat().st_size} for p in source.rglob("*") if p.is_file()]
    all_skills = read_json(source / "03_官方Skill技能库/_技能总表1145条.json")
    skill_audit = []
    local_items = []
    ready_skills = []
    file_extensions = Counter()
    tool_mentions = Counter()
    markers = ["media_generator", "generate_image", "generate_video", "video_assembler", "composite_video", "analyze_video", "extract_frames", "ffmpeg", "ffprobe", "suno", "tts"]
    details = sorted((source / "03_官方Skill技能库/详情_完整定义").glob("*.json"))
    image_dir = source / "06_案例素材"
    cover_paths = {}
    for path in image_dir.glob("*"):
        match = re.match(r"(\d+)_(.+)_cover\.[^.]+$", path.name, re.I)
        if match:
            cover_paths[match[2]] = (int(match[1]), path)

    def cover(path, filename):
        destination = output / filename
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((1200, 900))
            image.save(destination, "WEBP", quality=90)
        return "/ltv-home/" + destination.name

    for file in details:
        skill = read_json(file)["data"]["skill"]
        sid = "pl-" + hashlib.sha256(("libtv:" + skill["templateUuid"]).encode()).hexdigest()[:32]
        snapshot = json.loads(skill.get("snapshotData") or "{}")
        body = snapshot.get("markdownContent", "").strip()
        definition_file = repo / "web/public/production-library/definitions" / (sid + ".json")
        imported = read_json(definition_file) if definition_file.exists() else None
        files = [{"path": f.get("path", "").replace("\\", "/"), "content": str(f.get("content") or "")} for f in (snapshot.get("skillFiles") or []) if str(f.get("content") or "").strip() != body]
        body_equal = bool(body and imported and imported["body"] == body)
        files_equal = bool(imported is not None and imported.get("files", []) == files)
        native = items_by_id.get(sid)
        ready = bool(native and native["available"] and body_equal and files_equal)
        if ready:
            ready_skills.append({**native, "cover": "", "media": ""})
        text = body + "\n" + "\n".join(f["content"] for f in files)
        mentions = [marker for marker in markers if re.search(r"\b" + marker + r"\b", text, re.I)]
        tool_mentions.update(mentions)
        file_extensions.update(Path(f["path"]).suffix.lower() for f in files)
        file_receipts = [{"path": f["path"], "sha256": hashlib.sha256(f["content"].encode()).hexdigest(), "bytes": len(f["content"].encode())} for f in files]
        skill_audit.append({"id": sid, "name": skill["name"], "source": str(file.relative_to(source)), "hasBody": bool(body), "bodyMatchesNativeImport": body_equal, "filesMatchNativeImport": files_equal, "bodySha256": hashlib.sha256(body.encode()).hexdigest() if body else None, "fileCount": len(files), "files": file_receipts, "capabilityMentions": mentions, "nativeDefinitionAvailable": ready})
        cover_key = skill["name"] if skill["name"] in cover_paths else re.sub(r'[<>:"/\\|?*]', '_', skill["name"])
        if cover_key in cover_paths:
            order, image_path = cover_paths[cover_key]
            entry = dict(native) if native else {"id": sid, "kind": "skill", "name": skill["name"], "description": skill.get("description", ""), "category": "others", "source": "LibTV", "author": skill.get("ownerName", ""), "available": False}
            entry.update(cover=cover(image_path, f"skill-{order:03}.webp"), media="", available=ready, source="LibTV", sourceOrder=order)
            local_items.append(entry)
    local_items.sort(key=lambda item: item["sourceOrder"])
    unique_covers = {}
    for item in local_items:
        current = unique_covers.get(item["sourceOrder"])
        if not current or (item["available"] and not current["available"]):
            unique_covers[item["sourceOrder"]] = item
    local_items = list(unique_covers.values())

    # Display motion is taken only from files already in the selected archive.
    previews = [14, 43, 44, 8, 22, 54, 52, 29]
    for number in previews:
        item = next((row for row in local_items if row["sourceOrder"] == number), None)
        media = next((p for p in sorted(image_dir.glob(f"{number:03}_*_case1.*")) if p.suffix.lower() in (".mp4", ".mov")), None)
        if item and media:
            destination = output / f"skill-{number:03}-preview.mp4"
            if not destination.exists():
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "1", "-i", str(media), "-t", "8", "-an", "-vf", "scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24", "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-movflags", "+faststart", "-y", str(destination)], check=True)
            item.update(media="/ltv-home/" + destination.name, previewOnly=True)

    template_source = read_json(source / "04_画布模板库/_画布模板总表1024条_含成片链接.json")
    voices = read_json(source / "05_官方音色库/_音色总表327条.json")
    endpoints = []
    for line in (source / "02_API端点全集/www_api_154端点.txt").read_text(encoding="utf-8-sig").splitlines():
        if ": " in line:
            name, path = line.split(": ", 1)
            endpoints.append({"name": name, "path": path, "implementationInArchive": False})
    chunks = list((source / "01_前端完整工程/chunks").glob("*.js"))
    paths = set()
    for file in chunks:
        text = file.read_text(encoding="utf-8")
        paths.update(re.findall(r'["\x27`]((?:/api/|/gateway/)[A-Za-z0-9_./{}$:-]+)', text))
    stats = {"files": len(inventory), "bytes": sum(row["bytes"] for row in inventory), "sourceSkills": len(all_skills), "skillDetails": len(details), "completeBodies": sum(row["hasBody"] for row in skill_audit), "verifiedNativeDefinitions": sum(row["nativeDefinitionAvailable"] for row in skill_audit), "caseReferences": len(template_source), "voiceDefinitions": len(voices), "localSkillCovers": len(local_items), "motionPreviews": sum(bool(row.get("media")) for row in local_items), "listedEndpoints": len(endpoints), "compiledChunks": len(chunks)}
    covers_by_id = {item["id"]: item["cover"] for item in local_items}
    for skill in ready_skills:
        skill["cover"] = covers_by_id.get(skill["id"], "")
    save_json(output / "catalog.json", {"version": 1, "stats": stats, "items": local_items, "skills": ready_skills})
    stats.update(companionFiles=sum(file_extensions.values()), companionFileExtensions=dict(file_extensions), compiledApiPathReferences=len(paths))
    save_json(repo / "docs/ltv-source-intake.json", {"version": 1, "source": "全量LTV", "stats": stats, "skills": skill_audit, "capabilityMentions": dict(tool_mentions), "endpoints": endpoints, "compiledApiPaths": sorted(paths), "inventory": inventory, "bounds": {"vendorBusinessApiCalled": False, "generationValidated": False, "archiveChanged": False, "sourceMediaReduced": False, "displayPreviewsOnly": True}})

    # Preserve the original CSS modules and resolved native theme values.
    home = repo / "web/src/pages/home"
    home.mkdir(parents=True, exist_ok=True)
    css = (cache / "31n4_jbbgzclt.readable.css").read_text(encoding="utf-8")
    (home / "ltv-native-effects.css").write_text("/* LTV 31n4_jbbgzclt.css: original dot grid and node flow modules. */\n" + css, encoding="utf-8")
    themes = read_json(cache / "original-theme-tokens.json")
    theme_css = ["/* Resolved from the archived LTV page with its original CSS, in Edge. */"]
    for scheme, selector in [("light", ".ltv-home, .app-workspace-shell.is-ltv-home"), ("dark", ".dark .ltv-home, .dark .app-workspace-shell.is-ltv-home")]:
        theme_css.append(selector + " {\n" + "\n".join(f"    {key}: {value};" for key, value in sorted(themes[scheme].items())) + "\n}")
    (home / "ltv-native-tokens.css").write_text("\n".join(theme_css) + "\n", encoding="utf-8")
    save_json(output / "source-receipt.json", {"css": read_json(cache / "css-recovery.json"), "media": [{"file": p.name, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in output.iterdir() if p.suffix in (".webp", ".mp4")]})
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    main()
