import assert from 'node:assert';
import { buildOfferings, classSlots, plan } from './planner';
import { TimetableEntry } from './types';

const E = (ttid: string, coursecode: string, classcode: string, labname = 'L1'): TimetableEntry => ({
  ttid,
  coursecode,
  classcode,
  labname,
  lecturers: [],
});

// Main class MAIN: course C1 at 0108,0109,0110.
// Missed MX: class A @ 0108 (clash), class B @ 0210 (free) -> best = B, 0 clash.
// Missed MY: only class C @ 0108,0109,0110 (3 clashes) -> suggest drop.
const tt: TimetableEntry[] = [
  E('0108', 'C1', 'MAIN'),
  E('0109', 'C1', 'MAIN'),
  E('0110', 'C1', 'MAIN'),
  E('0108', 'MX', 'A'),
  E('0210', 'MX', 'B'),
  E('0108', 'MY', 'C'),
  E('0109', 'MY', 'C'),
  E('0110', 'MY', 'C'),
];

// 1. classSlots + drop
assert.deepStrictEqual([...classSlots(tt, 'MAIN')].sort(), ['0108', '0109', '0110']);
assert.strictEqual(classSlots(tt, 'MAIN', ['C1']).size, 0, 'dropping C1 empties base');

// 2. buildOfferings groups by classcode, excludes main class
const mxOff = buildOfferings(tt, 'MX', 'MAIN');
assert.strictEqual(mxOff.length, 2, 'MX has 2 class-group offerings');
assert.deepStrictEqual(
  mxOff.map((o) => o.classcode).sort(),
  ['A', 'B']
);
assert.strictEqual(buildOfferings(tt, 'C1', 'MAIN').length, 0, 'excludeClass removes own class');

// 3. plan picks clash-free offering for MX, flags MY as drop
const res = plan({
  timetables: tt,
  mainClass: 'MAIN',
  droppedCourses: [],
  missedCourses: ['MX', 'MY'],
  friends: [],
});

const best = res.plans[0];
assert.ok(best, 'at least one plan');
assert.strictEqual(best.totalClashes, 3, 'MY forces 3 clashes, MX adds 0');

const mxPlace = best.placements.find((p) => p.coursecode === 'MX');
assert.strictEqual(mxPlace?.offering.classcode, 'B', 'MX picks clash-free class B');
assert.strictEqual(mxPlace?.clashes.length, 0);

const myPlace = best.placements.find((p) => p.coursecode === 'MY');
assert.strictEqual(myPlace?.clashes.length, 3);

const dropMy = res.suggestions.find((s) => s.coursecode === 'MY');
assert.strictEqual(dropMy?.type, 'drop', 'MY (3 clashes, no better class) -> drop');
assert.ok(!res.suggestions.some((s) => s.coursecode === 'MX'), 'MX clash-free -> no suggestion');

// 4. freeTogether excludes base slots
assert.ok(!res.freeTogether.includes('0108'), 'base slot not free');
assert.ok(res.freeTogether.includes('0210'), 'unused slot is free');

// 5. friend slots reduce free-together
const res2 = plan({
  timetables: [...tt, E('0210', 'FC', 'FRIEND')],
  mainClass: 'MAIN',
  droppedCourses: [],
  missedCourses: [],
  friends: [{ id: 'f1', mainClass: 'FRIEND', missedCourses: [], droppedCourses: [] }],
});
assert.ok(res2.friendSlots.includes('0210'));
assert.ok(!res2.freeTogether.includes('0210'), 'friend-busy slot not free-together');

// 6. resolution cascade (steps)
assert.strictEqual(best.steps.length, 2, 'one step per missed course');
const stepMx = best.steps.find((s) => s.coursecode === 'MX');
assert.strictEqual(stepMx?.resolved, true, 'MX placed clash-free');
assert.strictEqual(stepMx?.chosenClass, 'B');
assert.deepStrictEqual(stepMx?.clashCourses, []);
const stepMy = best.steps.find((s) => s.coursecode === 'MY');
assert.strictEqual(stepMy?.resolved, false, 'MY cannot be resolved');
assert.ok(stepMy?.clashCourses.includes('C1'), 'MY clashes with base course C1');

// 7. a clashing course always yields a suggestion naming an alternative class
const tt2: TimetableEntry[] = [
  E('0108', 'C1', 'MAIN'),
  E('0109', 'C1', 'MAIN'),
  E('0108', 'MQ', 'P'), // clashes with base C1
  E('0109', 'MQ', 'Q'), // also clashes with base C1
];
const r2 = plan({
  timetables: tt2,
  mainClass: 'MAIN',
  droppedCourses: [],
  missedCourses: ['MQ'],
  friends: [],
});
assert.ok(r2.plans[0].totalClashes >= 1, 'MQ cannot avoid a clash');
const sug = r2.suggestions.find((s) => s.coursecode === 'MQ');
assert.ok(sug, 'clashing course gets a suggestion');
assert.ok(sug?.bestClasscode, 'suggestion names an alternative class');
assert.ok(
  sug?.message.includes(sug.bestClasscode as string),
  'message names the alternative class'
);

// 8. cascading reassignment: multimedia -> DIT3_S4 (clash python) -> python -> DIT5_S7
const tt3: TimetableEntry[] = [
  E('0210', 'PYTHON', 'DIT5_S1'), // base course in main class
  E('0210', 'MULTIMEDIA', 'DIT3_S4'), // missed course, only offering, clashes with python
  E('0315', 'PYTHON', 'DIT5_S7'), // python can be taken in another class, free slot
];
const r3 = plan({
  timetables: tt3,
  mainClass: 'DIT5_S1',
  droppedCourses: [],
  missedCourses: ['MULTIMEDIA'],
  friends: [],
});
const cas = r3.cascade;
assert.strictEqual(cas.resolved, true, 'cascade resolves all clashes');
assert.strictEqual(cas.totalClashes, 0);
const addStep = cas.steps.find((s) => s.coursecode === 'MULTIMEDIA' && s.action === 'add');
assert.strictEqual(addStep?.classcode, 'DIT3_S4', 'multimedia placed in DIT3_S4');
assert.ok(addStep?.clashWith.includes('PYTHON'), 'multimedia clashes with python');
const moveStep = cas.steps.find((s) => s.coursecode === 'PYTHON' && s.action === 'move');
assert.strictEqual(moveStep?.classcode, 'DIT5_S7', 'python moved to DIT5_S7');
const pyFinal = cas.finalAssignment.find((a) => a.coursecode === 'PYTHON');
assert.strictEqual(pyFinal?.classcode, 'DIT5_S7');
assert.strictEqual(pyFinal?.changed, true, 'python marked changed');

// rankedPlans: #1 is resolved, shows original -> new class for both courses
const rp = r3.rankedPlans[0];
assert.strictEqual(rp.resolved, true, 'top ranked plan resolved');
assert.strictEqual(rp.totalClashes, 0);
const mmChange = rp.changes.find((ch) => ch.coursecode === 'MULTIMEDIA');
assert.strictEqual(mmChange?.originalClass, '', 'missed course has no original class');
assert.strictEqual(mmChange?.newClass, 'DIT3_S4');
const pyChange = rp.changes.find((ch) => ch.coursecode === 'PYTHON');
assert.strictEqual(pyChange?.originalClass, 'DIT5_S1', 'moved base course shows original class');
assert.strictEqual(pyChange?.newClass, 'DIT5_S7');

// 9. multiple resolved ranked plans, all clash-free, sorted by fewest changes, distinct
const tt4: TimetableEntry[] = [
  E('0108', 'C1', 'MAIN'), // base, only one offering (can't move)
  E('0210', 'MZ', 'A'), // missed, two free offerings
  E('0310', 'MZ', 'B'),
];
const r4 = plan({
  timetables: tt4,
  mainClass: 'MAIN',
  droppedCourses: [],
  missedCourses: ['MZ'],
  friends: [],
  maxPlans: 10,
});
assert.ok(r4.rankedPlans.length >= 2, 'produces multiple resolved plans');
assert.ok(
  r4.rankedPlans.every((rp) => rp.resolved && rp.totalClashes === 0),
  'every ranked plan is resolved'
);
for (let i = 1; i < r4.rankedPlans.length; i++) {
  assert.ok(
    r4.rankedPlans[i - 1].changes.length <= r4.rankedPlans[i].changes.length,
    'ranked by fewest changes'
  );
}
const mzClasses = new Set(r4.rankedPlans.map((rp) => rp.changes.find((ch) => ch.coursecode === 'MZ')?.newClass));
assert.ok(mzClasses.has('A') && mzClasses.has('B'), 'plans offer distinct classes for MZ');

// 10. togetherness: prefer the missed course's class that a friend is in
// base MAIN has C1@0108. Friend F1 (class FCLASS) has SHARED@0512.
// MISSED offered by classA@0210 (free) and FCLASS@0512 (free, shared with friend).
const tt5: TimetableEntry[] = [
  E('0108', 'C1', 'MAIN'),
  E('0512', 'SHARED', 'FCLASS'), // friend's course
  E('0210', 'MISSED', 'classA'),
  E('0512', 'MISSED', 'FCLASS'), // same slot as friend's SHARED
];
const r5 = plan({
  timetables: tt5,
  mainClass: 'MAIN',
  droppedCourses: [],
  missedCourses: ['MISSED'],
  friends: [{ id: 'f1', mainClass: 'FCLASS', missedCourses: [], droppedCourses: [] }],
  maxPlans: 10,
});
// Both classA and FCLASS are clash-free (1 change each); FCLASS has higher togetherness.
const top = r5.rankedPlans[0];
assert.ok(top, 'has a plan');
assert.strictEqual(top.together >= 1, true, 'top plan shares a class with the friend');
assert.strictEqual(
  top.changes.find((ch) => ch.coursecode === 'MISSED')?.newClass,
  'FCLASS',
  'prefers the class the friend is in'
);

// 11. allowDrop: an unplaceable missed course is dropped to stay clash-free
// MISSED2 only offered at 0108 which clashes with base C1; no other offering.
const tt6: TimetableEntry[] = [
  E('0108', 'C1', 'MAIN'),
  E('0108', 'MISSED2', 'onlyClass'), // clashes with base, only offering
];
const r6drop = plan({
  timetables: tt6,
  mainClass: 'MAIN',
  droppedCourses: [],
  missedCourses: ['MISSED2'],
  friends: [],
  allowDrop: true,
});
assert.ok(r6drop.rankedPlans.length >= 1, 'allowDrop yields a resolved plan');
assert.strictEqual(r6drop.rankedPlans[0].resolved, true);
assert.ok(r6drop.rankedPlans[0].drops.includes('MISSED2'), 'MISSED2 dropped');
const r6nodrop = plan({
  timetables: tt6,
  mainClass: 'MAIN',
  droppedCourses: [],
  missedCourses: ['MISSED2'],
  friends: [],
  allowDrop: false,
});
// without drop, MISSED2 is unplaceable -> omitted; base alone is clash-free
assert.ok(
  r6nodrop.rankedPlans.every((rp) => !rp.drops.includes('MISSED2')),
  'no drops when allowDrop is false'
);

// 12. ranking: fewest drops first, then fewest changes
// MA can be placed clash-free (0 drops, 1 change) or dropped (1 drop, 0 changes).
const tt7: TimetableEntry[] = [
  E('0108', 'C1', 'MAIN'),
  E('0315', 'MA', 'classA'),
  E('0415', 'MA', 'classB'),
];
const r7 = plan({
  timetables: tt7,
  mainClass: 'MAIN',
  droppedCourses: [],
  missedCourses: ['MA'],
  friends: [],
  allowDrop: true,
  maxPlans: 10,
});
assert.ok(r7.rankedPlans.every((rp) => rp.resolved), 'all resolved');
// drop counts must be non-decreasing down the ranking
for (let i = 1; i < r7.rankedPlans.length; i++) {
  assert.ok(r7.rankedPlans[i - 1].drops.length <= r7.rankedPlans[i].drops.length, 'drops non-decreasing');
}
// the 1-drop plan (0 changes) ranks AFTER the 0-drop plans (1 change)
const droppedIdx = r7.rankedPlans.findIndex((rp) => rp.drops.includes('MA'));
const placedIdx = r7.rankedPlans.findIndex((rp) => !rp.drops.includes('MA'));
assert.ok(droppedIdx > placedIdx, 'drop plan ranks after placed plans despite fewer changes');
// within same drop count, sorted by fewest changes
const zeroDrop = r7.rankedPlans.filter((rp) => rp.drops.length === 0);
for (let i = 1; i < zeroDrop.length; i++) {
  assert.ok(zeroDrop[i - 1].changes.length <= zeroDrop[i].changes.length, 'changes non-decreasing within drop tier');
}

console.log('planner self-check: ALL PASS');
