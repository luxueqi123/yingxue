"""Prepare the authorized LTV finished-video library without downloading or transcoding it.

Original videos live outside web/public. Only derived poster images join normal builds.
The source archive is read-only. Run --self-test for the matching boundary checks.
"""
import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
import time
import unittest
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if path.exists() and path.read_bytes() == payload:
        return
    temporary = path.with_suffix(path.suffix + ".pending")
    temporary.write_bytes(payload)
    for attempt in range(3):
        try:
            temporary.replace(path)
            return
        except PermissionError:
            if attempt == 2:
                raise
            time.sleep(0.2 * (attempt + 1))


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def safe_title(value):
    # This is the archive's reversible filename convention, not fuzzy title matching.
    return re.sub(r'[\\/:*?"<>|]', "_", value)


def match_media(cases, filenames):
    ids = [row["templateUuid"] for row in cases]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r"[a-f0-9]{32}", value) for value in ids):
        raise ValueError("Case template IDs must be unique 32-character stable IDs")
    by_title = defaultdict(list)
    for index, row in enumerate(cases):
        by_title[safe_title(row["name"])].append((index, row))
    ranked = sorted(cases, key=lambda row: -(row.get("likeCount") or 0))
    matched = []
    seen = set()
    for filename in sorted(filenames):
        found = re.fullmatch(r"(\d+)_(.+)\.(mp4|mov)", filename, re.IGNORECASE)
        if not found:
            raise ValueError(f"Unrecognized final-output filename: {filename}")
        rank, title, extension = found.groups()
        candidates = by_title.get(title, [])
        if len(candidates) != 1:
            raise ValueError(f"Filename does not uniquely identify a metadata record: {filename}")
        index, row = candidates[0]
        ordinal = int(rank)
        if not 1 <= ordinal <= len(ranked) or ranked[ordinal - 1]["templateUuid"] != row["templateUuid"]:
            raise ValueError(f"Filename ordinal and metadata stable ID disagree: {filename}")
        if row["templateUuid"] in seen:
            raise ValueError(f"More than one file maps to the same case: {filename}")
        seen.add(row["templateUuid"])
        matched.append({"case": row, "sourceIndex": index + 1, "sourceRank": ordinal, "filename": filename, "extension": extension.lower()})
    return matched


def probe_media(path, ffprobe):
    process = subprocess.run([ffprobe, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)], capture_output=True, timeout=60, check=True)
    result = json.loads(process.stdout.decode("utf-8"))
    streams = result.get("streams", [])
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    duration = float(result.get("format", {}).get("duration") or (video or {}).get("duration") or 0)
    if not video or not video.get("codec_name") or not math.isfinite(duration) or duration <= 0:
        raise ValueError(f"No valid video stream and duration: {path.name}")
    if int(result.get("format", {}).get("size", 0)) != path.stat().st_size:
        raise ValueError(f"ffprobe size differs from the file: {path.name}")
    keys = ("index", "codec_type", "codec_name", "profile", "width", "height", "pix_fmt", "sample_rate", "channels", "duration", "r_frame_rate")
    return {"durationSeconds": duration, "format": result["format"]["format_name"], "videoCodec": video["codec_name"], "audioCodec": audio.get("codec_name") if audio else None, "width": video.get("width"), "height": video.get("height"), "streams": [{key: stream[key] for key in keys if key in stream} for stream in streams]}


def copy_verified(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    before = source.stat()
    if destination.exists():
        source_hash = digest(source)
        if destination.stat().st_size != before.st_size or digest(destination) != source_hash:
            raise ValueError(f"Existing destination differs; it was not overwritten: {destination}")
        return source_hash
    temporary = destination.with_suffix(destination.suffix + ".pending")
    if temporary.exists():
        raise ValueError(f"Unfinished copy exists; inspect it before retrying: {temporary}")
    checksum = hashlib.sha256()
    with source.open("rb") as incoming, temporary.open("xb") as outgoing:
        for chunk in iter(lambda: incoming.read(8 * 1024 * 1024), b""):
            checksum.update(chunk)
            outgoing.write(chunk)
    after = source.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns) or digest(temporary) != checksum.hexdigest():
        raise ValueError(f"Original changed or copied bytes failed verification: {source.name}")
    shutil.copystat(source, temporary)
    temporary.replace(destination)
    return checksum.hexdigest()


def prepare(args):
    source = args.source.resolve()
    repo = args.repo.resolve()
    library = repo / ".local/ltv-case-library"
    public = repo / "web/public/production-library"
    metadata_path = source / "04_画布模板库/_画布模板总表1024条_含成片链接.json"
    media_root = (source / "06_案例素材/final_outputs").resolve()
    cases = read_json(metadata_path)
    if len(cases) != 1024:
        raise ValueError(f"Expected all 1024 cases, found {len(cases)}")
    files = sorted(path for path in media_root.iterdir() if path.is_file())
    for path in files:
        path.resolve().relative_to(media_root)
    mappings = match_media(cases, [path.name for path in files])
    inventory = {"cases": len(cases), "localFiles": len(files), "localBytes": sum(path.stat().st_size for path in files), "normalizedFilenameMatches": sum(safe_title(row["case"]["name"]) != row["case"]["name"] for row in mappings)}
    print(json.dumps({"inventory": inventory}, ensure_ascii=False), flush=True)
    if args.audit_only:
        return
    ffprobe = args.ffprobe or shutil.which("ffprobe")
    ffmpeg = args.ffmpeg or shutil.which("ffmpeg")
    if not ffprobe or not ffmpeg:
        raise ValueError("Local ffprobe and ffmpeg executables are required")
    with ThreadPoolExecutor(max_workers=4) as pool:
        probes = list(pool.map(lambda row: probe_media(media_root / row["filename"], ffprobe), mappings))
    print(json.dumps({"ffprobeVerified": len(probes), "durationSeconds": sum(probe["durationSeconds"] for probe in probes), "videoCodecs": sorted({probe["videoCodec"] for probe in probes}), "withoutAudio": sum(probe["audioCodec"] is None for probe in probes)}, ensure_ascii=False), flush=True)
    missing_bytes = sum((media_root / row["filename"]).stat().st_size for row in mappings if not (library / "media" / f'{row["case"]["templateUuid"]}.{row["extension"]}').exists())
    if shutil.disk_usage(repo).free < missing_bytes + 1024 ** 3:
        raise ValueError("Insufficient free space for original media and verification")
    entries = []
    for number, (row, probe) in enumerate(zip(mappings, probes), 1):
        original = media_root / row["filename"]
        identifier = row["case"]["templateUuid"]
        filename = f'{identifier}.{row["extension"]}'
        destination = library / "media" / filename
        original_hash = copy_verified(original, destination)
        poster = public / "covers/cases" / f"{identifier}.webp"
        poster.parent.mkdir(parents=True, exist_ok=True)
        if not poster.exists():
            subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", str(min(1, probe["durationSeconds"] / 4)), "-i", str(destination), "-frames:v", "1", "-vf", f'scale={min(480, probe["width"] or 480)}:-2', "-c:v", "libwebp", "-quality", "85", str(poster)], capture_output=True, timeout=60, check=True)
        if not poster.stat().st_size:
            raise ValueError(f"Empty poster: {poster.name}")
        entries.append({"id": f"case-{identifier}", "localMedia": f"/production-library/case-media/{filename}", "localCover": f"/production-library/covers/cases/{poster.name}", "mediaStatus": "local", "filename": filename, "localMediaInfo": {"bytes": original.stat().st_size, "sha256": original_hash, **probe}, "poster": {"bytes": poster.stat().st_size, "sha256": digest(poster), "derivedFromSha256": original_hash}, "source": {"path": f'06_案例素材/final_outputs/{row["filename"]}', "metadataIndex": row["sourceIndex"], "likeRank": row["sourceRank"], "templateUuid": identifier, "projectUuid": row["case"]["projectUuid"], "finalOutput": row["case"]["finalOutput"], "match": "unique-safe-filename-and-like-rank-stable-id"}})
        write_json(library / "checkpoints" / f"{identifier}.json", entries[-1])
        print(json.dumps({"verifiedOriginals": number, "of": len(mappings), "id": f"case-{identifier}", "bytes": original.stat().st_size}, ensure_ascii=False), flush=True)
    catalog_path = public / "catalog.json"
    catalog = read_json(catalog_path)
    catalog_cases = [item for item in catalog["items"] if item["kind"] == "case"]
    by_id = {f'case-{row["templateUuid"]}': row for row in cases}
    if len(catalog_cases) != len(cases) or {item["id"] for item in catalog_cases} != set(by_id):
        raise ValueError("Existing catalog and all source stable case IDs must match exactly")
    local = {item["id"]: item for item in entries}
    for item in catalog_cases:
        original = by_id[item["id"]]
        if item.get("media", "") != original.get("finalOutput", ""):
            raise ValueError(f'Original case URL mismatch: {item["id"]}')
        item.update(sourceProjectId=original["projectUuid"], sourceTemplateId=original["templateUuid"], likeCount=original.get("likeCount", 0), publishedAt=original.get("publishAt", ""), mediaStatus="remote" if item.get("media") else "unavailable")
        item.pop("localMedia", None)
        item.pop("localMediaInfo", None)
        if item["id"] in local:
            item["localCover"] = local[item["id"]]["localCover"]
    manifest = {"version": 1, "kind": "ltv-case-media", "metadataCount": len(cases), "metadataSha256": digest(metadata_path), "sourceMetadata": "source-cases.json", "summary": {**inventory, "verifiedFiles": len(entries), "remoteCases": len(cases) - len(entries), "durationSeconds": sum(row["localMediaInfo"]["durationSeconds"] for row in entries)}, "bounds": {"completeEditableProjects": False, "originalMediaTranscoded": False, "originalArchiveModified": False, "networkDownloaded": False}, "entries": entries}
    library.mkdir(parents=True, exist_ok=True)
    copy_verified(metadata_path, library / "source-cases.json")
    write_json(library / "manifest.json", manifest)
    metadata = {"version": 1, "kind": "ltv-case-metadata", "metadataSha256": manifest["metadataSha256"], "entries": catalog_cases}
    write_json(public / "case-metadata.json", metadata)
    if args.export_static:
        export = args.export_static.resolve() / "production-library"
        for item in entries:
            copy_verified(library / "media" / item["filename"], export / "case-media" / item["filename"])
            copy_verified(public / "covers/cases" / f'{item["source"]["templateUuid"]}.webp', export / "covers/cases" / f'{item["source"]["templateUuid"]}.webp')
        write_json(export / "case-media-manifest.json", manifest)
        write_json(export / "case-metadata.json", metadata)
        write_json(export / "catalog.json", catalog)
    print(json.dumps({"prepared": manifest["summary"], "manifest": str(library / "manifest.json"), "publicVideoBytes": 0, "staticExportRequested": bool(args.export_static)}, ensure_ascii=False), flush=True)


class MappingBoundaries(unittest.TestCase):
    def case(self, identifier="a" * 32, title="A", likes=2):
        return {"templateUuid": identifier, "name": title, "likeCount": likes}

    def test_unique_filename_and_rank(self):
        row = match_media([self.case(title="A | B")], ["001_A _ B.mp4"])[0]
        self.assertEqual(row["case"]["templateUuid"], "a" * 32)

    def test_fuzzy_substring_does_not_match(self):
        with self.assertRaises(ValueError):
            match_media([self.case(title="Long A")], ["001_A.mp4"])

    def test_duplicate_stable_id_is_rejected(self):
        with self.assertRaises(ValueError):
            match_media([self.case(), self.case(title="B")], ["001_A.mp4"])

    def test_sanitized_collision_is_rejected(self):
        with self.assertRaises(ValueError):
            match_media([self.case(title="A | B"), self.case("b" * 32, "A / B", 1)], ["001_A _ B.mp4"])

    def test_rank_disagreement_is_rejected(self):
        with self.assertRaises(ValueError):
            match_media([self.case(), self.case("b" * 32, "B", 1)], ["002_A.mp4"])

    def test_existing_different_media_is_not_overwritten(self):
        with tempfile.TemporaryDirectory(prefix="ltv-case-copy-test-") as directory:
            source, destination = Path(directory) / "source", Path(directory) / "target"
            source.write_bytes(b"original")
            destination.write_bytes(b"existing")
            with self.assertRaises(ValueError):
                copy_verified(source, destination)
            self.assertEqual(destination.read_bytes(), b"existing")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, nargs="?")
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--ffprobe")
    parser.add_argument("--ffmpeg")
    parser.add_argument("--audit-only", action="store_true")
    parser.add_argument("--export-static", type=Path)
    parser.add_argument("--self-test", action="store_true")
    options = parser.parse_args()
    if options.self_test:
        unittest.main(argv=[__file__])
    elif options.source:
        prepare(options)
    else:
        parser.error("source is required unless --self-test is used")
