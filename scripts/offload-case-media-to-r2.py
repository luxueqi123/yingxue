"""Upload an explicit published-media inventory to the existing R2 bucket.

Run attached to an SSH channel. Configuration arrives on stdin, stays in memory,
and is never included in output. No source file, database or credential is changed.
"""

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlsplit


PREFIX = "yingxue-published-cases/v1/"
# Keep concurrent uploads small enough for a busy desktop. S3 parts require 5 MiB.
PART_BYTES = 8 * 1024 * 1024
LOCK = threading.Lock()
PUBLIC_INDEX_PATHS = {
    '/production-library/case-media-manifest.json': Path('/opt/open-ai-canvas/releases/featured200-20261026/published/manifest.json'),
    '/production-library/published-catalog.json': Path('/opt/open-ai-canvas/web-data/production-library/published-catalog.json'),
}


def emit(value):
    with LOCK:
        print(json.dumps(value, ensure_ascii=False), flush=True)


def validate_item(item, local=False):
    uri = item["uri"]
    if uri not in PUBLIC_INDEX_PATHS and not re.fullmatch(r"/production-library/(?:case-media|covers/cases)/[A-Za-z0-9_./-]+", uri):
        raise ValueError("Unapproved published media URI")
    if ".." in uri.split("/") or not re.fullmatch(r"[a-f0-9]{64}", item["sha256"]):
        raise ValueError("Invalid inventory identity")
    path = Path(item["localPath"] if local else item["path"])
    approved = (
        Path("/opt/open-ai-canvas/releases/featured200-20261026/published/media"),
        Path("/opt/open-ai-canvas/releases/clean-media-20260928-interior-v1/published/media"),
        Path("/opt/open-ai-canvas/web-data/production-library/covers/cases"),
    )
    if local:
        if os.name != 'nt':
            raise ValueError('Local sources require the authorized Windows workstation')
        base = Path('E:/天琊书客/映雪')
        approved = tuple(base / name for name in ('原始素材', '交付', '本地案例库'))
    resolved = path.resolve(strict=True)
    if uri in PUBLIC_INDEX_PATHS:
        permitted = not local and resolved == PUBLIC_INDEX_PATHS[uri]
    else:
        permitted = any(root == resolved or root in resolved.parents for root in approved)
    if not permitted:
        raise ValueError("Source outside published-media roots")
    if not resolved.is_file() or resolved.stat().st_size != item["bytes"]:
        raise ValueError("Source missing or changed")
    if item["bytes"] <= 0:
        raise ValueError("Empty media is not publishable")
    return resolved


def object_key(item):
    if item['uri'] in PUBLIC_INDEX_PATHS:
        return PREFIX + 'indexes/' + item['sha256'] + '-' + Path(item['uri']).name
    if item['uri'].startswith('/production-library/covers/cases/'):
        return PREFIX + 'covers/' + item['sha256'] + Path(item['uri']).suffix
    return PREFIX + item["uri"].lstrip("/")


def s3_client(setting):
    import boto3
    from botocore.config import Config

    endpoint = urlsplit(setting["endpoint"])
    if endpoint.scheme != "https" or not endpoint.hostname.endswith(".r2.cloudflarestorage.com"):
        raise ValueError("Expected the existing public HTTPS R2 endpoint")
    if endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
        raise ValueError("Invalid endpoint")
    options = dict(signature_version="s3v4", s3={"addressing_style": "path"},
                   retries={"max_attempts": 4, "mode": "standard"},
                   connect_timeout=15, read_timeout=180, max_pool_connections=12)
    for name in ("request_checksum_calculation", "response_checksum_validation"):
        if name in Config.OPTION_DEFAULTS:
            options[name] = "when_required"
    return boto3.client("s3", endpoint_url=setting["endpoint"],
                        region_name=setting.get("region") or "auto",
                        aws_access_key_id=setting["accessKeyId"],
                        aws_secret_access_key=setting["accessKeySecret"],
                        aws_session_token=setting.get("sessionToken") or None,
                        config=Config(**options))


def error_code(error):
    return getattr(error, "response", {}).get("Error", {}).get("Code", type(error).__name__)


def preflight(client, bucket):
    for operation, call in (
        ("listPublishedObjects", lambda: client.list_objects_v2(Bucket=bucket, Prefix=PREFIX, MaxKeys=1)),
        ("readBucketCORS", lambda: client.get_bucket_cors(Bucket=bucket)),
    ):
        try:
            result = call()
        except Exception as error:
            emit({"event": "preflight", "operation": operation, "allowed": False, "code": error_code(error)})
        else:
            emit({"event": "preflight", "operation": operation, "allowed": True,
                  "corsRules": result.get("CORSRules", []) if operation == "readBucketCORS" else None})


def upload_one(client, bucket, item, local=False):
    path = validate_item(item, local)
    key = object_key(item)
    try:
        current = client.head_object(Bucket=bucket, Key=key)
    except Exception as error:
        if str(error_code(error)) not in ("404", "NoSuchKey", "NotFound"):
            raise
    else:
        if current["ContentLength"] != item["bytes"] or current.get("Metadata", {}).get("sha256") != item["sha256"]:
            raise ValueError("Existing destination conflicts with inventory; refused overwrite")
        return dict(event="object", uri=item["uri"], key=key, bytes=item["bytes"],
                    sha256=item["sha256"], etag=current["ETag"].strip('"'), resumed=True)

    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    args = dict(Bucket=bucket, Key=key, ContentType=mime,
                CacheControl="public, max-age=31536000, immutable",
                Metadata={"sha256": item["sha256"], "source": "yingxue-published-case"})
    parts = []
    digest = hashlib.sha256()
    multipart = None
    try:
        with path.open("rb") as source:
            if item["bytes"] <= PART_BYTES:
                data = source.read()
                digest.update(data)
                if digest.hexdigest() != item["sha256"]:
                    raise ValueError("Source SHA256 mismatch")
                md5 = hashlib.md5(data).digest()
                result = client.put_object(**args, Body=data, ContentLength=len(data),
                                           ContentMD5=base64.b64encode(md5).decode())
                expected_etag = md5.hex()
            else:
                multipart = client.create_multipart_upload(**args)["UploadId"]
                while True:
                    data = source.read(PART_BYTES)
                    if not data:
                        break
                    digest.update(data)
                    md5 = hashlib.md5(data).digest()
                    part = client.upload_part(Bucket=bucket, Key=key, UploadId=multipart,
                                              PartNumber=len(parts) + 1, Body=data,
                                              ContentLength=len(data), ContentMD5=base64.b64encode(md5).decode())
                    if part["ETag"].strip('"') != md5.hex():
                        raise ValueError("Uploaded part ETag mismatch")
                    parts.append({"ETag": part["ETag"], "PartNumber": len(parts) + 1})
                if digest.hexdigest() != item["sha256"]:
                    raise ValueError("Source SHA256 mismatch")
                expected_etag = hashlib.md5(b"".join(bytes.fromhex(p["ETag"].strip('"')) for p in parts)).hexdigest() + "-" + str(len(parts))
                result = client.complete_multipart_upload(Bucket=bucket, Key=key, UploadId=multipart,
                                                          MultipartUpload={"Parts": parts})
                multipart = None
        if result["ETag"].strip('"') != expected_etag:
            raise ValueError("Completed upload ETag mismatch")
        head = client.head_object(Bucket=bucket, Key=key)
        if head["ContentLength"] != item["bytes"] or head.get("Metadata", {}).get("sha256") != item["sha256"] or head["ETag"].strip('"') != expected_etag:
            raise ValueError("Uploaded object verification failed")
        return dict(event="object", uri=item["uri"], key=key, bytes=item["bytes"],
                    sha256=item["sha256"], etag=expected_etag, resumed=False)
    finally:
        if multipart:
            client.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=multipart)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("preflight", "upload", "cors"))
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--local", action="store_true")
    options = parser.parse_args()
    payload = json.load(sys.stdin)
    setting = payload["setting"]
    client = s3_client(setting)
    bucket = setting["bucket"]
    if options.phase == "preflight":
        preflight(client, bucket)
        return
    if options.phase == "cors":
        # The coordinator supplies a reviewed merge, preserving existing rules.
        rules = payload["corsRules"]
        client.put_bucket_cors(Bucket=bucket, CORSConfiguration={"CORSRules": rules})
        actual = client.get_bucket_cors(Bucket=bucket)["CORSRules"]
        if actual != rules:
            raise ValueError("CORS save did not match the reviewed configuration")
        emit({"event": "cors", "rules": actual})
        return
    items = payload["items"]
    if len({x["uri"] for x in items}) != len(items):
        raise ValueError("Duplicate inventory URI")
    start = time.monotonic()
    completed = 0
    total = 0
    errors = []
    with ThreadPoolExecutor(max_workers=max(1, min(options.workers, 8))) as pool:
        pending = {pool.submit(upload_one, client, bucket, item, options.local): item for item in items}
        for job in as_completed(pending):
            item = pending[job]
            try:
                result = job.result()
            except Exception as error:
                errors.append(item["uri"])
                emit({"event": "error", "uri": item["uri"], "code": error_code(error)})
                if len(errors) >= 3:
                    for other in pending:
                        other.cancel()
                    break
            else:
                completed += 1
                total += item["bytes"]
                emit(result)
    emit({"event": "complete", "passed": not errors, "objects": completed,
          "expectedObjects": len(items), "verifiedBytes": total,
          "elapsedSeconds": round(time.monotonic() - start, 2), "failedURIs": errors})
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"event": "fatal", "code": error_code(error)})
        raise SystemExit(1)
