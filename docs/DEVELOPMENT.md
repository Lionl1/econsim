# Development

## Setup

Requirements: Node 20+ (tested on 25), Python 3.10+ for the data scripts (standard library only).

```bash
npm install
npm run dev        # Vite dev server, http://localhost:5173
npm run build      # static build into dist/
npm test           # smoke tests (~3 s)
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` | app |
| `npm test` | `scripts/test.mjs`: determinism, every preset 24 months without NaN, overlapping tariff claims, peace deal, trade diversion, parser cases, a 2019 calendar world, a small ensemble |
| `npm run sim -- 240` | headless run, prints the world by year and a few countries |
| `npm run calibrate -- 6` | model moments vs World Bank 2000–2024; override parameters with `P='{"gNoise":9}' npm run calibrate` |
| `npm run backtest` | pandemic, 2008 crisis and 2022 oil shock vs history |
| `npm run calendar -- 2000 8 [ids\|all]` | calendar world from a start year: model vs actual growth and inflation, effect of the removed events |
| `npm run ensemble -- <preset\|"Russian text"> [seeds] [months]` | the Evaluate window in the terminal; `NOPARAMS=1` keeps only random events |
| `node scripts/scenario-test.mjs [ids]` | each preset vs baseline after 5 years |
| `npm run data` / `history` / `markets` / `trade` | refresh datasets (see [DATA.md](DATA.md)) |

## Before committing a model change

1. `npm test` — must pass.
2. `npm run calibrate -- 6` — growth and high-income inflation rows should stay within ~±15%.
3. `npm run backtest` — pandemic year-one world growth around −4…−6 pp, crisis around −4…−5 pp.
4. `npm run calendar -- 2000 8` — growth correlation with history ≥ 0.8, inflation bias near 0.
5. Open the app, run a preset and the Calendar once; check the console is clean.

## Conventions

- **`src/sim` has no DOM.** It must run in the browser, in the Web Worker and in Node. UI code lives in `src/ui` and `src/main.js`.
- **Randomness only through `rng.js`** (`sim.rnd`, `sim.gs`, `hash`, `gauss`) with a slot that is not used elsewhere (see the slot table in [ARCHITECTURE.md](ARCHITECTURE.md#determinism-and-the-baseline)). Never use `Math.random()` in the simulation: it breaks the baseline comparison and reproducibility.
- **Parameters in `params.js`.** Calibrated values in the first group, literature values with a short source comment; add a range to `PRANGES` if the value is uncertain.
- **Effects are data.** New behaviour that scenarios should trigger becomes an effect kind or a shock variable, not a special case in the UI.
- **Language.** Code, comments and docs in English; user-facing strings in Russian.
- **Commits.** Small, one topic each, imperative subject in English.

## How to…

### Add a calendar event

Append to `CALENDAR` in `src/sim/calendar.js`:

```js
{ id: 'my-event', date: '2017-05', icon: '🌀', title: 'Название', desc: 'Что случилось.', fact: 'Реальные цифры для ориентира.',
  duration: 12,
  effects: [
    { kind: 'shock', targets: ['iso:XXX'], var: 'growth', value: -2, at: 0, len: 6 },   // phase: first 6 months
    { kind: 'oil', value: 0.2 },
  ] },
```

Then check its size against history with `npm run calendar -- <year> 8 <id>` (the effect column) and against the actual series. Open-ended events (`duration: 0`) should give transient shocks their own `at`/`len` window.

### Add a preset

Append to `PRESETS` in `src/sim/scenarios.js` (`id`, `icon`, `title`, `duration`, `desc`, `effects`). `node scripts/scenario-test.mjs <id>` shows its effect; `npm test` runs every preset.

### Add a map metric

1. Return the value in `Sim.metric()` (`engine.js`).
2. Add `{ label, stops, fmt }` to `METRICS` and the key to a group in `METRIC_GROUPS` (`src/ui/colors.js`).

### Add a shock variable or an effect kind

- Shock variable (applied every month while active): add a `case` in `applyScenarios()` writing to `s.mods` (reset each month in `blankMods()`), use it in the step, and add a label to `SHOCK_VARS`.
- Effect kind (applied once at start): handle it in `startScenario()`; if it must be reverted, record it in `sc.saved` or use the claim mechanism (`claim`/`release`) like tariffs and sanctions.
- Describe it in `describeEffect()` (`src/ui/targets.js`) and, if useful, teach the parser (`src/sim/nlp.js`).

### Add a parameter

Add it to `P` with a comment and a source, use `P.name` in the model, add a `PRANGES` entry if uncertain, and rerun the checks above.

### Add a parser phrase

`src/sim/nlp.js` works on lowercase text with Cyrillic word starts `(?<![а-я])` (JavaScript `\b` does not work with Cyrillic). Country names match a base plus case endings; add common words that collide with country names to `STOP`. Add a test case to `scripts/test.mjs`.

## Debugging tips

- `window.app` in the browser console exposes the world (`app.world`), both simulations (`app.sim`, `app.base`) and helpers (`app.launch`, `app.select`, `app.setStartYear`, `app.openTab`).
- Step manually: `for (let i = 0; i < 12; i++) { app.sim.step(); app.base.step(); } app.refreshAll(true)`.
- In Node, `loadWorld()` / `loadData()` from `scripts/load.mjs` give the same world as the app; `buildWorld(raw, { ...data, history, startYear })` builds a historical one.
