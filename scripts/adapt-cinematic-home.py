"""Apply the first, explicitly recorded homepage expansion to native assets."""
import hashlib
import json
from pathlib import Path

ROOT = Path(r"E:\桌面文件\映雪创作平台二开资产\映雪前端商业化设计方案-20260909\映雪首页扩展")
ASSETS = ROOT / "assets"
CHANGES = []


def edit(name, replacements):
    file = ASSETS / name
    before = file.read_text(encoding="utf-8")
    after = before
    for old, new, reason in replacements:
        count = after.count(old)
        if not count:
            raise ValueError(f"Source anchor missing: {name}: {reason}")
        after = after.replace(old, new)
        CHANGES.append({"file": name, "reason": reason, "occurrences": count, "original": old, "replacement": new})
    file.write_text(after, encoding="utf-8")
    return {"file": name, "beforeSha256": hashlib.sha256(before.encode()).hexdigest(), "afterSha256": hashlib.sha256(after.encode()).hexdigest()}


def main():
    hashes = []
    hashes.append(edit("index-Vu3y3_4Q.js", [
        ("logo:`Movo`", "logo:`映雪`", "首页文字品牌"),
        ("home:`探索`,explore:`探索`", "home:`首页`,explore:`首页`", "导航名称"),
        ("workflow:`创作流`,storyboard:`实验`,projects:`作品`", "workflow:`创作工作台`,storyboard:`技能广场`,projects:`灵感参考`", "连接现有预览的导航，不新增业务模块"),
        ("Movo 是 AI 视频生成平台，将创意转化为电影级故事。", "把灵感，变成看得见的作品。", "精简主标题下说明，移除原站品牌"),
        ("GPT-Image / DALL·E 多模型驱动，一句话生成海报、概念图与角色设定。", "海报、概念图、角色设定。", "入口说明精简"),
        ("文本、图像、音频、视频多模态驱动，最长 15 秒电影级动态影像。", "让静止的想象，成为动态影像。", "移除未接入的原站模型和时长承诺"),
        ("Seedance 与 Kling Omni 双引擎，支持首尾帧、参考视频、多镜头叙事。", "从灵感、分镜，到完整的视觉故事。", "移除未接入的原站模型承诺"),
        ("featured:{title:`精选作品`,viewAll:`查看全部`}", "featured:{title:`灵感参考`,viewAll:`探索更多`}", "原素材是创作参考，并非映雪出品背书"),
        ("auth:{login:`登录`", "auth:{login:`进入工作台`", "当前阶段只接现有 LTV 预览入口"),
        ("workflow:`Creation Flow`,storyboard:`Lab`,projects:`Works`", "workflow:`Studio`,storyboard:`Skills`,projects:`Inspiration`", "英文导航与中文一致"),
        ("Movo is an AI video generation platform that transforms ideas into cinematic stories.", "Turn your imagination into moving stories.", "英文品牌说明"),
        ("GPT-Image / DALL·E multi-model engines. One sentence to posters, concepts, and character designs.", "Posters, concepts, and character designs.", "英文入口说明"),
        ("Text, image, audio, and video driven together. Up to 15s cinematic motion.", "Bring your imagination to life in motion.", "英文入口说明"),
        ("Seedance and Kling Omni dual engines. First/last frames, video references, and multi-shot storytelling.", "From ideas and storyboards to visual stories.", "英文入口说明"),
        ("auth:{login:`Login`", "auth:{login:`Enter studio`", "英文工作台入口"),
    ]))
    desktop_old = "[{key:`home`,icon:ye,path:`/`},{key:`aiVideo`,icon:be,path:`/generate`},{key:`aiImage`,icon:xe,path:`/generate-image`},{key:`videoAnalysis`,icon:De,path:`/video-analysis`},{key:`storyboard`,icon:Ee,path:`/storyboard`},{key:`workflow`,icon:Se,path:`/short-film`},{key:`projects`,icon:Ce,path:`/records`},{key:`characters`,icon:we,path:`/characters`},{key:`scenes`,icon:Te,path:`/scenes`},{key:`profile`,icon:we,path:`/profile`}]"
    desktop_new = "[{key:`home`,icon:ye,path:`/`},{key:`workflow`,icon:Se,path:`/short-film`},{key:`storyboard`,icon:Ee,path:`/storyboard`},{key:`projects`,icon:Ce,path:`/records`}]"
    mobile_old = "[{key:`home`,labelKey:`nav.home`,icon:oe,path:`/`},{key:`aiVideo`,labelKey:`nav.aiVideo`,icon:ie,path:`/generate`},{key:`aiImage`,labelKey:`nav.aiImage`,icon:ae,path:`/generate-image`},{key:`storyboard`,labelKey:`nav.storyboard`,icon:Ee,path:`/storyboard`},{key:`projects`,labelKey:`nav.projects`,icon:me,path:`/records`},{key:`profile`,labelKey:`nav.profile`,icon:_e,path:`/profile`}]"
    mobile_new = "[{key:`home`,labelKey:`nav.home`,icon:oe,path:`/`},{key:`workflow`,labelKey:`nav.workflow`,icon:ie,path:`/short-film`},{key:`storyboard`,labelKey:`nav.storyboard`,icon:Ee,path:`/storyboard`},{key:`projects`,labelKey:`nav.projects`,icon:me,path:`/records`}]"
    hashes.append(edit("MobileBottomNav-Dgs-Qobw.js", [
        (desktop_old, desktop_new, "首页工作副本仅展示本轮已可访问的四个入口，原导航完整保存在原始归档"),
        (mobile_old, mobile_new, "手机导航与本轮首页入口一致"),
        ("r(t.path),e?.()", "window.yxHomepage.navigate(t.path),e?.()", "原生按钮导航接入预览路由"),
        ("Movo logo", "映雪动态标识", "保留原版标识动画，调整读屏名称"),
    ]))
    hashes.append(edit("HomePage-yvhEjmiq.js", [
        ("children:`MOVO`", "children:`映雪`", "手机品牌"),
        ("title:`MOVO - AI视频生成平台 | 文生视频、图生视频、视频编辑`", "title:`映雪 · 让灵感成片`", "网页标题"),
        ("description:`MOVO 是一款简单强大的 AI 视频生成工具，支持文生视频、图生视频、视频编辑。使用可灵、Seedance 等前沿模型，快速生成高质量短视频。`", "description:`映雪 AI 创作平台，从灵感到影像。`", "网页说明"),
        ("onClick:()=>o(`/generate`)", "onClick:()=>window.yxHomepage.openShowreel()", "轮播展示入口播放原素材影片"),
        ("children:t(`featured.title`)", "id:`featured-title`,children:t(`featured.title`)", "提供作品区滚动锚点"),
        ("更多功能，请访问 PC 端", "灵感继续，进入创作空间", "手机说明适配本轮入口"),
        ("短片工作流、会员中心、项目管理等完整能力，在电脑端体验更佳", "在电脑上继续探索画布、技能与创作案例。", "避免预览冒充原站账户功能"),
        ("onClick:()=>i(!1),role:`button`,tabIndex:-1", "onClick:e=>{if(e.target===e.currentTarget)i(!1)},role:`dialog`,\"aria-modal\":!0,\"aria-label\":e.title||`原资产示例影片`,tabIndex:-1", "修复原片播放器点击进度条就关闭的问题"),
    ]))
    hashes.append(edit("Layout-B7Hd-dkU.js", [
        ("fixed top-0 right-0 left-0 md:left-[220px] z-40 flex items-center justify-end px-6 py-4 pointer-events-none", "fixed top-0 right-0 left-0 md:left-[220px] z-40 hidden md:flex items-center justify-end px-6 py-4 pointer-events-none", "手机仅显示原生手机页头，消除两个工作台按钮互相遮挡"),
    ]))
    (ROOT / "第一步修改记录.json").write_text(json.dumps({"stage": "首页视觉与预览入口", "changes": CHANGES, "files": hashes, "ltvOriginalUiChanged": False, "ltvBootstrapChange": "启动器增加 next=/skill 白名单跳转，以便全新浏览器先安装归档 Service Worker 再进入技能页", "businessConnected": False}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"modifiedFiles": len(hashes), "recordedChanges": len(CHANGES)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
