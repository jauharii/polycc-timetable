import { readFileSync } from 'fs';
import { join } from 'path';
import { notFound } from 'next/navigation';
import TimetableViewer from './TimetableViewer';

function getSessionData(agencyid: string, sessioncode: string) {
  const dataDir = join(process.cwd(), 'public', 'data');
  const filePath = join(dataDir, 't', agencyid, `${sessioncode}.json`);
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const dataDir = join(process.cwd(), 'public', 'data');
  const agencies = JSON.parse(readFileSync(join(dataDir, 'agencies.json'), 'utf-8'));
  const params: { agencyid: string; sessioncode: string }[] = [];

  for (const agency of agencies) {
    for (const session of agency.sessions) {
      params.push({ agencyid: agency.agencyid, sessioncode: session.sessioncode });
    }
  }
  return params;
}

export default function TimetablePage({ params }: { params: { agencyid: string; sessioncode: string } }) {
  const data = getSessionData(params.agencyid, params.sessioncode);
  if (!data) notFound();

  return <TimetableViewer initialData={data} agencyid={params.agencyid} sessioncode={params.sessioncode} />;
}