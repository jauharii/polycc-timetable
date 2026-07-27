import { DAY_ORDER, TIME_ORDER, TimetableEntry } from './types';

export interface Offering {
  coursecode: string;
  classcode: string;
  ttids: string[];
  labs: string[];
  lecturers: { code: string; name: string }[];
}

export interface Placement {
  coursecode: string;
  offering: Offering;
  clashes: string[]; // ttids clashing with base / earlier placements
}

export interface ResolutionStep {
  coursecode: string;
  chosenClass: string;
  slots: string[];
  clashCourses: string[]; // courses still occupying the chosen slots ([] = resolved)
  resolved: boolean;
}

export interface Plan {
  placements: Placement[];
  totalClashes: number;
  clashSlots: string[];
  unplaced: string[]; // missed courses with no offering
  steps: ResolutionStep[]; // resolution cascade: each course -> class -> resolved?
}

export interface Suggestion {
  coursecode: string;
  type: 'change' | 'drop' | 'unavailable';
  message: string;
  bestClasscode?: string;
  bestClashes?: number;
}

export interface FriendProfile {
  id: string;
  mainClass: string;
  missedCourses: string[];
  droppedCourses: string[];
}

export interface PlannerInput {
  timetables: TimetableEntry[];
  mainClass: string;
  droppedCourses: string[];
  missedCourses: string[];
  friends: FriendProfile[];
  maxPlans?: number;
  allowDrop?: boolean; // solver may drop courses to reach a clash-free plan
}

export interface Assignment {
  coursecode: string;
  classcode: string; // current class group
  ttids: string[]; // current slots
  isBase: boolean; // originally in the main class
  changed: boolean; // moved away from its home class group
  originalClass?: string; // home class group (for changed base courses)
  originalTtids?: string[]; // home slots (for changed base courses)
}

export interface CascadeStep {
  coursecode: string;
  classcode: string;
  ttids: string[];
  action: 'add' | 'move';
  clashWith: string[]; // courses it clashed with at this step
  resolved: boolean; // true if clash-free after this step
  unavailable?: boolean; // no class offers this course
}

export interface CascadeResult {
  steps: CascadeStep[];
  finalAssignment: Assignment[];
  totalClashes: number;
  resolved: boolean;
}

export interface Change {
  coursecode: string;
  originalClass: string; // '' for a newly added (missed) course
  newClass: string;
}

export interface RankedPlan {
  totalClashes: number;
  resolved: boolean;
  changes: Change[]; // course: originalClass -> newClass
  drops: string[]; // courses dropped (only when allowDrop)
  together: number; // shared class groups with friends (higher = more together)
  assignment: Assignment[]; // full timetable for this plan
}

export interface PlannerResult {
  baseSlots: string[];
  friendSlots: string[];
  freeTogether: string[];
  plans: Plan[];
  suggestions: Suggestion[];
  offeringsByCourse: Record<string, Offering[]>;
  cascade: CascadeResult;
  rankedPlans: RankedPlan[];
}

const MAX_OFFERINGS = 25; // offerings kept per course
const BEAM_WIDTH = 40; // partial plans kept per step
const DEFAULT_PLANS = 10; // final ranked plans returned (user can request more)

/** All ttids belonging to a class, optionally excluding dropped courses. */
export function classSlots(
  timetables: TimetableEntry[],
  classcode: string,
  droppedCourses: string[] = []
): Set<string> {
  const drop = new Set(droppedCourses);
  const out = new Set<string>();
  for (const e of timetables) {
    if (e.classcode === classcode && !drop.has(e.coursecode)) out.add(e.ttid);
  }
  return out;
}

/**
 * A course runs in parallel class-group offerings. Group the course's entries
 * by classcode → one Offering per class group (its weekly slots for that course).
 */
export function buildOfferings(
  timetables: TimetableEntry[],
  coursecode: string,
  excludeClass?: string
): Offering[] {
  const byClass = new Map<string, Offering>();
  for (const e of timetables) {
    if (e.coursecode !== coursecode) continue;
    if (excludeClass && e.classcode === excludeClass) continue;
    let off = byClass.get(e.classcode);
    if (!off) {
      off = { coursecode, classcode: e.classcode, ttids: [], labs: [], lecturers: [] };
      byClass.set(e.classcode, off);
    }
    if (!off.ttids.includes(e.ttid)) off.ttids.push(e.ttid);
    if (e.labname && !off.labs.includes(e.labname)) off.labs.push(e.labname);
    for (const l of e.lecturers || []) {
      if (l.code && !off.lecturers.some((x) => x.code === l.code)) off.lecturers.push(l);
    }
  }
  return Array.from(byClass.values());
}

function intersectSize(a: string[], b: Set<string>): string[] {
  return a.filter((t) => b.has(t));
}

const allWeekSlots = (): string[] => {
  const out: string[] = [];
  for (const [d] of DAY_ORDER) for (const h of TIME_ORDER) out.push(`${d}${h}`);
  return out;
};

/**
 * Walk a plan's placements in order, tracking which course owns each slot, to
 * produce the resolution cascade: for each added course, which class it was put
 * in and whether that resolved its clash (clashCourses empty) or not.
 */
export function buildSteps(
  placements: Placement[],
  baseOwner: Map<string, string>
): ResolutionStep[] {
  const owner = new Map(baseOwner);
  const steps: ResolutionStep[] = [];
  for (const pl of placements) {
    const clashCourses: string[] = [];
    for (const t of pl.offering.ttids) {
      const oc = owner.get(t);
      if (oc && !clashCourses.includes(oc)) clashCourses.push(oc);
    }
    steps.push({
      coursecode: pl.coursecode,
      chosenClass: pl.offering.classcode,
      slots: pl.offering.ttids,
      clashCourses,
      resolved: clashCourses.length === 0,
    });
    for (const t of pl.offering.ttids) owner.set(t, pl.coursecode);
  }
  return steps;
}

/**
 * Cascading reassignment resolver. Places each missed course, then repeatedly
 * reassigns ANY clashing course (missed OR base) to another class group until
 * there are no clashes or no move improves things. Produces the recommendation
 * chain, e.g. "multimedia -> DIT3_S4 (clash python) -> python -> DIT5_S7".
 */
export function resolveCascade(input: PlannerInput): CascadeResult {
  const { timetables, mainClass, droppedCourses, missedCourses } = input;
  const drop = new Set(droppedCourses);

  const offCache = new Map<string, Offering[]>();
  const offeringsFor = (cc: string): Offering[] => {
    let o = offCache.get(cc);
    if (!o) {
      o = buildOfferings(timetables, cc);
      offCache.set(cc, o);
    }
    return o;
  };

  const assignment = new Map<string, Assignment>();
  // base courses: home class group = main class
  const baseSlots = new Map<string, Set<string>>();
  for (const e of timetables) {
    if (e.classcode !== mainClass || drop.has(e.coursecode)) continue;
    let s = baseSlots.get(e.coursecode);
    if (!s) {
      s = new Set<string>();
      baseSlots.set(e.coursecode, s);
    }
    s.add(e.ttid);
  }
  baseSlots.forEach((slots, cc) => {
    assignment.set(cc, {
      coursecode: cc,
      classcode: mainClass,
      ttids: Array.from(slots),
      isBase: true,
      changed: false,
      originalClass: mainClass,
      originalTtids: Array.from(slots),
    });
  });

  const totalClashes = (): number => {
    const occ = new Map<string, number>();
    assignment.forEach((a) => a.ttids.forEach((t) => occ.set(t, (occ.get(t) || 0) + 1)));
    let n = 0;
    occ.forEach((cnt) => {
      if (cnt >= 2) n += (cnt * (cnt - 1)) / 2;
    });
    return n;
  };

  const clashCourses = (cc: string): string[] => {
    const mine = assignment.get(cc);
    if (!mine) return [];
    const mySlots = new Set(mine.ttids);
    const out: string[] = [];
    assignment.forEach((a, other) => {
      if (other !== cc && a.ttids.some((t) => mySlots.has(t))) out.push(other);
    });
    return out;
  };

  const steps: CascadeStep[] = [];

  function resolveLoop() {
    let guard = 0;
    let current = totalClashes();
    while (guard++ < 200 && current > 0) {
      let target = '';
      assignment.forEach((_, cc) => {
        if (!target && clashCourses(cc).length) target = cc;
      });
      if (!target) break;
      const involved = [target, ...clashCourses(target)];
      let bestMove: { course: string; off: Offering; total: number } | null = null;
      for (const cc of involved) {
        const cur = assignment.get(cc);
        if (!cur) continue;
        for (const off of offeringsFor(cc)) {
          if (off.classcode === cur.classcode) continue;
          assignment.set(cc, { ...cur, classcode: off.classcode, ttids: off.ttids });
          const t = totalClashes();
          assignment.set(cc, cur);
          if (!bestMove || t < bestMove.total) bestMove = { course: cc, off, total: t };
        }
      }
      if (!bestMove || bestMove.total >= current) break;
      const before = clashCourses(bestMove.course);
      const cur = assignment.get(bestMove.course);
      if (!cur) break;
      assignment.set(bestMove.course, {
        ...cur,
        classcode: bestMove.off.classcode,
        ttids: bestMove.off.ttids,
        changed: true,
      });
      steps.push({
        coursecode: bestMove.course,
        classcode: bestMove.off.classcode,
        ttids: bestMove.off.ttids,
        action: 'move',
        clashWith: before,
        resolved: bestMove.total === 0,
      });
      current = bestMove.total;
    }
  }

  // place missed courses one by one, resolving clashes after each
  for (const mc of missedCourses) {
    if (assignment.has(mc)) continue; // already in main class
    const offs = offeringsFor(mc);
    if (offs.length === 0) {
      steps.push({
        coursecode: mc,
        classcode: '',
        ttids: [],
        action: 'add',
        clashWith: [],
        resolved: false,
        unavailable: true,
      });
      continue;
    }
    let best = offs[0];
    let bestN = Infinity;
    for (const off of offs) {
      assignment.set(mc, { coursecode: mc, classcode: off.classcode, ttids: off.ttids, isBase: false, changed: false });
      const n = clashCourses(mc).length;
      if (n < bestN) {
        bestN = n;
        best = off;
      }
    }
    assignment.set(mc, { coursecode: mc, classcode: best.classcode, ttids: best.ttids, isBase: false, changed: false });
    steps.push({
      coursecode: mc,
      classcode: best.classcode,
      ttids: best.ttids,
      action: 'add',
      clashWith: clashCourses(mc),
      resolved: false,
    });
    resolveLoop();
  }

  const total = totalClashes();
  if (steps.length) steps[steps.length - 1].resolved = total === 0;
  return { steps, finalAssignment: Array.from(assignment.values()), totalClashes: total, resolved: total === 0 };
}

/**
 * Beam search over ALL needed courses (base courses may move class group too).
 * Clash count only grows as courses are added, so any partial with a clash can
 * never resolve -> safe to prune. Yields up to topN distinct clash-free plans,
 * ranked by fewest class changes.
 */
function resolveBeam(input: PlannerInput, topN: number): RankedPlan[] {
  const { timetables, mainClass, droppedCourses, missedCourses, friends, allowDrop } = input;
  const drop = new Set(droppedCourses);

  const offCache = new Map<string, Offering[]>();
  const offeringsFor = (cc: string): Offering[] => {
    let o = offCache.get(cc);
    if (!o) {
      o = buildOfferings(timetables, cc);
      offCache.set(cc, o);
    }
    return o;
  };

  // home slots for base courses
  const baseSlots = new Map<string, Set<string>>();
  for (const e of timetables) {
    if (e.classcode !== mainClass || drop.has(e.coursecode)) continue;
    let s = baseSlots.get(e.coursecode);
    if (!s) {
      s = new Set<string>();
      baseSlots.set(e.coursecode, s);
    }
    s.add(e.ttid);
  }

  // togetherness: course -> classcode -> #friends that have that course in that class
  const togetherCount = new Map<string, Map<string, number>>();
  for (const f of friends) {
    if (!f.mainClass) continue;
    const fdrop = new Set(f.droppedCourses);
    for (const e of timetables) {
      if (e.classcode !== f.mainClass || fdrop.has(e.coursecode)) continue;
      let m = togetherCount.get(e.coursecode);
      if (!m) {
        m = new Map<string, number>();
        togetherCount.set(e.coursecode, m);
      }
      m.set(f.mainClass, (m.get(f.mainClass) || 0) + 1);
    }
  }
  const togetherGain = (cc: string, classcode: string): number => togetherCount.get(cc)?.get(classcode) || 0;

  interface Need {
    coursecode: string;
    isBase: boolean;
  }
  const needed: Need[] = [];
  baseSlots.forEach((_, cc) => needed.push({ coursecode: cc, isBase: true }));
  for (const mc of missedCourses) if (!baseSlots.has(mc)) needed.push({ coursecode: mc, isBase: false });
  // most constrained first
  needed.sort((a, b) => offeringsFor(a.coursecode).length - offeringsFor(b.coursecode).length);
  const placeableCount = needed.filter((n) => offeringsFor(n.coursecode).length > 0).length;
  const accountableCount = allowDrop ? needed.length : placeableCount;

  interface State {
    assign: Map<string, Offering>;
    dropped: string[];
    clashes: number;
    changes: number;
    together: number;
  }
  let beam: State[] = [{ assign: new Map(), dropped: [], clashes: 0, changes: 0, together: 0 }];
  const beamWidth = Math.max(300, topN * 30);
  const sortKey = (a: State, b: State) =>
    a.clashes - b.clashes ||
    a.dropped.length - b.dropped.length ||
    a.changes - b.changes ||
    b.together - a.together;

  for (const need of needed) {
    const offs = offeringsFor(need.coursecode);
    if (offs.length === 0 && !allowDrop) continue; // unplaceable & cannot drop -> omit
    const next: State[] = [];
    for (const st of beam) {
      const occ = new Map<string, number>();
      st.assign.forEach((off) => off.ttids.forEach((t) => occ.set(t, (occ.get(t) || 0) + 1)));
      for (const off of offs) {
        let addClash = 0;
        for (const t of off.ttids) if ((occ.get(t) || 0) > 0) addClash += 1;
        const isChange = need.isBase ? off.classcode !== mainClass : true;
        const assign = new Map(st.assign);
        assign.set(need.coursecode, off);
        next.push({
          assign,
          dropped: st.dropped,
          clashes: st.clashes + addClash,
          changes: st.changes + (isChange ? 1 : 0),
          together: st.together + togetherGain(need.coursecode, off.classcode),
        });
      }
      if (allowDrop) {
        next.push({
          assign: st.assign,
          dropped: [...st.dropped, need.coursecode],
          clashes: st.clashes,
          changes: st.changes,
          together: st.together,
        });
      }
    }
    next.sort(sortKey);
    beam = next.slice(0, beamWidth);
  }

  beam.sort(sortKey);
  const result: RankedPlan[] = [];
  const seen = new Set<string>();
  for (const st of beam) {
    if (st.assign.size + st.dropped.length < accountableCount) continue;
    if (st.clashes !== 0) continue; // only fully resolved
    const assignment: Assignment[] = [];
    const changes: Change[] = [];
    needed.forEach((n) => {
      const off = st.assign.get(n.coursecode);
      if (!off) return; // dropped or omitted
      const changed = n.isBase && off.classcode !== mainClass;
      const home = baseSlots.get(n.coursecode);
      assignment.push({
        coursecode: n.coursecode,
        classcode: off.classcode,
        ttids: off.ttids,
        isBase: n.isBase,
        changed,
        originalClass: n.isBase ? mainClass : undefined,
        originalTtids: n.isBase && home ? Array.from(home) : undefined,
      });
      if (!n.isBase || changed) {
        changes.push({ coursecode: n.coursecode, originalClass: n.isBase ? mainClass : '', newClass: off.classcode });
      }
    });
    const sig =
      assignment
        .map((a) => `${a.coursecode}:${a.classcode}`)
        .sort()
        .join('|') +
      '::' +
      st.dropped.slice().sort().join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
    result.push({ totalClashes: 0, resolved: true, changes, drops: st.dropped, together: st.together, assignment });
    if (result.length >= topN) break;
  }
  result.sort((a, b) => a.drops.length - b.drops.length || a.changes.length - b.changes.length || b.together - a.together);
  return result;
}

export function plan(input: PlannerInput): PlannerResult {
  const { timetables, mainClass, droppedCourses, missedCourses, friends, maxPlans } = input;
  const topN = Math.max(1, maxPlans ?? DEFAULT_PLANS);
  const beamWidth = Math.max(BEAM_WIDTH, topN);

  const baseSet = classSlots(timetables, mainClass, droppedCourses);
  const baseSlots = Array.from(baseSet);

  // ttid -> coursecode for the main class (after drops), for naming clashes.
  const dropSet = new Set(droppedCourses);
  const baseOwner = new Map<string, string>();
  for (const e of timetables) {
    if (e.classcode === mainClass && !dropSet.has(e.coursecode) && !baseOwner.has(e.ttid)) {
      baseOwner.set(e.ttid, e.coursecode);
    }
  }

  const friendSet = new Set<string>();
  for (const f of friends) {
    if (!f.mainClass) continue;
    classSlots(timetables, f.mainClass, f.droppedCourses).forEach((t) => friendSet.add(t));
  }
  const friendSlots = Array.from(friendSet);

  const freeTogether = allWeekSlots().filter((t) => !baseSet.has(t) && !friendSet.has(t));

  // Offerings per missed course, sorted by clash vs base, capped.
  const offeringsByCourse: Record<string, Offering[]> = {};
  for (const c of missedCourses) {
    const offs = buildOfferings(timetables, c, mainClass)
      .map((o) => ({ o, n: intersectSize(o.ttids, baseSet).length }))
      .sort((a, b) => a.n - b.n || a.o.ttids.length - b.o.ttids.length)
      .slice(0, MAX_OFFERINGS)
      .map((x) => x.o);
    offeringsByCourse[c] = offs;
  }

  // Beam search over missed courses: pick one offering each, minimize total clash.
  interface Partial {
    placements: Placement[];
    occupied: Set<string>;
    clashSlots: Set<string>;
    totalClashes: number;
    unplaced: string[];
  }
  let beam: Partial[] = [
    { placements: [], occupied: new Set(baseSet), clashSlots: new Set(), totalClashes: 0, unplaced: [] },
  ];

  for (const c of missedCourses) {
    const offs = offeringsByCourse[c] || [];
    if (offs.length === 0) {
      beam = beam.map((p) => ({ ...p, unplaced: [...p.unplaced, c] }));
      continue;
    }
    const next: Partial[] = [];
    for (const p of beam) {
      for (const off of offs) {
        const clashes = intersectSize(off.ttids, p.occupied);
        const occupied = new Set(p.occupied);
        for (const t of off.ttids) occupied.add(t);
        const clashSlots = new Set(p.clashSlots);
        for (const t of clashes) clashSlots.add(t);
        next.push({
          placements: [...p.placements, { coursecode: c, offering: off, clashes }],
          occupied,
          clashSlots,
          totalClashes: p.totalClashes + clashes.length,
          unplaced: p.unplaced,
        });
      }
    }
    next.sort((a, b) => a.totalClashes - b.totalClashes);
    beam = next.slice(0, beamWidth);
  }

  const plans: Plan[] = beam.slice(0, topN).map((p) => ({
    placements: p.placements,
    totalClashes: p.totalClashes,
    clashSlots: Array.from(p.clashSlots),
    unplaced: p.unplaced,
    steps: buildSteps(p.placements, baseOwner),
  }));

  // Suggestions from the best plan: for each clashing course, always name the
  // best *other* class (vs base + the other added courses). If that class
  // reduces clashes -> "change"; if nothing improves -> "drop".
  const suggestions: Suggestion[] = [];
  const best = plans[0];
  if (best) {
    for (const pl of best.placements) {
      if (pl.clashes.length === 0) continue;
      // slots occupied by base + the OTHER added courses
      const occupied = new Set(baseSet);
      for (const other of best.placements) {
        if (other.coursecode === pl.coursecode) continue;
        for (const t of other.offering.ttids) occupied.add(t);
      }
      const chosenClash = intersectSize(pl.offering.ttids, occupied).length;
      // best alternative class for this course, excluding the chosen one
      let bestAlt: Offering | null = null;
      let bestAltClash = Infinity;
      for (const off of buildOfferings(timetables, pl.coursecode, mainClass)) {
        if (off.classcode === pl.offering.classcode) continue;
        const n = intersectSize(off.ttids, occupied).length;
        if (n < bestAltClash) {
          bestAltClash = n;
          bestAlt = off;
        }
      }
      if (bestAlt && bestAltClash < chosenClash) {
        suggestions.push({
          coursecode: pl.coursecode,
          type: 'change',
          message: `${pl.coursecode}: switch to class ${bestAlt.classcode} to cut clashes (${chosenClash} → ${bestAltClash}).`,
          bestClasscode: bestAlt.classcode,
          bestClashes: bestAltClash,
        });
      } else {
        const altNote = bestAlt
          ? ` (next best: class ${bestAlt.classcode}, ${bestAltClash} clash)`
          : ' (no other class offers it)';
        suggestions.push({
          coursecode: pl.coursecode,
          type: 'drop',
          message: `${pl.coursecode} clashes ${chosenClash} slot(s) and no class improves it${altNote} — consider dropping it.`,
          bestClasscode: bestAlt?.classcode,
          bestClashes: bestAlt ? bestAltClash : chosenClash,
        });
      }
    }
    for (const c of best.unplaced) {
      suggestions.push({
        coursecode: c,
        type: 'unavailable',
        message: `${c} has no offering outside your class this session — cannot add.`,
      });
    }
  }

  const cascade = resolveCascade(input);

  const rankedPlans = resolveBeam(input, topN);

  return { baseSlots, friendSlots, freeTogether, plans, suggestions, offeringsByCourse, cascade, rankedPlans };
}
