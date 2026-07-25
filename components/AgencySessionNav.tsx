'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Agency, Session } from '@/lib/types';

const NAV_KEY = 'polycc.lastNav';

const sessionLabel = (s: Session) => `${s.session_name} (${s.sessioncode})`;

interface Props {
  currentAgencyId: string;
  currentSessionCode: string;
}

export default function AgencySessionNav({ currentAgencyId, currentSessionCode }: Props) {
  const router = useRouter();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyInput, setAgencyInput] = useState('');
  const [sessionInput, setSessionInput] = useState('');

  // Load full agency/session catalogue for the pickers.
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${base}/data/agencies.json`)
      .then((r) => r.json())
      .then(setAgencies)
      .catch(() => {});
  }, []);

  // Populate inputs only from sessionStorage (blank by default).
  useEffect(() => {
    if (!agencies.length) return;
    try {
      const stored = JSON.parse(sessionStorage.getItem(NAV_KEY) || '');
      const agency = agencies.find((a) => a.agencyid === stored.agencyid);
      const session = agency?.sessions.find((s) => s.sessioncode === stored.sessioncode);
      if (agency) setAgencyInput(agency.agencyname);
      if (session) setSessionInput(sessionLabel(session));
    } catch {
      /* no stored nav */
    }
  }, [agencies]);

  const selectedAgency = useMemo(
    () => agencies.find((a) => a.agencyname === agencyInput || a.agencyid === agencyInput),
    [agencies, agencyInput]
  );

  const sessions = selectedAgency?.sessions ?? [];

  const persist = (agency?: Agency, session?: Session) => {
    if (!agency) return;
    sessionStorage.setItem(
      NAV_KEY,
      JSON.stringify({ agencyid: agency.agencyid, sessioncode: session?.sessioncode ?? '' })
    );
  };

  const onAgencyChange = (value: string) => {
    setAgencyInput(value);
    setSessionInput('');
    const agency = agencies.find((a) => a.agencyname === value || a.agencyid === value);
    if (agency) persist(agency);
  };

  const onSessionChange = (value: string) => {
    setSessionInput(value);
    const agency = selectedAgency;
    if (!agency) return;
    const session = agency.sessions.find((s) => sessionLabel(s) === value || s.sessioncode === value);
    if (!session) return;
    persist(agency, session);
    if (agency.agencyid !== currentAgencyId || session.sessioncode !== currentSessionCode) {
      router.push(`/t/${agency.agencyid}/${session.sessioncode}`);
    }
  };

  return (
    <div className="filters mb-4">
      <label>
        <span className="text-sm font-medium">Agency</span>
        <input
          list="nav-agency-options"
          value={agencyInput}
          onChange={(e) => onAgencyChange(e.target.value)}
          placeholder="Search agency..."
          aria-label="Agency"
          className="w-full"
        />
        <datalist id="nav-agency-options">
          {agencies.map((a) => (
            <option key={a.agencyid} value={a.agencyname} />
          ))}
        </datalist>
      </label>

      <label>
        <span className="text-sm font-medium">Session</span>
        <input
          list="nav-session-options"
          value={sessionInput}
          onChange={(e) => onSessionChange(e.target.value)}
          placeholder={selectedAgency ? 'Search session...' : 'Select agency first'}
          aria-label="Session"
          className="w-full"
        />
        <datalist id="nav-session-options">
          {sessions.map((s) => (
            <option key={s.sessioncode} value={sessionLabel(s)} />
          ))}
        </datalist>
      </label>
    </div>
  );
}