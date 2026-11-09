# Model

The model is a monthly, multi-country macro simulation with agents on top. It is designed to be explainable and to have realistic magnitudes and volatility, not to forecast. This document lists every equation as implemented; symbols match the code (`src/sim/*.js`), parameters live in `src/sim/params.js` (`P`).

- [Time, units, notation](#time-units-notation)
- [Baseline path](#baseline-path)
- [Output](#output)
- [Inflation and monetary policy](#inflation-and-monetary-policy)
- [Labor, debt, stability](#labor-debt-stability)
- [Oil and the global cycle](#oil-and-the-global-cycle)
- [Trade](#trade)
- [Exchange rates](#exchange-rates)
- [Stock markets and corporations](#stock-markets-and-corporations)
- [Crypto](#crypto)
- [Agents](#agents)
- [Wars and relations](#wars-and-relations)
- [Parameters](#parameters)
- [Calibration and validation](#calibration-and-validation)
- [Known limitations](#known-limitations)

## Time, units, notation

- Random macro and market shocks are scaled by `Sim.noise` (1 = calibrated, 0 = expected path; the 🎲 switch in the dock).
- One step = one month; `t` counts months from January of the start year. Growth and inflation rates are annualized percentages; `gdp` is real, in start-year US dollars.
- Smoothed states follow `x += a · (target − x)`; `a` is the monthly adjustment speed.
- `ε` denotes a standard normal draw from the counter-based RNG (see [ARCHITECTURE.md](ARCHITECTURE.md#determinism-and-the-baseline)).
- Country `i`, partner `j`; `c` = static country data, `s` = dynamic state, `m` = scenario modifiers for this month.

## Baseline path

| Period | Potential growth `gpot` | Inflation anchor | Natural unemployment `uN` |
|---|---|---|---|
| Today mode (start 2026) | IMF WEO growth for the year (2026–2031, then held) | starts at the IMF 2026 value, then follows the IMF path interpolated by month and led by `inflLead` months (offsets core inertia), speed `anchorTrack` | → IMF WEO unemployment |
| Historical start, years < 2026 | 5-year mean growth before the start − `convergence` · ln(income per head / income at start) (β-convergence) | 5-year median inflation before the start, drifting to `targetHIC` / `targetEM` over `anchorDriftMonths` | starting value |
| Historical start, years ≥ 2026 | IMF WEO as above | IMF WEO as above | IMF WEO as above |

Countries without an IMF forecast use the start formula `gpot = 0.4·growth + 0.6·(4.6 − 0.36·ln(GDPpc/1000))` clamped to [−0.5, 7].

## Output

Level effects (permanent shifts of the GDP level, in %) collect slow-moving drags:

```
levelT = tradeKappa · exports% · (expIdx − 1)          trade: exports vs a no-barrier counterfactual
       − tariffCost · imports% · tauImp                 importer's cost of its average tariff
       − 40 · max(0, 0.3 − stab)                         instability
       + fxLevel                                        real exchange rate (see FX)
level += 0.08 · (levelT − level)     (starts at its steady value, so there is no first-year transient)
dLevel = Δlevel + pulse              (pulse: scenario "level" shocks and war damage, % per month)
```

Cyclical growth `gc` follows a target:

```
target = gpot + fiscalMult·f + equityGrowth + 2·crypto·BTC12m + 0.1·Δmil − 0.25·tight
       + 0.35·openness·(partners' growth − partners' potential)      demand spillover, export weights
       − 1.8·(oil − 1)·energyImportShare + m.g + cycAmp·cyc·openness
       + gNoise·vol(income)·ε
gc += gAdj · (target − gc)
gdp *= 1 + gc/1200 + dLevel/100          reported growth g = gc + 12·dLevel
```

## Inflation and monetary policy

```
price shocks priceShock = oilInfl·(oil − 1)·max(energyImportShare, 0) + m.infl        energy/food and scenario shocks
core target  inflT = anchor + 0.25·(gc − gpot) + 0.35·f + (1 − headlineShare)·priceShock − 0.3·tight
core        inflCore += inflAdj · (inflT − inflCore)
headline    hl += 0.3 · (headlineShare·priceShock − hl)          most of a price shock hits CPI at once and fades with it
noise       n = (1 − inflAdj)·n + noise·inflNoise·ε                 AR(1), same persistence as the core
            inflNoisy = (inflCore + inflShift) · exp(n − Var(n)/2) − inflShift     multiplicative, centered: right-skewed, rare shallow deflation
one-offs    tariffs:  tarPL → tariffPass · imports% · tauImp;  FX: fxPL → pass · q · 100
            inflPL = (tarPL − slow tarPL) + (fxPL − slow fxPL)      price-level jumps stay in annual inflation ~1 year
inflation   infl = clamp(inflNoisy + inflPL + hl, −3, 300)
```

Monetary policy (government agent, every month) is a Taylor (1993) rule around the **current** anchor with a zero lower bound, moving at most 0.5 pp per month:

```
neutral real rate  rrN = clamp(0.5 + 0.5·gpot, 0.5, 4)
rT = clamp(rrN + anchor + 1.5·(infl − anchor) + 0.5·(gc − gpot), 0, 60)
tight = r − (rrN + infl)              real policy rate minus neutral (>0 = restrictive)
```

## Labor, debt, stability

```
unemp += −okun·(gc − gpot)/12 + 0.08·(uN + m.unemp − unemp)                         Okun's law
deficit = deficit0 + f + Δmil + debt/100 · max(−3, r − r0)
debt += (deficit − debt·(g + infl)/100) / 12
default if debt > 120 + 60·govEffectiveness and r − r0 > 2, with probability 1%·debt/150 per month
         → debt ×0.65, GDP −6%, inflation +8, stability −0.2, stock market −30%, FX risk premium for 24 months
stabT = stab0 − 0.008·(misery − misery0) − 0.12·atWar − 0.12·sanctionPressure − 0.5·max(0, protest − 0.1) + m.stab
stab += 0.10 · (stabT − stab)          misery = inflation + unemployment
```

## Oil and the global cycle

```
oilTarget = 1 + 0.12·(world output gap) + oilShock + 1.2·(share of oil exports disrupted by wars/sanctions)
oil += 0.15·(oilTarget − oil) + 0.012·ε,  oil ∈ [0.3, 4.5]       (1.0 = $80/bbl)
cyc = cycPers·cyc + cycNoise·ε                                   global cycle, hits open economies
```

## Trade

Bilateral exports `X[i→j]` come from UN Comtrade (importer reports, exporter mirror, scaled gravity for pairs reported by neither), scaled to World Bank totals (goods + services). Each importer `i` splits purchases across its top 45 sources (Armington CES):

```
barrier τ_ij = tariff_ij/100 + sanctionTau·[sanctions either way] + 4·[at war]
target share s*_ij = s0_ij · (1 + τ_ij)^(−tradeElast) / Σ_k s0_ik (1 + τ_ik)^(−tradeElast)     (unlisted sources keep their base share)
s_ij += tradeAdj · (s*_ij − s_ij)
tauImp_i = Σ_j s_ij · min(τ_ij, 2)                               average tariff on imports
imports_i = imports0_i · (gdp_i/gdp0_i) · (1 + tauImp_i)^(−impElast) · exp(−0.5·q_i)
expIdx_j = (Σ_i imports_i · s_ij + rest_j) / (Σ_i imports0_i · gdp_i/gdp0_i · s0_ij + rest_j)
```

`expIdx` < 1 is a loss for the exporter, > 1 a gain from trade diversion; it feeds `levelT`.

## Exchange rates

Each country has a log rate vs USD `e` (up = depreciation) and a real rate `q = e − (P_i − P_US)`.

```
q* = −fxRate·(real-rate gap with the US vs start)/100
   + fxRisk·(max(0, stab0 − stab) + 0.3·sanctionPressure + 0.15·atWar + 0.3·[recent default])
   − fxOil·fuelExportShare·ln(oil) + m.fx/100
float:      q += fxAdj·(q* − q) + 0.8·fxNoise·σ_hist/√12·ε     (σ_hist: World Bank 2008–2024; scenario devaluations pass 50%/month)
peg:        e = anchor's e; breaks to float with 1.5%/month if q* − q > pegBreak, immediately under scenario pressure
union:      euro area aggregate, members share e
dollarized: e = anchor's e (USD, EUR, AUD, CHF)
pass-through to prices: fxPL → (0.1 high income | 0.3 others) · q · 100
fxLevel = (fxTrade·exports%/100 − [EM] 0.3·fxBalance) · q          % of GDP
```

## Stock markets and corporations

```
fund = (gc + infl)/1200 + eqPremium − 0.002 + 2.5·dLevel/100              fundamental path F += fund
r_eq = fund − eqDuration·Δ(r − anchor)/100 + β·risk + idio·ε + jumps − eqRevert·(eq − F)
risk = 0.037·ε + tail (−6% in ~0.6% of months)                            common to all markets and BTC
idio = √max((eqIdioK·σ_hist)² − σ_FX² − (β·0.12)², 0.04²) / √12           σ_hist: S&P country indices (USD)
equityGrowth = eqWealth · (market cap/GDP) · (12-month return − expected) · 100 + fdi − chipShock
```

Corporations (63): `value = (1 − foreign)·eq_home + foreign·Σ export-weighted eq_partners + sector + barrier + news`, where `barrier` tracks losses from barriers in export markets and between the production country and home. Every 6 months a company with `barrier < −5%` (in goods-producing sectors) may move production to a hub (Vietnam, Mexico, India, …) chosen by relations, barriers, peace, stability, size and crowding; the hub gets an investment boost `fdi` (growth, decaying 4%/month) and the old production country loses some.

If Taiwan is at war (`chipShock`), the semiconductor sector falls 10%/month and every economy loses 0.4–0.8 pp of growth.

## Crypto

```
r_BTC = 0.01 + btcBeta·0.5·risk + btcVol/√12 · t₄ − 0.02·Δr_US,   t₄: Student t with 4 df (fat tails)
adoption → crypto0 + 0.1·(inflation surprise) + 0.05·depreciation + 0.02·BTC momentum   (×0.25 under a ban)
crypto0 = internet% · (base by income + 0.12·clamp((infl − 3)/40, 0, 1))                (proxy: no open data)
```

## Agents

**Governments** (`decisions.js`): monetary policy monthly; the rest every 3 months, staggered.

| Decision | Rule |
|---|---|
| Military spending | → `mil0 · (1 + 0.9·threat)`, threat from hostile neighbors and wars |
| Fiscal stance | stimulus up to 5% GDP when the gap < −1, mild consolidation when > 1.5, forced consolidation when debt > 100%; halved in weak states |
| Tariffs | retaliate against partners' tariffs (probability ↑ with protectionism), occasional protectionism under high unemployment, de-escalation with friends |
| Sanctions | lifted when relations recover; rich cooperative democracies sanction aggressors |
| Aid | rich cooperative countries help friends in trouble |
| War | against hostile neighbors when expected win share, hawkishness, hostility and domestic trouble outweigh cooperation; defense blocs multiply the defender's power ×8; nuclear deterrence |

Traits: `hawk`, `coop`, `protect` from military spending, democracy and noise; they mutate on government change.

**Citizens** (`citizens.js`): 16–100 agents per country (each a share of the population): employment follows the unemployment rate (lower-income agents first), sentiment reacts to the output gap, inflation and unemployment surprises, war and stability; agents below a threshold protest (the threshold is lower in autocracies, so protest takes more discontent there), unhappy agents emigrate to richer, stabler partners. Elections every 4–6 years in democracies (loss probability rises with discontent); coups in autocracies under low stability and protests.

## Wars and relations

Wars have sides (primary attacker/defender plus allies recruited from defense blocs and bilateral alliances), intensity, monthly damage (`0.45·intensity·enemy power share·2` % of GDP for primaries, 30% of that for allies), inflation and population effects, and end with a monthly probability rising with duration, exhaustion, lopsidedness and nuclear deterrence; a truce of 48 months follows.

Relations drift 4%/month toward `base + trade ties + 0.4·peace − 0.9·war − 0.35·sanctions − 0.004·tariffs + aid`.

## Parameters

| Parameter | Value | Ensemble range | Source |
|---|---|---|---|
| `gNoise`, `cycNoise`, `cycAmp`, `cycPers`, `gAdj`, `volLIC/HIC` | 7.8, 8, 0.6, 0.8, 0.5, 1.3/0.95 | — | calibrated: growth sd, persistence, co-movement |
| `inflNoise`, `inflAdj`, `inflShift` | 0.16, 0.07, 3 | — | calibrated: inflation sd, persistence, skew |
| `headlineShare` | 0.7 | — | energy/food weight in CPI pass-through; fits 2008 and 2022 peaks in the calendar |
| `anchorTrack`, `inflLead` | 0.25, 10 | — | inflation follows the IMF path without lagging it |
| `convergence`, `targetHIC`, `targetEM`, `anchorDriftMonths` | 2, 2, 3.5, 36 | — | historical starts: β-convergence (~2%/yr, Barro & Sala-i-Martin) and the spread of inflation targeting |
| `okun` | 0.32 | 0.25–0.4 | calibrated to unemployment changes |
| `oilInfl` | 10 | 6–14 | sized to the 2022 energy shock |
| `fiscalMult` | 0.5 | 0.3–0.8 | Ramey (2019), lower in EMs |
| `tradeElast` | 3 | 2–5 | Head & Mayer (2014); Boehm et al. (2023) |
| `tradeAdj` | 1/18 | — | multi-year adjustment of supply chains |
| `sanctionTau` | 0.6 | 0.4–0.9 | Felbermayr et al. (2020), Global Sanctions Database |
| `tradeKappa` | 0.6 | 0.4–0.8 | value-added share of export losses |
| `tariffCost` | 0.25 | 0.12–0.4 | order of magnitude of Yale Budget Lab (2025) |
| `tariffPass` | 0.7 | 0.5–1 | Amiti, Redding & Weinstein (2019) |
| `fxRate`, `fxRisk`, `fxOil`, `fxAdj` | 1, 0.8, 0.5, 0.08 | 0.5–1.5, 0.4–1.2 | UIP-style gap, risk premia |
| `fxPassAE/EM` | 0.1 / 0.3 | — | Burstein & Gopinath (2014) |
| `fxTrade`, `fxBalance` | 35, 15 | 20–50 | IMF WEO (2015, ch. 3); Kearns & Patel (BIS 2016) |
| `fxNoise`, `pegBreak` | 0.65, 0.35 | — | calibrated: FX volatility, peg breaks ~1 per decade |
| `eqPremium`, `eqDuration`, `eqRevert`, `eqIdioK` | 0.004, 3, 0.02, 0.85 | eqDuration 2–5 | calibrated: index volatility, world market σ ≈ 15%, cross-section of returns |
| `eqWealth` | 0.02 | 0.01–0.04 | wealth effect 2–5 cents per dollar |
| `btcVol`, `btcBeta` | 0.6, 1.5 | btcBeta 1–2.2 | long-run BTC volatility |

## Calibration and validation

| Check | Command | Result |
|---|---|---|
| Growth: sd, AR(1), co-movement, by income group | `npm run calibrate` | within ~±10% of World Bank 2000–2024 medians |
| Inflation, high income: median, sd | `npm run calibrate` | 2.2% vs 2.3%, 2.2 vs 2.2 |
| Inflation, low/lower-middle income | `npm run calibrate` | lower and calmer than 2000–2024 (median 4.7% vs 6.4%) |
| FX volatility (floating currencies) | dev script | median annual σ ≈ data |
| Stock index volatility, world market | dev script | ≈ data; world σ 0.15 (MSCI World ≈ 0.15) |
| Pandemic preset, year-one world growth | `npm run backtest` | −4.3 pp (actual −5…−6); inflation peak +4.0 pp |
| 2008-style crisis | `npm run backtest` | −3.8 pp (actual ~−5) |
| Calendar from 2000, world growth | `npm run calendar` | corr 0.87, mean abs error 0.80 pp |
| Calendar from 2000, world inflation (GDP-weighted CPI) | `npm run calendar` | corr 0.88, mean abs error 0.58 pp, bias ~0 |
| Baseline 2026–2031 vs IMF (market weights), 200 seeds | dev script | growth within ±2 standard errors each year (mean −0.02 pp); inflation 2031 2.8% vs 2.6% |
| Same without random shocks (`noise: 0`), 30 seeds | dev script | 2.52 → 2.47% vs IMF 2.52 → 2.37% |

## Known limitations

- Effect sizes of events and many agent rules are assumptions sized to the order of magnitude of real episodes, not estimates.
- No input–output structure: trade is total goods (services scaled), sectors exist only on the stock market.
- Okun slope steeper than the median country estimate (−0.15 vs −0.09; the empirical one is attenuated by measurement error).
- Inflation in emerging and low-income economies is calmer than in 2000–2024; after price shocks inflation still fades a little too slowly (2023: 6.3% vs 5.2%).
- With random shocks switched off the path is the expected one, but agent decisions (wars, elections) stay random, so a single run can still contain a war that moves everything.
- Exchange rate regimes are simplified; crypto adoption is a proxy.
- Historical starts reuse today's trade matrix, governance, blocs and company list.
