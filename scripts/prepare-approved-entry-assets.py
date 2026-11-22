"""Copy the approved local entry assets without recompressing or modifying sources."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--source", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
files = {
    "映雪首页扩展/assets/brand/yingxue-lockup.webp": "brand/yingxue-approved-lockup.webp",
    "映雪首页扩展/assets/brand/yingxue-mark.webp": "brand/yingxue-approved-mark.webp",
    "映雪工作台扩展/assets/yingxue-lettering-clean.webp": "ltv-home/yingxue-lettering-clean.webp",
    "映雪首页扩展/assets/home-poster.webp": "showcase/entry/home-poster.webp",
    "映雪首页扩展/assets/showcase-film-poster.webp": "showcase/entry/film-poster.webp",
    "映雪首页扩展/补齐资源/background.mp4": "showcase/entry/background.mp4",
    "映雪首页扩展/补齐资源/mmexport1785853992807.jpg": "showcase/entry/showcase-1.jpg",
    "映雪首页扩展/补齐资源/mmexport1785853988813.jpg": "showcase/entry/showcase-2.jpg",
    "映雪首页扩展/补齐资源/5q4mpi_1786080365815_69wucu.mp4": "showcase/entry/haier.mp4",
    "映雪首页扩展/补齐资源/5q4mpi_1786080405282_1v5iht.png": "showcase/entry/haier.png",
    "映雪首页扩展/补齐资源/au5cf4_1785779066660_nlpq4k.mp4": "showcase/entry/film.mp4",
}
records = []
for source_name, destination_name in files.items():
    source = args.source / source_name
    destination = root / "web/public" / destination_name
    digest = hashlib.file_digest(source.open("rb"), "sha256").hexdigest()
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    with destination.open("rb") as stream:
        assert hashlib.file_digest(stream, "sha256").hexdigest() == digest
    records.append({"source": source_name, "destination": f"web/public/{destination_name}", "bytes": source.stat().st_size, "sha256": digest})

for name in ["映雪首页扩展/README.md", "映雪首页扩展/entry-layout.css", "映雪首页扩展/提取工具/entry-component.js", "映雪首页扩展/assets/HomePage-yvhEjmiq.js", "映雪工作台扩展/README.md", "映雪工作台扩展/studio-adapter.css", "映雪工作台扩展/studio-adapter.js"]:
    source = args.source / name
    with source.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    records.append({"source": name, "sha256": digest, "bytes": source.stat().st_size, "purpose": "approved-layout-reference"})

manifest = root / "docs/design/yingxue-entry-sources.json"
manifest.write_text(json.dumps({"version": "yingxue-entry-v1", "files": records}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"copied": len(files), "sourceRecords": len(records), "manifestSha256": hashlib.sha256(manifest.read_bytes()).hexdigest()}))
