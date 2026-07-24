#!/usr/bin/env python3
"""Export SQLite timetable data to JSON files for Next.js static site."""

import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "timetable.db"
OUT_DIR = Path(__file__).parent.parent / "public" / "data"


def export_agencies(db: sqlite3.Connection) -> list[dict]:
    """Export agencies with their sessions (derived from timetables)."""
    cur = db.execute("SELECT agencyid, agencyname FROM agencies ORDER BY agencyid")
    agencies = []
    for agencyid, agencyname in cur:
        cur2 = db.execute(
            "SELECT DISTINCT t.sessioncode, s.session_name FROM timetables t "
            "JOIN sessions s ON t.sessioncode = s.sessioncode "
            "WHERE t.agencyid = ? ORDER BY t.sessioncode",
            (agencyid,)
        )
        sessions = [{"sessioncode": sc, "session_name": sn} for sc, sn in cur2]
        agencies.append({"agencyid": agencyid, "agencyname": agencyname, "sessions": sessions})
    return agencies


def export_session(db: sqlite3.Connection, agencyid: str, sessioncode: str) -> dict:
    """Export all data for a specific agency/session."""
    # Timetables with lecturers
    cur = db.execute(
        """SELECT t.id, t.ttid, t.coursecode, t.classcode, t.labname,
                  l.lecturercode, l.lecturername
           FROM timetables t
           LEFT JOIN timetable_lecturers tl ON t.id = tl.timetable_id
           LEFT JOIN lecturers l ON tl.lecturercode = l.lecturercode AND tl.lectureragencyid = l.agencyid
           WHERE t.agencyid = ? AND t.sessioncode = ?
           ORDER BY t.id, l.lecturercode""",
        (agencyid, sessioncode)
    )

    timetables = {}
    for row in cur:
        tid = row[0]
        if tid not in timetables:
            timetables[tid] = {
                "ttid": row[1] or "",
                "coursecode": row[2],
                "classcode": row[3],
                "labname": row[4],
                "lecturers": []
            }
        if row[5]:  # lecturercode exists
            timetables[tid]["lecturers"].append({
                "code": row[5],
                "name": row[6]
            })

    # Courses (from timetables for this agency/session)
    cur = db.execute(
        "SELECT DISTINCT t.coursecode, c.coursename FROM timetables t "
        "LEFT JOIN courses c ON t.coursecode = c.coursecode "
        "WHERE t.agencyid = ? AND t.sessioncode = ? ORDER BY t.coursecode",
        (agencyid, sessioncode)
    )
    courses = {cc: {"coursecode": cc, "coursename": cn or ""} for cc, cn in cur}

    # Classes (from timetables)
    cur = db.execute(
        "SELECT DISTINCT classcode FROM timetables WHERE agencyid = ? AND sessioncode = ? ORDER BY classcode",
        (agencyid, sessioncode)
    )
    classes = [row[0] for row in cur]

    # Labs (from timetables)
    cur = db.execute(
        "SELECT DISTINCT labname FROM timetables WHERE agencyid = ? AND sessioncode = ? ORDER BY labname",
        (agencyid, sessioncode)
    )
    labs = [row[0] for row in cur]

    # Lecturers (from timetable_lecturers for this agency/session)
    cur = db.execute(
        "SELECT DISTINCT l.lecturercode FROM timetable_lecturers tl "
        "JOIN timetables t ON tl.timetable_id = t.id "
        "JOIN lecturers l ON tl.lecturercode = l.lecturercode AND tl.lectureragencyid = l.agencyid "
        "WHERE t.agencyid = ? AND t.sessioncode = ? ORDER BY l.lecturercode",
        (agencyid, sessioncode)
    )
    lecturers = [row[0] for row in cur]

    # Session name
    cur = db.execute(
        "SELECT session_name FROM sessions WHERE sessioncode = ?",
        (sessioncode,)
    )
    row = cur.fetchone()
    session_name = row[0] if row else ""

    # Agency name
    cur = db.execute("SELECT agencyname FROM agencies WHERE agencyid = ?", (agencyid,))
    agencyname = cur.fetchone()[0]

    return {
        "agency": {"agencyid": agencyid, "agencyname": agencyname},
        "session": {"sessioncode": sessioncode, "session_name": session_name},
        "timetables": list(timetables.values()),
        "courses": courses,
        "classes": classes,
        "labs": labs,
        "lecturers": lecturers
    }


def main():
    if not DB_PATH.exists():
        print(f"Database not found: {DB_PATH}")
        return

    db = sqlite3.connect(DB_PATH)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Exporting agencies...")
    agencies = export_agencies(db)
    with open(OUT_DIR / "agencies.json", "w") as f:
        json.dump(agencies, f, ensure_ascii=False, indent=2)
    print(f"  {len(agencies)} agencies")

    total_sessions = 0
    for agency in agencies:
        agencyid = agency["agencyid"]
        agency_dir = OUT_DIR / "t" / agencyid
        agency_dir.mkdir(parents=True, exist_ok=True)

        for session in agency["sessions"]:
            sessioncode = session["sessioncode"]
            print(f"  {agencyid}/{sessioncode}...")
            data = export_session(db, agencyid, sessioncode)
            with open(agency_dir / f"{sessioncode}.json", "w") as f:
                json.dump(data, f, ensure_ascii=False)
            total_sessions += 1

    print(f"Exported {total_sessions} sessions")
    db.close()


if __name__ == "__main__":
    main()