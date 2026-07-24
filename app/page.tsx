import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';
import { Agency } from '@/lib/types';

function getAgencies(): Agency[] {
  const dataDir = join(process.cwd(), 'public', 'data');
  return JSON.parse(readFileSync(join(dataDir, 'agencies.json'), 'utf-8'));
}

export default function Home() {
  const agencies = getAgencies();

  return (
    <>
      <h1 className="text-3xl font-bold mb-6">Politeknik &amp; Kolej Komuniti Timetables</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agencies.map((agency) => (
          <Link
            key={agency.agencyid}
            href={`/a/${agency.agencyid}`}
            className="block border border-gray-300 rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <h2 className="font-semibold text-lg mb-1">{agency.agencyname}</h2>
            <p className="text-sm text-gray-600">
              {agency.sessions.length} session{agency.sessions.length !== 1 ? 's' : ''}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}