// Self-check: buildGrid must always produce rows whose colSpan sum === 10.
// Run: npx tsc lib/grid.ts lib/types.ts --outDir /tmp/gridcheck --module commonjs --target es2020 --esModuleInterop --skipLibCheck && node scripts/check_grid.mjs
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildGrid } = require('/tmp/gridcheck/grid.js');
const { TIME_ORDER } = require('/tmp/gridcheck/types.js');

const N = TIME_ORDER.length;
assert.strictEqual(N, 10, 'TIME_ORDER must have 10 slots');

// Deterministic PRNG for reproducible pseudo-random entries
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const DAYS = ['01', '02', '03', '04', '05', '06', '07'];
const courses = {};
for (let c = 0; c < 20; c++) courses[`C${c}`] = { coursecode: `C${c}`, coursename: `Course ${c}` };

function makeEntries(count) {
  const entries = [];
  for (let i = 0; i < count; i++) {
    const day = DAYS[Math.floor(rand() * DAYS.length)];
    const hour = TIME_ORDER[Math.floor(rand() * N)];
    const coursecode = `C${Math.floor(rand() * 20)}`;
    entries.push({
      ttid: `${day}${hour}`,
      coursecode,
      classcode: `CLS${Math.floor(rand() * 5)}`,
      labname: rand() > 0.5 ? `LAB${Math.floor(rand() * 3)}` : '',
      lecturers: [{ code: `L${Math.floor(rand() * 10)}`, name: 'Lec' }],
    });
  }
  return entries;
}

// Test many random distributions, including heavy collisions on same slot
for (let trial = 0; trial < 200; trial++) {
  const entries = makeEntries(1 + Math.floor(rand() * 60));
  const { rows } = buildGrid(entries, courses);
  for (const row of rows) {
    const sum = row.cells.reduce((s, c) => s + c.span, 0);
    assert.strictEqual(sum, N, `trial ${trial} day ${row.day_code}: span sum ${sum} != ${N}`);
    // unique hours (unique React keys)
    const hours = row.cells.map(c => c.hour);
    assert.strictEqual(new Set(hours).size, hours.length, `trial ${trial} day ${row.day_code}: duplicate hours`);
  }
}

// Edge cases: empty, single, full-day same course, alternating courses
const edge = [
  [],
  [{ ttid: '0108', coursecode: 'C0', classcode: 'X', labname: 'L', lecturers: [] }],
  TIME_ORDER.map(h => ({ ttid: `01${h}`, coursecode: 'C0', classcode: 'X', labname: 'L', lecturers: [] })),
  TIME_ORDER.map((h, i) => ({ ttid: `01${h}`, coursecode: `C${i % 2}`, classcode: 'X', labname: 'L', lecturers: [] })),
];
for (const entries of edge) {
  const { rows } = buildGrid(entries, courses);
  for (const row of rows) {
    const sum = row.cells.reduce((s, c) => s + c.span, 0);
    assert.strictEqual(sum, N, `edge: span sum ${sum} != ${N}`);
  }
}

console.log('OK: all rows have exactly', N, 'time columns, unique keys');