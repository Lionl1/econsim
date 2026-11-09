// Ensemble: scenario vs baseline over many seeds. Three layers of uncertainty:
//  1) random events (growth, inflation, FX and market shocks, agent decisions): different seeds;
//  2) model parameters: drawn within ranges of literature estimates (PRANGES), like posterior draws
//     in the Bayesian DSGE models of the Fed/ECB;
//  3) event size: lognormal multiplier with median 1 (sigma=0.35: a "-6%" shock is -3.4%...-10.6% in 80% of draws).
// The baseline follows the IMF WEO forecast; its growth band is compared with it (like IMF / Bank of England fan charts).
import { Sim } from './engine.js';
import { P, PRANGES } from './params.js';
import { hash, gauss } from './rng.js';

const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); const k = (a.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return a[lo] + (a[hi] - a[lo]) * (k - lo); };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const SCALABLE = new Set(['shock', 'oil', 'tariff', 'relation', 'crypto', 'sector']);

export function runEnsemble(world, scenarios, { seeds = 20, months = 60, seed0 = 1, params = true, magnitude = true, onProgress } = {}) {
  const N = world.N, saved = { ...P };
  const keys = ['gdp', 'infl', 'unemp', 'wars', 'eq', 'btc', 'trade'];
  const paths = Object.fromEntries(keys.map(k => [k, []]));
  const finalC = Array.from({ length: N }, () => []), fxC = Array.from({ length: N }, () => []);
  const warStarts = [], baseGrowth = [];               // [seed][year]: world growth in the baseline run, %
  try {
    for (let k = 0; k < seeds; k++) {
      const seed = seed0 + k;
      Object.assign(P, saved);
      if (params) for (const [name, [lo, hi]] of Object.entries(PRANGES)) P[name] = lo + (hi - lo) * hash(seed, 777, 1, name.length * 31 + name.charCodeAt(0) + name.charCodeAt(name.length - 1));
      const base = new Sim(world, { seed }), sim = new Sim(world, { seed });
      scenarios.forEach((s, si) => sim.addScenario({ ...s.def, start: s.delay || 0, effects: s.def.effects.map((e, ei) => {
        if (!magnitude || !SCALABLE.has(e.kind) || e.value == null) return { ...e };
        const m = Math.exp(0.35 * gauss(seed, 778, si, ei));
        return { ...e, value: e.kind === 'crypto' ? Math.max(-0.95, e.value * m) : e.value * m };
      }) }));
      const Pth = Object.fromEntries(keys.map(k2 => [k2, []]));
      let g0 = base.agg.gdp; const bg = [];
      for (let m = 0; m < months; m++) {
        base.step(); sim.step();
        Pth.gdp.push((sim.agg.gdp / base.agg.gdp - 1) * 100);
        Pth.infl.push(sim.agg.infl - base.agg.infl);
        Pth.unemp.push(sim.agg.unemp - base.agg.unemp);
        Pth.wars.push(sim.agg.wars - base.agg.wars);
        Pth.eq.push((Math.exp(sim.agg.eq - base.agg.eq) - 1) * 100);
        Pth.btc.push((sim.btc / base.btc - 1) * 100);
        Pth.trade.push((sim.agg.trade / base.agg.trade - 1) * 100);
        if ((m + 1) % 12 === 0) { bg.push((base.agg.gdp / g0 - 1) * 100); g0 = base.agg.gdp; }
      }
      for (const key of keys) paths[key].push(Pth[key]);
      for (let i = 0; i < N; i++) { finalC[i].push((sim.S[i].gdp / base.S[i].gdp - 1) * 100); fxC[i].push((Math.exp(sim.S[i].e - base.S[i].e) - 1) * 100); }
      warStarts.push(sim.agentWars - base.agentWars);   // wars declared by agents beyond the baseline (excluding the scenario's own wars)
      baseGrowth.push(bg);
      onProgress?.((k + 1) / seeds);
    }
  } finally { Object.assign(P, saved); }
  const band = key => {
    const out = { p10: [], p50: [], p90: [] };
    for (let m = 0; m < months; m++) { const col = paths[key].map(p => p[m]); out.p10.push(q(col, 0.1)); out.p50.push(q(col, 0.5)); out.p90.push(q(col, 0.9)); }
    return out;
  };
  const end = key => { const col = paths[key].map(p => p[months - 1]); return { p10: q(col, 0.1), p50: q(col, 0.5), p90: q(col, 0.9), neg: mean(col.map(v => +(v < 0))) }; };
  const peak = (key, fn) => { const col = paths[key].map(p => fn(...p)); return { p10: q(col, 0.1), p50: q(col, 0.5), p90: q(col, 0.9) }; };
  const years = Math.floor(months / 12);
  const yb = { p10: [], p50: [], p90: [] };
  for (let y = 0; y < years; y++) { const col = baseGrowth.map(r => r[y]); yb.p10.push(q(col, 0.1)); yb.p50.push(q(col, 0.5)); yb.p90.push(q(col, 0.9)); }
  const countries = finalC.map((col, i) => ({ i, p50: q(col, 0.5), p10: q(col, 0.1), p90: q(col, 0.9), neg: mean(col.map(v => +(v < -0.05))), pos: mean(col.map(v => +(v > 0.05))),
    fx: q(fxC[i], 0.5) }));
  return {
    seeds, months, layers: { params, magnitude },
    bands: Object.fromEntries(keys.map(k => [k, band(k)])),
    end: Object.fromEntries(['gdp', 'infl', 'unemp', 'eq', 'btc', 'trade'].map(k => [k, end(k)])),
    peak: { gdp: peak('gdp', Math.min), infl: peak('infl', Math.max), unemp: peak('unemp', Math.max), eq: peak('eq', Math.min) },
    wars: { newWarsMedian: q(warStarts, 0.5), pMore: mean(warStarts.map(v => +(v > 0))) },
    baseline: { years: Array.from({ length: years }, (_, y) => 2026 + y), growth: yb, imf: Array.from({ length: years }, (_, y) => world.worldForecast?.[2026 + y] ?? null) },
    countries,
  };
}
