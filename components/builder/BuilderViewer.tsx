'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Agency, TimetableData } from '@/lib/types';
import { plan as runPlanner, PlannerResult } from '@/lib/planner';
import Combobox from '@/components/Combobox';
import CascadeGrid from './CascadeGrid';
import CourseTable from './CourseTable';

interface FriendState {
  key: number;
  mainClass: string;
  missed: string[];
  dropped: string[];
  missedInput: string;
  dropInput: string;
}

const sessionLabel = (s: { session_name: string; sessioncode: string }) =>
  `${s.session_name} (${s.sessioncode})`;

function Chips({ items, onRemove }: { items: string[]; onRemove: (x: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="chip-row">
      {items.map((x) => (
        <span key={x} className="chip">
          {x}
          <button type="button" aria-label={`Remove ${x}`} onClick={() => onRemove(x)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export default function BuilderViewer() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyInput, setAgencyInput] = useState('');
  const [sessionInput, setSessionInput] = useState('');
  const [data, setData] = useState<TimetableData | null>(null);

  const [mainClass, setMainClass] = useState('');
  const [missed, setMissed] = useState<string[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);

  const [missedInput, setMissedInput] = useState('');
  const [dropInput, setDropInput] = useState('');
  const [activePlan, setActivePlan] = useState(0);
  const [planCount, setPlanCount] = useState(10);
  const [allowDrop, setAllowDrop] = useState(false);
  const [friends, setFriends] = useState<FriendState[]>([]);
  const [nextFriendKey, setNextFriendKey] = useState(1);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${base}/data/agencies.json`)
      .then((r) => r.json())
      .then(setAgencies)
      .catch(() => {});
  }, []);

  const selectedAgency = useMemo(
    () => agencies.find((a) => a.agencyname === agencyInput || a.agencyid === agencyInput),
    [agencies, agencyInput]
  );
  const selectedSession = useMemo(
    () => selectedAgency?.sessions.find((s) => sessionLabel(s) === sessionInput),
    [selectedAgency, sessionInput]
  );

  // Fetch timetable data when agency+session chosen; reset selections.
  useEffect(() => {
    if (!selectedAgency || !selectedSession) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${base}/data/t/${selectedAgency.agencyid}/${selectedSession.sessioncode}.json`)
      .then((r) => r.json())
      .then((d: TimetableData) => {
        setData(d);
        setMainClass('');
        setFriends([]);
        setMissed([]);
        setDropped([]);
        setActivePlan(0);
      })
      .catch(() => {});
  }, [selectedAgency, selectedSession]);

  const cname = (cc: string) => data?.courses[cc]?.coursename || cc;
  const courseLabel = (cc: string) => {
    const n = data?.courses[cc]?.coursename;
    return n ? `${cc} — ${n}` : cc;
  };
  const codeOf = (label: string) => label.split(' — ')[0];

  const dropOptions = useMemo(() => {
    if (!data || !mainClass) return [];
    const set = new Set<string>();
    for (const e of data.timetables) if (e.classcode === mainClass) set.add(e.coursecode);
    return Array.from(set).sort().map(courseLabel);
  }, [data, mainClass]);

  const courseOptions = useMemo(
    () => (data ? Object.keys(data.courses).sort().map(courseLabel) : []),
    [data]
  );

  const result: PlannerResult | null = useMemo(() => {
    if (!data || !mainClass) return null;
    return runPlanner({
      timetables: data.timetables,
      mainClass,
      droppedCourses: dropped.map(codeOf),
      missedCourses: missed.map(codeOf),
      friends: friends
        .filter((f) => f.mainClass)
        .map((f) => ({
          id: String(f.key),
          mainClass: f.mainClass,
          missedCourses: f.missed.map(codeOf),
          droppedCourses: f.dropped.map(codeOf),
        })),
      maxPlans: planCount,
      allowDrop,
    });
  }, [data, mainClass, dropped, missed, friends, planCount, allowDrop]);

  const addUnique = (
    value: string,
    list: string[],
    set: (v: string[]) => void,
    valid: string[]
  ) => {
    const v = value.trim();
    if (!v || list.includes(v)) return;
    if (valid.length && !valid.includes(v)) return;
    set([...list, v]);
  };

  const updateFriend = (key: number, patch: Partial<FriendState>) =>
    setFriends((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const addFriend = () => {
    setFriends((fs) => [
      ...fs,
      { key: nextFriendKey, mainClass: '', missed: [], dropped: [], missedInput: '', dropInput: '' },
    ]);
    setNextFriendKey((k) => k + 1);
  };
  const removeFriend = (key: number) => setFriends((fs) => fs.filter((f) => f.key !== key));
  const friendCourseOpts = (cls: string) => {
    if (!data) return [];
    const set = new Set<string>();
    for (const e of data.timetables) if (e.classcode === cls) set.add(e.coursecode);
    return Array.from(set).sort().map(courseLabel);
  };
  const addFriendCourse = (key: number, field: 'missed' | 'dropped', value: string, valid: string[]) => {
    const f = friends.find((x) => x.key === key);
    if (!f) return;
    const v = value.trim();
    if (!v || f[field].includes(v) || (valid.length && !valid.includes(v))) return;
    if (field === 'missed') updateFriend(key, { missed: [...f.missed, v], missedInput: '' });
    else updateFriend(key, { dropped: [...f.dropped, v], dropInput: '' });
  };

  const selectedPlan = result?.rankedPlans[
    Math.min(activePlan, Math.max((result?.rankedPlans.length || 1) - 1, 0))
  ];

  return (
    <>
      <div className="toolbar">
        <div className="builder-head">
          <h1 className="builder-title">Timetable Builder</h1>
          <Link href="/" className="builder-back">
            ← Timetable viewer
          </Link>
        </div>

        <div className="agency-session-nav mb-4">
          <label>
            <span className="text-sm font-medium">Agency</span>
            <Combobox
              options={agencies.map((a) => a.agencyname)}
              value={agencyInput}
              onChange={(v) => {
                setAgencyInput(v);
                setSessionInput('');
                setData(null);
              }}
              placeholder="Search agency..."
              ariaLabel="Agency"
            />
          </label>
          <label>
            <span className="text-sm font-medium">Session</span>
            <Combobox
              options={(selectedAgency?.sessions ?? []).map(sessionLabel)}
              value={sessionInput}
              onChange={setSessionInput}
              placeholder={selectedAgency ? 'Search session...' : 'Select agency first'}
              ariaLabel="Session"
            />
          </label>
        </div>

        {data && (
          <div className="builder-config">
            <div className="config-group">
              <h3 className="config-group-title">You</h3>
              <label>
                <span className="text-sm font-medium">My main class</span>
                <Combobox
                  options={data.classes}
                  value={mainClass}
                  onChange={setMainClass}
                  placeholder="Select your class..."
                  ariaLabel="Main class"
                />
              </label>

              <div className="builder-multi">
                <span className="text-sm font-medium">Missed courses to add (optional)</span>
                <div className="builder-addrow">
                  <Combobox
                    options={courseOptions.filter((c) => !missed.includes(c))}
                    value={missedInput}
                    onChange={setMissedInput}
                    placeholder="Search code or course name..."
                    ariaLabel="Missed course"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addUnique(missedInput, missed, setMissed, courseOptions);
                      setMissedInput('');
                    }}
                  >
                    Add
                  </button>
                </div>
                <Chips items={missed} onRemove={(x) => setMissed(missed.filter((f) => f !== x))} />
              </div>

              <div className="builder-multi">
                <span className="text-sm font-medium">Drop courses (optional)</span>
                <div className="builder-addrow">
                  <Combobox
                    options={dropOptions.filter((c) => !dropped.includes(c))}
                    value={dropInput}
                    onChange={setDropInput}
                    placeholder={mainClass ? 'Search code or course name...' : 'Pick main class first'}
                    ariaLabel="Drop course"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addUnique(dropInput, dropped, setDropped, dropOptions);
                      setDropInput('');
                    }}
                  >
                    Add
                  </button>
                </div>
                <Chips items={dropped} onRemove={(x) => setDropped(dropped.filter((f) => f !== x))} />
              </div>

              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={allowDrop}
                  onChange={(e) => setAllowDrop(e.target.checked)}
                />
                <span>Allow drop suggestions (drop a course if it can&apos;t fit clash-free)</span>
              </label>
            </div>

            <div className="config-group friends-section">
              <div className="friends-head">
                <h3 className="config-group-title">Friends (optional)</h3>
                <button type="button" onClick={addFriend}>
                  + Add friend
                </button>
              </div>
              {friends.map((f, idx) => {
                const fopts = friendCourseOpts(f.mainClass);
                return (
                  <div key={f.key} className="friend-card">
                    <div className="friend-card-head">
                      <strong>Friend {idx + 1}</strong>
                      <button type="button" onClick={() => removeFriend(f.key)}>
                        Remove
                      </button>
                    </div>
                    <label className="pick">
                      <span className="pick-label">Their main class</span>
                      <Combobox
                        options={data.classes}
                        value={f.mainClass}
                        onChange={(v) =>
                          updateFriend(f.key, {
                            mainClass: v,
                            missed: [],
                            dropped: [],
                            missedInput: '',
                            dropInput: '',
                          })
                        }
                        placeholder="Select friend class..."
                        ariaLabel={`Friend ${idx + 1} class`}
                      />
                    </label>
                    <div className="pick">
                      <span className="pick-label">Their missed courses</span>
                      <div className="builder-addrow">
                        <Combobox
                          options={fopts.filter((x) => !f.missed.includes(x))}
                          value={f.missedInput}
                          onChange={(v) => updateFriend(f.key, { missedInput: v })}
                          placeholder={f.mainClass ? 'Search course...' : 'Pick their class first'}
                          ariaLabel={`Friend ${idx + 1} missed`}
                        />
                        <button
                          type="button"
                          onClick={() => addFriendCourse(f.key, 'missed', f.missedInput, fopts)}
                        >
                          Add
                        </button>
                      </div>
                      <Chips
                        items={f.missed}
                        onRemove={(x) => updateFriend(f.key, { missed: f.missed.filter((m) => m !== x) })}
                      />
                    </div>
                    <div className="pick">
                      <span className="pick-label">Their dropped courses</span>
                      <div className="builder-addrow">
                        <Combobox
                          options={fopts.filter((x) => !f.dropped.includes(x))}
                          value={f.dropInput}
                          onChange={(v) => updateFriend(f.key, { dropInput: v })}
                          placeholder={f.mainClass ? 'Search course...' : 'Pick their class first'}
                          ariaLabel={`Friend ${idx + 1} dropped`}
                        />
                        <button
                          type="button"
                          onClick={() => addFriendCourse(f.key, 'dropped', f.dropInput, fopts)}
                        >
                          Add
                        </button>
                      </div>
                      <Chips
                        items={f.dropped}
                        onRemove={(x) => updateFriend(f.key, { dropped: f.dropped.filter((m) => m !== x) })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!data && (
        <div className="text-center py-12 text-gray-500">Select agency and session to start.</div>
      )}

      {data && !mainClass && (
        <div className="text-center py-12 text-gray-500">Select your main class to build.</div>
      )}

      {data && result && mainClass && (
        <>
          {result.rankedPlans.length === 0 ? (
            <div className="details">
              <p className="text-gray-500">
                {missed.length === 0
                  ? 'Add a missed course to generate ranked plans.'
                  : 'No clash-free timetable found — try dropping a course or removing a friend.'}
              </p>
            </div>
          ) : (
            <>
              <div className="details">
                <div className="plans-head">
                  <h2>Ranked plans ({result.rankedPlans.length})</h2>
                  <label className="plans-count">
                    Show
                    <select
                      value={planCount}
                      onChange={(e) => {
                        setActivePlan(0);
                        setPlanCount(Number(e.target.value));
                      }}
                    >
                      {[5, 10, 20, 50, 100].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="plans-hint">
                  Ranked by fewest clashes. Each plan lists class changes (original → new). Select a plan to preview.
                </p>
                <div className="ranked-list">
                  {result.rankedPlans.map((rp, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`ranked-card${i === activePlan ? ' active' : ''}`}
                      onClick={() => setActivePlan(i)}
                    >
                      <div className="ranked-top">
                        <span className="ranked-num">#{i + 1}</span>
                        <span className="changes-badge">
                          {rp.changes.length} change{rp.changes.length === 1 ? '' : 's'}
                        </span>
                        {rp.drops.length > 0 && (
                          <span className="drops-badge">{rp.drops.length} dropped</span>
                        )}
                        {rp.together > 0 && (
                          <span className="together-badge">★ {rp.together} together</span>
                        )}
                        <span className="ranked-ok">✓ no clashes</span>
                      </div>
                      {rp.changes.length === 0 && rp.drops.length === 0 ? (
                        <div className="ranked-nochange">No class changes needed</div>
                      ) : (
                        <ul className="change-list">
                          {rp.changes.map((ch, ci) => (
                            <li key={ci}>
                              <span className="change-course">{ch.coursecode}</span>
                              <span className="change-name">{cname(ch.coursecode)}</span>
                              <span className="change-classes">
                                {ch.originalClass ? `${ch.originalClass} → ` : 'add → '}
                                <strong>{ch.newClass}</strong>
                              </span>
                            </li>
                          ))}
                          {rp.drops.map((d, di) => (
                            <li key={`drop-${di}`} className="change-drop">
                              <span className="change-course">{d}</span>
                              <span className="change-name">{cname(d)}</span>
                              <span className="change-classes">drop</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  ))}
                </div>
                <p className="free-line">
                  Free slots with friends: <strong>{result.freeTogether.length}</strong>
                  {friends.length === 0 && ' (add friends to compare)'}
                </p>
              </div>

              {selectedPlan && (
                <div className="details">
                  <h2>Plan #{activePlan + 1} timetable</h2>
                  <CascadeGrid data={data} assignment={selectedPlan.assignment} />
                  <CourseTable
                    data={data}
                    assignment={selectedPlan.assignment}
                    drops={selectedPlan.drops}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
