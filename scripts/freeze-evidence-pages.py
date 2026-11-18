"""Label a private, reproducible lookup sample using Poppler rather than the PRI index."""

import argparse
import hashlib
import json
import random
import re
import statistics
import subprocess
import time
import unicodedata
from collections import Counter
from pathlib import Path


CONCEPTS = [
    ("响应度", r"\b(?:photo)?responsivit\w*"), ("暗电流", r"\bdark current"),
    ("光电流", r"\bphotocurrent"), ("响应时间", r"\b(?:response|rise|fall) time"),
    ("迁移率", r"\bmobility"), ("栅压", r"\bgate voltage"),
    ("探测率", r"\bdetectivit\w*"), ("异质结", r"\bheterojunction"),
    ("光晶体管", r"\bphototransistor"), ("厚度", r"\bthickness"),
    ("存储", r"\bretention"), ("阈值电压", r"\bthreshold voltage"),
]
QUANTITY = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*(nm|ms|ns|nA|mW|pA|GHz|MHz|Hz|mV|mm|K|V)\b", re.I)
PHRASE = re.compile(r"\b[A-Za-z]{5,}(?:[ -][A-Za-z]{4,}){2}\b")
STOP_WORDS = set(
    "that this these those have from which with using than were been used more also their into figure table "
    "published copyright article rights reserved supporting information supplementary material online download "
    "author authors references journal permission license wiley elsevier springer available creative commons "
    "university accessed under terms conditions downloaded".split()
)


def extract(root, executable):
    pages, elapsed = [], {}
    cumulative_ms = 0
    for file in sorted(root.rglob("*.pdf")):
        if not file.is_file() or file.is_symlink() or not file.resolve().is_relative_to(root):
            continue
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        if digest in elapsed:
            continue
        start = time.perf_counter()
        process = subprocess.run([executable, "-enc", "UTF-8", "-layout", str(file), "-"], capture_output=True)
        cumulative_ms += (time.perf_counter() - start) * 1000
        elapsed[digest] = cumulative_ms
        if process.returncode == 0:
            pages.extend((digest, number, text) for number, text in enumerate(process.stdout.decode("utf-8", "replace").split("\f"), 1) if text.strip())
    return pages, elapsed


def question_candidates(pages):
    counts = Counter()
    conditions, phrases = [], []
    for digest, number, text in pages:
        per_page = set()
        for line in text.splitlines():
            line = " ".join(unicodedata.normalize("NFKC", line).split())
            for label, pattern in CONCEPTS:
                match = re.search(pattern, line, re.I)
                if not match:
                    continue
                for measurement in QUANTITY.finditer(line):
                    if abs(measurement.start() - match.start()) > 100:
                        continue
                    qty = " ".join(measurement.groups())
                    key = (label, qty.lower())
                    per_page.add(key)
                    conditions.append((key, digest, number, line, f"哪一页同时讨论{label}和 {qty} 这一测量条件？"))
            for match in PHRASE.finditer(line):
                phrase = match.group()
                words = re.split(r"[ -]+", phrase.lower())
                if any(word in STOP_WORDS for word in words) or len(phrase) > 55:
                    continue
                key = ("原文术语", " ".join(words))
                per_page.add(key)
                phrases.append((key, digest, number, phrase, f"查找原文术语 {phrase}"))
        counts.update(per_page)
    return counts, conditions, phrases


def freeze(pages, seed):
    counts, conditions, phrases = question_candidates(pages)
    rng = random.Random(seed)
    selected, used_pages = [], set()
    for category, pool in [("条件查页", conditions), ("原文术语", phrases)]:
        rng.shuffle(pool)
        per_doc, per_topic = Counter(), Counter()
        target = len(selected) + 10
        for key, digest, number, locator, query in pool:
            topic = key[0] if category == "条件查页" else key
            if counts[key] != 1 or (digest, number) in used_pages or per_doc[digest] >= 2 or per_topic[topic] >= 3:
                continue
            selected.append(dict(category=category, id=digest, page=number, query=query, locator=locator))
            per_doc[digest] += 1
            per_topic[topic] += 1
            used_pages.add((digest, number))
            if len(selected) == target:
                break
        if len(selected) != target:
            raise SystemExit("Insufficient unique reference pages for this benchmark.")
    return selected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--pdftotext", default="pdftotext")
    parser.add_argument("--seed", type=int, default=20261118)
    options = parser.parse_args()
    if options.output.exists():
        raise SystemExit("Benchmark already frozen. Use a new output path for a new trial.")
    pages, elapsed = extract(options.root.resolve(), options.pdftotext)
    sample = freeze(pages, options.seed)
    options.output.parent.mkdir(parents=True, exist_ok=True)
    with options.output.open("x", encoding="utf-8") as out:
        json.dump(sample, out, ensure_ascii=False)
    print(json.dumps({"questions": len(sample), "referencePdfs": len({q["id"] for q in sample}), "popplerPages": len(pages),
                      "sequentialExtractionMedianMs": round(statistics.median(elapsed[q["id"]] for q in sample))}))


if __name__ == "__main__":
    main()
