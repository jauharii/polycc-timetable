#!/usr/bin/env python3
"""Migrate ttid day codes from Mon=01..Sun=07 to Sun=01..Sat=07.
Rewrites cache JSON ttids, then rebuilds DB from scratch.
Run: python3 scripts/migrate_day_codes.py
"""
import json
import os
import sqlite3
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
from import_polycc import CACHE_DIR, DB_PATH, write_agencies_to_db, merge_all_cache_to_json

def remap_ttid(ttid):
    old_day = int(ttid[:2])
    new_day = (old_day % 7) + 1  # Mon(1)->2 ... Sat(6)->7, Sun(7)->1
    return f"{new_day:02d}{ttid[2:]}"

def main():
    # 1. Rewrite cache ttids
    migrated = 0
    for fname in sorted(os.listdir(CACHE_DIR)):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(CACHE_DIR, fname)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for t in data.get("timetables", []):
            t["ttid"] = remap_ttid(t["ttid"])
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        migrated += 1
    print(f"Migrated {migrated} cache files")

    # 2. Rebuild DB from scratch (merge appends, so delete first)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print("Removed old DB")

    agency_data_list = []
    for fname in sorted(os.listdir(CACHE_DIR)):
        if fname.endswith(".json"):
            with open(os.path.join(CACHE_DIR, fname), "r", encoding="utf-8") as f:
                agency_data_list.append(json.load(f))
    write_agencies_to_db(agency_data_list)
    print("Rebuilt DB")

    # 3. Re-merge JSON exports
    stats = merge_all_cache_to_json()
    print("Stats:", stats)

    # 4. Verify day distribution
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT substr(ttid,1,2) d, COUNT(*) FROM timetables GROUP BY d ORDER BY d")
    print("Day distribution (01=Sun..07=Sat):")
    for d, n in cur.fetchall():
        print(f"  {d}: {n}")
    conn.close()

if __name__ == "__main__":
    main()