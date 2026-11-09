// Calendar check: model "as it was" vs actual world growth, and the world without the events.
//   node scripts/calendar-check.mjs [startYear] [seeds] [removed ids, comma-separated | all]
import fs from 'node:fs';
import { loadData } from './load.mjs';
import { buildWorld } from '../src/sim/world.js';
import { Sim } from '../src/sim/engine.js';
import { CALENDAR, monthOf } from '../src/sim/calendar.js';

const [Y = 2000, SEEDS = 6, rem = 'all'] = process.argv.slice(2);
const startYear = +Y, d = loadData();
const history = JSON.parse(fs.readFileSync(new URL('../public/data/history.json', import.meta.url)));
const world = buildWorld(d.raw, { ...d, history, startYear });
const evs = CALENDAR.filter(ev => monthOf(ev, startYear) >= 0);
const removed = new Set(rem === 'all' ? evs.map(e => e.id) : rem.split(','));
const years = 2031 - startYear + 1, med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const A = [], B = [], AI = [];
for (let seed = 1; seed <= +SEEDS; seed++) {
  const a = new Sim(world, { seed }), b = new Sim(world, { seed });
  for (const ev of evs) {
    const def = { title: ev.title, duration: ev.duration, start: monthOf(ev, startYear), effects: ev.effects };
    a.addScenario(def); if (!removed.has(ev.id)) b.addScenario(def);
  }
  const ga = [], gb = [], ia = [];
  for (let y = 0; y < years; y++) { const a0 = a.agg.gdp, b0 = b.agg.gdp; let inf = 0; for (let m = 0; m < 12; m++) { a.step(); b.step(); inf += a.agg.infl / 12; } ga.push((a.agg.gdp / a0 - 1) * 100); gb.push((b.agg.gdp / b0 - 1) * 100); ia.push(inf); }
  A.push(ga); B.push(gb); AI.push(ia);
}
const wld = history._WLD.growth, imf = world.worldForecast;
// actual inflation aggregated like the model: country CPI inflation weighted by GDP (the WB "World" series uses its own method)
const wInfl = yr => { let w = 0, v = 0; for (const [iso, h] of Object.entries(history)) { const g = h.gdp?.[yr], i = h.infl?.[yr]; if (iso[0] !== '_' && g && i != null && Math.abs(i) < 100) { w += g; v += g * i; } } return w ? v / w : null; };
console.log(`start ${startYear}, ${SEEDS} seeds, removed: ${[...removed].join(', ')}`);
console.log('year   actual  model(as was)  model(without)  effect   infl: actual(GDP-w) model   events');
let err = [];
for (let y = 0; y < years; y++) {
  const yr = startYear + y, a = med(A.map(r => r[y])), b = med(B.map(r => r[y])), f = wld[yr] ?? imf[yr];
  if (wld[yr] != null) err.push(a - wld[yr]);
  const names = evs.filter(e => +e.date.slice(0, 4) === yr).map(e => e.id).join(' ');
  console.log(String(yr).padEnd(6), (f != null ? f.toFixed(1) + (wld[yr] == null ? 'f' : ' ') : '  —').padStart(6), a.toFixed(1).padStart(10), b.toFixed(1).padStart(14), (a - b).toFixed(1).padStart(10), (wInfl(yr) != null ? wInfl(yr).toFixed(1) : '—').padStart(12), med(AI.map(r => r[y])).toFixed(1).padStart(6), '  ', names);
}
const mean = x => x.reduce((p, q) => p + q, 0) / x.length;
console.log(`model - actual: mean ${mean(err).toFixed(2)} pp, mean abs ${mean(err.map(Math.abs)).toFixed(2)} pp, corr ${(() => { const a = [], b = []; for (let y = 0; y < years; y++) { const yr = startYear + y; if (wld[yr] != null) { a.push(med(A.map(r => r[y]))); b.push(wld[yr]); } } const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let k = 0; k < a.length; k++) { n += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; } return (n / Math.sqrt(da * db)).toFixed(2); })()}`);
