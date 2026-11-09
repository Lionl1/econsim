// Ensemble from the command line:  node scripts/ensemble.mjs <preset-id | "event text (Russian)"> [seeds] [months]
import fs from 'node:fs';
import { loadWorld } from './load.mjs';
import { runEnsemble } from '../src/sim/ensemble.js';
import { PRESETS } from '../src/sim/scenarios.js';
import { parseEvent } from '../src/sim/nlp.js';
import { buildTargets } from '../src/ui/targets.js';
const world = loadWorld();
const [arg = 'oil-shock', seeds = 20, months = 60] = process.argv.slice(2);
const preset = PRESETS.find(p => p.id === arg);
let scenarios;
if (preset) scenarios = [{ def: preset, delay: 0 }];
else {
  const T = buildTargets(world);
  const r = parseEvent(arg, world, sel => T.label(sel));
  if (!r.ok) { console.error(r.notes.join('\n')); process.exit(1); }
  scenarios = r.parts.map(p => ({ def: p, delay: p.delay }));
}
const t0 = Date.now();
const r = runEnsemble(world, scenarios, { seeds: +seeds, months: +months, params: !process.env.NOPARAMS, magnitude: !process.env.NOPARAMS });
const f = (x, d = 2) => (x > 0 ? '+' : '') + x.toFixed(d);
const rng = o => `${f(o.p50)} [${f(o.p10)} … ${f(o.p90)}]`;
console.log(`${scenarios.map(s => s.def.title).join(' + ')} — ${seeds} runs x ${months} months (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log(`World GDP at the end, %:   ${rng(r.end.gdp)}   below baseline in ${(r.end.gdp.neg * 100).toFixed(0)}% of runs`);
console.log(`World GDP, trough, %:      ${rng(r.peak.gdp)}`);
console.log(`Inflation, peak, pp:       ${rng(r.peak.infl)}`);
console.log(`Unemployment, peak, pp:    ${rng(r.peak.unemp)}`);
console.log(`World stocks, %: ${rng(r.end.eq)}   Bitcoin, %: ${rng(r.end.btc)}   World trade, %: ${rng(r.end.trade)}`);
console.log(`Baseline world growth by year (median [10...90]) vs IMF WEO: ${r.baseline.years.map((y, k) => `${y}: ${r.baseline.growth.p50[k].toFixed(1)} [${r.baseline.growth.p10[k].toFixed(1)}…${r.baseline.growth.p90[k].toFixed(1)}] / ${r.baseline.imf[k] ?? '—'}`).join('; ')}`);
console.log(`New wars beyond baseline:  ${f(r.wars.newWarsMedian, 0)}, more wars than baseline in ${(r.wars.pMore * 100).toFixed(0)}% of runs`);
const big = r.countries.filter(c => world.countries[c.i].gdp > 5e9).sort((a, b) => a.p50 - b.p50);
const row = c => `  ${world.countries[c.i].name.padEnd(28)} ${rng(c)}  (below baseline in ${(c.neg * 100).toFixed(0)}%)`;
console.log('Biggest losers:\n' + big.slice(0, 6).map(row).join('\n'));
console.log('Biggest winners:\n' + big.slice(-4).reverse().map(row).join('\n'));
