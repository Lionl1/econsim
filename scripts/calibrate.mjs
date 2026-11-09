// Сравнение моментов модели с историей World Bank 2000-2024.  node scripts/calibrate.mjs [seeds] [--json]
import fs from 'node:fs';
import { buildWorld } from '../src/sim/world.js';
import { Sim, P } from '../src/sim/engine.js';
const U = f => new URL(f, import.meta.url);
const raw = JSON.parse(fs.readFileSync(U('../public/data/countries.json')));
const hist = JSON.parse(fs.readFileSync(U('../data/history.json')));
const world = buildWorld(raw);
if (process.env.P) Object.assign(P, JSON.parse(process.env.P));
const SEEDS = +process.argv[2] || 3, YEARS = 24;

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const ar1 = a => { const x = a.slice(0, -1), y = a.slice(1), mx = mean(x), my = mean(y); let n = 0, d = 0; for (let k = 0; k < x.length; k++) { n += (x[k] - mx) * (y[k] - my); d += (x[k] - mx) ** 2; } return d ? n / d : 0; };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let k = 0; k < a.length; k++) { n += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; } return n / Math.sqrt(da * db || 1); };
const slope = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, d = 0; for (let k = 0; k < x.length; k++) { n += (x[k] - mx) * (y[k] - my); d += (x[k] - mx) ** 2; } return n / (d || 1); };

// набор годовых рядов -> метрики
function metrics(series /* [{g:[],infl:[],u:[],w:number(gdp weight),inc}] */, worldG) {
  const out = {};
  const f = (name, fn, filt = () => true) => { const v = series.filter(filt).map(fn).filter(Number.isFinite); out[name] = med(v); };
  f('growth mean', s => mean(s.g)); f('growth sd', s => sd(s.g)); f('growth ar1', s => ar1(s.g));
  f('growth corr w/ world', s => corr(s.g, worldG));
  f('infl median', s => med(s.infl)); f('infl sd', s => sd(s.infl)); f('infl ar1', s => ar1(s.infl));
  f('unemp sd(Δ)', s => sd(s.u.slice(1).map((x, k) => x - s.u[k])), s => s.u.length > 8);
  f('okun slope', s => slope(s.g.slice(1), s.u.slice(1).map((x, k) => x - s.u[k])), s => s.u.length > 8);
  for (const inc of ['HIC', 'UMC', 'LMC', 'LIC']) f(`growth sd ${inc}`, s => sd(s.g), s => s.inc === inc);
  for (const inc of ['HIC', 'LIC']) { f(`infl median ${inc}`, s => med(s.infl), s => s.inc === inc); f(`infl sd ${inc}`, s => sd(s.infl), s => s.inc === inc); }
  f('infl min (p, all)', s => Math.min(...s.infl));
  out['world growth sd'] = sd(worldG);
  out['share of country-years infl>10'] = mean(series.flatMap(s => s.infl.map(x => +(x > 10))));
  out['share of country-years growth<-2'] = mean(series.flatMap(s => s.g.map(x => +(x < -2))));
  return out;
}

// --- эмпирика ---
const years = Array.from({ length: 25 }, (_, k) => String(2000 + k));
const emp = [];
for (const c of raw) {
  const h = hist[c.iso3]; if (!h?.growth) continue;
  const ys = years.filter(y => h.growth[y] != null && h.infl?.[y] != null);
  if (ys.length < 18 || c.pop < 1e6) continue;
  emp.push({ g: ys.map(y => h.growth[y]), infl: ys.map(y => h.infl[y]), u: years.filter(y => h.unemp?.[y] != null).map(y => h.unemp[y]), inc: c.income });
}
const wy = years.filter(y => hist._WLD.growth[y] != null);
const empM = metrics(emp, wy.map(y => hist._WLD.growth[y]));

// --- модель ---
const allRuns = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const sim = new Sim(world, { seed });
  const rows = world.countries.map(() => ({ g: [], infl: [], u: [] }));
  const wg = [];
  let gd0 = sim.S.map(s => s.gdp), yi = sim.S.map(() => []), yu = sim.S.map(() => []), w0 = sim.agg.gdp;
  for (let m = 1; m <= YEARS * 12; m++) {
    sim.step();
    sim.S.forEach((s, i) => { yi[i].push(s.infl); yu[i].push(s.unemp); });
    if (m % 12 === 0) {
      sim.S.forEach((s, i) => { rows[i].g.push((s.gdp / gd0[i] - 1) * 100); rows[i].infl.push(mean(yi[i])); rows[i].u.push(mean(yu[i])); gd0[i] = s.gdp; yi[i] = []; yu[i] = []; });
      wg.push((sim.agg.gdp / w0 - 1) * 100); w0 = sim.agg.gdp;
    }
  }
  const series = rows.map((r, i) => ({ ...r, inc: world.countries[i].income, pop: world.countries[i].pop })).filter(s => s.pop >= 1e6);
  allRuns.push(metrics(series, wg));
}
const simM = Object.fromEntries(Object.keys(empM).map(k => [k, mean(allRuns.map(r => r[k]))]));
const w = Math.max(...Object.keys(empM).map(k => k.length));
console.log('metric'.padEnd(w), 'реальность'.padStart(11), 'модель'.padStart(9), 'отн.ошибка');
for (const k of Object.keys(empM)) {
  const e = empM[k], s = simM[k], err = Math.abs(e) > 0.02 ? (s - e) / Math.abs(e) : NaN;
  const flag = Math.abs(err) > 0.35 ? ' ◀' : '';
  console.log(k.padEnd(w), e.toFixed(2).padStart(11), s.toFixed(2).padStart(9), (Number.isFinite(err) ? (err * 100).toFixed(0) + '%' : '').padStart(8) + flag);
}
