// Trade: UN Comtrade bilateral flows + Armington CES demand (the standard in structural gravity models:
// Anderson & van Wincoop 2003, Head & Mayer 2014). Importer i splits purchases across suppliers j by
// tariff-inclusive price: share ~ s0_ij * (1+tau_ij)^(-sigma). Shares adjust with a lag (short-run elasticity
// is lower than long-run: Boehm, Levchenko & Pandalai-Nayar 2023). This yields:
//   • direct export losses for the country facing tariffs/sanctions;
//   • trade diversion to third countries (like Vietnam/Mexico after the US–China tariffs, Fajgelbaum et al. 2024);
//   • total imports fall with an elasticity of ~1 to the average tariff;
//   • tariffs pass almost fully into import prices (Amiti, Redding & Weinstein 2019).
import { P } from './params.js';

// ad-valorem equivalent of the barrier between i and j
export function wedge(sim, i, j) {
  const N = sim.world.N;
  return sim.T[i * N + j] / 100
    + ((sim.San[i * N + j] | sim.San[j * N + i]) ? P.sanctionTau : 0)
    + (sim.warMat[i * N + j] ? 4 : 0);
}

export function initTrade(sim) {
  const W = sim.world, N = W.N;
  sim.msCur = Float32Array.from(W.ms);                 // current supplier shares in imports
  sim.expNow = new Float64Array(N); sim.expCf = new Float64Array(N);
  sim.worldTrade = 1;
  for (const s of sim.S) { s.expIdx = 1; s.tauImp = 0; s.tradeImp = 1; }
}

export function stepTrade(sim) {
  const W = sim.world, N = W.N, S = sim.S, ms0 = W.ms, ms = sim.msCur, sig = P.tradeElast;
  const now = sim.expNow.fill(0), cf = sim.expCf.fill(0);
  let tradeNow = 0, tradeCf = 0;
  for (let i = 0; i < N; i++) {
    const s = S[i], src = W.sources[i];
    if (!src.length) { s.tauImp = 0; continue; }
    let sum0 = 0, norm = 0;
    const wd = sim._wd ??= new Float64Array(64), fac = sim._fac ??= new Float64Array(64);
    for (let n = 0; n < src.length; n++) {
      const j = src[n], t0 = ms0[i * N + j], w = wedge(sim, i, j);
      wd[n] = w; fac[n] = w === 0 ? 1 : Math.pow(1 + w, -sig);         // no barrier, no pow
      sum0 += t0; norm += t0 * fac[n];
    }
    const rest = Math.max(0, 1 - sum0);
    norm += rest;
    let tau = 0;
    for (let n = 0; n < src.length; n++) {
      const k = i * N + src[n];
      const target = ms0[k] * fac[n] / norm;
      ms[k] += P.tradeAdj * (target - ms[k]);
      tau += ms[k] * Math.min(wd[n], 2);
    }
    s.tauImp = tau;
    // import demand: grows with GDP, falls with tariffs and with real depreciation of the importer's currency
    const scale = s.gdp / s.gdp0;
    const demand = scale * Math.pow(1 + tau, -P.impElast) * Math.exp(-0.5 * (s.q || 0));
    s.tradeImp = demand / scale;
    const M0 = W.impTot[i];
    for (const j of src) {
      const k = i * N + j;
      now[j] += M0 * demand * ms[k];
      cf[j] += M0 * scale * ms0[k];
    }
    tradeNow += M0 * demand; tradeCf += M0 * scale;
  }
  // export index vs a no-barrier counterfactual (same partner demand): <1 losses, >1 gains from diversion
  for (let j = 0; j < N; j++) {
    const rest = Math.max(0, W.expTot[j] - W.expCovered[j]);       // exports outside the modeled pairs are unchanged
    S[j].expIdx = cf[j] + rest > 0 ? (now[j] + rest) / (cf[j] + rest) : 1;
  }
  sim.worldTrade = tradeCf ? tradeNow / tradeCf : 1;
}
