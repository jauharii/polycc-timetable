'use client';

import { GridRow, TIME_ORDER } from '@/lib/types';

interface Props {
  rows: GridRow[];
  filterType: 'class' | 'lab' | 'lecturer';
}

// Transposed layout for mobile: times as rows, days as columns.
// Reuses the same GridRow data; a cell's `span` becomes a vertical rowSpan.
export default function TimetableGridMobile({ rows, filterType }: Props) {
  return (
    <table className="timetable-mobile">
      <thead>
        <tr>
          <th className="time-corner">Masa</th>
          {rows.map((day) => (
            <th key={day.day_code} className="day-head">
              {day.day_name.slice(0, 3)}
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
            {rows.map((day) => {
              // Only render the cell that *starts* at this hour; hours inside a
              // span are covered by the rowSpan above (no <td> emitted).
              const cell = day.cells.find((c) => c.hour === hour);
              if (!cell) return null;
              return (
                <td key={day.day_code} rowSpan={cell.span} className="slot-cell">
                  {cell.items.map((item, ii) => (
                    <div key={ii} className="slot-item">
                      <div className="slot-code">{item.shortcode || item.coursecode}</div>
                      {filterType === 'class' && item.labname && (
                        <div className="slot-room">{item.labname}</div>
                      )}
                      {filterType === 'lecturer' && (
                        <>
                          {item.labname && <div className="slot-room">{item.labname}</div>}
                          <div className="slot-room">{item.classcode}</div>
                        </>
                      )}
                      {filterType === 'lab' && (
                        <>
                          <div className="slot-room">
                            {item.lecturers.map((l, li) => (
                              <span key={li}>{li > 0 ? ', ' : ''}{l.code}</span>
                            ))}
                          </div>
                          <div className="slot-room">{item.classcode}</div>
                        </>
                      )}
                    </div>
                  ))}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}