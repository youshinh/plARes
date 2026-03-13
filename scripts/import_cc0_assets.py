#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ALLOWED_LICENSES = {"CC0"}
ALLOWED_DOMAINS = {
    "polyhaven.com",
    "dl.polyhaven.org",
    "ambientcg.com",
    "kenney.nl",
    "quaternius.com",
}


@dataclass
class ManifestEntry:
    id: str
    provider: str
    license: str
    download_url: str
    target_path: str
    source_page: str
    checksum_sha256: str
    asset_type: str


def _load_manifest(path: Path) -> list[ManifestEntry]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("manifest must be a JSON object")
    entries = raw.get("entries")
    if not isinstance(entries, list):
        raise ValueError("manifest.entries must be an array")
    out: list[ManifestEntry] = []
    for item in entries:
        if not isinstance(item, dict):
            continue
        out.append(
            ManifestEntry(
                id=str(item.get("id", "")).strip(),
                provider=str(item.get("provider", "")).strip(),
                license=str(item.get("license", "")).strip().upper(),
                download_url=str(item.get("download_url", "")).strip(),
                target_path=str(item.get("target_path", "")).strip(),
                source_page=str(item.get("source_page", "")).strip(),
                checksum_sha256=str(item.get("checksum_sha256", "")).strip().lower(),
                asset_type=str(item.get("asset_type", "")).strip(),
            )
        )
    return out


def _domain_allowed(download_url: str) -> bool:
    try:
        host = (urlparse(download_url).hostname or "").lower()
    except Exception:
        return False
    return host in ALLOWED_DOMAINS


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _download(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "plaresAR-cc0-importer/1.0"})
    with urlopen(req, timeout=45) as res:
        return res.read()


def _validate_entry(entry: ManifestEntry) -> list[str]:
    issues: list[str] = []
    if not entry.id:
        issues.append("id is empty")
    if entry.license not in ALLOWED_LICENSES:
        issues.append(f"license '{entry.license}' is not allowed")
    if not entry.download_url.startswith("https://"):
        issues.append("download_url must be https")
    if not _domain_allowed(entry.download_url):
        issues.append("download_url domain is not allowlisted")
    if not entry.target_path:
        issues.append("target_path is empty")
    if ".." in entry.target_path.replace("\\", "/"):
        issues.append("target_path contains '..'")
    return issues


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def run(manifest_path: Path, output_root: Path, fetch: bool, dry_run: bool) -> int:
    entries = _load_manifest(manifest_path)
    results: list[dict[str, Any]] = []
    errors = 0

    for entry in entries:
        issues = _validate_entry(entry)
        status = "validated"
        bytes_len = 0
        checksum = ""
        target_file = output_root / entry.target_path

        if issues:
            status = "rejected"
            errors += 1
        elif fetch:
            try:
                data = _download(entry.download_url)
                checksum = _sha256_bytes(data)
                bytes_len = len(data)
                if entry.checksum_sha256 and entry.checksum_sha256 != checksum:
                    status = "checksum_mismatch"
                    issues.append("checksum mismatch")
                    errors += 1
                elif dry_run:
                    status = "downloaded_dry_run"
                else:
                    _write_bytes(target_file, data)
                    status = "imported"
            except Exception as exc:
                status = "download_failed"
                issues.append(str(exc))
                errors += 1
        else:
            status = "planned"
            note_path = target_file
            if note_path.suffix == "":
                note_path = note_path.with_suffix(".asset.txt")
            if not dry_run:
                _write_text(
                    note_path,
                    f"Planned import for {entry.id}\nprovider={entry.provider}\nsource={entry.download_url}\n",
                )

        results.append(
            {
                "id": entry.id,
                "provider": entry.provider,
                "license": entry.license,
                "asset_type": entry.asset_type,
                "download_url": entry.download_url,
                "target_path": entry.target_path,
                "source_page": entry.source_page,
                "status": status,
                "issues": issues,
                "size_bytes": bytes_len,
                "checksum_sha256": checksum or entry.checksum_sha256,
            }
        )

    lock = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "manifest": str(manifest_path),
        "output_root": str(output_root),
        "fetch_mode": fetch,
        "dry_run": dry_run,
        "entries": results,
    }
    lock_path = manifest_path.parent / "import-lock.json"
    _write_text(lock_path, json.dumps(lock, ensure_ascii=False, indent=2))
    print(f"[cc0-import] wrote lock file: {lock_path}")
    print(f"[cc0-import] entries={len(results)} errors={errors}")
    return 1 if errors else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="CC0 asset import pipeline for PlaresAR")
    parser.add_argument(
        "--manifest",
        default="assets/cc0/manifest.json",
        help="path to manifest json",
    )
    parser.add_argument(
        "--out",
        default="frontend/public/assets/cc0",
        help="destination root for imported assets",
    )
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="download and import assets (default: generate plan only)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="validate/download without writing imported files",
    )
    args = parser.parse_args()

    root = Path(os.getcwd())
    manifest_path = (root / args.manifest).resolve()
    out_root = (root / args.out).resolve()
    return run(manifest_path, out_root, fetch=args.fetch, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
