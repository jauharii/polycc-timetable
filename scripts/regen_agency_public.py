#!/usr/bin/env python3
"""Regenerate public/data/t/<agency>/*.json from a single agency's cache file.
Surgical: touches only that agency's session files, leaves all others intact.
Usage: python3 scripts/regen_agency_public.py 17
"""
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(BASE, "data", "cache")
OUT = os.path.join(BASE, "public", "data", "t")

def build_session(data, sessioncode, session_name):
    tts = [t for t in data["timetables"] if t["sessioncode"] == sessioncode]
    timetables = [{
        "ttid": t["ttid"],
        "coursecode": t["coursecode"],
        "classcode": t["classcode"],
        "labname": t["labname"],
        "lecturers": [{"code": l["code"], "name": l.get("name", "")} for l in t.get("lecturers", [])],
    } for t in tts]

    coursecodes = sorted(set(t["coursecode"] for t in tts))
    courses = {cc: data["courses"].get(cc, {"coursecode": cc, "coursename": ""}) for cc in coursecodes}
    classes = sorted(set(t["classcode"] for t in tts))
    labs = sorted(set(t["labname"] for t in tts if t["labname"]))
    lecturers = sorted(set(l["code"] for t in tts for l in t.get("lecturers", []) if l["code"]))

    return {
        "agency": data["agency"],
        "session": {"sessioncode": sessioncode, "session_name": session_name},
        "timetables": timetables,
        "courses": courses,
        "classes": classes,
        "labs": labs,
        "lecturers": lecturers,
    }

def main():
    agencyid = sys.argv[1]
    with open(os.path.join(CACHE, f"{agencyid}.json"), encoding="utf-8") as f:
        data = json.load(f)

    outdir = os.path.join(OUT, agencyid)
    os.makedirs(outdir, exist_ok=True)
    for s in data["sessions"]:
        sc = s["sessioncode"]
        sess = build_session(data, sc, s.get("session_name", ""))
        with open(os.path.join(outdir, f"{sc}.json"), "w", encoding="utf-8") as f:
            json.dump(sess, f, ensure_ascii=False)
        # count multi-lecturer slots
        multi = sum(1 for t in sess["timetables"] if len(t["lecturers"]) > 1)
        print(f"  {sc}: {len(sess['timetables'])} timetables, {multi} multi-lecturer slots, {len(sess['lecturers'])} lecturers")

if __name__ == "__main__":
    main()