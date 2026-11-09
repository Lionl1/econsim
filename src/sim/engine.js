// Simulation core: monthly step. Country macro + citizen agents + government agents + wars/sanctions/tariffs
// + trade, exchange rates, stock markets, crypto and corporations (separate modules).
import { hash, gauss } from './rng.js';
import { resolve } from './world.js';
import { DEFENSE_BLOCS, BLOCS } from './blocs.js';
import { initCitizens, updateCitizens } from './citizens.js';
import { decide } from './decisions.js';
import { initTrade, stepTrade } from './trade.js';
import { initFx, stepFx, fxLevel } from './fx.js';
import { initCrypto, stepCrypto } from './crypto.js';
import { initEquity, stepEquity, equityGrowth, worldEquity } from './equity.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const HIST = 900;
import { P } from './params.js';
export { P };

export class Sim {
  constructor(world, { seed = 1 } = {}) {
    this.world = world; this.seed = seed;
    this.reset();
  }

  reset() {
    const W = this.world, N = W.N;
    this.t = 0;
    this.startYear = W.startYear ?? 2026;
    this.oil = 1; this.cyc = 0; this.oilShock = 0;
    this.T = new Float32Array(N * N);          // tariffs: T[i*N+j], the extra duty i charges on goods from j (%)
    this.San = new Uint8Array(N * N);          // sanctions: San[i*N+j] = 1 when i sanctions j
    this.warMat = new Uint8Array(N * N);       // 1 when the countries are at war with each other
    this.R = Float32Array.from(W.base);        // dynamic relations
    this.aid = new Float32Array(N * N);        // decaying "memory" of aid
    this.wars = []; this.truce = new Map(); this.peace = [];
    this.agentWars = 0;                        // wars declared by agents (not scenarios)
    // tariffs/sanctions set by scenarios: k -> { base, claims: Map(scId -> value) }; agents leave them alone while claims exist
    this.lockedSan = new Map(); this.lockedT = new Map();
    this.events = []; this.eventSeq = 0;
    this.scenarios = []; this.scSeq = 0;
    this.wh = { gdp: [], g: [], infl: [], oil: [], wars: [], stab: [], unemp: [] };
    this.prevG = new Float32Array(N);
    this.S = W.countries.map(c => this.initCountry(c));
    this.S.forEach((s, i) => { this.prevG[i] = s.g; });
    initFx(this); initCrypto(this); initTrade(this); initEquity(this);
    this.wh.btc = []; this.wh.eq = []; this.wh.trade = []; this.wh.gdpUsd = [];
    this.aggregate();
    this.recordHistory();
  }

  rnd(i, slot, t = this.t) { return hash(this.seed, i, t, slot); }
  gs(i, slot, t = this.t) { return gauss(this.seed, i, t, slot); }

  initCountry(c) {
    const i = c.i;
    const gpot = c.trend ?? clamp(0.4 * c.growth + 0.6 * (4.6 - 0.36 * Math.log(Math.max(c.gdpPc, 300) / 1000)), -0.5, 7);
    const infl = clamp(c.infl, -2, 60);
    const anchor = c.inflTrend != null ? clamp(c.inflTrend, 1, 25) : clamp(infl * P.anchorK, 1.5, 18);
    const debt = clamp(c.debt, 3, 300);
    const stab0 = clamp(0.52 + 0.2 * c.wgiPV + 0.05 * c.wgiGE, 0.08, 0.97);
    const rrN = clamp(0.5 + 0.5 * gpot, 0.5, 4);                  // neutral real rate
    const r0 = clamp(rrN + anchor + 1.5 * (infl - anchor), 0, 60);
    const unemp = clamp(c.unemp, 0.5, 40);
    const hawk = clamp(0.2 + 0.05 * c.mil + 0.3 * (1 - c.dem) + 0.25 * (hash(this.seed, i, 7777, 1) - 0.5) + (c.nuclear ? 0.05 : 0), 0.02, 0.98);
    const s = {
      i, gdp: c.gdp, gdp0: c.gdp, pop: c.pop, pop0: c.pop, gpot, gc: clamp(c.growth, -4, 9), g: clamp(c.growth, -4, 9),
      infl0: infl, infl, inflCore: infl, inflPL: 0, tarPL: 0, tarPLslow: 0, anchor, dLevel: 0, defaultT: 0, unemp0: unemp, unemp, uN: unemp,
      debt, debt0: debt, deficit0: debt * (gpot + anchor) / 100,
      stab0, stab: stab0, sent: 0.5, sentBase: clamp(0.38 + 0.4 * stab0 + 0.06 * c.dem, 0.35, 0.85), protest: 0,
      misery0: Math.min(infl, 60) + unemp,
      f: 0, r: r0, r0, rrN, mil0: clamp(c.mil, 0.2, 15), mil: clamp(c.mil, 0.2, 15),
      level: -Math.max(0, 0.3 - stab0) * 40, pulse: 0,   // start at the steady instability level, not 0 (no first-year transient)
      hawk, coop: clamp(0.55 + 0.25 * c.dem - 0.35 * hawk + 0.15 * (hash(this.seed, i, 7777, 2) - 0.5), 0.05, 0.98),
      protect: clamp(0.3 + 0.3 * (1 - Math.min(1, c.openness)) + 0.3 * (hash(this.seed, i, 7777, 3) - 0.5), 0.02, 0.98),
      dem: c.dem, popGrowth: c.popGrowth,
      warCount: 0, sanctionPressure: 0, defaulted: 0, migNet: 0, lastGovChange: 0,
      nextElection: Math.floor(12 + 48 * hash(this.seed, i, 7777, 4)),
      protestFlag: false,
      mods: this.blankMods(),
      hist: { gdp: [], g: [], infl: [], unemp: [], stab: [], sent: [], debt: [], fx: [], eq: [] },
    };
    initCitizens(this, s, c);
    return s;
  }

  blankMods() { return { g: 0, infl: 0, unemp: 0, stab: 0, sent: 0, mil: 0, f: 0, fx: 0 }; }

  // ---------- event log ----------
  log(kind, text, ids = [], sev = 1) {
    this.events.push({ id: ++this.eventSeq, t: this.t, kind, text, ids, sev });
    if (this.events.length > 600) this.events.splice(0, 100);
  }
  nm(i) { return this.world.countries[i].nameRu; }

  // ---------- scenarios ----------
  addScenario(def) {
    const sc = { id: ++this.scSeq, title: def.title || 'Сценарий', desc: def.desc || '', start: def.start ?? this.t, duration: def.duration ?? 12,
      effects: def.effects.map(e => ({ ...e })), started: false, ended: false, saved: [] };
    this.scenarios.push(sc);
    return sc;
  }
  removeScenario(id) {
    const sc = this.scenarios.find(s => s.id === id);
    if (!sc) return;
    if (sc.started && !sc.ended) this.endScenario(sc);
    this.scenarios = this.scenarios.filter(s => s.id !== id);
  }

  targets(e, key) {
    const cacheKey = '_' + key;
    if (!e[cacheKey]) e[cacheKey] = resolve(this.world, e[key] || []);
    return e[cacheKey];
  }
  meanOf(key) {
    this._means ??= {};
    return this._means[key] ??= this.world.countries.reduce((a, c) => a + (c[key] ?? 0), 0) / this.world.N;
  }

  startScenario(sc) {
    sc.started = true;
    this.log('scenario', `▶ Сценарий: ${sc.title}`, [], 3);
    const N = this.world.N;
    for (const e of sc.effects) {
      if (e.kind === 'tariff') {
        for (const a of this.targets(e, 'from')) for (const b of this.targets(e, 'to')) {
          if (a === b) continue;
          this.claim(this.lockedT, this.T, a * N + b, sc.id, e.value);
        }
      } else if (e.kind === 'sanction') {
        for (const a of this.targets(e, 'from')) for (const b of this.targets(e, 'to')) {
          if (a === b) continue;
          this.claim(this.lockedSan, this.San, a * N + b, sc.id, 1);
        }
      } else if (e.kind === 'war') {
        const A = this.targets(e, 'a'), B = this.targets(e, 'b');
        if (A.length && B.length) { const w = this.declareWar(A, B, { forcedEnd: sc.duration > 0 ? sc.start + sc.duration : null, scenario: sc.id, noAllies: e.noAllies }); sc.saved.push(['W', w.id]); }
      } else if (e.kind === 'relation') {
        for (const a of this.targets(e, 'a')) for (const b of this.targets(e, 'b')) {
          if (a === b) continue;
          this.R[a * N + b] = this.R[b * N + a] = clamp(this.R[a * N + b] + e.value, -1, 1);
        }
      } else if (e.kind === 'crypto') {
        this.btcJump = (1 + this.btcJump) * (1 + e.value) - 1;          // one-off bitcoin price jump
        this.log('crypto', `₿ Биткоин ${e.value > 0 ? '+' : ''}${Math.round(e.value * 100)}%`, [], 3);
      } else if (e.kind === 'company' || e.kind === 'relocate') {
        const co = this.corps.find(x => x.name === e.name);
        if (co && e.kind === 'company') co.own = (co.own || 0) + Math.log(Math.max(0.05, 1 + e.value / 100));
        if (co && e.kind === 'relocate') {
          const j = this.world.idx.get(e.to);
          if (j != null) {
            const from = co.prod ? this.world.idx.get(co.prod[0]) : co.hq;
            co.relocated = j; this.S[j].fdi += clamp(co.mcap / this.S[j].gdp * 0.08, 0.1, 1.5);
            if (from != null && from !== co.hq) this.S[from].fdi -= clamp(co.mcap / this.S[from].gdp * 0.04, 0.05, 0.8);
            this.log('corp', `🏭 ${co.name} переносит производство: ${this.nm(from ?? co.hq)} → ${this.nm(j)}`, [from ?? co.hq, j], 3);
          }
        }
      } else if (e.kind === 'sector') {
        this.sectorJump[e.sector] = (1 + (this.sectorJump[e.sector] || 0)) * (1 + e.value / 100) - 1;
      } else if (e.kind === 'peace') {
        // peace deal within a group: wars between members end, mutual sanctions and tariffs
        // (not set by other scenarios) are lifted; members do not fight each other while it lasts
        const set = new Set(this.targets(e, 'a'));
        for (const w of [...this.wars]) if (w.a.some(i => set.has(i)) && w.b.some(i => set.has(i))) this.endWar(w, 'мирное соглашение');
        for (const a of set) for (const b of set) {
          if (a === b) continue;
          const k = a * N + b;
          if (!this.lockedSan.has(k)) this.San[k] = 0;
          if (!this.lockedT.has(k)) this.T[k] = 0;
          this.R[k] = clamp(this.R[k] + 0.3, -1, 1);
        }
      }
    }
  }
  endScenario(sc) {
    sc.ended = true;
    for (const rec of sc.saved) {
      if (rec[0] === 'W') { const w = this.wars.find(x => x.id === rec[1]); if (w) this.endWar(w, 'сценарий завершён'); }
    }
    this.release(this.lockedT, this.T, sc.id);
    this.release(this.lockedSan, this.San, sc.id);
    this.log('scenario', `■ Сценарий завершён: ${sc.title}`, [], 2);
  }
  // several scenarios may set the same tariff/sanction: the maximum of active claims applies,
  // and the original value returns only when the last one ends
  claim(locks, arr, k, id, v) {
    let L = locks.get(k);
    if (!L) locks.set(k, L = { base: arr[k], claims: new Map() });
    L.claims.set(id, v);
    arr[k] = Math.max(L.base, ...L.claims.values());
  }
  release(locks, arr, id) {
    for (const [k, L] of locks) {
      if (!L.claims.delete(id)) continue;
      if (L.claims.size) arr[k] = Math.max(L.base, ...L.claims.values());
      else { arr[k] = L.base; locks.delete(k); }
    }
  }

  applyScenarios() {
    for (const s of this.S) s.mods = this.blankMods(), s.pulse = 0, s.cryptoBan = 0;
    this.oilShock = 0;
    this.peace = [];   // country groups under an active peace deal (filled below)
    for (const sc of this.scenarios) {
      // duration 0 = open-ended: shocks last until removed, one-off amounts (level/pop/debt) apply in 1 month
      const t0 = sc.start, dur = Math.max(sc.duration, 1), t1 = sc.duration > 0 ? t0 + dur : Infinity;
      const once = sc.duration > 0 ? dur : 1, onceActive = this.t < t0 + once;
      if (this.t >= t0 && !sc.started) this.startScenario(sc);
      if (this.t >= t0 && this.t < t1) {
        for (const e of sc.effects) {
          // optional window inside the scenario: active from month `at` for `len` months (phases like crash -> rebound)
          if (e.at != null && (this.t < t0 + e.at || this.t >= t0 + e.at + (e.len ?? dur))) continue;
          if (e.kind === 'oil') this.oilShock += e.value;
          if (e.kind !== 'shock') continue;
          const idxs = this.targets(e, 'targets');
          const mean = e.scale && e.scale !== 'none' ? this.meanOf(e.scale) : 1;
          // one-off amounts (level/pop/debt) are spread over the effect's own window if it has one, else over the scenario
          const spread = e.at != null ? (e.len ?? dur) : once, spreadOn = e.at != null || onceActive;
          for (const i of idxs) {
            const s = this.S[i], c = this.world.countries[i];
            const k = e.scale && e.scale !== 'none' ? clamp((c[e.scale] ?? mean) / mean, 0.2, 3) : 1;
            const v = e.value * k;
            switch (e.var) {
              case 'growth': s.mods.g += v; break;
              case 'infl': s.mods.infl += v; break;
              case 'unemp': s.mods.unemp += v; break;
              case 'stab': s.mods.stab += v; break;
              case 'sent': s.mods.sent += v; break;
              case 'mil': s.mods.mil += v; break;
              case 'fiscal': s.mods.f += v; break;
              case 'level': if (spreadOn) s.pulse += v / spread; break;       // % of GDP over the whole duration
              case 'pop': if (spreadOn) s.pop *= 1 + v / spread / 100; break;
              case 'debt': if (spreadOn) s.debt += v / spread; break;
              case 'fx': s.mods.fx += v; break;                               // % depreciation vs USD (while active)
              case 'equity': if (this.t === t0) s.eqJump = (1 + s.eqJump) * (1 + v / 100) - 1; break;   // one-off market crash/rally, %
              case 'cryptoBan': s.cryptoBan = 1; break;
            }
          }
        }
      }
      if (this.t >= t1 && sc.started && !sc.ended && sc.duration > 0) this.endScenario(sc);
      if (sc.started && !sc.ended) for (const e of sc.effects) if (e.kind === 'peace') this.peace.push(new Set(this.targets(e, 'a')));
    }
  }

  isPeace(i, j) { return this.peace.length > 0 && this.peace.some(S => S.has(i) && S.has(j)); }

  // ---------- wars ----------
  milPower(i) {
    const s = this.S[i];
    return Math.pow(Math.max(1, s.gdp * s.mil / 100), 0.9) * (0.6 + 0.8 * s.stab);
  }
  sidePower(list) { return list.reduce((a, i) => a + this.milPower(i), 0); }

  declareWar(A, B, opts = {}) {
    const N = this.world.N;
    const w = { id: ++this.eventSeq + 100000, a: [...A], b: [...B], start: this.t, intensity: 0.5 + 0.4 * this.rnd(A[0], 91),
      forcedEnd: opts.forcedEnd ?? null, scenario: opts.scenario ?? null, primaryA: A[0], primaryB: B[0] };
    if (opts.scenario == null) this.agentWars++;
    if (!opts.noAllies) this.recruitAllies(w);
    this.wars.push(w);
    this.rebuildWarMat();
    this.log('war', `⚔ Война: ${w.a.map(i => this.nm(i)).join(', ')} ⟷ ${w.b.map(i => this.nm(i)).join(', ')}`, [...w.a, ...w.b], 5);
    for (const a of w.a) for (const b of w.b) this.R[a * N + b] = this.R[b * N + a] = clamp(this.R[a * N + b] - 0.4, -1, 1);
    return w;
  }

  recruitAllies(w) {
    const W = this.world, N = W.N;
    const atk = w.primaryA, vic = w.primaryB;
    const inWar = new Set([...w.a, ...w.b]);
    const cand = new Set();
    // defending the victim: defense blocs and bilateral alliances
    for (const b of DEFENSE_BLOCS) {
      if (W.countries[vic].blocs.includes(b) && !W.countries[atk].blocs.includes(b))
        BLOCS[b].forEach(iso => { const k = W.idx.get(iso); if (k != null) cand.add(k); });
    }
    W.allies[vic].forEach(k => cand.add(k));
    for (const k of cand) {
      if (inWar.has(k) || W.allies[atk].has(k) || W.countries[k].blocs.some(b => DEFENSE_BLOCS.includes(b) && W.countries[atk].blocs.includes(b))) continue;
      const bilateral = W.allies[vic].has(k);
      const p = (bilateral ? 0.55 : 0.4) + 0.3 * this.R[k * N + vic] - 0.3 * this.R[k * N + atk];
      if (this.rnd(k, 200 + w.id % 97) < p * (0.4 + 0.6 * this.S[k].hawk + 0.3 * (this.S[k].mil > 1.5 ? 1 : 0))) {
        w.b.push(k); inWar.add(k);
        this.log('join', `🛡 ${this.nm(k)} вступает в войну на стороне: ${this.nm(vic)}`, [k, vic], 4);
      }
    }
    for (const k of W.allies[atk]) {
      if (inWar.has(k)) continue;
      if (this.rnd(k, 300 + w.id % 97) < 0.3 + 0.2 * this.S[k].hawk) {
        w.a.push(k); inWar.add(k);
        this.log('join', `🛡 ${this.nm(k)} вступает в войну на стороне: ${this.nm(atk)}`, [k, atk], 4);
      }
    }
  }

  rebuildWarMat() {
    const N = this.world.N;
    this.warMat.fill(0);
    this.S.forEach(s => (s.warCount = 0));
    for (const w of this.wars) {
      for (const a of w.a) { this.S[a].warCount++; for (const b of w.b) this.warMat[a * N + b] = this.warMat[b * N + a] = 1; }
      for (const b of w.b) this.S[b].warCount++;
    }
  }

  endWar(w, reason) {
    this.wars = this.wars.filter(x => x !== w);
    this.rebuildWarMat();
    const N = this.world.N;
    for (const a of w.a) for (const b of w.b) {
      this.truce.set(a * N + b, this.t + 48); this.truce.set(b * N + a, this.t + 48);
      this.R[a * N + b] = this.R[b * N + a] = Math.min(this.R[a * N + b] + 0.15, -0.1);
    }
    this.log('peace', `🕊 Перемирие (${reason}): ${w.a.map(i => this.nm(i)).join(', ')} / ${w.b.map(i => this.nm(i)).join(', ')} — ${this.t - w.start} мес.`, [...w.a, ...w.b], 4);
  }

  stepWars() {
    for (const w of [...this.wars]) {
      const PA = this.sidePower(w.a), PB = this.sidePower(w.b);
      const shareA = PA / (PA + PB);
      const dmg = (i, share, primary) => {
        const s = this.S[i];
        const d = w.intensity * 0.45 * share * 2 * (primary ? 1 : 0.3);   // % of GDP per month
        s.pulse -= d; s.mods.infl += 0.35 * d; s.mods.sent -= 0.01 * d;
        s.pop *= 1 - d * 0.00015;
      };
      w.a.forEach(i => dmg(i, 1 - shareA, i === w.primaryA));
      w.b.forEach(i => dmg(i, shareA, i === w.primaryB));
      const dur = this.t - w.start;
      const weak = Math.min(this.S[w.primaryA].stab, this.S[w.primaryB].stab) < 0.15;
      const lopsided = Math.max(shareA, 1 - shareA) > 0.88 && dur > 6;
      const nuc = w.a.some(i => this.world.countries[i].nuclear) && w.b.some(i => this.world.countries[i].nuclear);
      const p = 0.012 + 0.0007 * dur + (weak ? 0.05 : 0) + (lopsided ? 0.04 : 0) + (nuc ? 0.05 : 0);
      if (w.forcedEnd != null) { if (this.t >= w.forcedEnd) this.endWar(w, 'срок истёк'); }
      else if (this.rnd(w.primaryA, 400 + w.id % 97) < p) this.endWar(w, lopsided ? 'победа одной стороны' : 'истощение сторон');
    }
  }

  // ---------- main step ----------
  step() {
    const W = this.world, N = W.N, S = this.S, t = this.t;
    this.applyScenarios();
    this.stepWars();

    // oil
    let wg = 0, wgpot = 0, gw = 0, oilTot = 0, oilHit = 0;
    for (const s of S) { const c = W.countries[s.i]; wg += this.prevG[s.i] * s.gdp; wgpot += s.gpot * s.gdp; gw += s.gdp; oilTot += c.fuelExp / 100 * s.gdp; oilHit += c.fuelExp / 100 * s.gdp * (0.5 * Math.min(1, s.warCount) + 0.6 * s.sanctionPressure); }
    const gap = (wg - wgpot) / gw;
    const oilTarget = 1 + 0.12 * gap + this.oilShock + 1.2 * (oilHit / Math.max(1, oilTot));
    this.oil = clamp(this.oil + 0.15 * (oilTarget - this.oil) + 0.012 * gauss(this.seed, 9999, t, 1), 0.3, 4.5);
    this.cyc = P.cycPers * this.cyc + P.cycNoise * gauss(this.seed, 9998, t, 2);
    const p = this.oil;

    stepTrade(this);
    const year = this.startYear + Math.floor(t / 12);

    // country macro update
    const newG = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const s = S[i], c = W.countries[i], m = s.mods;
      // the IMF WEO forecast sets the baseline path: potential growth, inflation anchor, natural unemployment
      const fc = c.forecast;
      if (fc) {
        const fy = Math.min(year, 2031);   // before 2026 there is no forecast: see the convergence rule below
        if (fc.growth?.[fy] != null) s.gpot = clamp(fc.growth[fy], -8, 12);
        if (fc.infl?.[fy] != null) s.anchor += 0.05 * (clamp(fc.infl[fy], 0.5, 80) - s.anchor);
        if (fc.unemp?.[fy] != null) s.uN += 0.05 * (clamp(fc.unemp[fy], 0.5, 40) - s.uN);
      }
      // historical years: the inflation anchor drifts to modern targets over ~3 years (the 1995–2015 move to inflation targeting)
      if (c.inflTrend != null && year < 2026) s.anchor += ((c.income === 'HIC' ? 2 : 3.5) - s.anchor) / 36;
      // historical years: pre-start trend minus beta-convergence (~2 pp per log point of income growth since the start)
      if (c.trend != null && year < 2026 && t % 12 === 0) s.gpot = Math.max(-1, c.trend - 2 * Math.log((s.gdp / s.pop) / (s.gdp0 / s.pop0)));
      let foreignG = 0, foreignBase = 0, sanc = 0;
      for (const j of W.partners[i]) {
        const w = W.xs[i * N + j];                                   // partner demand weighted by the actual export structure
        foreignG += w * this.prevG[j]; foreignBase += w * S[j].gpot;
        sanc += W.share[i * N + j] * this.San[j * N + i];
      }
      s.sanctionPressure = Math.min(1, sanc * 2.5);
      if (s.defaultT > 0) s.defaultT--;
      // level effects: trade (exports vs counterfactual, tariff costs), instability, real exchange rate
      const levelT = P.tradeKappa * c.exports * (s.expIdx - 1) - P.tariffCost * c.imports * s.tauImp
        - Math.max(0, 0.3 - s.stab) * 40 + fxLevel(s, c);
      const prevLevel = s.level;
      s.level += 0.08 * (levelT - s.level);
      const dLevel = s.level - prevLevel + s.pulse;                   // % per month
      s.dLevel = dLevel;
      // exogenous drivers
      const e = clamp(c.energyImp / 100, -1, 1);
      const oilEff = -1.8 * (p - 1) * e;
      const spill = 0.35 * c.openness * (foreignG - foreignBase);
      const fEff = s.f + m.f;
      const milExtra = s.mil - s.mil0;
      const tight = s.r - (s.rrN + s.infl);   // real policy rate minus the neutral real rate (>0 = restrictive)
      const target = s.gpot + P.fiscalMult * fEff + equityGrowth(this, s) + 2 * s.crypto * clamp(this.btcMom || 0, -1, 1) + 0.1 * milExtra - 0.25 * tight + spill + oilEff + m.g + P.cycAmp * this.cyc * c.openness
        + P.gNoise * (c.income === 'LIC' ? P.volLIC : c.income === 'HIC' ? P.volHIC : 1) * this.gs(i, 1);
      s.gc += P.gAdj * (target - s.gc);
      s.g = s.gc + 12 * dLevel;
      newG[i] = s.g;
      s.gdp *= 1 + s.gc / 1200 + dLevel / 100;
      s.pop *= 1 + s.popGrowth / 1200;

      // inflation = core + one-off price-level shifts (tariffs, exchange rate) that stay in annual inflation for ~a year
      const oilInfl = P.oilInfl * (p - 1) * Math.max(e, 0);
      const inflT = s.anchor + 0.25 * (s.gc - s.gpot) + 0.35 * fEff + oilInfl - 0.3 * tight + m.infl;
      // noise is a separate AR(1) component, multiplicative around (core + 3): inflation is right-skewed in the data,
      // deep deflation is rare, and low-inflation countries swing less than high-inflation ones
      s.inflCore = clamp(s.inflCore + P.inflAdj * (inflT - s.inflCore), -2, 150);
      s.inflN = (1 - P.inflAdj) * (s.inflN || 0) + P.inflNoise * this.gs(i, 2);
      // centered: exp(n - var/2) has mean 1, so the noise does not lift average inflation
      const nVar = P.inflNoise ** 2 / (1 - (1 - P.inflAdj) ** 2);
      const inflNoisy = (Math.max(s.inflCore, -2) + 3) * Math.exp(s.inflN - nVar / 2) - 3;
      s.tarPL += 0.15 * (P.tariffPass * c.imports * s.tauImp - s.tarPL);
      s.tarPLslow += (s.tarPL - s.tarPLslow) / 12;
      s.inflPL = (s.tarPL - s.tarPLslow) + (s.fxPL - s.fxPLslow);
      s.infl = clamp(inflNoisy + s.inflPL, -3, 300);
      m.sent += 0.15 * s.crypto * clamp(this.btcMom || 0, -1.5, 1.5);

      // unemployment (Okun's law)
      s.unemp = clamp(s.unemp + (-P.okun * (s.gc - s.gpot) / 12) + 0.08 * (s.uN + m.unemp - s.unemp), 0.4, 50);

      // public debt
      const deficit = s.deficit0 + fEff + (s.mil - s.mil0) + s.debt / 100 * Math.max(-3, s.r - s.r0);
      s.debt = clamp(s.debt + (deficit - s.debt * (s.g + s.infl) / 100) / 12, 0, 400);
      if (s.debt > 120 + 60 * c.ge && s.r - s.r0 > 2 && this.rnd(i, 3) < 0.01 * (s.debt / 150)) this.sovereignDefault(i);

      // stability
      const misery = Math.min(s.infl, 60) + s.unemp;
      const stabT = clamp(s.stab0 - 0.008 * clamp(misery - s.misery0, -10, 80) - 0.12 * Math.min(1, s.warCount) - 0.3 * s.sanctionPressure * 0.4
        - 0.5 * Math.max(0, s.protest - 0.1) + m.stab, 0.01, 0.99);
      s.stab += 0.10 * (stabT - s.stab);
    }
    this.prevG = newG;
    stepFx(this); stepCrypto(this); stepEquity(this);

    // citizens, politics, government decisions
    for (let i = 0; i < N; i++) updateCitizens(this, S[i], W.countries[i]);
    for (let i = 0; i < N; i++) decide(this, i);

    // relations
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const k = i * N + j;
      const ties = Math.min(0.3, W.share[k] * 3 + W.share[j * N + i] * 3);
      const tar = W.base[k] + ties + (this.isPeace(i, j) ? 0.4 : 0) - 0.9 * this.warMat[k] - 0.35 * (this.San[k] | this.San[j * N + i]) - 0.004 * (this.T[k] + this.T[j * N + i]) + this.aid[k] + this.aid[j * N + i];
      const v = clamp(this.R[k] + 0.04 * (clamp(tar, -1, 1) - this.R[k]), -1, 1);
      this.R[k] = this.R[j * N + i] = v;
      this.aid[k] *= 0.95; this.aid[j * N + i] *= 0.95;
    }
    for (const [key, until] of this.truce) if (until <= t) this.truce.delete(key);

    this.t++;
    this.aggregate();
    this.recordHistory();
  }

  sovereignDefault(i) {
    const s = this.S[i];
    s.debt *= 0.65; s.gdp *= 0.94; s.inflCore += 8; s.stab = Math.max(0.05, s.stab - 0.2); s.defaulted++;
    s.defaultT = 24; s.eqJump = (1 + s.eqJump) * 0.7 - 1;
    this.log('default', `💥 Суверенный дефолт: ${this.nm(i)}`, [i], 4);
  }

  aggregate() {
    let gdp = 0, g = 0, infl = 0, stab = 0, unemp = 0, pop = 0, gdpUsd = 0, crypto = 0;
    for (const s of this.S) {
      gdp += s.gdp; g += s.g * s.gdp; infl += s.infl * s.gdp; stab += s.stab * s.pop; unemp += s.unemp * s.pop; pop += s.pop;
      gdpUsd += s.gdp * Math.exp((s.Plog || 0) - (s.e || 0)); crypto += (s.crypto || 0) * s.pop;
    }
    this.agg = { gdp, g: g / gdp, infl: infl / gdp, stab: stab / pop, unemp: unemp / pop, pop, wars: this.wars.length, oil: this.oil,
      gdpUsd, crypto: crypto / pop, btc: this.btc, eq: this.corps ? worldEquity(this) : 0, trade: this.worldTrade ?? 1 };
  }

  recordHistory() {
    const a = this.agg, wh = this.wh;
    wh.gdp.push(a.gdp); wh.g.push(a.g); wh.infl.push(a.infl); wh.oil.push(this.oil); wh.wars.push(a.wars); wh.stab.push(a.stab); wh.unemp.push(a.unemp);
    wh.btc?.push(a.btc); wh.eq?.push(a.eq); wh.trade?.push(a.trade); wh.gdpUsd?.push(a.gdpUsd);
    for (const s of this.S) {
      const h = s.hist;
      h.gdp.push(s.gdp); h.g.push(s.g); h.infl.push(s.infl); h.unemp.push(s.unemp); h.stab.push(s.stab); h.sent.push(s.sent); h.debt.push(s.debt);
      h.fx.push(((Math.exp(s.e || 0)) - 1) * 100); h.eq.push((Math.exp(s.eq || 0) - 1) * 100);
      if (h.gdp.length > HIST) for (const k in h) h[k].shift();
    }
    for (const k in wh) if (wh[k].length > HIST) wh[k].shift();
  }

  date() {
    const m = this.t % 12, y = this.startYear + Math.floor(this.t / 12);
    return ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][m] + ' ' + y;
  }

  // metric value for map coloring and tables
  metric(i, key, base) {
    const s = this.S[i];
    switch (key) {
      case 'g': return s.g;
      case 'gdp': return s.gdp;
      case 'gdpPc': return s.gdp / s.pop;
      case 'infl': return s.infl;
      case 'unemp': return s.unemp;
      case 'debt': return s.debt;
      case 'stab': return s.stab;
      case 'sent': return s.sent;
      case 'mil': return s.mil;
      case 'protest': return s.protest;
      case 'dGdp': return base ? (s.gdp / base.S[i].gdp - 1) * 100 : 0;
      case 'dStab': return base ? (s.stab - base.S[i].stab) * 100 : 0;
      case 'dUnemp': return base ? s.unemp - base.S[i].unemp : 0;
      case 'dInfl': return base ? s.infl - base.S[i].infl : 0;
      case 'fx': return (Math.exp(s.e) - 1) * 100;                         // change vs USD since start, % (+ = depreciation)
      case 'eq': return (Math.exp(s.eq) - 1) * 100;                        // stock index in local currency, % since start
      case 'expIdx': return (s.expIdx - 1) * 100;                          // exports vs a no-barrier counterfactual, %
      case 'crypto': return s.crypto * 100;
      case 'gdpUsd': return s.gdp * Math.exp(s.Plog - s.e);
      case 'dFx': return base ? (Math.exp(s.e - base.S[i].e) - 1) * 100 : 0;
      case 'dEq': return base ? (Math.exp(s.eq - base.S[i].eq) - 1) * 100 : 0;
    }
    return 0;
  }
}
