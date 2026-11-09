// Торговля: двусторонние потоки UN Comtrade + CES-спрос Армингтона (стандарт гравитационных моделей:
// Anderson & van Wincoop 2003, Head & Mayer 2014). Импортёр i делит закупки между поставщиками j по цене
// с учётом пошлины: доля ∝ s0_ij · (1+τ_ij)^(−σ). Доли подстраиваются с запаздыванием (короткая эластичность
// меньше длинной: Boehm, Levchenko & Pandalai-Nayar 2023). Отсюда:
//   • прямые потери экспорта страны, против которой ввели пошлины/санкции;
//   • переток торговли к третьим странам (как Вьетнам/Мексика после пошлин США–Китай, Fajgelbaum et al. 2024);
//   • общий импорт падает с эластичностью ~1 к средней пошлине;
//   • пошлина почти полностью переносится в цены импорта (Amiti, Redding & Weinstein 2019).
import { P } from './params.js';

// ad-valorem эквивалент барьера между i и j
export function wedge(sim, i, j) {
  const N = sim.world.N;
  return sim.T[i * N + j] / 100
    + ((sim.San[i * N + j] | sim.San[j * N + i]) ? P.sanctionTau : 0)
    + (sim.warMat[i * N + j] ? 4 : 0);
}

export function initTrade(sim) {
  const W = sim.world, N = W.N;
  sim.msCur = Float32Array.from(W.ms);                 // текущие доли поставщиков в импорте
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
      wd[n] = w; fac[n] = w === 0 ? 1 : Math.pow(1 + w, -sig);         // без барьера — без pow
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
    // спрос на импорт: растёт с ВВП, падает с пошлинами и реальной девальвацией своей валюты
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
  // индекс экспорта к контрфактуалу без барьеров (спрос партнёров тот же): <1 — потери, >1 — выигрыш от перетока
  for (let j = 0; j < N; j++) {
    const rest = Math.max(0, W.expTot[j] - W.expCovered[j]);       // экспорт вне учтённых пар — без изменений
    S[j].expIdx = cf[j] + rest > 0 ? (now[j] + rest) / (cf[j] + rest) : 1;
  }
  sim.worldTrade = tradeCf ? tradeNow / tradeCf : 1;
}
