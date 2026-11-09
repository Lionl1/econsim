// Map metrics, color scales and number formatting.
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAD = '#e5484d', WARN = '#f5a524', MID = '#3b4658', GOOD = '#2ec4a6', GOOD2 = '#4cc9f0';

export const fmtMoney = v => v >= 1e12 ? (v / 1e12).toFixed(2) + ' трлн $' : v >= 1e9 ? (v / 1e9).toFixed(1) + ' млрд $' : (v / 1e6).toFixed(0) + ' млн $';
export const fmtNum = v => v >= 1e9 ? (v / 1e9).toFixed(2) + ' млрд' : v >= 1e6 ? (v / 1e6).toFixed(1) + ' млн' : v >= 1e3 ? (v / 1e3).toFixed(0) + ' тыс' : v.toFixed(0);
const pct = (d = 1) => v => v.toFixed(d) + '%';
const sgn = (d = 1, u = '') => v => (v > 0 ? '+' : '') + v.toFixed(d) + u;

// stops: [[value, color], ...]; log = interpolate on a log scale
export const METRICS = {
  g:      { label: 'Рост ВВП', stops: [[-6, BAD], [0, MID], [3, GOOD], [8, GOOD2]], fmt: pct(1) },
  gdp:    { label: 'ВВП (номинал)', log: true, stops: [[1e9, '#1b2a49'], [2e10, '#264d7a'], [3e11, '#2a7a9b'], [2e12, '#35b1a0'], [1e13, '#a8e063'], [3e13, '#f4e04d']], fmt: fmtMoney },
  gdpPc:  { label: 'ВВП на душу', log: true, stops: [[500, '#1b2a49'], [3000, '#264d7a'], [12000, '#2a7a9b'], [30000, '#35b1a0'], [60000, '#a8e063'], [100000, '#f4e04d']], fmt: v => Math.round(v).toLocaleString('ru') + ' $' },
  infl:   { label: 'Инфляция', stops: [[0, MID], [3, MID], [10, WARN], [30, BAD]], fmt: pct(1) },
  unemp:  { label: 'Безработица', stops: [[2, MID], [6, MID], [12, WARN], [25, BAD]], fmt: pct(1) },
  debt:   { label: 'Госдолг, % ВВП', stops: [[10, MID], [60, MID], [100, WARN], [180, BAD]], fmt: pct(0) },
  stab:   { label: 'Стабильность', stops: [[0.05, BAD], [0.3, WARN], [0.55, MID], [0.9, GOOD]], fmt: v => (v * 100).toFixed(0) + '/100' },
  sent:   { label: 'Настроения населения', stops: [[0.25, BAD], [0.45, WARN], [0.6, MID], [0.85, GOOD]], fmt: v => (v * 100).toFixed(0) + '/100' },
  protest:{ label: 'Протесты', stops: [[0, MID], [0.1, MID], [0.3, WARN], [0.6, BAD]], fmt: v => (v * 100).toFixed(0) + '%' },
  mil:    { label: 'Военные расходы', stops: [[0.5, MID], [2, MID], [4, WARN], [10, BAD]], fmt: pct(1) },
  dGdp:   { label: 'Δ ВВП к базе', delta: true, stops: [[-10, BAD], [-1, '#6a3a45'], [0, '#323a49'], [1, '#2b6a62'], [10, GOOD]], fmt: sgn(2, '%') },
  dStab:  { label: 'Δ стабильности к базе', delta: true, stops: [[-20, BAD], [0, '#323a49'], [20, GOOD]], fmt: sgn(1, ' п.') },
  dUnemp: { label: 'Δ безработицы к базе', delta: true, stops: [[-4, GOOD], [0, '#323a49'], [4, BAD]], fmt: sgn(1, ' п.п.') },
  dInfl:  { label: 'Δ инфляции к базе', delta: true, stops: [[-4, GOOD], [0, '#323a49'], [6, BAD]], fmt: sgn(1, ' п.п.') },
  gdpUsd: { label: 'ВВП в текущих $', log: true, stops: [[1e9, '#1b2a49'], [2e10, '#264d7a'], [3e11, '#2a7a9b'], [2e12, '#35b1a0'], [1e13, '#a8e063'], [3e13, '#f4e04d']], fmt: fmtMoney },
  fx:     { label: 'Курс к $ с начала (+ = девальвация)', stops: [[-20, GOOD2], [0, MID], [30, WARN], [200, BAD]], fmt: sgn(0, '%') },
  eq:     { label: 'Фондовый индекс с начала', stops: [[-40, BAD], [-10, WARN], [0, MID], [40, GOOD], [150, GOOD2]], fmt: sgn(0, '%') },
  expIdx: { label: 'Экспорт: эффект барьеров', stops: [[-30, BAD], [-3, WARN], [0, MID], [5, GOOD], [20, GOOD2]], fmt: sgn(1, '%') },
  crypto: { label: 'Доля населения с криптой', stops: [[0, '#1b2a49'], [2, '#264d7a'], [6, '#2a7a9b'], [12, '#a8e063'], [25, '#f4e04d']], fmt: pct(1) },
  dFx:    { label: 'Δ курса к базе (+ = слабее)', delta: true, stops: [[-15, GOOD], [0, '#323a49'], [30, BAD]], fmt: sgn(1, '%') },
  dEq:    { label: 'Δ фондового индекса к базе', delta: true, stops: [[-30, BAD], [0, '#323a49'], [30, GOOD]], fmt: sgn(1, '%') },
};
export const METRIC_GROUPS = [
  ['Экономика', ['g', 'gdp', 'gdpUsd', 'gdpPc', 'infl', 'unemp', 'debt']],
  ['Рынки и торговля', ['fx', 'eq', 'expIdx', 'crypto']],
  ['Общество и политика', ['stab', 'sent', 'protest', 'mil']],
  ['Влияние сценария (разница с базой)', ['dGdp', 'dInfl', 'dUnemp', 'dStab', 'dFx', 'dEq']],
];

const parsed = {};
for (const k in METRICS) parsed[k] = METRICS[k].stops.map(([v, c]) => [v, hex(c)]);

export function colorOf(key, v) {
  const m = METRICS[key], st = parsed[key];
  const x = m.log ? Math.log(Math.max(v, 1e-9)) : v;
  const xs = m.log ? st.map(s => Math.log(s[0])) : st.map(s => s[0]);
  if (x <= xs[0]) return st[0][1];
  for (let i = 1; i < st.length; i++) {
    if (x <= xs[i]) {
      const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]), a = st[i - 1][1], b = st[i][1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return st[st.length - 1][1];
}
export const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
export const gradientCss = key => `linear-gradient(90deg, ${METRICS[key].stops.map(s => s[1]).join(',')})`;
