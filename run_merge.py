#!/usr/bin/env python3
import os, json

CACHE_DIR = "data/cache"
DATA_DIR = "data"

agencies, sessions, departments, classes, courses, lecturers, labs, timetables = [], [], [], [], {}, [], {}, []
seen_deps, seen_cls = set(), set()

for fname in sorted(os.listdir(CACHE_DIR)):
    if not fname.endswith(".json"):
        continue
    with open(os.path.join(CACHE_DIR, fname), "r", encoding="utf-8") as f:
        data = json.load(f)
    agencies.append(data["agency"])
    sessions.extend(data["sessions"])
    for d in data["departments"]:
        if d["departmentcode"] not in seen_deps:
            seen_deps.add(d["departmentcode"])
            departments.append(d)
    for c in data["classes"]:
        key = (c["classcode"], c["sessioncode"])
        if key not in seen_cls:
            seen_cls.add(key)
            classes.append(c)
    c_data = data["courses"]
    if isinstance(c_data, list):
        courses.update({c["coursecode"]: c for c in c_data})
    else:
        courses.update(c_data)
    l_data = data["lecturers"]
    if isinstance(l_data, dict):
        lecturers.extend(l_data.values())
    else:
        lecturers.extend(l_data)
    labs_data = data["labs"]
    if isinstance(labs_data, list):
        labs.update({l["labname"]: l for l in labs_data})
    else:
        labs.update(labs_data)
    timetables.extend(data["timetables"])

def jsave(name, data):
    with open(os.path.join(DATA_DIR, name), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

jsave("agencies.json", agencies)
jsave("sessions.json", sessions)
jsave("departments.json", sorted(departments, key=lambda x: x["departmentcode"]))
jsave("classes.json", sorted(classes, key=lambda x: (x["sessioncode"], x["classcode"])))
jsave("courses.json", sorted(courses.values(), key=lambda x: x["coursecode"]))
jsave("lecturers.json", sorted(lecturers, key=lambda x: (x["lecturercode"], x.get("agencyid", ""))))
jsave("labs.json", sorted(labs.values(), key=lambda x: x["labname"]))
jsave("timetables.json", timetables)

print(f"agencies: {len(agencies)}")
print(f"sessions: {len(sessions)}")
print(f"departments: {len(departments)}")
print(f"classes: {len(classes)}")
print(f"courses: {len(courses)}")
print(f"lecturers: {len(lecturers)}")
print(f"labs: {len(labs)}")
print(f"timetables: {len(timetables)}")
print("Done!")
