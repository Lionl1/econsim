// Exchange rates. Each country has a log rate vs USD, e (up = depreciation), and a real rate q.
// Regimes (IMF AREAER, simplified): float; peg (can break); union (shared rate, the euro area is one economy);
// dollarized (uses another currency, follows its anchor); anchor (the US dollar itself).
// The floating real rate is pulled to an equilibrium q*: real rate gap with the US (UIP), risk premium
// (stability, sanctions, war, default), oil for exporters, scenario shocks; noise from the rate history (World Bank).
// Feedbacks: pass-through to prices, and real depreciation -> net exports (minus dollar-debt effects for EMs).
import { P } from './params.js';
import { gauss } from './rng.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function initFx(sim) {
  const W = sim.world;
  sim.usa = W.idx.get('USA');
  sim.eur = { q: 0, e: 0, P: 0, members: W.countries.filter(c => c.currency.regime === 'union' && c.currency.anchor === 'EUR').map(c => c.i) };
  for (const s of sim.S) {
    const c = W.countries[s.i];
    s.regime = c.currency.regime;
    s.e = 0; s.q = 0; s.qShock = 0; s.Plog = 0; s.fxPL = 0; s.fxPLslow = 0;
    s.rr0 = s.r - s.infl;
  }
}

const anchorE = (sim, code) => code === 'USD' ? 0 : code === 'EUR' ? sim.eur.e
  : code === 'AUD' ? sim.S[sim.world.idx.get('AUS')].e : code === 'CHF' ? sim.S[sim.world.idx.get('CHE')].e : 0;

// equilibrium real rate "as if the currency were floating"
function qStar(sim, s, c) {
  const us = sim.S[sim.usa];
  const rrDiff = (s.r - s.infl - s.rr0) - (us.r - us.infl - us.rr0);
  return -P.fxRate * rrDiff / 100
    + P.fxRisk * (Math.max(0, s.stab0 - s.stab) + 0.3 * s.sanctionPressure + 0.15 * Math.min(1, s.warCount) + (s.defaultT > 0 ? 0.3 : 0))
    - P.fxOil * (c.fuelExp / 100) * Math.log(sim.oil)
    + s.mods.fx / 100;
}

export function stepFx(sim) {
  const W = sim.world, S = sim.S, t = sim.t, us = S[sim.usa];
  for (const s of S) s.Plog += s.infl / 1200;
  // euro area: GDP-weighted aggregate of members
  const ez = sim.eur;
  if (ez.members.length) {
    let w = 0, rr = 0, infl = 0, risk = 0, sh = 0;
    for (const i of ez.members) { const s = S[i]; w += s.gdp; rr += s.gdp * (s.r - s.infl - s.rr0); infl += s.gdp * s.infl; risk += s.gdp * Math.max(0, s.stab0 - s.stab); sh += s.gdp * s.mods.fx; }
    ez.P += infl / w / 1200;
    const qs = -P.fxRate * (rr / w - (us.r - us.infl - us.rr0)) / 100 + P.fxRisk * risk / w + sh / w / 100;
    ez.q += P.fxAdj * (qs - ez.q) + P.fxNoise * 0.063 / Math.sqrt(12) * gauss(sim.seed, 9997, t, 3);
    ez.e = ez.q + ez.P - us.Plog;
  }
  for (const s of S) {
    const c = W.countries[s.i], cur = c.currency;
    if (s.regime === 'anchor') { s.e = 0; s.q = 0; }
    else if (s.regime === 'union') { s.e = ez.e; s.q = s.e - (s.Plog - us.Plog); }
    else if (s.regime === 'dollarized') { s.e = anchorE(sim, cur.anchor); s.q = s.e - (s.Plog - us.Plog); }
    else if (s.regime === 'peg') {
      s.e = anchorE(sim, cur.anchor);
      s.q = s.e - (s.Plog - us.Plog);
      const pressure = qStar(sim, s, c) - s.q;            // >0: the currency is overvalued vs equilibrium
      const p = s.mods.fx > 0 ? 1 : pressure > P.pegBreak ? 0.015 : 0;
      if (p && sim.rnd(s.i, 120) < p) {
        s.regime = 'float';
        sim.log('fx', `💱 Срыв привязки: ${c.nameRu} (${cur.code}) — девальвация`, [s.i], 3);
      }
    } else {
      const sigma = Math.max(0.03, cur.fxVol || 0.1) * 0.8 * P.fxNoise / Math.sqrt(12);
      const qBase = s.q - s.qShock;
      const qs = qStar(sim, s, c) - s.mods.fx / 100;
      const nb = qBase + P.fxAdj * (qs - qBase) + sigma * gauss(sim.seed, s.i, t, 121);
      s.qShock += 0.5 * (s.mods.fx / 100 - s.qShock);      // scenario depreciation passes through quickly
      s.q = clamp(nb + s.qShock, -1.5, 4);
      s.e = s.q + (s.Plog - us.Plog);
    }
    // pass-through uses real moves (q) only: PPP depreciation already reflects the country's own inflation
    const pass = c.income === 'HIC' ? P.fxPassAE : P.fxPassEM;
    s.fxPL += 0.15 * (pass * s.q * 100 - s.fxPL);
    s.fxPLslow += (s.fxPL - s.fxPLslow) / 12;
  }
}

// FX contribution to the GDP level (%): real depreciation -> exports, minus dollar-debt effects for EMs
export function fxLevel(s, c) {
  const k = P.fxTrade * (c.exports / 100) - (c.income === 'HIC' ? 0 : P.fxBalance * 0.3);
  return clamp(k * s.q, -15, 15);
}
