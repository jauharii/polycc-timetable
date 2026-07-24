#!/usr/bin/env python3
"""Generate static HTML site from timetable DB for GitHub Pages."""
import os
import shutil
import sqlite3
from functools import lru_cache
from urllib.parse import quote

import app as app_module
from app import app, index

BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build")

# ponytail: persistent conn + LRU cache — no batch rendering needed
_conn = sqlite3.connect(app_module.DB_PATH)
_conn.row_factory = sqlite3.Row


@lru_cache(maxsize=256)
def _cached_query(sql, params=()):
    return _conn.execute(sql, params).fetchall()


def query_all(sql, params=()):
    return _cached_query(sql, tuple(params))


app_module.query_all = query_all


def safe_name(s):
    """Sanitize string for use in filenames."""
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in s)


def save(path, html):
    """Write HTML, fixing static asset paths for relative depth. Skip if exists."""
    full = os.path.join(BUILD, path)
    if os.path.exists(full):
        return False
    os.makedirs(os.path.dirname(full), exist_ok=True)
    depth = path.count("/")
    if depth:
        html = html.replace('"/static/', '"../' * depth + 'static/')
    with open(full, "w") as f:
        f.write(html)
    return True


def render_page(aid, sc, ft, q):
    """Render a single timetable page via Flask test context."""
    qs = f"/?agencyid={aid}&sessioncode={sc}&filter_type={ft}&search_query={quote(q, safe='')}"
    with app.test_request_context(qs):
        return index(print_mode=True)


def freeze():
    # Resumable: skip existing files, don't wipe build dir
    if not os.path.exists(BUILD):
        os.makedirs(BUILD)
    if not os.path.exists(os.path.join(BUILD, "static")):
        shutil.copytree("static", os.path.join(BUILD, "static"))

    agencies = query_all("SELECT * FROM agencies ORDER BY agencyname")
    total = 0

    root_lines = [
        '<!doctype html><html><head><meta charset="utf-8">',
        '<title>PolyCC Timetable</title>',
        '<link rel="stylesheet" href="static/style.css"></head>',
        '<body><main class="page">',
        '<h1>Politeknik &amp; Kolej Komuniti Timetables</h1><ul>',
    ]

    for agency in agencies:
        aid = agency["agencyid"]
        aname = agency["agencyname"]
        print(f"[{aid}] {aname}...", flush=True)

        sessions = query_all(
            """SELECT DISTINCT t.sessioncode, s.session_name
               FROM timetables t JOIN sessions s ON t.sessioncode = s.sessioncode
               WHERE t.agencyid = ? ORDER BY t.sessioncode""",
            (aid,),
        )

        agency_lines = [
            "<!doctype html><html><head><meta charset='utf-8'>",
            f"<title>{aname}</title>",
            "<link rel='stylesheet' href='../static/style.css'></head>",
            "<body><main class='page'>",
            f"<h1>{aname}</h1>",
            "<p><a href='../index.html'>&larr; All agencies</a></p>",
        ]

        for sess in sessions:
            sc = sess["sessioncode"]
            sname = sess["session_name"]
            agency_lines.append(f"<h2>{sname} ({sc})</h2>")

            # Classes
            classes = query_all(
                "SELECT DISTINCT classcode FROM timetables WHERE agencyid=? AND sessioncode=? ORDER BY classcode",
                (aid, sc),
            )
            if classes:
                agency_lines.append("<h3>Classes</h3><ul>")
                for c in classes:
                    cc = c["classcode"]
                    fname = f"t/{aid}_{sc}_class_{safe_name(cc)}.html"
                    agency_lines.append(f'<li><a href="../{fname}">{cc}</a></li>')
                    if not os.path.exists(os.path.join(BUILD, fname)):
                        save(fname, render_page(aid, sc, "class", cc))
                    total += 1
                agency_lines.append("</ul>")

            # Labs
            labs = query_all(
                "SELECT DISTINCT labname FROM timetables WHERE agencyid=? AND sessioncode=? AND labname!='' ORDER BY labname",
                (aid, sc),
            )
            if labs:
                agency_lines.append("<h3>Labs</h3><ul>")
                for lab in labs:
                    ln = lab["labname"]
                    fname = f"t/{aid}_{sc}_lab_{safe_name(ln)}.html"
                    agency_lines.append(f'<li><a href="../{fname}">{ln}</a></li>')
                    if not os.path.exists(os.path.join(BUILD, fname)):
                        save(fname, render_page(aid, sc, "lab", ln))
                    total += 1
                agency_lines.append("</ul>")

            # Lecturers
            lecs = query_all(
                """SELECT DISTINCT tl.lecturercode
                   FROM timetable_lecturers tl
                   JOIN timetables t ON tl.timetable_id = t.id
                   WHERE t.agencyid=? AND t.sessioncode=?
                   ORDER BY tl.lecturercode""",
                (aid, sc),
            )
            if lecs:
                agency_lines.append("<h3>Lecturers</h3><ul>")
                for lec in lecs:
                    lc = lec["lecturercode"]
                    fname = f"t/{aid}_{sc}_lecturer_{safe_name(lc)}.html"
                    agency_lines.append(f'<li><a href="../{fname}">{lc}</a></li>')
                    if not os.path.exists(os.path.join(BUILD, fname)):
                        save(fname, render_page(aid, sc, "lecturer", lc))
                    total += 1
                agency_lines.append("</ul>")

        agency_lines.append("</main></body></html>")
        save(f"a/{aid}.html", "\n".join(agency_lines))

        root_lines.append(f'<li><a href="a/{aid}.html">{aname} ({len(sessions)} session{"s" if len(sessions)!=1 else ""})</a></li>')

    root_lines.append("</ul></main></body></html>")
    save("index.html", "\n".join(root_lines))

    index_count = 1 + len(agencies)
    print(f"Froze {total} timetable pages + {index_count} index pages to {BUILD}/")


if __name__ == "__main__":
    freeze()
