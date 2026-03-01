# plARes: CC0 Asset Pipeline Rules

[日本語版 (JP)](jp/cc0_pipeline.md)

This document defines the rules for importing commercially usable CC0 assets safely and reproducibly.

---

## 1. Target Files

- **Manifest**: `assets/cc0/manifest.json`
- **Importer**: `scripts/import_cc0_assets.py`
- **Lockfile**: `assets/cc0/import-lock.json`
- **Output**: `frontend/public/assets/cc0`

---

## 2. Auto-Import Requirements

1.  **License**: Only `CC0` is permitted.
2.  **Download URL**: Must use `https://`.
3.  **Allowlisted Domains**:
    - `polyhaven.com` / `dl.polyhaven.org`
    - `ambientcg.com`
    - `kenney.nl`
    - `quaternius.com`
4.  **No Path Traversal**: `target_path` must not contain `..`.
5.  **Checksum**: SHA256 must match if provided.

---

## 3. Commands

```bash
# Dry run (recommended)
python3 scripts/import_cc0_assets.py --dry-run

# Actual import
python3 scripts/import_cc0_assets.py --fetch
```

---

## 4. Operational Rules

1.  Always add new assets to `manifest.json`.
2.  Maintain the `source_page` URL for license verification.
3.  Review `import-lock.json` diffs in PRs.
4.  Mark rejected immediately if a license change is detected.

---

> Refer to [Character Quality](character_quality.md) for style guidelines.
