"""Prepare the user's native MOVO homepage assets as a separate local work copy."""
import concurrent.futures
import hashlib
import json
import re
import shutil
import urllib.request
from pathlib import Path

SOURCE = Path(r"E:\桌面文件\映雪创作平台二开资产\二开首要资产\首页震撼UI电影质感")
OUTPUT = SOURCE.parents[1] / "映雪前端商业化设计方案-20260909" / "映雪首页扩展"
CDN = "https://op-sourcecode.cdn.bcebos.com/source_code/projects/conv-dgckb2qzy6f4_1788329952005/"
ORIGIN = "https://movo.appmiaoda.com"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def download(item):
    url, target = item
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.is_file():
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=45) as response:
            content_type = response.headers.get("Content-Type", "")
            if target.suffix in (".mp4", ".js", ".css") and "text/html" in content_type:
                raise ValueError(f"Not the requested asset: {url}")
            temporary = target.with_suffix(target.suffix + ".partial")
            with temporary.open("wb") as stream:
                shutil.copyfileobj(response, stream)
            temporary.replace(target)
    with target.open("rb") as stream:
        sha = hashlib.file_digest(stream, "sha256").hexdigest()
    return {"url": url, "file": target.relative_to(OUTPUT).as_posix(), "bytes": target.stat().st_size, "sha256": sha}


def main():
    for folder in ("原始归档", "assets", "补齐资源", "核验", "源码对照"):
        (OUTPUT / folder).mkdir(parents=True, exist_ok=True)
    originals = []
    scripts = {}
    for folder in ("00_前端源码全量_bundles", "00_前端源码全量_chunks"):
        for source in (SOURCE / folder).iterdir():
            if not source.is_file():
                continue
            target = OUTPUT / "原始归档" / source.name
            shutil.copy2(source, target)
            data = source.read_bytes()
            originals.append({"source": str(source), "file": target.relative_to(OUTPUT).as_posix(), "bytes": len(data), "sha256": digest(data), "equal": data == target.read_bytes()})
            if source.suffix == ".js":
                scripts[source.name] = data.decode("utf-8")

    featured = json.loads((SOURCE / "04_商业与运营配置/featured_videos.json").read_text(encoding="utf-8"))
    home = scripts["HomePage-yvhEjmiq.js"]
    urls = set(re.findall(r"https://[^`\"'\s]+\.(?:jpg|png|webp|mp4)", home))
    urls.update(row[key] for row in featured for key in ("video_url", "thumbnail_url") if row.get(key))
    urls.add(ORIGIN + "/videos/background.mp4")
    # Only download actual homepage references. No login, user data or generation API.
    html = (SOURCE / "00_前端源码全量_bundles/index.html").read_text(encoding="utf-8")
    urls.update(re.findall(r'https://[^"\s]+\.(?:png|css)', html))
    jobs = []
    mapping = {}
    for url in sorted(urls):
        name = url.rsplit("/", 1)[-1]
        target = OUTPUT / "补齐资源" / name
        jobs.append((url, target))
        mapping[url] = "/media/" + name
    receipts, failures = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        pending = {pool.submit(download, item): item[0] for item in jobs}
        for future in concurrent.futures.as_completed(pending):
            try:
                row = future.result()
                receipts.append(row)
                print("RECOVERED", Path(row["file"]).name, row["bytes"], flush=True)
            except Exception as error:
                failures.append({"url": pending[future], "error": str(error)})
                print("MISSING", pending[future], str(error), flush=True)

    for name, script in scripts.items():
        patched = script.replace(CDN, "/")
        for url, path in mapping.items():
            patched = patched.replace(url, path)
        patched = patched.replace("/videos/background.mp4", "/media/background.mp4")
        # A local anonymous UI preview has no need for the source site's public key.
        patched = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "local-preview-disconnected", patched)
        (OUTPUT / "assets" / name).write_text(patched, encoding="utf-8")
    for row in featured:
        for key in ("video_url", "thumbnail_url"):
            if row.get(key):
                row[key] = mapping[row[key]]
    css = (OUTPUT / "补齐资源/index-BL68Z6IH.css").read_text(encoding="utf-8")
    font_urls = re.findall(r'@import "([^"]+)";', css)
    for index, url in enumerate(font_urls):
        css_file = OUTPUT / "补齐资源" / f"font-family-{index}.css"
        receipts.append(download((url, css_file)))
        font_css = css_file.read_text(encoding="utf-8")
        font_jobs = {}
        for font_url in set(re.findall(r"url\((https://[^)]+)\)", font_css)):
            target = OUTPUT / "补齐资源" / font_url.rsplit("/", 1)[-1]
            font_jobs[font_url] = target
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for row in pool.map(download, font_jobs.items()):
                receipts.append(row)
        for font_url, file in font_jobs.items():
            font_css = font_css.replace(font_url, "/media/" + file.name)
        local_css = OUTPUT / "assets" / f"font-family-{index}.css"
        local_css.write_text(font_css, encoding="utf-8")
        css = css.replace(url, "/assets/" + local_css.name)
    (OUTPUT / "assets/native.css").write_text(css, encoding="utf-8")
    (OUTPUT / "featured.json").write_text(json.dumps(sorted(featured, key=lambda row: row["sort_order"]), ensure_ascii=False, indent=2), encoding="utf-8")
    receipt = {"source": str(SOURCE), "originals": originals, "recovered": receipts, "missing": failures, "mapping": mapping}
    (OUTPUT / "资产来源核对.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "originalFiles": len(originals), "recovered": len(receipts), "missing": len(failures)}, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
