#!/usr/bin/env python3
"""Split agency list into 20 chunks: 1 for Ungku Omar (agency 5), 19 for the rest.
Outputs JSON array of chunks: [[{"id":"5","name":"..."}], [{"id":"1",...},...], ...]
"""
import json
import os
import re
import sys
import urllib.request

BASE_URL = "https://app.mypolycc.edu.my/polycctas/service/kelas/"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "cache")
UNGKU_OMAR_ID = "5"

def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")

def extract_options(html, select_name):
    match = re.search(rf'<select[^>]*name="{select_name}"[^>]*>(.*?)</select>', html, re.S)
    if not match:
        return []
    return [{"value": v.strip(), "label": re.sub(r"\s+", " ", l).strip()}
            for v, l in re.findall(r'<option value="([^"]*)"[^>]*>(.*?)</option>', match.group(1), re.S)
            if v.strip()]

def main():
    # Fetch agency list
    html = fetch_text(BASE_URL)
    agencies = extract_options(html, "agc")
    print(f"Found {len(agencies)} agencies", file=sys.stderr)

    # Filter out cached
    cached = set()
    if os.path.exists(CACHE_DIR):
        for fname in os.listdir(CACHE_DIR):
            if fname.endswith(".json"):
                cached.add(fname.replace(".json", ""))

    pending = [a for a in agencies if a["value"] not in cached]
    print(f"Pending: {len(pending)} (cached: {len(cached)})", file=sys.stderr)

    if not pending:
        print("[]")
        return

    # Separate Ungku Omar (agency 5) from the rest
    ungku_omar = [a for a in pending if a["value"] == UNGKU_OMAR_ID]
    others = [a for a in pending if a["value"] != UNGKU_OMAR_ID]

    chunks = []

    # Chunk 1: Ungku Omar only (if pending)
    if ungku_omar:
        chunks.append([{"id": a["value"], "name": a["label"]} for a in ungku_omar])

    # Chunks 2-20: split remaining into 19 chunks
    if others:
        chunk_size = max(1, -(-len(others) // 19))  # ceiling division
        for i in range(0, len(others), chunk_size):
            chunk = others[i:i + chunk_size]
            chunks.append([{"id": a["value"], "name": a["label"]} for a in chunk])

    print(f"Total chunks: {len(chunks)}", file=sys.stderr)
    print(json.dumps(chunks))

if __name__ == "__main__":
    main()