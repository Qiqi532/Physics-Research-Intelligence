"""Build the local journal corpus: assemble manifest, download, and verify PDFs.

Selection: 45 papers from Science / PRL / Nature / Nature Communications / Nature Photonics.
PDFs are downloaded from the official arXiv endpoint for local review and verified by
signature + SHA-256. Check each arXiv version's license before any further processing.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDFS = ROOT / "pdfs"
PDFS.mkdir(parents=True, exist_ok=True)

CANDIDATES = json.loads((ROOT / "candidates.json").read_text(encoding="utf-8"))
SCIENCE_META = json.loads((ROOT / "science_arxiv_meta.json").read_text(encoding="utf-8"))

# Final curated selection: journal -> list of arXiv base ids
SELECTION = {
    "Science": [
        "2408.15441", "2504.21524", "2410.10611", "2508.08368",
        "2607.14326", "2503.04621", "2506.16346", "2606.18410", "2605.02590",
    ],
    "Physical Review Letters": [
        "2608.17627", "2602.22028", "2607.00287", "2606.21149", "2604.21383",
        "2604.11698", "2603.17955", "2601.20814", "2601.18083", "2601.13374",
        "2601.02350", "2601.01759",
    ],
    "Nature": [
        "2608.26320", "2607.01316", "2604.16216", "2603.16115",
        "2602.22637", "2601.20956", "2601.14526", "2512.07159",
    ],
    "Nature Communications": [
        "2608.27064", "2608.23208", "2608.18467", "2607.21889", "2607.21507",
        "2606.05653", "2605.23654", "2605.30703", "2603.29342", "2601.19403",
    ],
    "Nature Photonics": [
        "2511.13968", "2511.05928", "2508.17940", "2505.09953", "2503.17744", "2403.00109",
    ],
}


def base_id(aid: str) -> str:
    return re.sub(r"v\d+$", "", aid)


def find_candidate(bid: str) -> dict | None:
    for r in CANDIDATES:
        if base_id(r["arxiv_id"]) == bid:
            return r
    for r in SCIENCE_META:
        if base_id(r["arxiv_id"]) == bid:
            return r
    return None


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(aid: str, dest: Path) -> dict:
    url = f"https://arxiv.org/pdf/{aid}"
    req = urllib.request.Request(url, headers={"User-Agent": "physics-research-intelligence/0.1 (personal corpus)"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    if not data.startswith(b"%PDF"):
        raise ValueError(f"not a PDF for {aid}: {data[:16]!r}")
    dest.write_bytes(data)
    return {
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "content_type": resp.headers.get("Content-Type", ""),
    }


def main() -> None:
    manifest = []
    errors = []
    for journal, ids in SELECTION.items():
        for bid in ids:
            rec = find_candidate(bid)
            if rec is None:
                errors.append(f"{journal}:{bid} metadata not found")
                print(f"[MISS-META] {journal}:{bid}")
                continue
            aid = rec["arxiv_id"]
            fname = f"{aid}.pdf"
            dest = PDFS / fname
            try:
                if dest.exists():
                    size = dest.stat().st_size
                    with dest.open("rb") as f:
                        head = f.read(5)
                    if head.startswith(b"%PDF") and size > 0:
                        info = {"size": size, "sha256": sha256_of(dest), "reused": True}
                        print(f"[REUSE] {aid} ({journal}) {size} bytes")
                    else:
                        raise ValueError("existing file corrupt")
                else:
                    info = download(aid, dest)
                    print(f"[OK] {aid} ({journal}) {info['size']} bytes sha256={info['sha256'][:12]}")
                    time.sleep(1)
                manifest.append(
                    {
                        "arxiv_id": aid,
                        "journal": journal,
                        "title": rec["title"],
                        "journal_ref": rec.get("journal_ref") or None,
                        "doi": rec.get("doi") or None,
                        "published": rec["published"],
                        "authors": rec.get("authors", []),
                        "primary_category": rec.get("primary_category"),
                        "categories": rec.get("categories", []),
                        "abstract": rec.get("abstract", "")[:800],
                        "pdf_file": fname,
                        "pdf_size": info["size"],
                        "pdf_sha256": info["sha256"],
                        "source": "arxiv",
                        "license_note": "arXiv full text; see arXiv license for the version used.",
                    }
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{journal}:{bid} download failed: {exc}")
                print(f"[FAIL] {aid} ({journal}): {exc}")

    manifest_path = ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nmanifest:", len(manifest), "papers ->", manifest_path)
    if errors:
        print("ERRORS:")
        for e in errors:
            print("  ", e)
    from collections import Counter
    print(Counter(m["journal"] for m in manifest))


if __name__ == "__main__":
    main()
