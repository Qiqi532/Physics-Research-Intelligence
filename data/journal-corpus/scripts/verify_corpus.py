"""Independent verification of the journal corpus: recheck manifest entries against on-disk files."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDFS = ROOT / "pdfs"
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))

print("manifest papers:", len(manifest))
ok = 0
problems = []
for m in manifest:
    p = PDFS / m["pdf_file"]
    if not p.exists():
        problems.append(f"{m['arxiv_id']}: file missing")
        continue
    data = p.read_bytes()
    if not data.startswith(b"%PDF"):
        problems.append(f"{m['arxiv_id']}: not a PDF ({data[:8]!r})")
        continue
    h = hashlib.sha256(data).hexdigest()
    if h != m["pdf_sha256"]:
        problems.append(f"{m['arxiv_id']}: sha256 mismatch {h[:12]} vs manifest {m['pdf_sha256'][:12]}")
        continue
    if len(data) != m["pdf_size"]:
        problems.append(f"{m['arxiv_id']}: size mismatch {len(data)} vs {m['pdf_size']}")
        continue
    ok += 1

print("verified OK:", ok, "/", len(manifest))
if problems:
    print("PROBLEMS:")
    for pr in problems:
        print("  ", pr)

# summary by journal
from collections import Counter
print(Counter(m["journal"] for m in manifest))

# list DOIs present / missing
no_doi = [m["arxiv_id"] for m in manifest if not m.get("doi")]
print("entries without DOI:", len(no_doi), no_doi)

# total size
total = sum(PDFS.joinpath(m["pdf_file"]).stat().st_size for m in manifest)
print(f"total pdf bytes: {total:,}")
