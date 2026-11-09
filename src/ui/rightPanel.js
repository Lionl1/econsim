// Правая панель: обзор мира или карточка выбранной страны (статистика, агенты, отношения, вмешательство).
import { lineChart } from './charts.js';
import { fmtMoney, fmtNum } from './colors.js';
import { targetSelectHtml } from './targets.js';
import { BLOC_NAMES } from '../sim/blocs.js';

const $ = (s, r = document) => r.querySelector(s);
const flag = iso2 => iso2 ? String.fromCodePoint(...[...iso2.toUpperCase()].map(c => 0x1f1a5 + c.charCodeAt(0))) : '';
const dcls = (v, goodHigh = true) => Math.abs(v) < 0.005 ? '' : (v > 0) === goodHigh ? 'pos' : 'neg';
const delta = (v, d = 1, goodHigh = true, unit = '') => Math.abs(v) < 0.5 * Math.pow(10, -d) ? '' : `<span class="dl ${dcls(v, goodHigh)}">${v > 0 ? '+' : ''}${v.toFixed(d)}${unit}</span>`;
const stat = (k, v, dl = '') => `<div class="stat"><div class="k">${k}</div><div class="v">${v}${dl}</div></div>`;
const REG = { Europe: 'Европа', Asia: 'Азия', Africa: 'Африка', Americas: 'Америка', Oceania: 'Океания' };
const INCOME = { HIC: 'богатая', UMC: 'выше среднего', LMC: 'ниже среднего', LIC: 'бедная', UNK: '' };

export class RightPanel {
  constructor(app) { this.app = app; this.root = $('#right'); this.mode = null; }

  show(i) { this.mode = i >= 0 ? 'country' : 'world'; this.i = i; this.build(); this.update(); }

  build() {
    const app = this.app;
    if (this.mode === 'world') {
      this.root.innerHTML = `
        <div class="name">🌍 Мир</div><div class="sub">Кликните на страну, чтобы увидеть её агентов и вмешаться</div>
        <div class="stats" id="w-stats"></div>
        <h3>ВВП мира: сценарий vs база</h3><canvas class="chart" id="w-c1"></canvas>
        <h3>Рост мирового ВВП и инфляция</h3><canvas class="chart" id="w-c2"></canvas>
        <h3>Цена нефти (1.0 = базовая) и число войн</h3><canvas class="chart" id="w-c3"></canvas>
        <h3 id="w-rk-t">Лидеры и аутсайдеры</h3><div id="w-rk"></div>`;
      return;
    }
    const c = app.world.countries[this.i];
    this.root.innerHTML = `
      <div class="name">${flag(c.iso2)} ${c.nameRu}<button class="small" id="c-close" style="margin-left:auto">✕</button></div>
      <div class="sub">${REG[c.region] || c.region}${c.capital ? ' · ' + c.capital : ''}</div>
      <div class="tags" id="c-tags"></div>
      <div class="stats" id="c-stats"></div>
      <h3>ВВП: сценарий vs база (индекс, старт = 100)</h3><canvas class="chart" id="c-ch1"></canvas>
      <h3>Рост ВВП и инфляция, %</h3><canvas class="chart" id="c-ch2"></canvas>
      <h3>Безработица и стабильность</h3><canvas class="chart" id="c-ch3"></canvas>
      <h3>Агент-правительство</h3><div id="c-gov"></div>
      <h3>Агенты-граждане</h3><div id="c-cit"></div>
      <h3>Отношения</h3><div id="c-rel"></div>
      <h3>Вмешательство</h3><div id="c-act"></div>`;
    $('#c-close').onclick = () => app.select(-1);
    this.buildActions(c);
  }

  buildActions(c) {
    const app = this.app, T = app.T;
    const box = $('#c-act');
    box.innerHTML = `<div class="form">
      <select id="a-kind">
        <option value="fiscal">💰 Фискальный стимул (+) / сокращение (−), % ВВП</option>
        <option value="mil">🎖 Изменить военные расходы, п.п. ВВП</option>
        <option value="tariff">🛃 Ввести пошлины против…</option>
        <option value="sanction">⛔ Ввести санкции против…</option>
        <option value="war">⚔ Объявить войну…</option>
        <option value="relation">🤝 Изменить отношения с…</option>
      </select>
      <div id="a-fields" class="form"></div>
      <button class="primary" id="a-go">Применить</button>
      <div class="hint">Вмешательство попадает в активные сценарии (вкладка «Сценарии») и сравнивается с базовым миром.</div></div>`;
    const sel = id => targetSelectHtml(T, id, { exclude: 'iso:' + c.iso3 });
    const fields = {
      fiscal: () => `<div class="r2"><div><label>% ВВП</label><input id="a-val" type="number" step="0.5" value="3"></div><div><label>Месяцев</label><input id="a-dur" type="number" value="12"></div></div>`,
      mil: () => `<div class="r2"><div><label>п.п. ВВП</label><input id="a-val" type="number" step="0.5" value="2"></div><div><label>Месяцев</label><input id="a-dur" type="number" value="24"></div></div>`,
      tariff: () => `<div><label>Против кого</label>${sel('a-to')}</div><div><label>Пошлина, % (бессрочно, пока не отмените)</label><input id="a-val" type="number" value="30"></div>`,
      sanction: () => `<div><label>Против кого</label>${sel('a-to')}</div>`,
      war: () => `<div><label>Против кого</label>${sel('a-to')}</div>`,
      relation: () => `<div><label>С кем</label>${sel('a-to')}</div><div><label>Изменение (−1…+1)</label><input id="a-val" type="number" step="0.1" value="0.4"></div>`,
    };
    const render = () => { $('#a-fields').innerHTML = fields[$('#a-kind').value](); };
    $('#a-kind').onchange = render; render();
    $('#a-go').onclick = () => {
      const kind = $('#a-kind').value, val = parseFloat($('#a-val')?.value), dur = parseInt($('#a-dur')?.value) || 0, to = $('#a-to')?.value;
      const me = ['iso:' + c.iso3], name = c.nameRu;
      let def;
      if (kind === 'fiscal') def = { title: `${name}: фискальный ${val > 0 ? 'стимул' : 'курс на сокращение'} ${val}% ВВП`, duration: dur || 12, effects: [{ kind: 'shock', targets: me, var: 'fiscal', value: val }] };
      if (kind === 'mil') def = { title: `${name}: военные расходы ${val > 0 ? '+' : ''}${val} п.п.`, duration: dur || 24, effects: [{ kind: 'shock', targets: me, var: 'mil', value: val }] };
      if (kind === 'tariff') def = { title: `${name}: пошлины ${val}% против ${T.label(to)}`, duration: 0, effects: [{ kind: 'tariff', from: me, to: [to], value: val }] };
      if (kind === 'sanction') def = { title: `${name}: санкции против ${T.label(to)}`, duration: 0, effects: [{ kind: 'sanction', from: me, to: [to] }] };
      if (kind === 'war') def = { title: `${name} объявляет войну: ${T.label(to)}`, duration: 0, effects: [{ kind: 'war', a: me, b: [to] }] };
      if (kind === 'relation') def = { title: `${name}: отношения с ${T.label(to)} ${val > 0 ? '+' : ''}${val}`, duration: 0, effects: [{ kind: 'relation', a: me, b: [to], value: val }] };
      if (def.effects.some(e => e.value !== undefined && Number.isNaN(e.value))) return app.toast('Введите число');
      app.launch(def, 0);
    };
  }

  update() {
    if (this.mode === 'world') return this.updateWorld();
    if (this.mode === 'country') return this.updateCountry();
  }

  updateWorld() {
    const { sim, base } = this.app, a = sim.agg, b = base.agg;
    $('#w-stats').innerHTML = [
      stat('ВВП мира', fmtMoney(a.gdp), delta((a.gdp / b.gdp - 1) * 100, 2, true, '%')),
      stat('Рост', a.g.toFixed(2) + '%', delta(a.g - b.g, 2)),
      stat('Инфляция', a.infl.toFixed(2) + '%', delta(a.infl - b.infl, 2, false)),
      stat('Безработица', a.unemp.toFixed(2) + '%', delta(a.unemp - b.unemp, 2, false)),
      stat('Нефть', (sim.oil * 80).toFixed(0) + ' $/барр.', delta((sim.oil - base.oil) * 80, 0, false)),
      stat('Идущих войн', a.wars, ''),
      stat('Население', fmtNum(a.pop), ''),
      stat('Стабильность', (a.stab * 100).toFixed(0) + '/100', delta((a.stab - b.stab) * 100, 1)),
    ].join('');
    const idx = h => h.map(v => v / h[0] * 100);
    lineChart($('#w-c1'), [{ data: idx(base.wh.gdp), color: '#7b8aa6', label: 'база', dash: [4, 3] }, { data: idx(sim.wh.gdp), color: '#4c9aff', label: 'сценарий', width: 2 }], { fmt: v => v.toFixed(0) });
    lineChart($('#w-c2'), [{ data: sim.wh.g, color: '#2ec4a6', label: 'рост' }, { data: sim.wh.infl, color: '#f5a524', label: 'инфляция' }], { zeroLine: true, fmt: v => v.toFixed(1) });
    lineChart($('#w-c3'), [{ data: sim.wh.oil, color: '#c792ea', label: 'нефть' }, { data: sim.wh.wars.map(w => 1 + w * 0.1), color: '#ef5b60', label: 'войны ×0.1' }], { fmt: v => v.toFixed(2) });
    const hasScen = sim.scenarios.length > 0;
    const arr = sim.S.map((s, i) => ({ i, v: hasScen ? sim.metric(i, 'dGdp', base) : s.g })).sort((x, y) => y.v - x.v);
    const row = ({ i, v }) => `<div class="rel" data-i="${i}"><span>${flag(this.app.world.countries[i].iso2)} ${this.app.world.countries[i].nameRu}</span><span class="rv ${v >= 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span></div>`;
    $('#w-rk-t').textContent = hasScen ? 'Кто выиграл / проиграл (Δ ВВП к базе)' : 'Лидеры и аутсайдеры по росту ВВП';
    $('#w-rk').innerHTML = arr.slice(0, 5).map(row).join('') + '<div style="height:6px"></div>' + arr.slice(-5).reverse().map(row).join('');
    $('#w-rk').querySelectorAll('[data-i]').forEach(e => e.onclick = () => this.app.select(+e.dataset.i, true));
  }

  updateCountry() {
    const { sim, base, world } = this.app, i = this.i, c = world.countries[i], s = sim.S[i], b = base.S[i], N = world.N;
    const tags = [];
    c.blocs.filter(x => !['G20'].includes(x)).forEach(x => tags.push(`<span class="tag">${BLOC_NAMES[x] || x}</span>`));
    if (c.nuclear) tags.push('<span class="tag orange">☢ ядерное оружие</span>');
    if (INCOME[c.income]) tags.push(`<span class="tag">${INCOME[c.income]}</span>`);
    if (s.warCount) tags.push('<span class="tag red">⚔ в состоянии войны</span>');
    if (s.sanctionPressure > 0.05) tags.push(`<span class="tag orange">⛔ под санкциями ${(s.sanctionPressure * 100).toFixed(0)}%</span>`);
    if (s.protest > 0.2) tags.push('<span class="tag red">✊ протесты</span>');
    if (s.defaulted) tags.push('<span class="tag red">💥 дефолт</span>');
    if (c.imputed.length > 6) tags.push('<span class="tag">данные оценочные</span>');
    $('#c-tags').innerHTML = tags.join('');
    $('#c-stats').innerHTML = [
      stat('ВВП', fmtMoney(s.gdp), delta((s.gdp / b.gdp - 1) * 100, 2, true, '%')),
      stat('На душу', Math.round(s.gdp / s.pop).toLocaleString('ru') + ' $', ''),
      stat('Население', fmtNum(s.pop), ''),
      stat('Рост ВВП', s.g.toFixed(1) + '%', delta(s.g - b.g, 1)),
      stat('Инфляция', s.infl.toFixed(1) + '%', delta(s.infl - b.infl, 1, false)),
      stat('Безработица', s.unemp.toFixed(1) + '%', delta(s.unemp - b.unemp, 1, false)),
      stat('Гос. долг', s.debt.toFixed(0) + '% ВВП', delta(s.debt - b.debt, 0, false)),
      stat('Ключевая ставка', s.r.toFixed(1) + '%', ''),
      stat('Стабильность', (s.stab * 100).toFixed(0) + '/100', delta((s.stab - b.stab) * 100, 0)),
      stat('Настроения', (s.sent * 100).toFixed(0) + '/100', delta((s.sent - b.sent) * 100, 0)),
      stat('Армия, % ВВП', s.mil.toFixed(1) + '%', delta(s.mil - b.mil, 1, false)),
      stat('Фискальный курс', (s.f > 0 ? '+' : '') + s.f.toFixed(1) + '% ВВП', ''),
    ].join('');
    const idx = h => h.map(v => v / h[0] * 100);
    lineChart($('#c-ch1'), [{ data: idx(b.hist.gdp), color: '#7b8aa6', label: 'база', dash: [4, 3] }, { data: idx(s.hist.gdp), color: '#4c9aff', label: 'сценарий', width: 2 }], { fmt: v => v.toFixed(0) });
    lineChart($('#c-ch2'), [{ data: s.hist.g, color: '#2ec4a6', label: 'рост' }, { data: s.hist.infl, color: '#f5a524', label: 'инфляция' }], { zeroLine: true, fmt: v => v.toFixed(1) });
    lineChart($('#c-ch3'), [{ data: s.hist.unemp, color: '#ef5b60', label: 'безработица' }, { data: s.hist.stab.map(v => v * 20), color: '#9ad1ff', label: 'стабильность×20' }], { fmt: v => v.toFixed(1) });

    const bar = (name, v, col = 'var(--acc)') => `<div class="trait"><span>${name}</span><div class="tb"><i style="width:${(v * 100).toFixed(0)}%;background:${col}"></i></div><span>${(v * 100).toFixed(0)}</span></div>`;
    $('#c-gov').innerHTML = bar('Ястребиность', s.hawk, '#ef5b60') + bar('Кооперативность', s.coop, '#2ec4a6') + bar('Протекционизм', s.protect, '#f5a524')
      + bar('Демократичность', s.dem, '#9ad1ff') + bar('Эффективность', c.ge, '#c792ea')
      + `<div class="hint">Следующие выборы: ${s.dem > 0.5 ? (s.nextElection > sim.t ? 'через ' + (s.nextElection - sim.t) + ' мес.' : 'скоро') : 'нет (авторитарный режим)'}.</div>`;
    const cit = s.cit; let unemp = 0; for (let k = 0; k < cit.n; k++) unemp += cit.emp[k] ? 0 : 1;
    $('#c-cit').innerHTML = `<div class="hint">${cit.n} агентов, каждый представляет ${fmtNum(s.pop / cit.n)} человек.</div>`
      + bar('Безработные', unemp / cit.n, '#ef5b60') + bar('Протестуют', s.protest, '#f5a524') + bar('Довольны жизнью', s.sent, '#2ec4a6')
      + (Math.abs(s.migNet) > 1000 ? `<div class="hint">Чистая миграция: ${s.migNet > 0 ? '+' : ''}${fmtNum(s.migNet)} чел.</div>` : '');

    const rel = [];
    for (let j = 0; j < N; j++) if (j !== i) rel.push({ j, r: sim.R[i * N + j], w: world.share[i * N + j] });
    const friends = [...rel].sort((x, y) => y.r - x.r).slice(0, 4), foes = [...rel].sort((x, y) => x.r - y.r).slice(0, 4);
    const trade = [...rel].sort((x, y) => y.w - x.w).slice(0, 4);
    const status = j => [sim.warMat[i * N + j] ? '⚔' : '', sim.San[i * N + j] ? '⛔→' : '', sim.San[j * N + i] ? '⛔←' : '', sim.T[i * N + j] ? `🛃${sim.T[i * N + j].toFixed(0)}%` : '', sim.T[j * N + i] ? `←🛃${sim.T[j * N + i].toFixed(0)}%` : ''].filter(Boolean).join(' ');
    const line = x => `<div class="rel" data-i="${x.j}"><span>${flag(world.countries[x.j].iso2)} ${world.countries[x.j].nameRu} <span class="hint">${status(x.j)}</span></span><span class="rv ${x.r >= 0 ? 'pos' : 'neg'}">${x.r > 0 ? '+' : ''}${x.r.toFixed(2)}</span></div>`;
    $('#c-rel').innerHTML = '<div class="hint">Союзники и друзья</div>' + friends.map(line).join('') + '<div class="hint" style="margin-top:6px">Недруги</div>' + foes.map(line).join('')
      + '<div class="hint" style="margin-top:6px">Главные торговые партнёры</div>' + trade.map(x => line(x)).join('');
    $('#c-rel').querySelectorAll('[data-i]').forEach(e => e.onclick = () => this.app.select(+e.dataset.i, true));
  }
}
