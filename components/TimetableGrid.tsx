'use client';

import { GridRow, TimetableEntry } from '@/lib/types';

interface Props {
  rows: GridRow[];
  filterType: 'class' | 'lab' | 'lecturer';
}

export default function TimetableGrid({ rows, filterType }: Props) {
  const TIME_ORDER = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17'];

  return (
    <table className="timetable poster-table">
      <thead>
        <tr>
          <th className="day-corner" />
          {TIME_ORDER.map((hour, i) => (
            <th key={hour} className="time-head">
              <div className="time-index">{i + 1}</div>
              <div className="time-label">
                {hour === '08' ? '8:00 - 9:00' :
                 hour === '09' ? '9:00 - 10:00' :
                 hour === '10' ? '10:00 - 11:00' :
                 hour === '11' ? '11:00 - 12:00' :
                 hour === '12' ? '12:00 - 13:00' :
                 hour === '13' ? '13:00 - 14:00' :
                 hour === '14' ? '14:00 - 15:00' :
                 hour === '15' ? '15:00 - 16:00' :
                 hour === '16' ? '16:00 - 17:00' :
                 '17:00 - 18:00'}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.day_code}>
            <th className="day-name">{row.day_name.slice(0, 3)}</th>
            {row.cells.map((cell, ci) => (
              <td
                key={`${row.day_code}-${ci}`}
                className="poster-cell"
                colSpan={cell.span}
              >
                {cell.items.map((item, ii) => (
                  <div key={ii} className="poster-slot">
                    <div className="poster-course">{item.shortcode || item.coursecode}</div>
                    {filterType === 'class' && (
                      <div className="poster-room">{item.labname}</div>
                    )}
                    {filterType === 'lecturer' && (
                      <>
                        <div className="poster-room">{item.labname}</div>
                        <div className="poster-room">{item.classcode}</div>
                      </>
                    )}
                    {filterType === 'lab' && (
                      <>
                        <div className="poster-room">
                          {item.lecturers.map((l, li) => (
                            <span key={li}>{li > 0 ? ', ' : ''}{l.code}</span>
                          ))}
                        </div>
                        <div className="poster-room">{item.classcode}</div>
                      </>
                    )}
                    {filterType !== 'class' && filterType !== 'lab' && filterType !== 'lecturer' && (
                      <div className="poster-room">{item.labname}</div>
                    )}
                  </div>
                ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}