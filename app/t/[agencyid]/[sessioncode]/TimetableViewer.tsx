'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TimetableData } from '@/lib/types';
import { buildGrid, buildCourseRows } from '@/lib/grid';
import TimetableGrid from '@/components/TimetableGrid';
import TimetableGridMobile from '@/components/TimetableGridMobile';
import CourseTable from '@/components/CourseTable';
import FilterTabs from '@/components/FilterTabs';
import AgencySessionNav from '@/components/AgencySessionNav';
import Combobox from '@/components/Combobox';

interface TimetableViewerProps {
  initialData: TimetableData;
  agencyid: string;
  sessioncode: string;
}

function TimetableContent({ initialData, agencyid, sessioncode }: TimetableViewerProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState(initialData);
  const [filterType, setFilterType] = useState<'class' | 'lab' | 'lecturer'>((searchParams.get('type') as 'class' | 'lab' | 'lecturer') || 'class');
  const [query, setQuery] = useState(searchParams.get('q') || '');

  useEffect(() => {
    // Re-fetch on client-side navigation (not needed for static export but safe)
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${base}/data/t/${agencyid}/${sessioncode}.json`)
      .then(res => res.json())
      .then(setData)
      .catch(() => {}); // Keep initialData on error
  }, [agencyid, sessioncode]);

  const filteredEntries = useMemo(() => {
    if (!query) return []; // Blank until selection made
    let entries = data.timetables;
    const q = query.toLowerCase();
    if (filterType === 'class') {
      entries = entries.filter(e => e.classcode.toLowerCase() === q);
    } else if (filterType === 'lab') {
      entries = entries.filter(e => e.labname.toLowerCase() === q);
    } else if (filterType === 'lecturer') {
      // Selected option is "CODE — Name"; typed input may be exact code or name.
      const sepIdx = query.indexOf(' — ');
      const code = sepIdx > -1 ? query.slice(0, sepIdx).trim().toLowerCase() : null;
      entries = entries.filter(e => e.lecturers.some(l =>
        code
          ? l.code.toLowerCase() === code
          : (l.code.toLowerCase() === q || l.name.toLowerCase() === q)
      ));
    }
    return entries;
  }, [data, filterType, query]);

  const lecturerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of data.timetables) {
      for (const l of e.lecturers) {
        if (l.code && !map.has(l.code)) map.set(l.code, l.name || l.code);
      }
    }
    return Array.from(map.entries())
      .map(([code, name]) => `${code} — ${name}`)
      .sort();
  }, [data]);

  const { rows, courseRows } = useMemo(() => {
    const { rows, details } = buildGrid(filteredEntries, data.courses);
    return { rows, courseRows: buildCourseRows(details, data.courses) };
  }, [data, filteredEntries]);

  const options = filterType === 'class' ? data.classes : filterType === 'lab' ? data.labs : lecturerOptions;

  return (
    <>
      <div className="toolbar">
        <AgencySessionNav currentAgencyId={agencyid} currentSessionCode={sessioncode} />
        <div className="filters">
          <FilterTabs
            filterType={filterType}
            onFilterChange={(type) => { setFilterType(type); setQuery(''); }}
          />
          <label>
            <span className="text-sm font-medium">{filterType.charAt(0).toUpperCase() + filterType.slice(1)}</span>
            <Combobox
              options={options}
              value={query}
              onChange={setQuery}
              placeholder={`Select ${filterType}...`}
              ariaLabel={filterType}
            />
          </label>
          <button type="button" onClick={() => window.print()}>Print</button>
          <Link href="/builder" className="builder-link-btn">Builder</Link>
        </div>
      </div>

      <div className="table-wrap poster-wrap">
        <div className="poster-headline">
          {query ? query.toUpperCase() + ' ' : ''}{data.session.session_name}
        </div>
        <div className="poster-agency">{data.agency.agencyname}</div>
        {query ? (
          <>
            <div className="grid-desktop hidden md:block">
              <TimetableGrid rows={rows} filterType={filterType} />
            </div>
            <div className="grid-mobile md:hidden">
              <TimetableGridMobile rows={rows} filterType={filterType} />
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            Select a {filterType} to view timetable
          </div>
        )}
      </div>

      {query && courseRows.length > 0 && (
        <div className="details">
          <CourseTable courseRows={courseRows} />
        </div>
      )}
    </>
  );
}

export default function TimetableViewer({ initialData, agencyid, sessioncode }: TimetableViewerProps) {
  return (
    <Suspense fallback={<div className="text-center py-12">Loading...</div>}>
      <TimetableContent initialData={initialData} agencyid={agencyid} sessioncode={sessioncode} />
    </Suspense>
  );
}