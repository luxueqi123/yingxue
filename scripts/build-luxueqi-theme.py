"""Build theme art and package separately reviewed, actual character footage.

Usage: python -X utf8 scripts/build-luxueqi-theme.py --source <originals>
Requires Pillow and NumPy for static art, and FFmpeg for reviewed video footage.
Video generation happens separately; this script never animates a still image.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "web/public/themes/luxueqi-tianya"
STATES = {
    "idle": "idle", "queued": "sleep_loop", "running": "working_loop",
    "waiting_approval": "think", "completed": "wave", "failed": "wipe_sweat",
    "cancelled": "lie_down", "rejected": "rejected",
}


def save_json(path: Path, value: object):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cutout(sheet: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    rgb = np.asarray(sheet.crop(box).convert("RGB")).astype(np.float32)
    distance = np.max(np.abs(rgb - 91), axis=2)
    alpha = np.clip((distance - 3) / 12, 0, 1)
    mask = ImageOps.expand(Image.fromarray(((alpha > 0.6) * 255).astype("uint8")), border=1)
    ImageDraw.floodfill(mask, (0, 0), 128)
    alpha[np.asarray(mask)[1:-1, 1:-1] != 128] = 1
    foreground = np.clip((rgb - (1 - alpha[..., None]) * 91) / np.maximum(alpha[..., None], 0.001), 0, 255)
    return Image.fromarray(np.dstack([foreground, alpha * 255]).astype("uint8"))


def build_art(source: Path):
    sheet = Image.open(source / "c6a579c7-067e-4ac8-81ab-1932854d7dca.png").convert("RGB")
    actor = cutout(sheet, (32, 0, 319, 346))
    actor.save(ART / "assistant.webp", lossless=True)
    portrait = cutout(sheet, (1193, 42, 1474, 307))
    portrait.save(ART / "portrait.webp", lossless=True)
    forest = Image.open(source / "c012e7b3-a87d-4042-819d-0412e5b53194.png").convert("RGB")
    still = Image.open(source / "c30bd0bf-fb83-4174-9d06-c2fb269ed527.png").convert("RGB")
    # Preserve the animation frame's composition and avoid the second character.
    still = still.crop((700, 0, 1800, 839))
    for mode, base in [("light", "#eff5f9"), ("dark", "#0b1522")]:
        hero = Image.new("RGB", (1440, 900), base)
        bamboo = ImageOps.fit(forest, hero.size, centering=(0.6, 0.45))
        bamboo = ImageEnhance.Color(bamboo).enhance(0.65)
        if mode == "light":
            bamboo = Image.blend(bamboo, Image.new("RGB", bamboo.size, base), 0.64)
        hero = Image.blend(hero, bamboo, 0.86 if mode == "dark" else 0.82)
        figure = ImageOps.fit(still, (970, 900), centering=(0.53, 0.35))
        if mode == "light":
            figure = Image.blend(figure, Image.new("RGB", figure.size, "#d4e6f4"), 0.09)
        xx = np.linspace(0, 1, 970)
        mask = (np.clip((xx - 0.02) / 0.38, 0, 1) * 250).astype("uint8")
        mask = Image.fromarray(np.tile(mask, (900, 1)))
        hero.paste(figure, (470, 0), mask)
        # Keep a quiet, opaque reading area on the left, with a soft diagonal join.
        x = np.linspace(0, 1, 1440)[None, :]
        y = np.linspace(0, 1, 900)[:, None]
        veil = np.clip((0.73 - x + y * 0.10) / 0.46, 0, 1)
        veil = Image.fromarray((veil * (248 if mode == "light" else 237)).astype("uint8"))
        hero.paste(Image.new("RGB", hero.size, base), (0, 0), veil)
        hero.save(ART / f"hero-{mode}.webp", quality=88, method=6)
    ImageOps.fit(forest, (1600, 800)).save(ART / "bamboo.webp", quality=86, method=6)
    # Empty library art remains decoration, never inserted into a user's assets.
    for name, image, center in [
        ("empty-bamboo.webp", forest, (0.68, 0.5)),
        ("empty-snow.webp", still, (0.45, 0.42)),
    ]:
        ImageOps.fit(image, (480, 320), centering=center).save(ART / name, quality=84, method=6)
    return actor


def build_bundle(plan: Path, receipt: Path, ffmpeg: str, ffprobe: str):
    subprocess.run([
        sys.executable, str(ROOT / "scripts/build-luxueqi-motion.py"),
        "--plan", str(plan), "--output", str(ART / "luxueqi-assistant.zip"),
        "--receipt", str(receipt), "--ffmpeg", ffmpeg, "--ffprobe", ffprobe,
    ], check=True)
    save_json(ART / "assistant-settings.json", {
        "agentName": "陆雪琪", "avatarType": "bundle", "avatarHeight": 260,
        "avatarClipStates": STATES,
    })


def build_sources(source: Path, real_motion: bool):
    selected = ["c012e7b3-a87d-4042-819d-0412e5b53194.png", "c30bd0bf-fb83-4174-9d06-c2fb269ed527.png", "c6a579c7-067e-4ac8-81ab-1932854d7dca.png"]
    path = ART / "sources.json"
    metadata = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    metadata.update({
        "name": "陆雪琪 · 天琊", "assetSource": "用户提供的动画画面、竹林场景与人物设定图",
        "gameAssetsUsed": False,
        "files": [{"name": name, "sha256": hashlib.sha256((source / name).read_bytes()).hexdigest()} for name in selected],
        "reference": "https://www.sina.cn/news/detail/5344800485933463.html",
        "rights": "仅记录用户提供素材的加工来源，不对原著或动画素材追加授权声明。",
    })
    if real_motion:
        metadata.update({
            "generativeModelUsed": True,
            "animationMethod": "用户动画与服装参考衍生首帧，经视频工具生成实际人物动作；目视审查后剪辑、清理绿幕、去音轨并导出影策原生MP4动画包。非Cubism模型，不使用立绘形变制作动作。",
        })
    save_json(path, metadata)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--skip-video", action="store_true")
    parser.add_argument("--motion-plan", type=Path)
    parser.add_argument("--receipt", type=Path, default=ROOT / ".local/cache/luxueqi-motion-verification.json")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()
    if not args.skip_video and args.motion_plan is None:
        parser.error("--motion-plan is required for video; a still image is not an animation source")
    ART.mkdir(parents=True, exist_ok=True)
    build_art(args.source)
    if not args.skip_video:
        build_bundle(args.motion_plan.resolve(), args.receipt, args.ffmpeg, args.ffprobe)
    build_sources(args.source, not args.skip_video)
    print(ART)


if __name__ == "__main__":
    main()
