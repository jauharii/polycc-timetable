'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Agency, Session } from '@/lib/types';
import Combobox from './Combobox';

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
  const sessionOptions = sessions.map(sessionLabel);

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

  const agencyOptions = agencies.map((a) => a.agencyname);

  return (
    <div className="agency-session-nav mb-4">
      <label>
        <span className="text-sm font-medium">Agency</span>
        <Combobox
          options={agencyOptions}
          value={agencyInput}
          onChange={onAgencyChange}
          placeholder="Search agency..."
          ariaLabel="Agency"
        />
      </label>

      <label>
        <span className="text-sm font-medium">Session</span>
        <Combobox
          options={sessionOptions}
          value={sessionInput}
          onChange={onSessionChange}
          placeholder={selectedAgency ? 'Search session...' : 'Select agency first'}
          ariaLabel="Session"
        />
      </label>
    </div>
  );
}