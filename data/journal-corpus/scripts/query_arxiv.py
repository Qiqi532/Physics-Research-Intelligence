"""Query arXiv API by journal reference (jr:) for the target physics journals.

Downloads candidate metadata for:
  - Physical Review Letters
  - Nature
  - Science
  - Nature Communications
  - Nature Photonics

Outputs data/journal-corpus/candidates.json for human review before downloading.
Polite arXiv API usage: >=3s between requests.
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}

JOURNALS = [
    "Physical Review Letters",
    "Nature",
    "Science",
    "Nature Communications",
    "Nature Photonics",
]

BASE = "https://export.arxiv.org/api/query"
PER_JOURNAL = 30  # fetch N most recent, then filter by exact journal match


def journal_matcher(jr: str):
    jr = (jr or "").strip()
    if re.match(r"^Physical Review Letters\b", jr):
        return "Physical Review Letters"
    if re.match(r"^Nature\s+\d{2,4}\b", jr):
        return "Nature"
    if re.match(r"^Science\s+\d{3,4}\b", jr):
        return "Science"
    if re.match(r"^Nature Communications\b", jr):
        return "Nature Communications"
    if re.match(r"^Nature Photonics\b", jr):
        return "Nature Photonics"
    return None


def fetch(query: str, max_results: int = PER_JOURNAL) -> list[dict]:
    params = urllib.parse.urlencode(
        {
            "search_query": query,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
            "max_results": max_results,
        }
    )
    url = f"{BASE}?{params}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "physics-research-intelligence-corpus/0.1 (personal corpus curation; mailto:research@example.invalid)"},
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        data = resp.read()
    root = ET.fromstring(data)
    out = []
    for entry in root.findall("atom:entry", NS):
        eid = entry.find("atom:id", NS).text.strip()
        title = " ".join(entry.find("atom:title", NS).text.split())
        published = entry.find("atom:published", NS).text.strip()
        jref_el = entry.find("arxiv:journal_ref", NS)
        jref = " ".join(jref_el.text.split()) if jref_el is not None and jref_el.text else ""
        doi_el = entry.find("arxiv:doi", NS)
        doi = doi_el.text.strip() if doi_el is not None and doi_el.text else None
        authors = [
            " ".join(a.text.split())
            for a in entry.findall("atom:author/atom:name", NS)
        ]
        summary = " ".join(entry.find("atom:summary", NS).text.split())
        cats = [c.get("term") for c in entry.findall("atom:category", NS)]
        journal = journal_matcher(jref)
        out.append(
            {
                "arxiv_id": eid.replace("http://arxiv.org/abs/", "").replace("https://arxiv.org/abs/", ""),
                "title": title,
                "journal_ref": jref,
                "matched_journal": journal,
                "published": published,
                "doi": doi,
                "authors": authors[:12],
                "primary_category": cats[0] if cats else None,
                "categories": cats,
                "abstract": summary[:600],
            }
        )
    return out


def main() -> None:
    all_candidates = []
    for jname in JOURNALS:
        q = f'jr:"{jname}"'
        try:
            rows = fetch(q)
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] query failed for {jname}: {exc}")
            continue
        matched = [r for r in rows if r["matched_journal"] == jname]
        print(f"{jname}: fetched={len(rows)} exact={len(matched)}")
        all_candidates.extend(matched)
        time.sleep(3)

    # dedupe by arxiv id, keep first
    seen = set()
    deduped = []
    for r in all_candidates:
        if r["arxiv_id"] in seen:
            continue
        seen.add(r["arxiv_id"])
        deduped.append(r)

    out_path = Path(__file__).resolve().parent.parent / "candidates.json"
    out_path.write_text(json.dumps(deduped, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"total candidates: {len(deduped)} -> {out_path}")


if __name__ == "__main__":
    main()
