#!/usr/bin/env python3
"""
Parallel PolyCC timetable importer.
Usage: python3 import_polycc.py --agencies agency1,agency2,agency3
       python3 import_polycc.py --agencies-file agencies_chunk.txt
       python3 import_polycc.py --all  # original sequential mode
"""
import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
import argparse

BASE_URL = "https://app.mypolycc.edu.my/polycctas/service/kelas/"
DATA_URL = BASE_URL + "data/viewjadual.php"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CACHE_DIR = os.path.join(DATA_DIR, "cache")
DB_PATH = os.path.join(DATA_DIR, "timetable.db")

DAY_CODES = {
    "AHD": "01", "ISN": "02", "SEL": "03", "RAB": "04",
    "KHA": "05", "JUM": "06", "SAB": "07",
}

SESS_LABELS = {"1": "I", "2": "II"}

def normalize_session_name(code):
    """Derive clean session name from sessioncode YYYYX.
    20241 -> 'I: 2024/2025', 20262 -> 'II: 2026/2027', 20263 -> 'SEM PENDEK 2026'."""
    if len(code) == 5 and code[:4].isdigit() and code[4].isdigit():
        year, sess = code[:4], code[4]
        if sess == "3":
            return f"SEM PENDEK {year}"
        return f"{SESS_LABELS.get(sess, sess)}: {year}/{int(year)+1}"
    return code

DB_SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -32768;
PRAGMA temp_store = MEMORY;

CREATE TABLE IF NOT EXISTS agencies (
    agencyid TEXT PRIMARY KEY, agencyname TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    sessioncode TEXT PRIMARY KEY, session_name TEXT
);
CREATE TABLE IF NOT EXISTS departments (
    departmentcode TEXT PRIMARY KEY, departmentname TEXT
);
CREATE TABLE IF NOT EXISTS classes (
    classcode TEXT, sessioncode TEXT, departmentcode TEXT,
    PRIMARY KEY (classcode, sessioncode),
    FOREIGN KEY (sessioncode) REFERENCES sessions(sessioncode)
);
CREATE TABLE IF NOT EXISTS courses (
    coursecode TEXT PRIMARY KEY, coursename TEXT
);
CREATE TABLE IF NOT EXISTS lecturers (
    lecturercode TEXT, lecturername TEXT, agencyid TEXT,
    PRIMARY KEY (lecturercode, agencyid),
    FOREIGN KEY (agencyid) REFERENCES agencies(agencyid)
);
CREATE TABLE IF NOT EXISTS labs (
    labname TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS timetables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ttid TEXT, coursecode TEXT, classcode TEXT, sessioncode TEXT,
    labname TEXT, agencyid TEXT, department TEXT,
    FOREIGN KEY (agencyid) REFERENCES agencies(agencyid)
);
CREATE TABLE IF NOT EXISTS timetable_lecturers (
    timetable_id INTEGER, lecturercode TEXT, lectureragencyid TEXT,
    PRIMARY KEY (timetable_id, lecturercode, lectureragencyid),
    FOREIGN KEY (timetable_id) REFERENCES timetables(id)
);
CREATE INDEX IF NOT EXISTS idx_t_session_class ON timetables(sessioncode, classcode);
CREATE INDEX IF NOT EXISTS idx_t_session_lab ON timetables(sessioncode, labname);
CREATE INDEX IF NOT EXISTS idx_t_agency ON timetables(agencyid);
CREATE INDEX IF NOT EXISTS idx_t_coursecode ON timetables(coursecode);
CREATE INDEX IF NOT EXISTS idx_cls_session_dept ON classes(sessioncode, departmentcode);
CREATE INDEX IF NOT EXISTS idx_l_agency ON lecturers(agencyid);
CREATE INDEX IF NOT EXISTS idx_tl_lecturer ON timetable_lecturers(lecturercode, lectureragencyid);
"""

def fetch_text(url, max_retries=2):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception:
            if attempt == max_retries - 1:
                raise
            time.sleep(2 ** attempt)

def post_form(data, max_retries=3):
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(
        DATA_URL, data=encoded,
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        method="POST",
    )
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except (urllib.error.URLError, TimeoutError):
            if attempt == max_retries - 1:
                raise
            time.sleep(2 ** attempt)

def extract_options(html, select_name):
    match = re.search(rf'<select[^>]*name="{select_name}"[^>]*>(.*?)</select>', html, re.S)
    if not match:
        return []
    return [{"value": v.strip(), "label": re.sub(r"\s+", " ", l).strip()}
            for v, l in re.findall(r'<option value="([^"]*)"[^>]*>(.*?)</option>', match.group(1), re.S)
            if v.strip()]

def make_ttid(day_code, time_label):
    start_str = time_label.split("-")[0].strip().replace(".", ":")
    hour = int(start_str.split(":")[0]) if ":" in start_str else int(start_str)
    if 1 <= hour <= 5:
        hour += 12
    return f"{day_code}{hour:02d}"

def ensure_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(CACHE_DIR, exist_ok=True)

def fetch_agency(agencyid, agencyname):
    """Fetch all data for one agency. Returns dict with all entity lists."""
    result = {
        "agency": {"agencyid": agencyid, "agencyname": agencyname},
        "sessions": [], "departments": [], "classes": [],
        "courses": {}, "lecturers": [], "labs": {}, "timetables": [],
        "_seen_lecturers": set(),
    }
    try:
        agency_html = fetch_text(BASE_URL + "?agc=" + agencyid)
    except Exception as e:
        print(f"  SKIP {agencyid}: agency page failed: {e}", flush=True)
        return result

    sessions = [{"sessioncode": s["value"], "session_name": normalize_session_name(s["value"])}
                for s in extract_options(agency_html, "sesi")]
    departments = extract_options(agency_html, "dep")
    if not departments:
        print(f"  SKIP {agencyid}: no departments", flush=True)
        return result

    seen_classes = set()
    for session in sessions:
        sessioncode = session["sessioncode"]
        result["sessions"].append(session)
        for dept in departments:
            dep = dept["value"]
            result["departments"].append({"departmentcode": dep, "departmentname": dept["label"]})
            try:
                class_list = post_form({"DEP": dep, "SES": sessioncode, "mode": "2",
                                        "uag": agencyid, "rt": "1", "dep": dep, "getall": "1"})
            except Exception:
                continue
            for class_item in class_list.get("arData", []):
                if not isinstance(class_item, list) or len(class_item) < 2:
                    continue
                classcode = class_item[0]
                cls_key = (classcode, sessioncode)
                if cls_key in seen_classes:
                    continue
                seen_classes.add(cls_key)
                result["classes"].append({"classcode": classcode,
                                          "sessioncode": sessioncode, "departmentcode": dep})
                try:
                    schedule = post_form({"DEP": dep, "SES": sessioncode, "mode": "2",
                                          "uag": agencyid, "rt": "2", "CLSS": classcode})
                except Exception:
                    continue
                row_titles = [x.strip() for x in schedule.get("format", {}).get("RowTitle", "").split(",") if x.strip()]
                col_titles = [x.strip() for x in schedule.get("format", {}).get("ColTitle", "").split(",") if x.strip()]
                slots_per_day = len(col_titles)
                if not slots_per_day:
                    continue

                assign_data = schedule.get("assign", {})
                assign_items = assign_data.values() if isinstance(assign_data, dict) else (assign_data if isinstance(assign_data, list) else [])
                for assign in assign_items:
                    if isinstance(assign, dict):
                        code, name = assign.get("SBJ"), assign.get("subject")
                        if code and name and code != "JUMLAH":
                            result["courses"][code] = {"coursecode": code, "coursename": name}

                display = schedule.get("display", [])
                if isinstance(display, list):
                    display = {str(i + 1): item for i, item in enumerate(display)}
                for cell_key, entry in sorted(display.items(), key=lambda x: int(x[0])):
                    cell_no = int(cell_key)
                    day_idx = (cell_no - 1) // slots_per_day
                    time_idx = (cell_no - 1) % slots_per_day
                    if day_idx >= len(row_titles) or time_idx >= len(col_titles):
                        continue
                    day_code = DAY_CODES.get(row_titles[day_idx], row_titles[day_idx])
                    ttid = make_ttid(day_code, col_titles[time_idx])
                    lecturercode = entry.get("NickName", "")
                    lecturername = entry.get("LecturerName", "")
                    labname = entry.get("VEN", "")
                    coursecode = re.sub(r"\([^)]*\)", "", entry.get("SBJ", "")).strip()
                    lecturers_list = []
                    if lecturercode:
                        if lecturercode not in result["_seen_lecturers"]:
                            result["_seen_lecturers"].add(lecturercode)
                            result["lecturers"].append({"lecturercode": lecturercode, "lecturername": lecturername, "agencyid": agencyid})
                        lecturers_list.append({"code": lecturercode, "name": lecturername, "agencyid": agencyid})
                    if labname:
                        result["labs"][labname] = {"labname": labname}
                    result["timetables"].append({
                        "agencyid": agencyid, "ttid": ttid, "coursecode": coursecode,
                        "lecturers": lecturers_list, "labname": labname,
                        "classcode": classcode, "sessioncode": sessioncode, "department": dep,
                    })
    return result

def save_to_cache(agencyid, data):
    path = os.path.join(CACHE_DIR, f"{agencyid}.json")
    to_save = {k: v for k, v in data.items() if not k.startswith("_")}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(to_save, f, ensure_ascii=False)

def write_agencies_to_db(agency_data_list):
    """Write multiple agencies to SQLite. Safe for single-process merge."""
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(DB_SCHEMA)
    cur = conn.cursor()

    for data in agency_data_list:
        a = data["agency"]
        cur.execute("INSERT OR IGNORE INTO agencies (agencyid, agencyname) VALUES (?, ?)", (a["agencyid"], a["agencyname"]))

        for s in data["sessions"]:
            cur.execute("INSERT OR IGNORE INTO sessions (sessioncode, session_name) VALUES (?, ?)",
                        (s["sessioncode"], s.get("session_name", "")))

        seen_deps = set()
        for d in data["departments"]:
            key = d["departmentcode"]
            if key in seen_deps:
                continue
            seen_deps.add(key)
            cur.execute("INSERT OR IGNORE INTO departments (departmentcode, departmentname) VALUES (?, ?)",
                        (d["departmentcode"], d.get("departmentname", "")))

        for c in data["classes"]:
            cur.execute("INSERT OR IGNORE INTO classes (classcode, sessioncode, departmentcode) VALUES (?, ?, ?)",
                        (c["classcode"], c["sessioncode"], c["departmentcode"]))

        for code, c in data["courses"].items():
            cur.execute("INSERT OR IGNORE INTO courses (coursecode, coursename) VALUES (?, ?)",
                        (c["coursecode"], c.get("coursename", "")))

        for l in data["lecturers"]:
            cur.execute("INSERT OR IGNORE INTO lecturers (lecturercode, lecturername, agencyid) VALUES (?, ?, ?)",
                        (l["lecturercode"], l.get("lecturername", ""), l.get("agencyid", "")))

        for lab in data["labs"].values():
            cur.execute("INSERT OR IGNORE INTO labs (labname) VALUES (?)", (lab["labname"],))

        for t in data["timetables"]:
            cur.execute(
                "INSERT INTO timetables (ttid, coursecode, classcode, sessioncode, labname, agencyid, department) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (t["ttid"], t["coursecode"], t["classcode"], t["sessioncode"], t["labname"], t["agencyid"], t["department"]))
            tid = cur.lastrowid
            for lec in t.get("lecturers", []):
                if lec.get("code"):
                    cur.execute("INSERT OR IGNORE INTO timetable_lecturers (timetable_id, lecturercode, lectureragencyid) VALUES (?, ?, ?)",
                                (tid, lec["code"], lec.get("agencyid", "")))

    conn.commit()
    conn.close()

def merge_all_cache_to_json():
    """Merge all cached agency data into per-type JSON files."""
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
        courses.update(data["courses"])
        lecturers.extend(data["lecturers"])
        labs.update(data["labs"])
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

    return {
        "agencies": len(agencies), "sessions": len(sessions),
        "departments": len(departments), "classes": len(classes),
        "courses": len(courses), "lecturers": len(lecturers),
        "labs": len(labs), "timetables": len(timetables),
    }

def get_all_agencies():
    agencies_html = fetch_text(BASE_URL)
    return extract_options(agencies_html, "agc")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Sequential all agencies (original mode)")
    parser.add_argument("--agencies", help="Comma-separated agency IDs to process")
    parser.add_argument("--agencies-file", help="File with one agency ID per line")
    parser.add_argument("--merge-only", action="store_true", help="Only merge cache to DB/JSON")
    args = parser.parse_args()

    ensure_dirs()

    if args.merge_only:
        print("Merging cache to DB/JSON...", flush=True)
        agency_data_list = []
        for fname in sorted(os.listdir(CACHE_DIR)):
            if fname.endswith(".json"):
                with open(os.path.join(CACHE_DIR, fname), "r", encoding="utf-8") as f:
                    agency_data_list.append(json.load(f))
        write_agencies_to_db(agency_data_list)
        stats = merge_all_cache_to_json()
        for k, v in stats.items():
            print(f"  {k}: {v}")
        return

    # Determine agencies to process
    if args.agencies:
        try:
            # JSON format: [{"id": "1", "name": "Agency Name"}, ...]
            agency_list = json.loads(args.agencies)
            all_agencies = [{"value": a["id"], "label": a.get("name", "")} for a in agency_list]
        except json.JSONDecodeError:
            # Fallback: comma-separated IDs
            agency_ids = [a.strip() for a in args.agencies.split(",")]
            all_agencies = [{"value": aid, "label": ""} for aid in agency_ids]
    elif args.agencies_file:
        with open(args.agencies_file, "r") as f:
            content = f.read().strip()
        try:
            agency_list = json.loads(content)
            all_agencies = [{"value": a["id"], "label": a.get("name", "")} for a in agency_list]
        except json.JSONDecodeError:
            agency_ids = [line.strip() for line in content.split("\n") if line.strip()]
            all_agencies = [{"value": aid, "label": ""} for aid in agency_ids]
    else:
        print("Fetching agency list...", flush=True)
        all_agencies = get_all_agencies()
        print(f"Found {len(all_agencies)} agencies", flush=True)

    # Check cached
    cached = set()
    for fname in os.listdir(CACHE_DIR):
        if fname.endswith(".json"):
            cached.add(fname.replace(".json", ""))
    pending = [a for a in all_agencies if a["value"] not in cached]
    print(f"Already cached: {len(cached)}, pending: {len(pending)}", flush=True)

    if not pending:
        print("Nothing to fetch. Merging...", flush=True)
        agency_data_list = []
        for fname in sorted(os.listdir(CACHE_DIR)):
            if fname.endswith(".json"):
                with open(os.path.join(CACHE_DIR, fname), "r", encoding="utf-8") as f:
                    agency_data_list.append(json.load(f))
        write_agencies_to_db(agency_data_list)
        stats = merge_all_cache_to_json()
        for k, v in stats.items():
            print(f"  {k}: {v}")
        return

    # Fetch each agency
    agency_data_list = []
    for i, agency_opt in enumerate(pending):
        agencyid = agency_opt["value"]
        agencyname = agency_opt["label"] or agencyid
        print(f"[{i+1}/{len(pending)}] {agencyid}...", flush=True)
        data = fetch_agency(agencyid, agencyname)
        save_to_cache(agencyid, data)
        agency_data_list.append(data)
        print(f"  cached: {len(data['timetables'])} timetables, {len(data['classes'])} classes", flush=True)

    # Write to DB and merge JSON
    print("\nWriting to DB...", flush=True)
    write_agencies_to_db(agency_data_list)
    stats = merge_all_cache_to_json()
    for k, v in stats.items():
        print(f"  {k}: {v}")

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM agencies")
    db_agencies = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM timetables")
    db_timetables = c.fetchone()[0]
    conn.close()
    print(f"\nDB total: {db_agencies} agencies, {db_timetables} timetables")
    print("Done!")

if __name__ == "__main__":
    main()