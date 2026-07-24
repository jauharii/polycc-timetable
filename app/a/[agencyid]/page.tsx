import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';
import { Agency } from '@/lib/types';
import { notFound } from 'next/navigation';

function getAgencies(): Agency[] {
  const dataDir = join(process.cwd(), 'public', 'data');
  return JSON.parse(readFileSync(join(dataDir, 'agencies.json'), 'utf-8'));
}

export function generateStaticParams() {
  return getAgencies().map(a => ({ agencyid: a.agencyid }));
}

export default function AgencyPage({ params }: { params: { agencyid: string } }) {
  const agency = getAgencies().find(a => a.agencyid === params.agencyid);
  if (!agency) notFound();

  return (
    <>
      <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; All agencies
      </Link>
      <h1 className="text-3xl font-bold mb-6">{agency.agencyname}</h1>

      {agency.sessions.length === 0 ? (
        <p className="text-gray-600">No sessions available.</p>
      ) : (
        <div className="space-y-6">
          {agency.sessions.map((session) => (
            <div key={session.sessioncode} className="border border-gray-300 rounded-lg p-4">
              <h2 className="text-xl font-semibold mb-3">{session.session_name} ({session.sessioncode})</h2>
              <Link
                href={`/t/${agency.agencyid}/${session.sessioncode}`}
                className="inline-block bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors"
              >
                View Timetable
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}