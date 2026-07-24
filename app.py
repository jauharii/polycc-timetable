from flask import Flask, render_template, request
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "timetable.db")

DAY_ORDER = [
    ("01", "Monday"),
    ("02", "Tuesday"),
    ("03", "Wednesday"),
    ("04", "Thursday"),
    ("05", "Friday"),
    ("06", "Saturday"),
    ("07", "Sunday"),
]

TIME_ORDER = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17"]
TIME_LABELS = {
    "08": "8:00 - 9:00",
    "09": "9:00 - 10:00",
    "10": "10:00 - 11:00",
    "11": "11:00 - 12:00",
    "12": "12:00 - 13:00",
    "13": "13:00 - 14:00",
    "14": "14:00 - 15:00",
    "15": "15:00 - 16:00",
    "16": "16:00 - 17:00",
    "17": "17:00 - 18:00",
}

DAY_SHORT = {
    "Monday": "Mo",
    "Tuesday": "Tu",
    "Wednesday": "We",
    "Thursday": "Th",
    "Friday": "Fr",
    "Saturday": "Sa",
    "Sunday": "Su",
}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def query_all(sql, params=()):
    conn = get_db()
    try:
        cur = conn.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()


def query_one(sql, params=()):
    conn = get_db()
    try:
        cur = conn.execute(sql, params)
        return cur.fetchone()
    finally:
        conn.close()


def build_grid(entries, courses):
    grouped = {}
    details = []
    for entry in sorted(entries, key=lambda item: item["ttid"]):
        day = entry["ttid"][:2]
        hour = entry["ttid"][2:]
        key = (day, hour)
        grouped.setdefault(key, []).append(entry)
        details.append(entry)

    rows = []
    for day_code, day_name in DAY_ORDER:
        row = {"day_code": day_code, "day_name": day_name, "cells": []}
        has_any = False
        current_course = None
        current_span = 0
        current_items = []

        for hour in TIME_ORDER:
            items = grouped.get((day_code, hour), [])
            merged = []
            for item in items:
                if merged and merged[-1]["coursecode"] == item["coursecode"] and merged[-1]["labname"] == item["labname"]:
                    existing = {(x["code"], x["name"]) for x in merged[-1]["lecturers"]}
                    for lecturer in item.get("lecturers", []):
                        key = (lecturer.get("code", ""), lecturer.get("name", ""))
                        if key not in existing:
                            merged[-1]["lecturers"].append(lecturer)
                            existing.add(key)
                else:
                    merged_item = dict(item)
                    course = courses.get(merged_item["coursecode"], {})
                    merged_item["coursename"] = course.get("coursename", "")
                    merged.append(merged_item)

            if not merged:
                if current_span > 0:
                    row["cells"].append({
                        "hour": hour,
                        "label": TIME_LABELS[hour],
                        "items": current_items,
                        "span": current_span,
                    })
                    current_span = 0
                    current_items = []
                row["cells"].append({"hour": hour, "label": TIME_LABELS[hour], "items": [], "span": 1})
                continue

            if current_span == 0:
                current_course = merged[0]["coursecode"]
                current_items = merged
                current_span = 1
            elif merged[0]["coursecode"] == current_course:
                current_span += 1
            else:
                row["cells"].append({
                    "hour": hour,
                    "label": TIME_LABELS[hour],
                    "items": current_items,
                    "span": current_span,
                })
                current_course = merged[0]["coursecode"]
                current_items = merged
                current_span = 1

            has_any = True

        if current_span > 0:
            last_hour = row["cells"][-1]["hour"] if row["cells"] else TIME_ORDER[0]
            row["cells"].append({
                "hour": last_hour,
                "label": TIME_LABELS[last_hour],
                "items": current_items,
                "span": current_span,
            })

        if has_any:
            rows.append(row)
    return rows, details


app = Flask(__name__)


@app.route("/print")
def print_view():
    return index(print_mode=True)


@app.route("/")
def index(print_mode=False):
    agencies = query_all("SELECT * FROM agencies")

    agencyid = request.args.get("agencyid") or ""
    sessioncode = request.args.get("sessioncode") or ""
    departmentcode = request.args.get("departmentcode") or ""
    filter_type = request.args.get("filter_type", "class")
    search_query = request.args.get("search_query", "").strip()

    # Sessions come from timetables (implicit via agency membership)
    if agencyid:
        sessions = query_all(
            """SELECT DISTINCT t.sessioncode, s.session_name
               FROM timetables t JOIN sessions s ON t.sessioncode = s.sessioncode
               WHERE t.agencyid = ? ORDER BY t.sessioncode""",
            (agencyid,))
    else:
        sessions = query_all("SELECT sessioncode, session_name FROM sessions ORDER BY sessioncode")
    if not sessioncode:
        sessioncode = sessions[0]["sessioncode"] if sessions else ""

    # Departments from timetables for this agency+session
    if agencyid and sessioncode:
        departments = query_all(
            """SELECT DISTINCT t.department AS departmentcode, d.departmentname
               FROM timetables t LEFT JOIN departments d ON t.department = d.departmentcode
               WHERE t.agencyid = ? AND t.sessioncode = ? ORDER BY t.department""",
            (agencyid, sessioncode))
    elif sessioncode:
        departments = query_all(
            """SELECT DISTINCT t.department AS departmentcode, d.departmentname
               FROM timetables t LEFT JOIN departments d ON t.department = d.departmentcode
               WHERE t.sessioncode = ? ORDER BY t.department""",
            (sessioncode,))
    else:
        departments = []

    departments_filtered = departments
    search_options = []
    filtered_classes = []
    if filter_type == "class":
        if agencyid and sessioncode:
            classes_where = "WHERE t.sessioncode = ? AND t.agencyid = ?"
            params = [sessioncode, agencyid]
        elif sessioncode:
            classes_where = "WHERE t.sessioncode = ?"
            params = [sessioncode]
        else:
            classes_where = "WHERE 1=0"
            params = []
        if departmentcode:
            classes_where += " AND t.department = ?"
            params.append(departmentcode)
        filtered_classes = query_all(
            f"SELECT DISTINCT t.classcode, t.sessioncode, t.department AS departmentcode FROM timetables t {classes_where} ORDER BY t.classcode",
            params)
        search_options = [item["classcode"] for item in filtered_classes]
        classcode = search_query if search_query else (filtered_classes[0]["classcode"] if filtered_classes else "")
    elif filter_type == "lab":
        if agencyid:
            lab_codes = query_all(
                "SELECT DISTINCT labname FROM timetables WHERE sessioncode = ? AND agencyid = ? ORDER BY labname",
                (sessioncode, agencyid))
        else:
            lab_codes = query_all(
                "SELECT DISTINCT labname FROM timetables WHERE sessioncode = ? ORDER BY labname",
                (sessioncode,))
        search_options = [r["labname"] for r in lab_codes]
        classcode = search_query if search_query else (search_options[0] if search_options else "")
    elif filter_type == "lecturer":
        if agencyid:
            lecturer_codes = query_all(
                """SELECT DISTINCT tl.lecturercode FROM timetable_lecturers tl
                   JOIN timetables t ON tl.timetable_id = t.id
                   WHERE t.sessioncode = ? AND t.agencyid = ? ORDER BY tl.lecturercode""",
                (sessioncode, agencyid))
        else:
            lecturer_codes = query_all(
                """SELECT DISTINCT tl.lecturercode FROM timetable_lecturers tl
                   JOIN timetables t ON tl.timetable_id = t.id
                   WHERE t.sessioncode = ? ORDER BY tl.lecturercode""",
                (sessioncode,))
        search_options = [r["lecturercode"] for r in lecturer_codes]
        classcode = search_query if search_query else (search_options[0] if search_options else "")
    else:
        classcode = ""

    courses_rows = query_all("SELECT coursecode, coursename FROM courses")
    courses = {r["coursecode"]: {"coursename": r["coursename"]} for r in courses_rows}

    # Build timetable query
    tt_where = ["t.sessioncode = ?"]
    tt_params = [sessioncode]
    if filter_type == "class":
        tt_where.append("t.classcode = ?")
        tt_params.append(classcode)
    elif filter_type == "lab":
        tt_where.append("t.labname = ?")
        tt_params.append(classcode)
    elif filter_type == "lecturer":
        tt_where.append("tl.lecturercode = ?")
        tt_params.append(classcode)
    if agencyid:
        tt_where.append("t.agencyid = ?")
        tt_params.append(agencyid)

    entries_rows = query_all(
        f"""SELECT t.*, l.lecturercode, l.lecturername
            FROM timetables t
            {"JOIN" if filter_type == "lecturer" else "LEFT JOIN"} timetable_lecturers tl ON t.id = tl.timetable_id
            {"JOIN" if filter_type == "lecturer" else "LEFT JOIN"} lecturers l ON tl.lecturercode = l.lecturercode
            WHERE {" AND ".join(tt_where)}
            ORDER BY t.ttid""",
        tt_params)

    entries = []
    for row in entries_rows:
        lecturers = []
        if row["lecturercode"]:
            lecturers.append({"code": row["lecturercode"], "name": row["lecturername"] or ""})
        entries.append({
            "ttid": row["ttid"],
            "coursecode": row["coursecode"],
            "classcode": row["classcode"],
            "sessioncode": row["sessioncode"],
            "labname": row["labname"],
            "department": row["department"],
            "lecturers": lecturers,
        })

    rows, details = build_grid(entries, courses)

    # Deduplicate lecturers from timetable data
    all_lecturers = {}
    for entry in details:
        for lecturer in entry.get("lecturers", []):
            code = lecturer.get("code", "")
            if code and code not in all_lecturers:
                all_lecturers[code] = lecturer.get("name", "")

    grouped_courses = {}
    for entry in details:
        coursecode = entry["coursecode"]
        if coursecode not in grouped_courses:
            course = courses.get(coursecode, {})
            grouped_courses[coursecode] = {
                "coursecode": coursecode,
                "coursename": course.get("coursename", ""),
                "lecturers": [],
            }
        existing = {(x["lecturercode"], x["lecturername"]) for x in grouped_courses[coursecode]["lecturers"]}
        for lecturer in entry.get("lecturers", []):
            code = lecturer.get("code", "")
            name = all_lecturers.get(code, lecturer.get("name", ""))
            key = (code, name)
            if key not in existing:
                grouped_courses[coursecode]["lecturers"].append({
                    "lecturercode": code,
                    "lecturername": name,
                })
                existing.add(key)

    course_rows = []
    for coursecode, item in grouped_courses.items():
        lecturers_list = item["lecturers"] or [{"lecturercode": "", "lecturername": ""}]
        course_rows.append({
            "coursecode": item["coursecode"],
            "coursename": item["coursename"],
            "rowspan": len(lecturers_list),
            "lecturers": lecturers_list,
        })

    return render_template(
        "index.html",
        agencies=agencies,
        agencyid=agencyid,
        sessions=sessions,
        sessioncode=sessioncode,
        departments=departments_filtered,
        departmentcode=departmentcode,
        classes=filtered_classes,
        classcode=classcode,
        rows=rows,
        time_order=TIME_ORDER,
        time_labels=TIME_LABELS,
        course_rows=course_rows,
        filter_type=filter_type,
        search_query=search_query,
        search_options=search_options,
        print_mode=print_mode,
    )


if __name__ == "__main__":
    app.run(debug=True)