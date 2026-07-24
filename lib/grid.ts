import { DAY_ORDER, TIME_ORDER, TIME_LABELS, TimetableEntry, Course, GridRow, GridCell, CourseRow } from './types';

export function buildGrid(entries: TimetableEntry[], courses: Record<string, Course>): { rows: GridRow[]; details: TimetableEntry[] } {
  const grouped: Record<string, TimetableEntry[]> = {};
  const details: TimetableEntry[] = [];

  for (const entry of [...entries].sort((a, b) => a.ttid.localeCompare(b.ttid))) {
    const day = entry.ttid.slice(0, 2);
    const hour = entry.ttid.slice(2);
    const key = `${day}-${hour}`;
    (grouped[key] ||= []).push(entry);
    details.push(entry);
  }

  const rows: GridRow[] = [];

  for (const [dayCode, dayName] of DAY_ORDER) {
    const row: GridRow = { day_code: dayCode, day_name: dayName, cells: [] };
    let hasAny = false;
    let currentCourse: string | null = null;
    let currentSpan = 0;
    let currentItems: TimetableEntry[] = [];

    for (const hour of TIME_ORDER) {
      const items = grouped[`${dayCode}-${hour}`] || [];
      const merged: TimetableEntry[] = [];

      for (const item of items) {
        if (merged.length && merged[merged.length - 1].coursecode === item.coursecode && merged[merged.length - 1].labname === item.labname) {
          const existing = new Set(merged[merged.length - 1].lecturers.map(l => `${l.code}-${l.name}`));
          for (const lecturer of item.lecturers || []) {
            const key = `${lecturer.code}-${lecturer.name}`;
            if (!existing.has(key)) {
              merged[merged.length - 1].lecturers.push(lecturer);
              existing.add(key);
            }
          }
        } else {
          merged.push({ ...item, coursename: courses[item.coursecode]?.coursename || '' } as TimetableEntry & { coursename: string });
        }
      }

      if (!merged.length) {
        if (currentSpan > 0) {
          row.cells.push({ hour, label: TIME_LABELS[hour], items: currentItems, span: currentSpan });
          currentSpan = 0;
          currentItems = [];
        }
        row.cells.push({ hour, label: TIME_LABELS[hour], items: [], span: 1 });
        continue;
      }

      if (currentSpan === 0) {
        currentCourse = merged[0].coursecode;
        currentItems = merged;
        currentSpan = 1;
      } else if (merged[0].coursecode === currentCourse) {
        currentSpan++;
      } else {
        row.cells.push({ hour, label: TIME_LABELS[hour], items: currentItems, span: currentSpan });
        currentCourse = merged[0].coursecode;
        currentItems = merged;
        currentSpan = 1;
      }
      hasAny = true;
    }

    if (currentSpan > 0) {
      const lastHour = row.cells.length ? row.cells[row.cells.length - 1].hour : TIME_ORDER[0];
      row.cells.push({ hour: lastHour, label: TIME_LABELS[lastHour], items: currentItems, span: currentSpan });
    }

    if (hasAny) rows.push(row);
  }

  return { rows, details };
}

export function buildCourseRows(details: TimetableEntry[], courses: Record<string, Course>): CourseRow[] {
  const allLecturers: Record<string, string> = {};
  for (const entry of details) {
    for (const lecturer of entry.lecturers || []) {
      if (lecturer.code && !allLecturers[lecturer.code]) {
        allLecturers[lecturer.code] = lecturer.name;
      }
    }
  }

  const grouped: Record<string, { coursecode: string; coursename: string; lecturers: { lecturercode: string; lecturername: string }[] }> = {};

  for (const entry of details) {
    const { coursecode } = entry;
    if (!grouped[coursecode]) {
      grouped[coursecode] = {
        coursecode,
        coursename: courses[coursecode]?.coursename || '',
        lecturers: [],
      };
    }
    const existing = new Set(grouped[coursecode].lecturers.map(l => `${l.lecturercode}-${l.lecturername}`));
    for (const lecturer of entry.lecturers || []) {
      const name = allLecturers[lecturer.code] || lecturer.name;
      const key = `${lecturer.code}-${name}`;
      if (!existing.has(key)) {
        grouped[coursecode].lecturers.push({ lecturercode: lecturer.code, lecturername: name });
        existing.add(key);
      }
    }
  }

  return Object.values(grouped).map(item => ({
    coursecode: item.coursecode,
    coursename: item.coursename,
    rowspan: item.lecturers.length || 1,
    lecturers: item.lecturers.length ? item.lecturers : [{ lecturercode: '', lecturername: '' }],
  }));
}
