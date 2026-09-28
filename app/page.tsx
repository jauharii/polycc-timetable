import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';

interface SessionInfo {
  sessioncode: string;
  session_name: string;
}
interface AgencyInfo {
  agencyid: string;
  agencyname: string;
  sessions: SessionInfo[];
}

// Build-time redirect target: first agency's newest session.
// Static-safe (no redirect() — that breaks `output: export`); the meta refresh
// also works with JS disabled, and the link below is the fallback.
function newestRoute(): { href: string; label: string } {
  try {
    const dir = join(process.cwd(), 'public', 'data');
    const agencies: AgencyInfo[] = JSON.parse(readFileSync(join(dir, 'agencies.json'), 'utf-8'));
    const first = agencies[0];
    const codes = (first?.sessions ?? []).map((s) => s.sessioncode).sort();
    if (first && codes.length) {
      const code = codes[codes.length - 1];
      const name = first.sessions.find((s) => s.sessioncode === code)?.session_name ?? code;
      return { href: `/t/${first.agencyid}/${code}`, label: `${first.agencyname} — ${name}` };
    }
  } catch {
    /* fall through to fallback */
  }
  return { href: '/t/1/20271', label: 'latest timetable' };
}

export default function Home() {
  const target = newestRoute();
  return (
    <div className="text-center py-12">
      <meta httpEquiv="refresh" content={`0;url=.${target.href}/`} />
      <p className="text-gray-500">Loading the {target.label}…</p>
      <p>
        <Link href={target.href} className="builder-link-btn">
          Open timetable
        </Link>
      </p>
    </div>
  );
}
