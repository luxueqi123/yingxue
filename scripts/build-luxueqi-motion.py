"""Package reviewed character footage using the native Agent avatar contract.

This script trims, scales and optionally crossfades actual video frames. It does
not synthesize body movement from a still image. Source media stays untouched.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import tempfile
import zipfile
from pathlib import Path


STATES = {
    "idle": "idle", "queued": "sleep_loop", "running": "working_loop",
    "waiting_approval": "think", "completed": "wave", "failed": "wipe_sweat",
    "cancelled": "lie_down", "rejected": "rejected",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command: list[str]) -> bytes:
    result = subprocess.run(command, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", "replace"))
    return result.stdout


def probe(executable: str, path: Path) -> dict:
    return json.loads(run([
        executable, "-v", "error", "-show_streams", "-show_format",
        "-of", "json", str(path),
    ]))


def build(plan_path: Path, output: Path, receipt_path: Path, ffmpeg: str, ffprobe: str):
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    if plan.get("version") != 1 or set(plan.get("clips", {})) != set(STATES):
        raise ValueError("The plan must define all eight Agent states.")
    sources = {}
    for name, spec in plan["sources"].items():
        path = (plan_path.parent / spec["file"]).resolve(strict=True)
        if digest(path) != spec["sha256"]:
            raise ValueError(f"Source digest changed: {name}")
        if spec.get("reviewAccepted") is not True or not spec.get("reviewNotes"):
            raise ValueError(f"Source needs an explicit visual review: {name}")
        metadata = probe(ffprobe, path)
        video = [s for s in metadata["streams"] if s["codec_type"] == "video"]
        if len(video) != 1:
            raise ValueError(f"Expected one source video stream: {name}")
        sources[name] = {"path": path, "spec": spec, "metadata": metadata}

    manifest = {
        "version": 1, "width": 512, "height": 640,
        "clips": {clip: clip + ".mp4" for clip in STATES.values()},
    }
    receipt = {
        "method": "Reviewed video footage; trim, chroma key cleanup, despill, scale, letterbox, remove audio and optional loop seam crossfade. No still-image motion synthesis.",
        "planSha256": digest(plan_path), "gameAssetsUsed": False,
        "sources": {n: {**s["spec"], "metadata": s["metadata"]} for n, s in sources.items()},
        "clips": [], "visualAcceptanceOfFinalBundle": "pending",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="luxueqi-real-motion-", dir=output.parent) as folder:
        directory = Path(folder)
        for state, clip_name in STATES.items():
            spec = plan["clips"][state]
            source = sources[spec["source"]]
            start, end = float(spec["start"]), float(spec["end"])
            duration = float(source["metadata"]["format"]["duration"])
            if not all(math.isfinite(n) for n in [start, end]) or not 0 <= start < end <= duration + 0.001:
                raise ValueError(f"Invalid source interval for {state}")
            if not spec.get("reviewNotes"):
                raise ValueError(f"Missing action review for {state}")
            seam = float(spec.get("seamSeconds", 0))
            if not math.isfinite(seam) or not 0 <= seam < (end - start) / 3:
                raise ValueError(f"Invalid loop seam for {state}")
            filters = f"[0:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,fps=24,settb=AVTB"
            if seam:
                offset = end - start - 2 * seam
                filters += (
                    f",split[body][head];[body]trim=start={seam},setpts=PTS-STARTPTS[main];"
                    f"[head]trim=end={seam},setpts=PTS-STARTPTS[wrap];"
                    f"[main][wrap]xfade=transition=fade:duration={seam}:offset={offset}"
                )
            crop = source["spec"].get("crop")
            if crop is not None:
                if len(crop) != 4 or not all(isinstance(n, int) and n >= 0 for n in crop):
                    raise ValueError("Crop must be [width, height, x, y].")
                filters += ",crop=" + ":".join(str(n) for n in crop)
            key = source["spec"].get("keyColor")
            if not isinstance(key, str) or len(key) != 8 or not key.startswith("0x") or any(c not in "0123456789abcdefABCDEF" for c in key[2:]):
                raise ValueError(f"Missing or invalid sampled green screen color: {spec['source']}")
            filters += (
                f",format=rgba,colorkey={key}:0.23:0.08,despill=type=green:mix=0.5:expand=0.08,"
                "scale=512:640:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1[actor];"
                f"color=c=0x00ff00:s=512x640:r=24:d={end-start}[background];"
                "[background][actor]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[out]"
            )
            target = directory / (clip_name + ".mp4")
            run([
                ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(source["path"]),
                "-filter_complex", filters, "-map", "[out]", "-an", "-c:v", "libx264",
                "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", "-map_metadata", "-1", str(target),
            ])
            metadata = probe(ffprobe, target)
            streams = metadata["streams"]
            if len(streams) != 1 or streams[0]["codec_name"] != "h264" or (streams[0]["width"], streams[0]["height"]) != (512, 640):
                raise ValueError(f"Native video contract failed for {state}")
            run([ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(target), "-f", "null", "-"])
            receipt["clips"].append({
                "state": state, "file": target.name, **spec,
                "sha256": digest(target), "bytes": target.stat().st_size,
                "duration": float(metadata["format"]["duration"]),
                "frames": int(streams[0]["nb_frames"]), "decodeExit": 0,
            })
            print(f"Verified {state}: {target.stat().st_size} bytes", flush=True)
        (directory / "avatar.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        candidate = directory / "luxueqi-assistant.zip"
        with zipfile.ZipFile(candidate, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in ["avatar.json", *manifest["clips"].values()]:
                archive.write(directory / name, name)
        with zipfile.ZipFile(candidate) as archive:
            if archive.testzip() is not None or len(archive.namelist()) != 9:
                raise ValueError("ZIP readback failed")
        candidate.replace(output)
    receipt.update({"bundleSha256": digest(output), "bundleBytes": output.stat().st_size, "zipEntries": 9})
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()
    build(args.plan.resolve(), args.output.resolve(), args.receipt.resolve(), args.ffmpeg, args.ffprobe)


if __name__ == "__main__":
    main()
