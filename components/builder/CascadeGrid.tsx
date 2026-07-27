'use client';

import { DAY_ORDER, TIME_ORDER, TimetableData } from '@/lib/types';
import { Assignment } from '@/lib/planner';
import { shortCode } from '@/lib/grid';

interface Props {
  data: TimetableData;
  assignment: Assignment[];
}

interface Item {
  coursecode: string;
  shortcode: string;
  classcode: string; // current class
  kind: 'base' | 'changed' | 'added';
  originalClass?: string;
}

interface Ghost {
  coursecode: string;
  shortcode: string;
  classcode: string; // original class
}

export default function CascadeGrid({ data, assignment }: Props) {
  const cname = (cc: string) => data.courses[cc]?.coursename || '';
  const sc = (cc: string) => shortCode(cname(cc)) || cc;

  const byTtid = new Map<string, Item[]>();
  const ghostByTtid = new Map<string, Ghost[]>();

  for (const a of assignment) {
    const kind: Item['kind'] = !a.isBase ? 'added' : a.changed ? 'changed' : 'base';
    for (const t of a.ttids) {
      const arr = byTtid.get(t) || [];
      arr.push({
        coursecode: a.coursecode,
        shortcode: sc(a.coursecode),
        classcode: a.classcode,
        kind,
        originalClass: a.originalClass,
      });
      byTtid.set(t, arr);
    }
    // ghost at the original (vacated) slots of a moved course
    if (a.changed && a.originalTtids) {
      for (const t of a.originalTtids) {
        const g = ghostByTtid.get(t) || [];
        g.push({ coursecode: a.coursecode, shortcode: sc(a.coursecode), classcode: a.originalClass || '' });
        ghostByTtid.set(t, g);
      }
    }
  }

  return (
    <div className="plan-grid-wrap">
      <table className="timetable-mobile plan-grid">
        <thead>
          <tr>
            <th className="time-corner">Masa</th>
            {DAY_ORDER.map(([d, name]) => (
              <th key={d} className="day-head">
                {name.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIME_ORDER.map((hour, hi) => (
            <tr key={hour}>
              <td className="time-cell">
                <span className="time-num">{hi + 1}</span>
                <span className="time-hr">{hour}:00</span>
              </td>
              {DAY_ORDER.map(([d]) => {
                const ttid = `${d}${hour}`;
                const items = byTtid.get(ttid) || [];
                const ghosts = ghostByTtid.get(ttid) || [];
                const clash = items.length > 1;
                return (
                  <td key={d} className={`slot-cell${clash ? ' slot-clash' : ''}`}>
                    {ghosts.map((g, i) => (
                      <div key={`g-${g.coursecode}-${i}`} className="slot-item slot-ghost">
                        <div className="slot-code">{g.shortcode}</div>
                        <div className="slot-room">was {g.classcode}</div>
                      </div>
                    ))}
                    {items.map((it, i) => (
                      <div key={`${it.coursecode}-${i}`} className={`slot-item slot-${it.kind}`}>
                        <div className="slot-code">{it.shortcode}</div>
                        <div className="slot-room">
                          {it.kind === 'changed' && it.originalClass
                            ? `${it.originalClass} → ${it.classcode}`
                            : it.classcode}
                        </div>
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="plan-legend">
        <span><i className="lg lg-base" /> Your class</span>
        <span><i className="lg lg-changed" /> Moved (orig → new)</span>
        <span><i className="lg lg-added" /> Added course</span>
        <span><i className="lg lg-ghost" /> Vacated slot</span>
      </div>
    </div>
  );
}
