// Tests for multi-file merge + people-set validation. Run: node test/merge.mjs
import { normalize, mergeModels } from '../js/parse.js';

// Tiny CSV → array of arrays (no quoted fields needed here).
const toRows = (s) => s.trim().split('\n').map((l) => l.split(','));
const entry = (name, csv) => ({ name, model: normalize(toRows(csv)) });

let failed = 0;
const check = (name, cond) => { if (!cond) { failed++; console.error('  FAIL:', name); } else console.log('  ok:', name); };

// Group A: people Ann, Bob, Cy
const A = entry('groupA.csv', `Date,Description,Category,Cost,Currency,Ann,Bob,Cy
2024-01-01,Lunch,Dining out,300,INR,200,-100,-100
2024-01-02,Cab,Taxi,150,INR,-50,100,-50`);

// Group B: SAME people, DIFFERENT column order (Cy, Ann, Bob)
const B = entry('groupB.csv', `Date,Description,Category,Cost,Currency,Cy,Ann,Bob
2024-02-01,Hotel,General,900,INR,600,-300,-300`);

// Group C: people Ann, Bob, Dee — extra Dee, missing Cy
const C = entry('groupC.csv', `Date,Description,Category,Cost,Currency,Ann,Bob,Dee
2024-03-01,Snacks,General,90,INR,-30,-30,60`);

// 1) Same people, reordered columns → merges; nets stay keyed by name.
const merged = mergeModels([A, B]);
check('merged keeps the people set', JSON.stringify([...merged.people].sort()) === JSON.stringify(['Ann', 'Bob', 'Cy']));
check('merged concatenates rows (2 + 1)', merged.rows.length === 3);
const hotel = merged.rows.find((r) => r.description === 'Hotel');
check('reordered file aligns nets by name (Cy paid)', hotel.net.Cy === 600 && hotel.net.Ann === -300);
check('sources recorded', merged.sources.length === 2);

// 2) Mismatched people → throws with a helpful message.
let threw = false, msg = '';
try { mergeModels([A, C]); } catch (e) { threw = true; msg = e.message; }
check('mismatched people throws', threw);
check('error names the extra person (Dee)', /Dee/.test(msg));
check('error names the missing person (Cy)', /Cy/.test(msg));
console.log('  msg:', msg);

// 3) Single file still works.
check('single-file merge works', mergeModels([A]).rows.length === 2);

console.log(failed ? `\n${failed} FAILED` : '\nAll merge tests passed ✓');
process.exit(failed ? 1 : 0);
