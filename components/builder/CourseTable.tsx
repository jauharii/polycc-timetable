'use client';

import { useMemo } from 'react';
import { TimetableData } from '@/lib/types';
import { Assignment } from '@/lib/planner';
import { shortCode } from '@/lib/grid';

interface Props {
  data: TimetableData;
  assignment: Assignment[];
  drops: string[];
}

interface Row {
  shortcode: string;
  code: string;
  name: string;
  cls: string;
  status: 'base' | 'moved' | 'added' | 'dropped';
  lecturer: string;
}

const STATUS_ORDER: Record<Row['status'], number> = { base: 0, moved: 1, added: 2, dropped: 3 };

export default function CourseTable({ data, assignment, drops }: Props) {
  const cname = (cc: string) => data.courses[cc]?.coursename || '';
  const scode = (cc: string) => shortCode(cname(cc)) || cc;

  // lecturer lookup: course|class -> names, with a course-level fallback
  const { byCourseClass, byCourse } = useMemo(() => {
    const byCourseClass = new Map<string, Set<string>>();
    const byCourse = new Map<string, Set<string>>();
    for (const e of data.timetables) {
      const names = e.lecturers.map((l) => l.name).filter(Boolean);
      if (!names.length) continue;
      let cs = byCourse.get(e.coursecode);
      if (!cs) {
        cs = new Set<string>();
        byCourse.set(e.coursecode, cs);
      }
      for (const n of names) cs.add(n);
      const classes = e.classcodes && e.classcodes.length ? e.classcodes : [e.classcode];
      for (const cl of classes) {
        const key = `${e.coursecode}|${cl}`;
        let s = byCourseClass.get(key);
        if (!s) {
          s = new Set<string>();
          byCourseClass.set(key, s);
        }
        for (const n of names) s.add(n);
      }
    }
    return { byCourseClass, byCourse };
  }, [data]);

  const lecturerOf = (cc: string, cl: string) => {
    const s = byCourseClass.get(`${cc}|${cl}`) || byCourse.get(cc);
    return s && s.size ? Array.from(s).join(', ') : '—';
  };

  const rows: Row[] = [
    ...assignment.map((a) => ({
      shortcode: scode(a.coursecode),
      code: a.coursecode,
      name: cname(a.coursecode),
      cls: a.changed && a.originalClass ? `${a.originalClass} → ${a.classcode}` : a.classcode,
      status: (!a.isBase ? 'added' : a.changed ? 'moved' : 'base') as Row['status'],
      lecturer: lecturerOf(a.coursecode, a.classcode),
    })),
    ...drops.map((d) => ({
      shortcode: scode(d),
      code: d,
      name: cname(d),
      cls: 'Dropped',
      status: 'dropped' as Row['status'],
      lecturer: lecturerOf(d, ''),
    })),
  ].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.code.localeCompare(b.code));

  return (
    <div className="course-table-wrap">
      <h3 className="course-table-title">Course list ({rows.length})</h3>
      <div className="course-table-scroll">
        <table className="course-table">
          <thead>
            <tr>
              <th>Short</th>
              <th>Code</th>
              <th>Course</th>
              <th>Class</th>
              <th>Lecturer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.code}-${i}`} className={`ct-${r.status}`}>
                <td className="ct-short">{r.shortcode}</td>
                <td className="ct-code">{r.code}</td>
                <td className="ct-name">{r.name}</td>
                <td className="ct-class">
                  <span className={`ct-chip ct-chip-${r.status}`}>{r.cls}</span>
                </td>
                <td className="ct-lect">{r.lecturer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
