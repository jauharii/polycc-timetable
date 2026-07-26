#!/usr/bin/env python3
"""Re-download all session JSONs from deployed site (original day codes) and migrate once. Parallel."""
import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://jauharii.github.io/polycc-timetable/data"
OUT = "/media/unified/hobiz/build/opencode/public/data"

# Map raw day abbreviations (portal sometimes returns unmapped codes) to new numeric.
RAW_DAY = {"AHD": "01", "AH": "01", "ISN": "02", "SEL": "03", "RAB": "04",
           "KHA": "05", "JUM": "06", "SAB": "07"}

def remap(ttid):
    # hour is always the last 2 chars; day code is the prefix (2 digits or raw abbrev).
    day_part, hour = ttid[:-2], ttid[-2:]
    if day_part.isdigit():
        new = (int(day_part) % 7) + 1  # Mon(1)->2 ... Sat(6)->7, Sun(7)->1
        return f"{new:02d}{hour}"
    # Non-numeric day code: map raw abbrev if known, else leave unchanged.
    if day_part in RAW_DAY:
        return RAW_DAY[day_part] + hour
    return ttid

def download_one(aid, sc):
    url = f"{BASE}/t/{aid}/{sc}.json"
    outpath = os.path.join(OUT, "t", aid, f"{sc}.json")
    os.makedirs(os.path.dirname(outpath), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    for t in data.get("timetables", []):
        t["ttid"] = remap(t["ttid"])
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return f"{aid}/{sc}"

def main():
    with open(os.path.join(OUT, "agencies.json")) as f:
        agencies = json.load(f)

    tasks = [(a["agencyid"], s["sessioncode"]) for a in agencies for s in a["sessions"]]
    print(f"Total: {len(tasks)} sessions", flush=True)

    done, failed = 0, []
    with ThreadPoolExecutor(max_workers=16) as ex:
        futures = {ex.submit(download_one, aid, sc): (aid, sc) for aid, sc in tasks}
        for fut in as_completed(futures):
            aid, sc = futures[fut]
            try:
                fut.result()
                done += 1
                if done % 20 == 0:
                    print(f"  {done}/{len(tasks)}", flush=True)
            except Exception as e:
                failed.append((aid, sc, str(e)))
                print(f"FAIL {aid}/{sc}: {e}", flush=True)

    print(f"Done: {done}, failed: {len(failed)}", flush=True)
    if failed:
        for aid, sc, e in failed:
            print(f"  FAILED {aid}/{sc}: {e}")

if __name__ == "__main__":
    main()