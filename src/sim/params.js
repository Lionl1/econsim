// Model parameters. The first group is calibrated to World Bank series (scripts/calibrate.mjs),
// the rest come from the literature; the ensemble draws them within PRANGES (model uncertainty).
export const P = {
  fiscalMult: 0.5,      // fiscal multiplier (Ramey 2019: 0.6–1; lower in EMs)
  // calibrated to World Bank series 2000–2024, calm years (the baseline has no crisis events; the calendar adds them)
  uNoise: 0.33,         // own unemployment shocks, pp per month
  gNoise: 4.3, cycAmp: 0.6, cycNoise: 3.3, inflNoise: 0.2, gAdj: 0.5, inflAdj: 0.07, okun: 0.1, cycPers: 0.8, volLIC: 1.5, volHIC: 1.2, anchorK: 0.85, oilInfl: 10,
  gPers: 0.96, gPersNoise: 2.1,   // persistent growth shock: monthly AR(1) persistence and size, pp
  okunHIC: 0.35,        // Okun coefficient in high-income economies (P.okun elsewhere)
  inflVolLIC: 1.6,       // inflation noise multiplier for low-income countries
  volSize: 0.13,        // growth shock size ∝ (GDP / $100 bn)^(−volSize)
  // inflation and the baseline path
  inflShift: 1,         // inflation noise is multiplicative around (core + inflShift): right-skewed, deflation rare and shallow
  anchorTrack: 0.25,    // monthly speed at which the inflation anchor follows the IMF path (interpolated by month)
  headlineShare: 0.7,   // share of energy/food/scenario price shocks that hits headline CPI directly (the rest via core)
  inflLead: 10,         // months the anchor leads the IMF path, offsetting the inertia of core inflation
  convergence: 2,       // historical starts: pp of potential growth lost per log point of income growth (beta-convergence)
  targetHIC: 2, targetEM: 3.5,   // historical starts: modern inflation targets the anchor drifts to
  anchorDriftMonths: 36, // historical starts: time scale of that drift (the 1995–2015 move to inflation targeting)
  // trade
  tradeElast: 3,        // elasticity of substitution between suppliers (Head & Mayer 2014: 3–6; short-run ~1, Boehm et al. 2023)
  tradeAdj: 1 / 18,     // supply chain adjustment speed, 1/month
  impElast: 1,          // elasticity of total imports to the average tariff
  sanctionTau: 0.6,     // sanctions ~ a 60% tariff -> -77% bilateral trade (GSDB, Felbermayr et al. 2020)
  tradeKappa: 0.6,      // share of export losses that hits GDP (the rest is redirected at home)
  tariffCost: 0.25,     // importer's GDP loss per pp of average tariff x import share (Yale Budget Lab 2025)
  tariffPass: 0.7,      // tariff pass-through to consumer prices (Amiti, Redding & Weinstein 2019)
  // exchange rates
  fxAdj: 0.08,          // speed of real rate reversion to equilibrium, 1/month
  fxRate: 1.0,          // real rate response to real interest rate gaps
  fxRisk: 0.8,          // risk premium: falling stability, sanctions, war -> depreciation
  fxOil: 0.5,           // oil currencies strengthen with the oil price
  fxNoise: 0.65,           // multiplier on historical FX volatility
  fxPassAE: 0.1, fxPassEM: 0.3,   // exchange rate pass-through to prices (Burstein & Gopinath 2014)
  fxTrade: 35,          // 10% real depreciation -> ~+1% GDP via net exports (IMF WEO 2015, ch. 3)
  fxBalance: 15,        // for EMs, dollar debts eat part of the gain (Kearns & Patel, BIS 2016)
  pegBreak: 0.35,       // real misalignment at which a peg comes under pressure
  // stock markets and crypto
  eqPremium: 0.004,     // equity risk premium, 1/month
  eqDuration: 3,        // equity sensitivity to the real rate (per pp)
  eqNoise: 1,           // multiplier on historical index volatility
  eqRevert: 0.02,       // valuation reversion to fundamentals, 1/month (half-life ~3 years)
  eqIdioK: 0.85,        // share of historical volatility given to the index's own shock (tuned to the cross-section of returns)
  eqWealth: 0.02,       // wealth effect: 12-month change x market cap / GDP -> GDP growth (2 cents per $)
  btcVol: 0.6,          // annual BTC volatility (long-run, above the last year)
  btcBeta: 1.5,         // BTC sensitivity to the global risk-asset factor
};

// ranges for parameter draws in the ensemble (uniform)
export const PRANGES = {
  tradeElast: [2, 5], sanctionTau: [0.4, 0.9], tradeKappa: [0.4, 0.8], tariffCost: [0.12, 0.4], tariffPass: [0.5, 1],
  oilInfl: [6, 14], okun: [0.25, 0.4], fxRate: [0.5, 1.5], fxRisk: [0.4, 1.2], fxTrade: [20, 50], eqWealth: [0.01, 0.04],
  eqDuration: [2, 5], btcBeta: [1, 2.2], fiscalMult: [0.3, 0.8],
};
