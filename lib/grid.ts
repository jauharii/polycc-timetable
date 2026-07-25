import { DAY_ORDER, TIME_ORDER, TIME_LABELS, TimetableEntry, Course, GridRow, GridCell, CourseRow } from './types';

const STOP_WORDS = new Set(['dan', 'and', 'of', '&', 'for', 'untuk', 'dalam', 'the', 'a', 'an', 'di', 'ke', 'dari', 'pada', 'dengan', 'or', 'atau']);

function shortCode(name: string): string {
  if (name.toLowerCase().includes('kokurikulum')) return 'KOKU';
  return name
    .trim()
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w.toLowerCase()))
    .map(w => w[0].toUpperCase())
    .join('');
}

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

  const mergeLecturers = (target: TimetableEntry, source: TimetableEntry) => {
    const existing = new Set(target.lecturers.map(l => `${l.code}-${l.name}`));
    for (const lecturer of source.lecturers || []) {
      const key = `${lecturer.code}-${lecturer.name}`;
      if (!existing.has(key)) {
        target.lecturers.push(lecturer);
        existing.add(key);
      }
    }
  };

  const rows: GridRow[] = [];

  for (const [dayCode, dayName] of DAY_ORDER) {
    // Step 1: exactly 10 slots (one per hour), merging duplicate course+lab within a slot.
    const slots = TIME_ORDER.map(hour => {
      const items = grouped[`${dayCode}-${hour}`] || [];
      const merged: (TimetableEntry & { coursename: string })[] = [];
      for (const item of items) {
        const last = merged[merged.length - 1];
        if (last && last.coursecode === item.coursecode && last.labname === item.labname) {
          mergeLecturers(last, item);
        } else {
          const coursename = courses[item.coursecode]?.coursename || '';
          merged.push({ ...item, coursename, shortcode: shortCode(coursename) || item.coursecode });
        }
      }
      return { hour, items: merged };
    });

    // Step 2: merge consecutive single-item slots with same course+lab into spans.
    // Each slot is consumed exactly once -> sum of spans === TIME_ORDER.length (10),
    // and every cell's `hour` is its unique span-start -> unique React keys.
    const cells: GridCell[] = [];
    let hasAny = false;
    let i = 0;
    while (i < TIME_ORDER.length) {
      const slot = slots[i];
      if (slot.items.length === 0) {
        cells.push({ hour: slot.hour, label: TIME_LABELS[slot.hour], items: [], span: 1 });
        i++;
        continue;
      }
      hasAny = true;
      const first = slot.items[0];
      let span = 1;
      let j = i + 1;
      while (
        j < TIME_ORDER.length &&
        slot.items.length === 1 &&
        slots[j].items.length === 1 &&
        slots[j].items[0].coursecode === first.coursecode &&
        slots[j].items[0].labname === first.labname
      ) {
        mergeLecturers(first, slots[j].items[0]);
        span++;
        j++;
      }
      cells.push({ hour: slot.hour, label: TIME_LABELS[slot.hour], items: slot.items, span });
      i = j;
    }

    if (hasAny) rows.push({ day_code: dayCode, day_name: dayName, cells });
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
    shortcode: shortCode(item.coursename) || item.coursecode,
    rowspan: item.lecturers.length || 1,
    lecturers: item.lecturers.length ? item.lecturers : [{ lecturercode: '', lecturername: '' }],
  }));
}
