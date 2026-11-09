// Crypto: a global BTC price (fat-tailed log returns, tied to the risk-asset factor and the Fed rate)
// and the share of people holding crypto in each country. There is no open data on crypto ownership,
// so the share is a proxy: internet x (base level + inflation + income); it rises with depreciation and inflation.
// Macro effects are small (wealth and sentiment), as in reality.
import { P } from './params.js';
import { gauss } from './rng.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function initCrypto(sim) {
  const W = sim.world, c0 = W.crypto;
  sim.btc0 = c0?.btc?.price || 74000;
  sim.btc = sim.btc0; sim.btcHist = [sim.btc];
  for (const s of sim.S) {
    const c = W.countries[s.i];
    const em = c.income === 'LMC' || c.income === 'UMC' ? 0.03 : c.income === 'HIC' ? 0.02 : 0.01;
    s.crypto0 = clamp((c.internet / 100) * (em + 0.12 * clamp((c.infl - 3) / 40, 0, 1)) + (c.iso3 === 'SLV' ? 0.1 : 0), 0.002, 0.3);
    s.crypto0 *= W.cryptoScale ?? 1;   // historical starts: crypto adoption was lower in earlier years
    s.crypto = s.crypto0; s.cryptoBan = 0;
  }
}

export function stepCrypto(sim) {
  const t = sim.t, us = sim.S[sim.usa];
  // Student t with 4 degrees of freedom: g / sqrt(chi2_4 / 4)
  let chi = 0; for (let k = 0; k < 4; k++) chi += gauss(sim.seed, 9996, t, 10 + k) ** 2;
  const tnoise = gauss(sim.seed, 9996, t, 1) / Math.sqrt(chi / 4) * Math.sqrt(0.5);
  const sigma = P.btcVol / Math.sqrt(12);
  const r = 0.01 + P.btcBeta * sim.riskShock * 0.5 + sigma * tnoise - 0.02 * (us.r - (sim.usR || us.r));
  sim.usR = us.r;
  sim.btc = Math.max(500, sim.btc * Math.exp(clamp(r, -0.6, 0.8)) * (1 + sim.btcJump));
  sim.btcJump = 0;
  sim.btcHist.push(sim.btc); if (sim.btcHist.length > 13) sim.btcHist.shift();
  const mom = Math.log(sim.btc / sim.btcHist[0]);                // 12-month return
  sim.btcMom = mom;
  for (const s of sim.S) {
    const target = s.cryptoBan ? s.crypto0 * 0.25
      : clamp(s.crypto0 + 0.1 * clamp((s.infl - s.infl0) / 40, 0, 1) + 0.05 * clamp(s.e, 0, 1) + 0.02 * clamp(mom, -1, 1), 0.001, 0.5);
    s.crypto += 0.05 * (target - s.crypto);
  }
}
