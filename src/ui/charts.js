// Мини-графики на canvas.
export function lineChart(canvas, series, { height = 90, zeroLine = false, fmt = v => v.toFixed(1) } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 260, h = height;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px'; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const all = series.flatMap(s => s.data).filter(Number.isFinite);
  if (all.length < 2) return;
  let min = Math.min(...all), max = Math.max(...all);
  if (zeroLine) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (max - min < 1e-9) { max += 1; min -= 1; }
  const pad = (max - min) * 0.08; min -= pad; max += pad;
  const L = 4, R = 4, T = 6, B = 14;
  const X = (i, n) => L + (w - L - R) * (n <= 1 ? 0 : i / (n - 1));
  const Y = v => T + (h - T - B) * (1 - (v - min) / (max - min));
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
  for (let k = 0; k <= 2; k++) { const y = T + (h - T - B) * k / 2; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); }
  if (zeroLine && min < 0 && max > 0) { ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(w - R, Y(0)); ctx.stroke(); }
  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.6; ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    s.data.forEach((v, i) => { const x = X(i, s.data.length), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '10px -apple-system, system-ui, sans-serif';
  ctx.fillText(fmt(max - pad), L + 2, T + 8); ctx.fillText(fmt(min + pad), L + 2, h - B - 2);
  let lx = w - R;
  ctx.textAlign = 'right';
  series.forEach((s, k) => { ctx.fillStyle = s.color; ctx.fillText(s.label || '', lx, h - 2); lx -= ctx.measureText(s.label || '').width + 14; });
  ctx.textAlign = 'left';
}
