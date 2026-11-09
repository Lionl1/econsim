# EconSim — a country & economy simulator on a 3D globe

**English** · [Русский](README.ru.md)

EconSim runs a monthly simulation of the world economy on an interactive 3D globe: 197 countries, real bilateral trade, exchange rates, stock markets, crypto, politics and wars. Inside it, three kinds of agents make decisions:

- **governments** set interest rates and budgets, retaliate against tariffs, impose sanctions, arm themselves, help allies and declare wars;
- **citizens** lose jobs, react to inflation and war, protest, emigrate and change governments through elections or coups;
- **corporations** (63 of the world's largest) move production away from tariffs and sanctions to friendly hubs.

The **calendar of global events** (2000–2025: the dot-com crash, 9/11, the 2008 crisis, the euro debt crisis, COVID-19, the war in Ukraine, the 2025 US tariffs and more) lets you travel back to any year with the actual state of the world, untick events, and see how the world would have looked without them — through today and on into the forecast.

You can also run "what if" scenarios — presets, a builder, or a plain-language event in Russian ("Китай вторгается на Тайвань через 6 месяцев, нефть +30%") — and compare the world against a parallel **baseline** that shares the same random shocks, so the difference is the pure effect of the scenario. The **Evaluate** button reruns a scenario across many possible futures and reports the median effect and its uncertainty.

> The interface and the event parser are in Russian. Code, comments and documentation are in English.

> ⚠ This is an educational model, not a forecast. See [Limitations](#limitations).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design: runtimes, module map, data flow, the monthly step, state, determinism, scenarios, ensembles, UI loop, performance, design decisions
- [docs/MODEL.md](docs/MODEL.md) — every equation, parameters with sources, calibration and validation results, known limitations
- [docs/DATA.md](docs/DATA.md) — sources, fetch pipeline, file formats, coverage and data-quality notes
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, commands, checks before committing, how to add events, presets, metrics, effects and parameters

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # smoke tests: engine, scenarios, parser, ensemble
```

Data refresh (optional, all sources are open and keyless):

```bash
npm run data         # countries: World Bank WDI + WGI, world-countries
npm run markets      # currencies, FX history, IMF WEO forecasts, crypto, stock markets, companies
npm run trade        # UN Comtrade bilateral trade (~2 h: the public API takes ~20 s per request)
npm run history      # World Bank 2000–2024 series used for calibration
```

Model checks without the UI:

```bash
npm run sim 240                              # 20-year headless run
npm run calibrate 6                          # model moments vs World Bank history
npm run backtest                             # pandemic, 2008 crisis, 2022 oil shock vs history
npm run ensemble -- us-china-trade-war 20 60 # preset or Russian event text, seeds, months
node scripts/scenario-test.mjs               # every preset vs baseline
npm run calendar -- 2000 8                   # calendar: model vs actual world growth since 2000 (start year, seeds, removed ids)
```

## Interface

- **Left rail** — Scenarios (presets), Prompt (event as text), Builder, Calendar (historical events and counterfactuals), Markets (world stocks, bitcoin, sectors, currencies, exchanges, corporations), Data. Clicking the active icon collapses the panel.
- **Top strip** — world KPIs (GDP, growth, inflation, oil, world stocks, bitcoin, trade, wars) with sparklines and the gap to the baseline.
- **Right inspector** — the world (overview, rankings) or a selected country: Overview, Economy, Markets (currency, exchange, companies, trade partners), Politics (agents, relations), Actions (interventions).
- **Bottom dock** — play/pause, speed, 🎲 random shocks on/off (off shows the expected path; Evaluate keeps the randomness), date, a timeline with event marks, a news ticker and the full event feed.
- **Map key** — metric picker and legend: growth, GDP, inflation, debt, exchange rates, stock indices, export effects, crypto adoption, stability, protests, and every metric's gap to the baseline.

## Data

All files live in `public/data/` and come from open sources (`public/data/sources.json` lists them):

| File | Contents | Sources |
|---|---|---|
| `countries.json` | 194 sovereign states + Taiwan, Palestine, Kosovo; macro, governance, demographics; gaps filled with regional medians (`imputed`) | World Bank WDI + WGI, world-countries |
| `trade.json` | exports by partner (goods, HS TOTAL, 2023/2022), importer-reported with exporter mirror fallback; pairs reported by neither side get a gravity estimate. The current snapshot has 122 import and 121 export reporters: the public API started refusing requests before the US, UK, Vietnam and a few others were fetched — `npm run trade` resumes where it stopped | UN Comtrade |
| `markets.json` | currencies and regimes, current rates, FX volatility, IMF WEO 2026–2031 forecasts, BTC/ETH, market caps and index volatility, 63 companies | open.er-api.com, World Bank, IMF DataMapper, CoinGecko, Wikidata |
| `history.json` | 1995–2024 by country: growth, inflation, unemployment, GDP, population, exchange rate, debt; world growth and inflation | World Bank |
| `world-50m.json` | borders | Natural Earth via world-atlas |

Dependencies and disputed areas without their own country (Greenland, Puerto Rico, Hong Kong, …) are colored like the state the World Bank assigns them to; Antarctica, Western Sahara and the Siachen Glacier are hatched as not modeled.

## Model

Monthly step, per country (`src/sim/`):

| File | What it does |
|---|---|
| `engine.js` | growth, inflation, unemployment (Okun), debt, stability, oil, wars, relations; scenarios and effects |
| `params.js` | every parameter: calibrated ones and literature-based ones (with references), plus ranges for ensemble draws |
| `world.js` | distances, the trade matrix and shares, currencies, forecasts, alliances, baseline relations |
| `trade.js` | Armington CES demand: tariffs, sanctions and wars reshuffle suppliers; diversion to third countries; one-off price effects |
| `fx.js` | floating rates (rate gaps, risk premium, oil, historical noise), pegs that can break, the euro area, dollarization; pass-through and net-export effects |
| `equity.js` | country stock indices with mean reversion to fundamentals, sectors, wealth effect; corporate agents and production moves; a chip shock if Taiwan is at war |
| `crypto.js` | fat-tailed BTC price tied to risk assets and the Fed rate; crypto adoption by country (proxy); bans |
| `decisions.js` | government agents |
| `citizens.js` | citizen agents |
| `ensemble.js` | scenario vs baseline across many seeds with three layers of uncertainty |
| `calendar.js` | 20 dated global events 2000–2025 with their effects |
| `nlp.js` | rule-based Russian event parser |
| `scenarios.js`, `blocs.js` | 19 presets; blocs, alliances, nuclear powers, rivalries |

The main and baseline worlds use a counter-based RNG (`rng.js`): the same (seed, country, month, slot) always gives the same number, so both worlds get identical shocks.

### What the mechanics are based on

- **Trade** — structural gravity with Armington CES demand (Anderson & van Wincoop 2003; Head & Mayer 2014): a supplier's share ∝ base share × (1 + barrier)^(−σ), σ ≈ 3 (2–5 in the ensemble), adjusting over ~18 months (short-run elasticities are lower than long-run ones: Boehm, Levchenko & Pandalai-Nayar 2023). Sanctions ≈ a 60% tariff, about −77% bilateral trade (Global Sanctions Database, Felbermayr et al. 2020). Tariffs pass almost fully into import prices (Amiti, Redding & Weinstein 2019) and divert trade to third countries (Fajgelbaum et al. 2024).
- **Exchange rates** — the real rate reverts to an equilibrium driven by real-rate gaps with the US, a risk premium (stability, sanctions, war, default) and oil; noise is scaled to each currency's World Bank history. Pass-through of 0.1 (advanced) / 0.3 (emerging) (Burstein & Gopinath 2014); a 10% real depreciation adds ~1% of GDP via net exports (IMF WEO 2015, ch. 3), partly offset by dollar debt in EMs (Kearns & Patel, BIS 2016).
- **Stock markets** — indices follow nominal GDP plus a premium, fall with expected real rates, share a global factor (σ ≈ 15%, like MSCI World) and revert to fundamentals; the wealth effect is 2 cents per dollar of unexpected gains.
- **Baseline** — anchored to IMF WEO 2026–2031 (potential growth, inflation anchor, natural unemployment).

### Calibration

The baseline world has no crisis events (the calendar adds them), so its random shocks are calibrated to World Bank 2000–2024 data **without the global crisis years** (2001, 2008–2010, 2020–2023) (`npm run calibrate`): country growth volatility and persistence (annual AR(1) 0.32 vs 0.35), the 10 largest economies, world growth volatility (0.70 vs 0.71), Okun's law (−0.06 vs −0.07) and income groups within ~±15%; shock size falls with economy size, as in the data. With the events on, the calendar reproduces the full-sample spread of world growth (1.83 vs 1.80). Inflation in advanced economies matches (median 2.1% vs 2.1%, sd 1.5 vs 1.4), its volatility in low-income ones too (4.6 vs 4.5); the low-income median is lower (3.8% vs 6.5%) because the baseline follows today's IMF forecasts rather than the 2000s. Inflation noise is multiplicative around its level (right-skewed): the typical lowest annual inflation of a country is 0.25% (data 0.26%). FX and stock index volatility match their World Bank histories. Random shocks do not bias average growth: with and without them the world grows the same over 20 years (+0.02 ± 0.01 pp/year, 200 seeds). Backtests (`npm run backtest`): the pandemic preset gives −4.0 pp of world growth in year one (actual −5…−6) and a +3.5 pp world inflation peak, the 2008-style crisis −3.7 pp (actual ~−5).

## Calendar of global events: what if it had not happened?

Pick a start year (2000–2025): the world starts from the actual state at the end of the previous year (World Bank GDP, population, growth, inflation, unemployment, debt, exchange rates). Before 2026 potential growth is the country's pre-start trend minus β-convergence (about 2 pp per log point of income growth), so China slows down as it gets richer without being told to; from 2026 the baseline follows the IMF forecast.

Using it takes three steps in the Calendar tab: pick a year (quick buttons for 2000, 2008, 2014, 2019, 2022), click the events that "did not happen", press **Show the world without them**. The button travels back, plays the globe up to 2031 and opens a results window (world GDP gap in 2031, growth by year with a band, the countries hit hardest); the top bar then switches the globe between *as it was* and *without the events*. Clicking a year or an event icon on the timeline (which spans 2000–2031 in this mode) travels there too.

Two worlds run with the same randomness: **as it was** (every event after the start) and **without the removed events**. Each event is a dated scenario whose effects are sized to the order of magnitude of the real episode (some have phases, e.g. the COVID crash and the 2021 rebound). The Calendar tab shows, by year, actual world growth, both model worlds, the effect, and the counterfactual estimate *actual − model effect*; **Evaluate on 20 futures** gives medians and 10–90% bands (about half a minute in a Web Worker).

How close is "as it was" to history? From 2000 with all events (`npm run calendar`), world growth correlates 0.91 with World Bank data (mean absolute error 0.65 pp): 2008 1.7% (actual 2.1%), 2009 −0.2% (−1.3%), 2020 −3.8% (−2.9%), 2021 +6.7% (+6.5%). World inflation, compared with country CPI inflation weighted by GDP the same way the model aggregates it, correlates 0.91 (mean absolute error 0.46 pp): 2008 5.1% (5.1%), 2022 7.4% (7.9%), 2023 5.6% (5.2%). The events and their sizes are model assumptions, not estimates.

## Uncertainty and the Evaluate window

A single run is mostly noise, so **Evaluate** reruns the scenario against the baseline over 10–40 futures and reports the median and the 10–90% band. Three layers can be switched on and off:

1. **Random events** — different seeds (aleatoric uncertainty).
2. **Model parameters** — key parameters are drawn within ranges of published estimates (`PRANGES`), the way central banks run Bayesian DSGE models over posterior draws (epistemic uncertainty).
3. **Event size** — a lognormal multiplier with median 1 and σ = 0.35 (a "−6%" shock lands between −3.4% and −10.6% in 80% of draws).

The window also plots the baseline's world growth band next to the IMF forecast re-weighted to market exchange rates; the band (~±1.5 pp) is comparable to the IMF's own historical one-year-ahead forecast errors.

## Limitations

- An educational model, not a forecast: many effect sizes are literature-based or judgment calls.
- Trade covers goods only (services are scaled to World Bank totals); no input–output or sector structure between countries.
- Exchange rate regimes are simplified; only 63 companies are modeled; crypto adoption by country is a proxy (no open data).
- The world starts at peace: ongoing conflicts are not loaded and are started through scenarios.
- The event parser understands Russian only.

## Project layout

```
index.html, src/main.js     app shell, KPI strip, dock, main loop
src/ui/                     globe, panels, charts, evaluation window
src/sim/                    simulation (no DOM; also runs in Node and in a Web Worker)
scripts/                    data fetchers (Python), calibration, backtests, tests (Node)
public/data/                datasets loaded by the app
data/                       Comtrade download cache (trade rebuilds)
docs/                       architecture, model, data and development docs
```

## License

[MIT](LICENSE). Data comes from the open sources listed above, each under its own terms (e.g. World Bank data is CC BY 4.0, Natural Earth is public domain); check the terms of IMF, UN Comtrade, CoinGecko and the other providers before reuse.
