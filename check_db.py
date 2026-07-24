#!/usr/bin/env python3
import sqlite3
conn = sqlite3.connect('/media/unified/hobiz/build/opencode/data/timetable.db')
c = conn.cursor()
tables = ['agencies','timetables','classes','sessions','departments','lecturers','timetable_lecturers']
for t in tables:
    try:
        c.execute(f'SELECT COUNT(*) FROM {t}')
        print(f'{t}: {c.fetchone()[0]}')
    except Exception as e:
        print(f'{t}: ERROR {e}')

print('\n--- Agencies ---')
c.execute('SELECT agencyid, agencyname FROM agencies')
for r in c.fetchall():
    print(f'  {r[0]} = {r[1]}')

print('\n--- Sample timetables ---')
c.execute('SELECT * FROM timetables LIMIT 3')
cols = [d[0] for d in c.description]
print(f'  columns: {cols}')
for r in c.fetchall():
    print(f'  {r}')

print('\n--- Sample lecturers ---')
c.execute('SELECT * FROM lecturers LIMIT 3')
cols = [d[0] for d in c.description]
print(f'  columns: {cols}')
for r in c.fetchall():
    print(f'  {r}')

print('\n--- Sample timetable_lecturers ---')
c.execute('SELECT * FROM timetable_lecturers LIMIT 3')
cols = [d[0] for d in c.description]
print(f'  columns: {cols}')
for r in c.fetchall():
    print(f'  {r}')

conn.close()
