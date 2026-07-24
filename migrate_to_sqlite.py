#!/usr/bin/env python3
"""
Incremental migration: loads JSON files into SQLite without dropping tables.
Safe to re-run — uses INSERT OR IGNORE for idempotency.
import_polycc.py now writes directly to DB; this script is for repair/rebuild only.
"""
import json
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "timetable.db")

SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -32768;
PRAGMA temp_store = MEMORY;

CREATE TABLE IF NOT EXISTS agencies (
    agencyid TEXT PRIMARY KEY, agencyname TEXT
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


def jload(name):
    path = os.path.join(DATA_DIR, name)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)  # CREATE IF NOT EXISTS — safe
    cur = conn.cursor()

    for item in jload("agencies.json"):
        cur.execute("INSERT OR IGNORE INTO agencies (agencyid, agencyname) VALUES (?, ?)",
                    (item["agencyid"], item["agencyname"]))

    for item in jload("sessions.json"):
        cur.execute("INSERT OR IGNORE INTO sessions (sessioncode, session_name) VALUES (?, ?)",
                    (item["sessioncode"], item.get("session_name", "")))

    for item in jload("departments.json"):
        cur.execute("INSERT OR IGNORE INTO departments (departmentcode, departmentname) VALUES (?, ?)",
                    (item["departmentcode"], item.get("departmentname", "")))

    for item in jload("classes.json"):
        cur.execute("INSERT OR IGNORE INTO classes (classcode, sessioncode, departmentcode) VALUES (?, ?, ?)",
                    (item["classcode"], item["sessioncode"], item["departmentcode"]))

    for item in jload("courses.json"):
        cur.execute("INSERT OR IGNORE INTO courses (coursecode, coursename) VALUES (?, ?)",
                    (item["coursecode"], item.get("coursename", "")))

    for item in jload("lecturers.json"):
        cur.execute("INSERT OR IGNORE INTO lecturers (lecturercode, lecturername, agencyid) VALUES (?, ?, ?)",
                    (item["lecturercode"], item.get("lecturername", ""), item.get("agencyid", "")))

    for item in jload("labs.json"):
        cur.execute("INSERT OR IGNORE INTO labs (labname) VALUES (?)", (item["labname"],))

    tt_count = 0
    for item in jload("timetables.json"):
        cur.execute(
            "INSERT INTO timetables (ttid, coursecode, classcode, sessioncode, labname, agencyid, department) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (item["ttid"], item["coursecode"], item["classcode"], item["sessioncode"],
             item.get("labname", ""), item.get("agencyid", ""), item.get("department", "")))
        tid = cur.lastrowid
        for lec in item.get("lecturers", []):
            if lec.get("code"):
                cur.execute("INSERT OR IGNORE INTO timetable_lecturers (timetable_id, lecturercode, lectureragencyid) VALUES (?, ?, ?)",
                            (tid, lec["code"], lec.get("agencyid", "")))
        tt_count += 1

    conn.commit()

    for t in ["agencies", "sessions", "departments", "classes", "courses", "lecturers", "labs", "timetables"]:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        print(f"  {t}: {cur.fetchone()[0]}")

    conn.close()
    print(f"Migration complete. {tt_count} timetables written.")


if __name__ == "__main__":
    main()
