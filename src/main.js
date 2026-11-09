import './style.css';
import { buildWorld } from './sim/world.js';
import { Sim } from './sim/engine.js';
import { Globe } from './ui/globe.js';
import { METRICS, METRIC_GROUPS, colorOf, gradientCss, fmtMoney } from './ui/colors.js';
import { buildTargets } from './ui/targets.js';
import { initLeft } from './ui/leftPanel.js';
import { RightPanel } from './ui/rightPanel.js';

const $ = s => document.querySelector(s);
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

async function boot() {
  const [raw, topo] = await Promise.all([
    fetch('/data/countries.json').then(r => r.json()),
    fetch('/data/world-50m.json').then(r => r.json()),
  ]);
  const world = buildWorld(raw);
  const app = window.app = { world, T: buildTargets(world), metric: 'g', running: false, speed: 1, selected: -1, seed: 1, feedMinor: false };

  app.newSims = () => {
    app.sim = new Sim(world, { seed: app.seed });
    app.base = new Sim(world, { seed: app.seed, baseline: true });
  };
  app.newSims();

  app.toast = msg => {
    const el = $('#toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(app._toast); app._toast = setTimeout(() => el.classList.remove('on'), 2200);
  };

  // ---------- глобус ----------
  const tip = $('#tooltip');
  app.globe = new Globe($('#globe'), world, topo, {
    onHover: (id, xy) => {
      if (id < 0 || !xy) { tip.style.display = 'none'; return; }
      const c = world.countries[id], m = METRICS[app.metric];
      const v = app.sim.metric(id, app.metric, app.base);
      tip.innerHTML = `<b>${c.nameRu}</b><br>${m.label}: <b>${m.fmt(v)}</b><br><span style="color:var(--mute)">ВВП ${fmtMoney(app.sim.S[id].gdp)}</span>`;
      tip.style.display = 'block';
      tip.style.left = Math.min(innerWidth - 250, xy[0] + 16) + 'px'; tip.style.top = Math.min(innerHeight - 90, xy[1] + 12) + 'px';
    },
    onClick: id => app.select(id),
  });

  app.select = (i, fly = false) => {
    app.selected = i;
    app.globe.setSelected(i);
    app.right.show(i);
    if (i >= 0 && (fly || true)) app.globe.flyTo(i);
    app.overlaySig = null; app.refreshOverlay();
  };

  app.launch = (def, delay = 0) => {
    app.sim.addScenario({ ...def, start: app.sim.t + delay });
    app.refreshActive(); app.toast(`Сценарий «${def.title}» запущен`);
    setRunning(true);
  };

  // ---------- панели ----------
  app.right = new RightPanel(app);
  initLeft(app);
  app.refreshActive();
  app.right.show(-1);

  // метрики
  $('#metric').innerHTML = METRIC_GROUPS.map(([g, keys]) => `<optgroup label="${g}">${keys.map(k => `<option value="${k}">${METRICS[k].label}</option>`).join('')}</optgroup>`).join('');
  $('#metric').onchange = e => { app.metric = e.target.value; refreshMap(); };

  // ---------- управление ----------
  const playBtn = $('#btn-play');
  function setRunning(v) { app.running = v; playBtn.textContent = v ? '⏸ Пауза' : '▶ Пуск'; }
  playBtn.onclick = () => setRunning(!app.running);
  $('#btn-step').onclick = () => { setRunning(false); stepOnce(); refreshAll(true); };
  $('#speed').onchange = e => (app.speed = +e.target.value);
  $('#btn-reset').onclick = () => { app.newSims(); app.overlaySig = null; app.lastFeedId = -1; setRunning(false); app.refreshActive(); refreshAll(true); app.toast('Мир перезапущен'); };
  addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); setRunning(!app.running); } });
  $('#feed-minor').onchange = e => { app.feedMinor = e.target.checked; app.lastFeedId = -1; refreshFeed(); };

  function stepOnce() { app.sim.step(); app.base.step(); }

  // ---------- обновления интерфейса ----------
  function refreshMap() {
    const { sim, base } = app, key = app.metric;
    app.globe.setColors(world.countries.map(c => colorOf(key, sim.metric(c.i, key, base))));
    const m = METRICS[key], st = m.stops;
    $('#lg-title').textContent = m.label;
    $('#lg-bar').style.background = gradientCss(key);
    $('#lg-min').textContent = m.fmt(st[0][0]); $('#lg-max').textContent = m.fmt(st[st.length - 1][0]);
  }

  function refreshHud() {
    const { sim, base } = app, a = sim.agg, b = base.agg, d = (a.gdp / b.gdp - 1) * 100;
    $('#date').textContent = sim.date();
    $('#agg').innerHTML = `<span>ВВП <b>${fmtMoney(a.gdp)}</b>${Math.abs(d) >= 0.01 ? ` <span class="${d >= 0 ? 'pos' : 'neg'}">${d > 0 ? '+' : ''}${d.toFixed(2)}%</span>` : ''}</span>`
      + `<span>Рост <b>${a.g.toFixed(2)}%</b></span><span>Инфляция <b>${a.infl.toFixed(2)}%</b></span><span>Нефть <b>$${(sim.oil * 80).toFixed(0)}</b></span>`
      + `<span>Войны <b style="color:${a.wars ? 'var(--bad)' : 'inherit'}">${a.wars}</b></span>`;
  }

  function refreshOverlay() {
    const { sim } = app, N = world.N;
    const warSig = sim.wars.map(w => w.id + ':' + w.a.length + ':' + w.b.length).join(',');
    let sanN = 0; for (let k = 0; k < sim.San.length; k++) sanN += sim.San[k];
    const prot = sim.S.filter(s => s.protest > 0.2).map(s => s.i).join(',');
    const sig = [warSig, sanN, app.selected, prot, sim.S[app.selected]?.gdp > 0 ? 0 : 1].join('|');
    if (sig === app.overlaySig) return;
    app.overlaySig = sig;
    const arcs = [], markers = [];
    for (const w of sim.wars) {
      const seen = new Set();
      for (const a of w.a) for (const b of w.b) {
        if (a !== w.primaryA && b !== w.primaryB) continue;
        const k = a + '-' + b; if (seen.has(k)) continue; seen.add(k);
        arcs.push({ i: a, j: b, color: 0xff4d55, opacity: 0.95, speed: 0.5, dotSize: 0.01 });
      }
      [...w.a, ...w.b].forEach(i => markers.push({ i, color: 0xff3b44, size: 0.07 }));
    }
    let n = 0;
    for (let i = 0; i < N && n < 80; i++) for (let j = 0; j < N && n < 80; j++) {
      if (sim.San[i * N + j] && (app.selected < 0 || i === app.selected || j === app.selected || n < 25)) { arcs.push({ i, j, color: 0xf5a524, opacity: 0.55, speed: 0.15, dotSize: 0.005 }); n++; }
    }
    if (app.selected >= 0) {
      const i = app.selected;
      for (const j of world.partners[i].slice(0, 6)) {
        const r = sim.R[i * N + j];
        arcs.push({ i, j, color: r > 0.3 ? 0x2ec4a6 : r < -0.2 ? 0xff7a90 : 0x6c8bbd, opacity: 0.6, speed: 0.22, dotSize: 0.006 });
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
    const list = ev.filter(e => app.feedMinor || e.sev >= 2).slice(-80).reverse();
    $('#feed-list').innerHTML = list.length ? list.map(e => {
      const m = MONTHS[e.t % 12] + ' ' + (app.sim.startYear + Math.floor(e.t / 12));
      return `<div class="ev s${e.sev}" data-i="${e.ids[0] ?? -1}"><span class="et">${m}</span><span>${e.text}</span></div>`;
    }).join('') : '<div class="hint" style="padding:8px 0">Событий пока нет. Нажмите «Пуск» или запустите сценарий.</div>';
    document.querySelectorAll('#feed-list .ev').forEach(el => el.onclick = () => { const i = +el.dataset.i; if (i >= 0) app.select(i, true); });
  }

  let lastUi = 0, lastMap = 0, lastSlow = 0;
  function refreshAll(force) {
    const now = performance.now();
    if (force || now - lastMap > 250) { refreshMap(); lastMap = now; }
    if (force || now - lastUi > 250) {
      refreshHud(); refreshFeed(); app.right.update(); refreshOverlay(); lastUi = now;
    }
    if (force || now - lastSlow > 800) { app.refreshActive(); app.refreshImpact?.(); lastSlow = now; }
  }

  // ---------- главный цикл ----------
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
  $('#metric').value = app.metric;
}

boot().catch(err => { console.error(err); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:60px;left:20px;color:#f88;z-index:99">${err.stack}</pre>`); });
