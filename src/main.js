import './style.css';
import { buildWorld } from './sim/world.js';
import { Sim } from './sim/engine.js';
import { Globe } from './ui/globe.js';
import { METRICS, METRIC_GROUPS, colorOf, gradientCss, fmtMoney } from './ui/colors.js';
import { buildTargets, esc } from './ui/targets.js';
import { initLeft } from './ui/leftPanel.js';
import { RightPanel } from './ui/rightPanel.js';
import { initEnsemble } from './ui/ensemble.js';
import { CALENDAR, monthOf } from './sim/calendar.js';

const $ = s => document.querySelector(s);
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const getJson = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);

// KPI sparkline: last ~10 years, scenario line and dashed baseline
function spark(data, baseData, color) {
  const n = Math.min(data.length, 120), d = data.slice(-n), b = baseData ? baseData.slice(-n) : null;
  if (n < 2) return '';
  const all = b ? d.concat(b) : d;
  let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pts = arr => arr.map((v, i) => `${(i / (n - 1) * 54).toFixed(1)},${(24 - (v - lo) / (hi - lo) * 22).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 54 26">${b ? `<polyline points="${pts(b)}" fill="none" stroke="#5f6d87" stroke-width="1" stroke-dasharray="2 2"/>` : ''}<polyline points="${pts(d)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

async function boot() {
  const [raw, topo, trade, markets, history] = await Promise.all([
    getJson('/data/countries.json'), getJson('/data/world-50m.json'), getJson('/data/trade.json'), getJson('/data/markets.json'), getJson('/data/history.json'),
  ]);
  let world = buildWorld(raw, { trade, markets });
  const app = window.app = { world, raw, trade, markets, history, cal: null, swapped: false, noise: 1, T: buildTargets(world), metric: 'g', running: false, speed: 1, selected: -1, seed: 1 + Math.floor(Math.random() * 1e6), feedMinor: false };

  // calendar mode: "as it was" gets every event after the start year, the comparison world lacks the removed ones
  app.newSims = () => {
    app.sim = new Sim(world, { seed: app.seed, noise: app.noise });
    app.base = new Sim(world, { seed: app.seed, noise: app.noise });
    app.swapped = false;
    if (app.cal) for (const ev of CALENDAR) {
      const start = monthOf(ev, app.cal.startYear);
      if (start < 0) continue;
      const def = { title: `${ev.icon} ${ev.title}`, desc: ev.desc, duration: ev.duration, start, effects: ev.effects };
      app.sim.addScenario(def);
      if (!app.cal.removed.has(ev.id)) app.base.addScenario(def);
    }
  };
  // rebuild the world for another start year (2026 = today, earlier = actual state of that year)
  app.setStartYear = (startYear, cal = null) => {
    world = app.world = buildWorld(raw, { trade, markets, history, startYear });
    app.cal = cal; app.T = buildTargets(world); app.globe.world = world;
    app.seed = 1 + Math.floor(Math.random() * 1e6);
    app.newSims(); app.overlaySig = null; app.lastFeedId = -1; app.selected = -1; app.globe.setSelected(-1);
    app.right.show(-1); app.refreshActive(); app.refreshMode(); app.refreshAll(true);
  };
  // actual World Bank annual values stretched to the monthly history (NaN where unknown) for chart overlays
  app.actual = (len, iso, key) => {
    if (!app.cal || !history) return null;
    const src = iso ? history[iso]?.[key] : history._WLD?.[key];
    if (!src) return null;
    return Array.from({ length: len }, (_, k) => { const v = src[app.sim.startYear + Math.floor(Math.max(0, k - 1) / 12)]; return v == null ? NaN : v; });
  };
  // show the comparison world on the globe instead (deltas flip sign)
  app.swapWorlds = () => { [app.sim, app.base] = [app.base, app.sim]; app.swapped = !app.swapped; app.overlaySig = null; app.lastFeedId = -1; app.refreshMode(); app.refreshAll(true); };
  app.refreshMode = () => {
    const chip = $('#mode-chip');
    if (!app.cal) { chip.innerHTML = ''; return; }
    const n = app.cal.removed.size;
    chip.innerHTML = `🗓 История с ${app.cal.startYear}`
      + (n ? `<span class="seg"><button data-w="real" class="${app.swapped ? '' : 'on'}">Как было</button><button data-w="cf" class="${app.swapped ? 'on' : ''}">Без событий</button></span>` : '')
      + '<button id="mc-res">Результат</button><button id="mc-exit">Выйти в сегодня</button>';
    chip.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { if ((b.dataset.w === 'cf') !== app.swapped) app.swapWorlds(); });
    $('#mc-res').onclick = () => app.openCalendarResult ? (app.openCalendarResult(), app.openTab('cal')) : app.openTab('cal');
    $('#mc-exit').onclick = () => { app.setStartYear(2026, null); app.toast('Вернулись в сегодняшний мир'); };
  };
  app.newSims();

  app.toast = msg => {
    const el = $('#toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(app._toast); app._toast = setTimeout(() => el.classList.remove('on'), 2400);
  };

  // ---------- globe ----------
  const tip = $('#tooltip');
  app.globe = new Globe($('#globe'), world, topo, {
    onHover: (id, xy) => {
      if (id < 0 || !xy) { tip.style.display = 'none'; return; }
      const c = world.countries[id], m = METRICS[app.metric], s = app.sim.S[id];
      const v = app.sim.metric(id, app.metric, app.base);
      tip.innerHTML = `<b>${esc(c.nameRu)}</b><div style="color:var(--mute)">${m.label}</div><div class="tt-v">${m.fmt(v)}</div>`
        + `<div style="color:var(--mute)">ВВП ${fmtMoney(s.gdp)} · ${esc(c.currency.code)} ${((Math.exp(s.e) - 1) * 100 > 0 ? '+' : '') + ((Math.exp(s.e) - 1) * 100).toFixed(0)}%</div>`;
      tip.style.display = 'block';
      tip.style.left = Math.min(innerWidth - 260, xy[0] + 16) + 'px'; tip.style.top = Math.min(innerHeight - 110, xy[1] + 12) + 'px';
    },
    onClick: id => app.select(id),
  });

  app.select = i => {
    app.selected = i;
    app.globe.setSelected(i);
    app.right.show(i);
    if (i >= 0) app.globe.flyTo(i);
    app.overlaySig = null; app.refreshOverlay();
  };

  app.launch = (def, delay = 0) => {
    app.sim.addScenario({ ...def, start: app.sim.t + delay });
    app.refreshActive(); app.toast(`Сценарий «${def.title}» запущен`);
    setRunning(true);
  };

  // ---------- panels ----------
  app.right = new RightPanel(app);
  initLeft(app);
  initEnsemble(app);
  app.refreshActive();
  app.right.show(-1);
  app.refreshMode();

  // ---------- map metric ----------
  const mapkey = $('#mapkey');
  const renderMenu = () => {
    $('#metric-menu').innerHTML = METRIC_GROUPS.map(([g, keys]) => `<div class="grp">${g}</div><div class="opts">${keys.map(k => `<button data-k="${k}" class="${k === app.metric ? 'on' : ''}">${METRICS[k].label}</button>`).join('')}</div>`).join('');
    $('#metric-menu').querySelectorAll('[data-k]').forEach(b => b.onclick = e => { e.stopPropagation(); app.setMetric(b.dataset.k); mapkey.classList.remove('open'); });
  };
  app.setMetric = k => { app.metric = k; renderMenu(); refreshMap(); };
  $('#metric-btn').onclick = e => { e.stopPropagation(); mapkey.classList.toggle('open'); };
  addEventListener('click', e => { if (!mapkey.contains(e.target)) mapkey.classList.remove('open'); });
  renderMenu();

  // ---------- time controls ----------
  const playBtn = $('#btn-play');
  function setRunning(v) { app.running = v; playBtn.textContent = v ? '❚❚' : '▶'; playBtn.classList.toggle('on', v); }
  app.setRunning = setRunning;
  playBtn.onclick = () => setRunning(!app.running);
  $('#btn-step').onclick = () => { setRunning(false); stepOnce(); refreshAll(true); };
  $('#speed').querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    app.speed = +b.dataset.v; $('#speed').querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#btn-reset').onclick = () => { app.seed = 1 + Math.floor(Math.random() * 1e6); app.newSims(); app.overlaySig = null; app.lastFeedId = -1; setRunning(false); app.refreshActive(); refreshAll(true); app.toast('Мир перезапущен'); };
  addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); setRunning(!app.running); } });
  $('#feed-minor').onchange = e => { app.feedMinor = e.target.checked; app.lastFeedId = -1; refreshFeed(); };
  $('#feed-toggle').onclick = () => $('#dock').classList.toggle('feed-open');
  // random shocks on/off for the worlds on the globe (the Evaluate windows always keep them)
  const noiseBtn = $('#btn-noise');
  const paintNoise = () => { noiseBtn.classList.toggle('on', app.noise > 0); noiseBtn.textContent = app.noise > 0 ? '🎲 Случайность: вкл' : '🎲 Случайность: выкл'; };
  noiseBtn.onclick = () => {
    app.noise = app.noise > 0 ? 0 : 1; app.sim.noise = app.base.noise = app.noise; paintNoise();
    app.toast(app.noise ? 'Случайные шоки включены: мир как в реальности, с колебаниями' : 'Случайные шоки выключены: глобус показывает ожидаемую траекторию, решения агентов остаются');
  };
  paintNoise();
  // calendar mode: clicking a year or an event icon on the timeline travels there
  $('#timeline').onclick = e => {
    if (!app.cal) return;
    const icon = e.target.closest('#tl-cal span');
    const r = $('#timeline').getBoundingClientRect();
    const y = icon ? +icon.dataset.y : Math.floor(2000 + (e.clientX - r.left) / r.width * 32);
    app.calendarTravel(Math.max(2000, Math.min(2025, y)));
  };

  function stepOnce() { app.sim.step(); app.base.step(); }

  // ---------- UI refresh ----------
  function refreshMap() {
    const { sim, base } = app, key = app.metric;
    app.globe.setColors(world.countries.map(c => colorOf(key, sim.metric(c.i, key, base))));
    const m = METRICS[key], st = m.stops;
    $('#lg-title').textContent = m.label;
    $('#lg-bar').style.background = gradientCss(key);
    $('#lg-min').textContent = m.fmt(st[0][0]); $('#lg-max').textContent = m.fmt(st[st.length - 1][0]);
  }

  const kpiDefs = [
    { k: 'ВВП мира', v: a => fmtMoney(a.gdp), d: (a, b) => (a.gdp / b.gdp - 1) * 100, u: '%', h: w => w.gdp, c: '#5b9cff', good: 1 },
    { k: 'Рост', v: a => a.g.toFixed(2) + '%', d: (a, b) => a.g - b.g, u: '', h: w => w.g, c: '#2fd3a7', good: 1 },
    { k: 'Инфляция', v: a => a.infl.toFixed(2) + '%', d: (a, b) => a.infl - b.infl, u: '', h: w => w.infl, c: '#ffb547', good: -1 },
    { k: 'Нефть', v: (a, s) => '$' + (s.oil * 80).toFixed(0), d: (a, b, s, bs) => (s.oil - bs.oil) * 80, u: '$', h: w => w.oil, c: '#c792ea', good: 0 },
    { k: 'Акции мира', v: a => ((Math.exp(a.eq) - 1) * 100 > 0 ? '+' : '') + ((Math.exp(a.eq) - 1) * 100).toFixed(1) + '%', d: (a, b) => (Math.exp(a.eq - b.eq) - 1) * 100, u: '%', h: w => w.eq, c: '#7cc4ff', good: 1 },
    { k: 'Биткоин', v: a => '$' + Math.round(a.btc).toLocaleString('ru'), d: (a, b) => (a.btc / b.btc - 1) * 100, u: '%', h: w => w.btc, c: '#f7931a', good: 0 },
    { k: 'Торговля', v: a => ((a.trade - 1) * 100 > 0 ? '+' : '') + ((a.trade - 1) * 100).toFixed(1) + '%', d: (a, b) => (a.trade / b.trade - 1) * 100, u: '%', h: w => w.trade, c: '#9ad1ff', good: 1 },
    { k: 'Войны', v: a => String(a.wars), d: (a, b) => a.wars - b.wars, u: '', h: w => w.wars, c: '#ff5c6c', good: -1, alert: a => a.wars > 0 },
  ];
  function refreshHud() {
    const { sim, base } = app, a = sim.agg, b = base.agg;
    $('#date').textContent = sim.date();
    $('#kpis').innerHTML = kpiDefs.map(d => {
      const dv = d.d(a, b, sim, base), show = Math.abs(dv) >= 0.01;
      const cls = !show || !d.good ? '' : (dv > 0) === (d.good > 0) ? 'pos' : 'neg';
      return `<div class="kpi${d.alert?.(a) ? ' alert' : ''}"><span class="k">${d.k}</span><span class="kv">${d.v(a, sim)}${show ? `<span class="kd ${cls}">${dv > 0 ? '+' : ''}${dv.toFixed(Math.abs(dv) >= 10 ? 0 : 2)}${d.u}</span>` : ''}</span>${spark(d.h(sim.wh), sim.scenarios.length ? d.h(base.wh) : null, d.c)}</div>`;
    }).join('');
    // timeline. Normal mode: from the start, the horizon grows as the simulation runs.
    // Calendar mode: the whole calendar 2000–2031, years before the start hatched, events as icons on their dates.
    const cal = app.cal, T0 = cal ? 2000 : sim.startYear;
    const span = cal ? (2032 - 2000) * 12 : Math.max(240, Math.ceil((sim.t + 1) / 120) * 120);
    const off = cal ? (sim.startYear - 2000) * 12 : 0, pos = m => Math.min(100, (off + m) / span * 100);
    document.body.classList.toggle('cal-mode', !!cal);
    $('#timeline').title = cal ? 'Клик по году или событию — перенестись туда' : '';
    $('#tl-pre').style.width = (off / span * 100) + '%';
    $('#tl-fill').style.left = (off / span * 100) + '%';
    $('#tl-fill').style.width = (pos(sim.t) - off / span * 100) + '%';
    const years = span / 12, stepY = cal ? 5 : years > 30 ? 10 : 5;
    let ys = ''; for (let y = 0; y <= years; y += stepY) ys += `<span style="left:${y / years * 100}%">${T0 + y}</span>`;
    $('#tl-years').innerHTML = ys;
    const marks = sim.events.filter(e => ['war', 'scenario', 'fx', 'default', 'peace'].includes(e.kind) && e.sev >= 3 && !(cal && e.kind === 'scenario')).slice(-60);
    const col = { war: '#ff5c6c', scenario: '#5b9cff', fx: '#ffb547', default: '#ff8a3d', peace: '#2fd3a7' };
    $('#tl-marks').innerHTML = marks.map(e => `<i style="left:${pos(e.t)}%;background:${col[e.kind]}" title="${esc(e.text)}"></i>`).join('');
    const calHtml = cal ? CALENDAR.map(ev => {
      const m = monthOf(ev, 2000), past = +ev.date.slice(0, 4) < cal.startYear, off2 = cal.removed.has(ev.id) && !past;
      return `<span data-y="${ev.date.slice(0, 4)}" class="${past ? 'past' : ''}${off2 ? ' off' : ''}" style="left:${m / span * 100}%" title="${ev.date.replace('-', '.')} · ${esc(ev.title)}${past ? ' (до старта)' : off2 ? ' — убрано в мире-сравнении' : ''}\nКлик — перенестись в ${ev.date.slice(0, 4)}">${ev.icon}</span>`;
    }).join('') : '';
    if ($('#tl-cal').innerHTML !== calHtml) $('#tl-cal').innerHTML = calHtml;
  }

  function refreshOverlay() {
    const { sim } = app, N = world.N;
    const warSig = sim.wars.map(w => w.id + ':' + w.a.length + ':' + w.b.length).join(',');
    let sanN = 0; for (let k = 0; k < sim.San.length; k++) sanN += sim.San[k];
    const prot = sim.S.filter(s => s.protest > 0.2).map(s => s.i).join(',');
    const sig = [warSig, sanN, app.selected, prot].join('|');
    if (sig === app.overlaySig) return;
    app.overlaySig = sig;
    const arcs = [], markers = [];
    for (const w of sim.wars) {
      const seen = new Set();
      for (const a of w.a) for (const b of w.b) {
        if (a !== w.primaryA && b !== w.primaryB) continue;
        const k = a + '-' + b; if (seen.has(k)) continue; seen.add(k);
        arcs.push({ i: a, j: b, color: 0xff4d5e, opacity: 0.95, speed: 0.5, dotSize: 0.01 });
      }
      [...w.a, ...w.b].forEach(i => markers.push({ i, color: 0xff3b50, size: 0.07 }));
    }
    let n = 0;
    for (let i = 0; i < N && n < 80; i++) for (let j = 0; j < N && n < 80; j++) {
      if (sim.San[i * N + j] && (app.selected < 0 || i === app.selected || j === app.selected || n < 25)) { arcs.push({ i, j, color: 0xffb547, opacity: 0.55, speed: 0.15, dotSize: 0.005 }); n++; }
    }
    if (app.selected >= 0) {
      const i = app.selected;
      for (const j of world.partners[i].slice(0, 6)) {
        const r = sim.R[i * N + j];
        arcs.push({ i, j, color: r > 0.3 ? 0x2fd3a7 : r < -0.2 ? 0xff7a90 : 0x6c8bbd, opacity: 0.6, speed: 0.22, dotSize: 0.006 });
      }
    }
    sim.S.forEach(s => { if (s.protest > 0.2 && markers.length < 120) markers.push({ i: s.i, color: 0xffd166, size: 0.045 }); });
    app.globe.setArcs(arcs); app.globe.setMarkers(markers);
  }
  app.refreshOverlay = refreshOverlay;

  app.lastFeedId = -1;
  function refreshFeed() {
    const ev = app.sim.events, last = ev.length ? ev[ev.length - 1].id : 0;
    if (last === app.lastFeedId) return;
    app.lastFeedId = last;
    const list = ev.filter(e => app.feedMinor || e.sev >= 2).slice(-100).reverse();
    const when = e => MONTHS[e.t % 12] + ' ' + (app.sim.startYear + Math.floor(e.t / 12));
    const item = e => `<div class="ev s${e.sev}" data-i="${e.ids[0] ?? -1}"><span class="et">${when(e)}</span><span>${esc(e.text)}</span></div>`;
    $('#feed-list').innerHTML = list.length ? list.map(item).join('') : '<div class="hint" style="padding:8px 0">Событий пока нет. Нажмите ▶ или запустите сценарий.</div>';
    $('#ticker-list').innerHTML = list.length ? list.slice(0, 5).map(item).join('') : '<span class="hint">Событий пока нет — нажмите ▶ или запустите сценарий слева.</span>';
    document.querySelectorAll('#feed-list .ev, #ticker-list .ev').forEach(el => el.onclick = () => { const i = +el.dataset.i; if (i >= 0) app.select(i); });
  }

  let lastUi = 0, lastMap = 0, lastSlow = 0;
  function refreshAll(force) {
    const now = performance.now();
    if (force || now - lastMap > 250) { refreshMap(); lastMap = now; }
    if (force || now - lastUi > 250) { refreshHud(); refreshFeed(); app.right.update(); refreshOverlay(); lastUi = now; }
    if (force || now - lastSlow > 800) { app.refreshActive(); app.refreshImpact?.(); app.refreshMarkets?.(); app.refreshCalendar?.(); lastSlow = now; }
  }
  app.refreshAll = refreshAll;

  // ---------- main loop ----------
  let prev = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
    if (app.running) {
      acc += dt * app.speed;
      let n = 0;
      while (acc >= 1 && n < 4) { stepOnce(); acc -= 1; n++; }
      if (acc > 4) acc = 0;
      if (n) refreshAll(false);
    }
    requestAnimationFrame(frame);
  }
  refreshAll(true);
  requestAnimationFrame(frame);
}

boot().catch(err => { console.error(err); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:70px;left:20px;color:#f88;z-index:99">${esc(err.stack)}</pre>`); });
