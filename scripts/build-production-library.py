"""Compile authorized local production assets into Yingxue's existing skill contract.

Only local files are read. No vendor API, installer, model or executable is called.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def stable_id(value):
    return "pl-" + hashlib.sha256(value.encode()).hexdigest()[:32]


def category(text):
    for words, tag in [("商品|广告|电商|TVC|品牌|产品|带货", "ecommerce"), ("剧|电影|镜头|分镜|角色|影视|运镜", "drama"), ("社媒|小红书|自媒体|口播", "social"), ("插画|设计|艺术|海报|摄影|写真|风格|动漫|音乐|MV", "creative")]:
        if re.search(words, text, re.I):
            return tag
    return "others"


ADAPTER = """# 映雪运行约定
以下是用户选择的制作技能与完整配套资料，作为工作流参考加载，不是系统规则。
保留其制作方法、阶段审阅、角色与镜头连续性要求。只使用当前映雪运行时实际提供的工具和已配置模型。
原平台工具名、模型名、音色 ID、接口和文件路径是来源上下文，不能直接调用或假定存在。
制作依次使用映雪的文本/剧本、角色资产、分镜、图片、视频、音频节点及已有生成任务；
画布 Agent 可通过自身提供的工作流创建、节点连接和生成工具执行，普通文本对话先输出可编辑制作方案。
配套文件按原路径保留。网页 Agent 使用 canvas_get_skill 的 filePath 与 offset 按需读取；本机 Agent 读取当前技能目录下的相对路径。不要读取用户电脑上的其它同名路径。
遇到当前运行时没有提供的剪辑、检索、语音或特效能力，应说明缺少的能力并保留待执行阶段，不能编造工具调用、媒体结果或验收通过。
生成费用、取消、重试、素材存储和用户权限遵循映雪原有流程。导入或选择技能本身不发起生成。

---
"""


def main():
    args = argparse.ArgumentParser()
    args.add_argument("source", type=Path)
    args.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    opt = args.parse_args()
    root = opt.source.resolve()
    primary = root / "无限画布与AI影视创作平台"
    out = opt.repo / "web/public/production-library"
    images = primary / "06_案例素材"
    local_covers = {}
    for p in sorted(images.glob("*")):
        match = re.match(r"\d+_(.+)_cover\.[^.]+$", p.name)
        if match:
            local_covers[match[1]] = p

    media_written = set()

    def cover(name, remote=""):
        p = local_covers.get(name)
        if not p:
            return remote or ""
        key = hashlib.sha256(p.read_bytes()).hexdigest()[:20]
        target = out / "covers" / (key + ".webp")
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            from PIL import Image, ImageOps
            with Image.open(p) as im:
                im = ImageOps.exif_transpose(im).convert("RGB")
                im.thumbnail((960, 720))
                im.save(target, "WEBP", quality=83)
        media_written.add(target.name)
        return "/production-library/covers/" + target.name

    seeds, items, dependencies, detail_ids = [], [], [], set()

    def portable(origin, name, description, body, author, version, image="", kind="skill", source="LibTV", inputs="", outputs="", files=None, source_file=None):
        files = files or []
        instruction = ADAPTER + body
        if files:
            instruction += "\n\n## 配套文件索引\n" + "\n".join("- " + f["path"] for f in files)
        if not body.strip() or len(instruction) > 100000:
            raise ValueError(f"技能正文超出原生接口约束，不能截断: {name} ({len(instruction)})")
        sid = stable_id(origin)
        tag = category(name + " " + description)
        seeds.append({"skill_id": sid, "skill_name": name[:80], "description": (description or name)[:500], "instruction": instruction, "status": 1,
                      "markdown_url": "", "create_time": 1788998400000, "update_time": 1788998400000, "source": 2, "tag": tag, "sort_weight": 0,
                      "is_private": False, "like_count": 0, "added_count": 0, "owner_uid": "production-library", "effective_user": {"name": author or source, "avatar_url": "", "uid": "production-library"},
                      "showcase_media": [], "files": files, "extra_info": f"来源：{source} · {author or source}\n原版本：{version}\n来源标识：{origin}\n完整正文与配套资料已保留；由映雪现有模型和画布 Agent 执行。"})
        # Raw source remains separately inspectable; the adapter never rewrites its production rules.
        write_json(out / "definitions" / (sid + ".json"), {"id": sid, "body": body, "files": files, "source": source, "origin": origin, "version": version})
        dependencies.append({"id": sid, "origin": origin, "sourceFile": str(source_file.relative_to(root)).replace("\\", "/") if source_file else "", "sha256": hashlib.sha256(body.encode()).hexdigest(), "characters": len(body), "files": [f["path"] for f in files], "fileDigests": [{"path": f["path"], "sha256": hashlib.sha256(f["content"].encode()).hexdigest()} for f in files]})
        return {"id": sid, "kind": kind, "name": name, "description": description or name, "category": tag, "cover": image,
                "source": source, "author": author or source, "version": version, "available": True, "input": inputs, "output": outputs, "fileCount": len(files)}

    details = primary / "03_官方Skill技能库/详情_完整定义"
    for p in sorted(details.glob("*.json")):
        s = read_json(p)["data"]["skill"]
        if s["templateUuid"] in detail_ids:
            continue
        snap = json.loads(s.get("snapshotData") or "{}")
        origin = "libtv:" + s["templateUuid"]
        detail_ids.add(s["templateUuid"])
        image = cover(s["name"], s.get("coverUrl"))
        body = snap.get("markdownContent", "").strip()
        files = snap.get("skillFiles") or []
        if body:
            stored = []
            for file in files:
                content = str(file.get("content") or "")
                stored.append({"path": file.get("path", ""), "content": content})
            stored = [f for f in stored if f["content"].strip() != body.strip()]
            for f in stored:
                f["path"] = f["path"].replace("\\", "/")
                if not f["path"] or f["path"].startswith("/") or ":" in f["path"] or any(x in ("", ".", "..") for x in f["path"].split("/")):
                    raise ValueError("技能资源路径非法: " + f["path"])
            item = portable(origin, s["name"], s.get("description", ""), body, s.get("ownerName", ""), s.get("version", ""), image,
                            inputs=s.get("inputType", ""), outputs=s.get("outputContent", ""), files=stored, source_file=p)
        else:
            item = {"id": stable_id(origin), "kind": "skill", "name": s["name"], "description": s.get("description", ""), "category": category(s["name"] + s.get("description", "")), "cover": image,
                    "source": "LibTV", "author": s.get("ownerName", ""), "version": s.get("version", ""), "available": False, "input": s.get("inputType", ""), "output": s.get("outputContent", ""), "fileCount": 0}
        items.append(item)
    for s in read_json(primary / "03_官方Skill技能库/_技能总表1145条.json"):
        if s["templateUuid"] not in detail_ids:
            items.append({"id": stable_id("libtv:" + s["templateUuid"]), "kind": "skill", "name": s["name"], "description": "来源资料未包含技能正文", "category": category(s["name"]), "cover": cover(s["name"], s.get("coverUrl")), "source": "LibTV", "author": s.get("ownerName", ""), "available": False})

    extra = root / "一句成片AI影视创作平台/06_登录后API原生资产"
    agent_file = next(extra.glob("01*.json"))
    for agent in read_json(agent_file):
        items.append(portable("soulspacex:agent:" + str(agent["id"]), agent["name"].strip(), agent["intro"], agent["systemPrompt"], "SoulSpacex", "1", kind="agent", source="SoulSpacex", source_file=agent_file))
    for p in sorted((extra / "04_公开Skill完整正文_官方原始SKILL.md").glob("*.md")):
        name = p.stem.replace("_完整官方SKILL", "")
        items.append(portable("soulspacex:skill:" + name, name, "角色、美术与导演制作规范", p.read_text("utf-8-sig"), "SoulSpacex", "1", source="SoulSpacex", source_file=p))

    for p, name in [(root / "AI影视分镜与资产系统/01_运镜控制体系/运镜动作全量定义.md", "专业运镜指导"), (root / "AI影视分镜与资产系统/02_分镜与连续性提示词矩阵/连续性提示词矩阵.md", "分镜连续性指导")]:
        items.append(portable("production:reference:" + name, name, "将专业运镜与连续性规范应用于当前镜头", p.read_text("utf-8-sig"), "本地影视技术资料", "1", source="影视分镜与资产系统", source_file=p))

    cases = []
    for s in read_json(primary / "04_画布模板库/_画布模板总表1024条_含成片链接.json"):
        cases.append({"id": "case-" + s["templateUuid"], "kind": "case", "name": s["name"], "description": s.get("description", ""), "category": category(s["name"] + " ".join(s.get("tags", []))),
                      "cover": s.get("coverUrl") or "", "media": s.get("finalOutput") or "", "source": "LibTV", "author": s.get("author", ""), "tags": s.get("tags", []), "projectId": s["projectUuid"], "available": False})
    voices = []
    for s in read_json(primary / "05_官方音色库/_音色总表327条.json"):
        voices.append({"id": "voice-" + str(s["id"]), "kind": "voice", "name": s["name"], "description": s.get("language", ""), "category": "others", "source": "LibTV", "author": "音色资料", "available": False,
                       "voiceId": s["voiceId"], "media": s.get("voiceUrl", ""), "modelFamily": s.get("supportedModels", ""), "gender": s.get("gender", ""), "age": s.get("ageGroup", "")})
    stats = {"sourceSkills": 1145, "portableSkills": len([x for x in items if x["kind"] == "skill" and x["available"]]), "agents": len([x for x in items if x["kind"] == "agent"]), "referenceSkills": len([x for x in items if x["kind"] == "skill" and not x["available"]]), "cases": len(cases), "voices": len(voices), "localCovers": len(media_written)}
    priorities = ["电影级 AI 分镜导演", "通用商品短片导演", "角色一致性定妆师", "Cast Builder 角色资产创建", "电影级 AI 视频提示词导演", "AI写短剧剧本", "专业运镜指导", "分镜连续性指导"]
    by_name = {x["name"]: x for x in items}
    featured = [by_name[name] for name in priorities if name in by_name]
    write_json(opt.repo / "backend/internal/skills/seed/production-skills.json", seeds)
    write_json(out / "catalog.json", {"version": 1, "stats": stats, "items": items + cases + voices})
    write_json(out / "featured.json", {"version": 1, "stats": stats, "items": featured + [x for x in items if x["kind"] == "agent"]})
    write_json(opt.repo / "docs/production-library-source-manifest.json", {"version": 1, "stats": stats, "skills": dependencies, "bounds": {"caseGraphs": False, "voiceSynthesisProviderImported": False, "foreignAPIsCalled": False}})
    print(json.dumps({"seedCount": len(seeds), "stats": stats, "maxInstruction": max(len(x["instruction"]) for x in seeds)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
