// Ансамбль прогонов: сценарий vs базовый мир на нескольких сидах. Один прогон показывает в основном шум,
// ансамбль — медиану эффекта и его разброс. Работает и в браузере (через воркер), и в Node.
import { Sim } from './engine.js';

const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); const k = (a.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return a[lo] + (a[hi] - a[lo]) * (k - lo); };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

// scenarios: [{ def: {title, duration, effects}, delay }]
export function runEnsemble(world, scenarios, { seeds = 20, months = 60, seed0 = 1, onProgress } = {}) {
  const N = world.N;
  const paths = { gdp: [], infl: [], unemp: [], wars: [] };      // [seed][month]
  const finalC = Array.from({ length: N }, () => []);             // ΔВВП страны в конце, по сидам
  const extraWars = [], warStarts = [];
  for (let k = 0; k < seeds; k++) {
    const seed = seed0 + k;
    const base = new Sim(world, { seed }), sim = new Sim(world, { seed });
    for (const s of scenarios) sim.addScenario({ ...s.def, effects: s.def.effects.map(e => ({ ...e })), start: s.delay || 0 });
    const P = { gdp: [], infl: [], unemp: [], wars: [] };
    let wb = 0, ws = 0;
    for (let m = 0; m < months; m++) {
      base.step(); sim.step();
      P.gdp.push((sim.agg.gdp / base.agg.gdp - 1) * 100);
      P.infl.push(sim.agg.infl - base.agg.infl);
      P.unemp.push(sim.agg.unemp - base.agg.unemp);
      P.wars.push(sim.agg.wars - base.agg.wars);
      wb += base.agg.wars; ws += sim.agg.wars;
    }
    for (const key in paths) paths[key].push(P[key]);
    for (let i = 0; i < N; i++) finalC[i].push((sim.S[i].gdp / base.S[i].gdp - 1) * 100);
    extraWars.push((ws - wb) / months);
    warStarts.push(sim.agentWars - base.agentWars);   // войны, объявленные агентами, сверх базы (без войн самого сценария)
    onProgress?.((k + 1) / seeds);
  }
  const band = key => {
    const out = { p10: [], p50: [], p90: [] };
    for (let m = 0; m < months; m++) { const col = paths[key].map(p => p[m]); out.p10.push(q(col, 0.1)); out.p50.push(q(col, 0.5)); out.p90.push(q(col, 0.9)); }
    return out;
  };
  const end = key => { const col = paths[key].map(p => p[months - 1]); return { p10: q(col, 0.1), p50: q(col, 0.5), p90: q(col, 0.9), neg: mean(col.map(v => +(v < 0))) }; };
  // худшее значение за горизонт (минимум ВВП, максимум инфляции/безработицы) — для шоков, которые потом проходят
  const peak = (key, fn) => { const col = paths[key].map(p => fn(...p)); return { p10: q(col, 0.1), p50: q(col, 0.5), p90: q(col, 0.9) }; };
  const countries = finalC.map((col, i) => ({ i, p50: q(col, 0.5), p10: q(col, 0.1), p90: q(col, 0.9), neg: mean(col.map(v => +(v < -0.05))), pos: mean(col.map(v => +(v > 0.05))) }));
  return {
    seeds, months,
    bands: { gdp: band('gdp'), infl: band('infl'), unemp: band('unemp'), wars: band('wars') },
    end: { gdp: end('gdp'), infl: end('infl'), unemp: end('unemp') },
    peak: { gdp: peak('gdp', Math.min), infl: peak('infl', Math.max), unemp: peak('unemp', Math.max) },
    wars: { extraAvg: mean(extraWars), newWarsMedian: q(warStarts, 0.5), pMore: mean(warStarts.map(v => +(v > 0))) },
    countries,
  };
}
