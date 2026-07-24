'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TimetableData } from '@/lib/types';
import { buildGrid, buildCourseRows } from '@/lib/grid';
import TimetableGrid from '@/components/TimetableGrid';
import CourseTable from '@/components/CourseTable';
import FilterTabs from '@/components/FilterTabs';

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
    let entries = data.timetables;
    if (filterType === 'class' && query) {
      entries = entries.filter(e => e.classcode === query);
    } else if (filterType === 'lab' && query) {
      entries = entries.filter(e => e.labname === query);
    } else if (filterType === 'lecturer' && query) {
      entries = entries.filter(e => e.lecturers.some(l => l.code === query));
    }
    return entries;
  }, [data, filterType, query]);

  const { rows, courseRows } = useMemo(() => {
    const { rows, details } = buildGrid(filteredEntries, data.courses);
    return { rows, courseRows: buildCourseRows(details, data.courses) };
  }, [data, filteredEntries]);

  const options = filterType === 'class' ? data.classes : filterType === 'lab' ? data.labs : data.lecturers;

  return (
    <>
      <Link href={`/a/${agencyid}`} className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; {data.agency.agencyname}
      </Link>

      <div className="toolbar">
        <div className="filters">
          <FilterTabs
            filterType={filterType}
            onFilterChange={(type) => { setFilterType(type); setQuery(''); }}
          />
          <label>
            <span className="text-sm font-medium">{filterType.charAt(0).toUpperCase() + filterType.slice(1)}</span>
            <select
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full"
            >
              <option value="">Select {filterType}...</option>
              {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <div className="table-wrap poster-wrap">
        <div className="poster-headline">
          {query.toUpperCase()} Sesi {sessioncode.slice(4) || ''} {data.session.session_name}
        </div>
        <div className="poster-agency">{data.agency.agencyname}</div>
        <TimetableGrid rows={rows} filterType={filterType} />
      </div>

      <div className="details">
        <CourseTable courseRows={courseRows} />
      </div>
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