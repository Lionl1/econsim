// Smoke tests: npm test
import assert from 'node:assert/strict';
import { loadWorld } from './load.mjs';
import { Sim } from '../src/sim/engine.js';
import { PRESETS } from '../src/sim/scenarios.js';
import { parseEvent } from '../src/sim/nlp.js';
import { runEnsemble } from '../src/sim/ensemble.js';

const world = loadWorld(), N = world.N, I = iso => world.idx.get(iso);
let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok  ', name); }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; }
};
const finite = (sim, label) => {
  for (const [k, v] of Object.entries(sim.agg)) assert.ok(Number.isFinite(v), `${label}: agg.${k} = ${v}`);
  for (const s of sim.S) for (const k of ['gdp', 'g', 'infl', 'unemp', 'debt', 'stab', 'e', 'eq', 'crypto'])
    assert.ok(Number.isFinite(s[k]), `${label}: ${world.countries[s.i].iso3}.${k} = ${s[k]}`);
};

console.log('world');
test('197 countries with currencies', () => {
  assert.equal(N, 197);
  assert.ok(world.countries.every(c => c.currency?.code));
});

console.log('engine');
test('same seed gives the same world', () => {
  const a = new Sim(world, { seed: 7 }), b = new Sim(world, { seed: 7 });
  for (let m = 0; m < 24; m++) { a.step(); b.step(); }
  assert.equal(a.agg.gdp, b.agg.gdp);
  assert.equal(a.btc, b.btc);
});
test('baseline run stays finite for 10 years', () => {
  const s = new Sim(world, { seed: 3 });
  for (let m = 0; m < 120; m++) s.step();
  finite(s, 'baseline');
});
test('every preset runs 24 months without NaN', () => {
  for (const p of PRESETS) {
    const s = new Sim(world, { seed: 1 });
    s.addScenario({ ...p, start: 0 });
    for (let m = 0; m < 24; m++) s.step();
    finite(s, p.id);
  }
});
test('overlapping tariff scenarios keep the higher claim until the last ends', () => {
  const s = new Sim(world, { seed: 1 }), k = I('USA') * N + I('CHN');
  s.addScenario({ title: 'a', duration: 3, start: 0, effects: [{ kind: 'tariff', from: ['iso:USA'], to: ['iso:CHN'], value: 40 }] });
  const b = s.addScenario({ title: 'b', duration: 0, start: 0, effects: [{ kind: 'tariff', from: ['iso:USA'], to: ['iso:CHN'], value: 20 }] });
  for (let m = 0; m < 6; m++) s.step();
  assert.equal(s.T[k], 20);
  s.removeScenario(b.id);
  assert.equal(s.T[k], 0);
});
test('a peace deal ends a war between members', () => {
  const s = new Sim(world, { seed: 1 });
  s.addScenario({ title: 'war', duration: 0, start: 0, effects: [{ kind: 'war', a: ['iso:RUS'], b: ['iso:UKR'], noAllies: true }] });
  s.addScenario({ title: 'peace', duration: 24, start: 3, effects: [{ kind: 'peace', a: ['all'] }] });
  for (let m = 0; m < 6; m++) s.step();
  assert.equal(s.warMat[I('RUS') * N + I('UKR')], 0);
});
test('US-China tariffs divert trade to third countries', () => {
  const base = new Sim(world, { seed: 2 }), s = new Sim(world, { seed: 2 });
  s.addScenario({ title: 'tw', duration: 0, start: 0, effects: [{ kind: 'tariff', from: ['iso:USA'], to: ['iso:CHN'], value: 60 }, { kind: 'tariff', from: ['iso:CHN'], to: ['iso:USA'], value: 60 }] });
  for (let m = 0; m < 36; m++) { base.step(); s.step(); }
  assert.ok(s.S[I('CHN')].expIdx < 0.98, 'China exports fall');
  assert.ok(s.S[I('VNM')].expIdx > 1, 'Vietnam exports gain');
  assert.ok(s.msCur[I('USA') * N + I('CHN')] < world.ms[I('USA') * N + I('CHN')] * 0.6, 'China share in US imports drops');
});

console.log('prompt parser');
const parts = t => { const r = parseEvent(t, world); assert.ok(r.ok, `not parsed: ${t}`); return r.parts; };
const kinds = t => parts(t).flatMap(p => p.effects.map(e => e.kind + (e.var ? ':' + e.var : '')));
test('war with roles by verb position', () => {
  const e = parts('Россия с помощью Ирана нападает на Украину')[0].effects.find(x => x.kind === 'war');
  assert.deepEqual(e.a.sort(), ['iso:IRN', 'iso:RUS']);
  assert.deepEqual(e.b, ['iso:UKR']);
});
test('word boundaries: EU sanctions are not an alliance, a cyberattack is not a war', () => {
  assert.deepEqual(kinds('Евросоюз вводит санкции против России'), ['sanction']);
  assert.ok(!kinds('Кибератака Китая на США').includes('war'));
});
test('several events keep their own timing', () => {
  const p = parts('Китай вторгается на Тайвань через 6 месяцев, нефть +30%');
  assert.equal(p.length, 2);
  assert.equal(p[0].delay, 6);
  assert.equal(p[1].delay, 0);
});
test('markets: currencies, crypto, companies, peace', () => {
  assert.deepEqual(kinds('Рубль упал на 30%'), ['shock:fx']);
  assert.deepEqual(kinds('Крах биткоина'), ['crypto']);
  assert.deepEqual(kinds('Apple переносит производство в Индию'), ['relocate']);
  assert.ok(kinds('все страны объединились').includes('peace'));
  assert.equal(parts('Инфляция в Турции снизится на 10%')[0].effects[0].value, -10);
});
test('declined country names', () => {
  assert.deepEqual(parts('Землетрясение в Южной Корее')[0].effects[0].targets, ['iso:KOR']);
  assert.deepEqual(parts('Санкции против Боснии и Герцеговины')[0].effects[0].to, ['iso:BIH']);
});

console.log('ensemble');
test('small ensemble returns finite bands', () => {
  const r = runEnsemble(world, [{ def: PRESETS.find(p => p.id === 'pandemic'), delay: 0 }], { seeds: 3, months: 12 });
  assert.ok(r.end.gdp.p50 < -1, 'pandemic lowers world GDP');
  for (const k of ['gdp', 'infl', 'eq']) assert.ok(r.bands[k].p50.every(Number.isFinite));
});

console.log(process.exitCode ? '\nsome tests failed' : `\nall ${passed} tests passed`);
