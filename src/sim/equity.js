// Stock markets and large corporations.
// Country index (log): drift = nominal GDP growth (earnings) + premium, minus rising real rates (duration),
// plus a global risk factor (shared by all markets and crypto), an own shock (volatility from annual changes
// of S&P / World Bank indices) and leveraged GDP level shocks (wars, sanctions, crises); valuations revert to fundamentals.
// Wealth effect: unexpected 12-month change x market cap / GDP -> GDP growth.
// Corporations are agents: value = indices of the markets they earn in + sector factor + losses from barriers
// in those markets and in their supply chain; under heavy barriers they move production to friendly hubs.
import { P } from './params.js';
import { gauss } from './rng.js';
import { wedge } from './trade.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const SECTORS = { semis: 'Полупроводники', tech: 'IT и интернет', energy: 'Нефть и газ', finance: 'Финансы', pharma: 'Фарма',
  consumer: 'Потребительский', auto: 'Автопром', industrial: 'Промышленность', defense: 'Оборонка', telecom: 'Телеком' };
const HUBS = ['VNM', 'MEX', 'IND', 'MYS', 'THA', 'POL', 'IDN', 'TUR', 'MAR', 'PHL', 'ROU', 'BRA'];

export function initEquity(sim) {
  const W = sim.world;
  sim.riskShock = 0; sim.btcJump = 0; sim.chipShock = 0;
  sim.sector = Object.fromEntries(Object.keys(SECTORS).map(k => [k, 0]));
  sim.sectorJump = Object.fromEntries(Object.keys(SECTORS).map(k => [k, 0]));
  for (const s of sim.S) {
    const c = W.countries[s.i], eq = c.equity || {};
    s.mcapGdp = clamp((eq.mcapGdp ?? 0) / 100, 0, 3);
    s.eqVol = clamp(eq.vol ?? (c.income === 'HIC' ? 0.18 : 0.28), 0.1, 0.6);
    s.eq = 0; s.eqF = 0; s.eqHist = [0]; s.eq12 = 0; s.rrPrev = s.r - s.anchor; s.eqJump = 0; s.fdi = 0;
  }
  sim.corps = (W.companies || []).map((co, k) => {
    const hq = W.idx.get(co.iso);
    return hq == null ? null : { ...co, k, hq, v: 0, barrier: 0, relocated: null, nextDecide: 6 + (k % 6) };
  }).filter(Boolean);
}

export function stepEquity(sim) {
  const W = sim.world, N = W.N, S = sim.S, t = sim.t;
  // common risk factor (about 15% a year for the world market) with rare tail months
  const tail = gauss(sim.seed, 9995, t, 2) > 2.5 ? -0.06 : 0;
  sim.riskShock = sim.noise * (0.037 * gauss(sim.seed, 9995, t, 1) + tail);
  // sectors
  const dOil = Math.log(sim.oil / (sim.oilPrev || sim.oil)); sim.oilPrev = sim.oil;
  const warShare = S.reduce((a, s) => a + (s.warCount ? s.gdp : 0), 0) / S.reduce((a, s) => a + s.gdp, 0);
  const twn = W.idx.get('TWN');
  sim.chipShock = twn != null && S[twn].warCount ? 1 : 0;                 // a war around Taiwan hits chips
  for (const k in sim.sector) {
    let d = sim.noise * 0.03 * gauss(sim.seed, 9994, t, k.length * 7 + k.charCodeAt(0));
    if (k === 'energy') d += 0.8 * dOil;
    if (k === 'defense') d += 0.02 * warShare;
    if (k === 'semis' && sim.chipShock) d -= 0.1;       // while the war lasts: -10%/month on the sector factor (settles around -1...-2 log)
    if (k === 'tech') d -= sim.chipShock ? 0.015 : 0;
    sim.sector[k] = clamp(sim.sector[k] + d + Math.log(1 + sim.sectorJump[k]) - 0.01 * sim.sector[k], -3, 3);
    sim.sectorJump[k] = 0;
  }
  // country indices
  for (const s of S) {
    const c = W.countries[s.i];
    const beta = c.income === 'HIC' ? 1 : 1.2;
    // the World Bank S&P history is in USD: subtract FX swings (fx.js supplies those) and the common factor
    const fxv = c.currency.regime === 'float' ? (c.currency.fxVol || 0.08) : 0.02;
    const idio = Math.sqrt(Math.max((P.eqIdioK * s.eqVol) ** 2 - fxv ** 2 - (beta * 0.12) ** 2, 0.04 ** 2)) / Math.sqrt(12);
    // real rate on expected inflation (the anchor): an inflation spike must not lift stocks
    const rr = s.r - s.anchor, dRR = rr - s.rrPrev; s.rrPrev = rr;
    // fundamental path: nominal earnings growth (~ nominal GDP) + premium, including GDP level shocks
    const fund = (s.gc + clamp(s.infl, -2, 40)) / 1200 + P.eqPremium - 0.002 + 2.5 * s.dLevel / 100;
    s.eqF += fund;
    // valuations revert to fundamentals (Shiller: deviations fade over several years)
    const r = fund - P.eqDuration * dRR / 100 + beta * sim.riskShock + sim.noise * P.eqNoise * idio * gauss(sim.seed, s.i, t, 130)
      + Math.log(1 + s.eqJump) - P.eqRevert * (s.eq - s.eqF);
    s.eqJump = 0;
    s.eq = clamp(s.eq + clamp(r, -0.6, 0.6), -4, 6);
    s.eqHist.push(s.eq); if (s.eqHist.length > 13) s.eqHist.shift();
    s.eq12 = s.eq - s.eqHist[0] - (s.gc + clamp(s.infl, -2, 40)) / 100;   // unexpected part of the 12-month return
    s.fdi *= 0.96;
  }
  // corporations
  for (const co of sim.corps) {
    const hq = co.hq;
    let foreignRet = 0, pen = 0;
    for (const j of W.partners[hq].slice(0, 15)) {
      const w = W.xs[hq * N + j];
      foreignRet += w * S[j].eq;
      pen += w * Math.min(1, wedge(sim, j, hq) * (co.relocated ? 0.4 : 1));
    }
    // production abroad: barriers between the production country and the home market (tariffs on its own imports)
    const pj = co.relocated ?? (co.prod ? W.idx.get(co.prod[0]) : null);
    const prodPen = pj != null && pj !== hq ? co.prod?.[1] * Math.min(1, wedge(sim, hq, pj)) * (1 - co.foreign * 0.5) : 0;
    co.barrier += 0.1 * (-0.8 * co.foreign * pen - 0.6 * (prodPen || 0) - co.barrier);
    co.own = (co.own || 0) * 0.995;   // one-off company news gradually fades into the market
    co.v = (1 - co.foreign) * S[hq].eq + co.foreign * foreignRet + (sim.sector[co.sector] || 0) + co.barrier + co.own;
    // decision: move production away from barriers
    if (t >= co.nextDecide) {
      co.nextDecide = t + 6;
      if (!co.relocated && co.barrier < -0.05 && ['semis', 'tech', 'auto', 'consumer', 'industrial'].includes(co.sector)) {
        const from = co.prod ? W.idx.get(co.prod[0]) : hq;
        let best = null, bestV = -1e9;
        for (const iso of HUBS) {
          const j = W.idx.get(iso); if (j == null || j === hq || j === from) continue;
          // relations with home, barriers, peace and stability, hub size (GDP, labor force), crowding by earlier moves
          const busy = sim.corps.filter(o => o.relocated === j).length;
          const v = sim.R[hq * N + j] - 2 * wedge(sim, hq, j) - S[j].warCount - (1 - S[j].stab)
            + 0.25 * Math.log(S[j].gdp / 2e11) + 0.15 * Math.log(S[j].pop / 5e7) - 0.25 * busy + 0.3 * sim.rnd(j, 140 + co.k % 7);
          if (v > bestV) { bestV = v; best = j; }
        }
        if (best != null && bestV > -0.6) {
          co.relocated = best;
          S[best].fdi += clamp(co.mcap / S[best].gdp * 0.08, 0.1, 1.5);
          if (from != null && from !== hq) S[from].fdi -= clamp(co.mcap / S[from].gdp * 0.04, 0.05, 0.8);
          sim.log('corp', `🏭 ${co.name} переносит часть производства: ${W.countries[from ?? hq].nameRu} → ${W.countries[best].nameRu}`, [from ?? hq, best], 2);
        }
      }
    }
  }
}

// market contribution to GDP growth (pp a year): wealth effect + investment from relocated production
export function equityGrowth(sim, s) {
  return P.eqWealth * s.mcapGdp * clamp(s.eq12, -1, 1) * 100 + s.fdi
    - (sim.chipShock ? (sim.world.countries[s.i].income === 'HIC' ? 0.8 : 0.4) : 0);
}

export function worldEquity(sim) {   // world index weighted by USD market cap
  let w = 0, v = 0;
  for (const s of sim.S) { const m = s.mcapGdp * s.gdp; w += m; v += m * (s.eq - s.e); }
  return w ? v / w : 0;
}
