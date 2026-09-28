#!/usr/bin/env python3
"""Split the pending agency list into up to 20 chunks: 1 for Ungku Omar (agency 5), up to 19 for the rest.
Outputs JSON array of chunks: [[{"id":"5","name":"..."}], [{"id":"1",...},...], ...]
Exits non-zero if the agency list cannot be fetched (so CI fails loudly instead of
deploying with stale/empty chunk data).
"""
import json
import os
import re
import sys
import time
import urllib.request

BASE_URL = "https://app.mypolycc.edu.my/polycctas/service/kelas/"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "cache")
UNGKU_OMAR_ID = "5"

def fetch_text(url, max_retries=3):
    """Fetch a URL with retries + exponential backoff (transient network failures
    previously aborted the whole deploy job — see run #19)."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    last_error = None
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as e:  # URLError, HTTPError, TimeoutError, ...
            last_error = e
            print(f"fetch attempt {attempt + 1}/{max_retries} failed: {e}", file=sys.stderr)
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed to fetch {url} after {max_retries} attempts: {last_error}")

def extract_options(html, select_name):
    match = re.search(rf'<select[^>]*name="{select_name}"[^>]*>(.*?)</select>', html, re.S)
    if not match:
        return []
    return [{"value": v.strip(), "label": re.sub(r"\s+", " ", l).strip()}
            for v, l in re.findall(r'<option value="([^"]*)"[^>]*>(.*?)</option>', match.group(1), re.S)
            if v.strip()]

def main():
    # Fetch agency list (retries; fail loudly if the portal is unreachable)
    try:
        html = fetch_text(BASE_URL)
    except RuntimeError as e:
        print(f"FATAL: {e}", file=sys.stderr)
        sys.exit(1)
    agencies = extract_options(html, "agc")
    if not agencies:
        print("FATAL: no agencies parsed from portal page", file=sys.stderr)
        sys.exit(1)
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

    # Chunks 2-20: split remaining into exactly 19 chunks (distribute evenly)
    if others:
        num_chunks = min(19, len(others))  # don't create more chunks than agencies
        base_size = len(others) // num_chunks
        remainder = len(others) % num_chunks
        idx = 0
        for i in range(num_chunks):
            # First 'remainder' chunks get 1 extra agency
            size = base_size + (1 if i < remainder else 0)
            chunk = others[idx:idx + size]
            chunks.append([{"id": a["value"], "name": a["label"]} for a in chunk])
            idx += size

    print(f"Total chunks: {len(chunks)}", file=sys.stderr)
    print(json.dumps(chunks))

if __name__ == "__main__":
    main()