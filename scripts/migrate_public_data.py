#!/usr/bin/env python3
"""Migrate public/data/t/*.json ttid day codes from Mon=01.. to Sun=01.."""
import json
import os

PUBLIC_DATA = "/media/unified/hobiz/build/opencode/public/data"

def remap(ttid):
    old = int(ttid[:2])
    # Mon(1)->Tue(2), Tue(2)->Wed(3), ..., Sat(6)->Sun(7), Sun(7)->Mon(1)
    # Current data only has 01-05 (Mon-Fri), so just +1
    new = old + 1
    if new > 7:
        new = 1
    return f"{new:02d}{ttid[2:]}"

def main():
    tdir = os.path.join(PUBLIC_DATA, "t")
    count = 0
    for agency_dir in os.listdir(tdir):
        apath = os.path.join(tdir, agency_dir)
        if not os.path.isdir(apath):
            continue
        for session_file in os.listdir(apath):
            if not session_file.endswith(".json"):
                continue
            spath = os.path.join(apath, session_file)
            with open(spath, "r", encoding="utf-8") as f:
                data = json.load(f)
            for t in data.get("timetables", []):
                t["ttid"] = remap(t["ttid"])
            with open(spath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            count += 1
    print(f"Migrated {count} session files")

if __name__ == "__main__":
    main()