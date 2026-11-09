// 3D-глобус: текстура собирается из полигонов Natural Earth на canvas, раскраска обновляется по метрике.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath, geoGraticule10 } from 'd3-geo';

const TW = 4096, TH = 2048;      // цветная текстура
const IW = 2048, IH = 1024;      // карта идентификаторов для выбора мышью

export function latLonToVec3(lat, lon, r = 1) {
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
}

export class Globe {
  constructor(container, world, topo, { onHover, onClick }) {
    this.container = container; this.world = world; this.onHover = onHover; this.onClick = onClick;
    this.N = world.N; this.hover = -1; this.selected = -1;
    this.colors = new Array(this.N).fill([50, 60, 80]);
    this.initPaths(topo);
    this.initScene();
    this.paintIdMap();
    this.paint();
    this.animate = this.animate.bind(this);
    this.t0 = performance.now(); this.tPrev = this.t0;
    this.animate();
  }

  // ---------- геометрия ----------
  initPaths(topo) {
    const proj = geoEquirectangular().scale(TW / (2 * Math.PI)).translate([TW / 2, TH / 2]);
    const gp = geoPath(proj);
    const feats = feature(topo, topo.objects.countries).features;
    const byNum = new Map(this.world.countries.map(c => [c.num, c.i]));
    this.polys = feats.map(f => {
      const p = new Path2D();
      geoPath(proj, p)(f);
      return { path: p, idx: f.id != null ? (byNum.get(String(f.id).padStart(3, '0')) ?? -1) : -1 };
    });
    this.graticule = new Path2D(); geoPath(proj, this.graticule)(geoGraticule10());
    this.proj = proj;
    // страны без полигона или очень маленькие — рисуем точками
    const hasPoly = new Set(this.polys.map(p => p.idx));
    this.dots = this.world.countries.filter(c => !hasPoly.has(c.i) || c.area < 1500).map(c => {
      const [x, y] = proj([c.cLon, c.cLat]);
      return { i: c.i, x, y };
    });
  }

  paint() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a1424'; ctx.fillRect(0, 0, TW, TH);
    ctx.strokeStyle = 'rgba(120,160,220,.07)'; ctx.lineWidth = 1.2; ctx.stroke(this.graticule);
    for (const p of this.polys) {
      const c = p.idx >= 0 ? this.colors[p.idx] : [38, 46, 62];
      ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      ctx.fill(p.path);
    }
    ctx.strokeStyle = 'rgba(8,14,26,.85)'; ctx.lineWidth = 1.1;
    for (const p of this.polys) ctx.stroke(p.path);
    for (const d of this.dots) {
      const c = this.colors[d.i];
      ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(8,14,26,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    this.tex.needsUpdate = true;
  }

  paintIdMap() {
    const cv = document.createElement('canvas'); cv.width = IW; cv.height = IH;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, IW, IH);
    ctx.scale(IW / TW, IH / TH);
    const code = i => { const v = i + 1; return `rgb(${v & 255},${v >> 8},0)`; };
    for (const p of this.polys) if (p.idx >= 0) { ctx.fillStyle = code(p.idx); ctx.fill(p.path); }
    for (const d of this.dots) { ctx.fillStyle = code(d.i); ctx.beginPath(); ctx.arc(d.x, d.y, 9, 0, Math.PI * 2); ctx.fill(); }
    this.idData = ctx.getImageData(0, 0, IW, IH).data;
  }

  idAt(u, v) {
    const x = Math.min(IW - 1, Math.max(0, Math.floor(u * IW))), y = Math.min(IH - 1, Math.max(0, Math.floor((1 - v) * IH)));
    const o = (y * IW + x) * 4;
    const id = this.idData[o] + (this.idData[o + 1] << 8) - 1;
    return id >= 0 && id < this.N ? id : -1;
  }

  // ---------- сцена ----------
  initScene() {
    const el = this.container;
    const w = el.clientWidth, h = el.clientHeight;
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h); renderer.setClearColor(0x050912);
    el.appendChild(renderer.domElement);
    const scene = this.scene = new THREE.Scene();
    const camera = this.camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 200);
    camera.position.set(0.9, 0.9, 2.6);

    const cv = this.canvas = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    this.ctx = cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.MeshBasicMaterial({ map: this.tex }));
    scene.add(this.earth);

    // подсветка наведённой/выбранной страны
    const hv = this.hcanvas = document.createElement('canvas'); hv.width = 2048; hv.height = 1024;
    this.hctx = hv.getContext('2d');
    this.htex = new THREE.CanvasTexture(hv); this.htex.colorSpace = THREE.SRGBColorSpace;
    this.hmesh = new THREE.Mesh(new THREE.SphereGeometry(1.002, 96, 64), new THREE.MeshBasicMaterial({ map: this.htex, transparent: true, depthWrite: false }));
    scene.add(this.hmesh);

    // атмосфера
    const atm = new THREE.Mesh(new THREE.SphereGeometry(1.14, 64, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.,0.,1.)), 3.0); gl_FragColor = vec4(0.25,0.55,1.0,1.0)*i*1.3; }',
    }));
    scene.add(atm);
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vP = -mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.0 - max(dot(vN, normalize(vP)),0.), 3.0); gl_FragColor = vec4(0.3,0.6,1.0,1.0)*f*0.55; }',
    }));
    scene.add(rim);

    // звёзды
    const sg = new THREE.BufferGeometry(), pos = [];
    for (let i = 0; i < 1800; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20); pos.push(v.x, v.y, v.z); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9fb4d8, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.7 })));

    this.overlay = new THREE.Group(); scene.add(this.overlay);
    this.arcs = []; this.markers = [];

    const controls = this.controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 1.35; controls.maxDistance = 5;
    controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.7; controls.enablePan = false;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
    this.idleTimer = 0;
    controls.addEventListener('start', () => { controls.autoRotate = false; this.flyT = null; });
    controls.addEventListener('end', () => { this.idleTimer = performance.now(); });

    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    const dom = renderer.domElement;
    let down = null;
    dom.addEventListener('pointermove', e => this.pick(e, false));
    dom.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) this.pick(e, true); down = null; });
    dom.addEventListener('pointerleave', () => { this.setHover(-1); });
    new ResizeObserver(() => this.resize()).observe(el);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  pick(e, click) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = this.ray.intersectObject(this.earth)[0];
    const id = hit ? this.idAt(hit.uv.x, hit.uv.y) : -1;
    this.mouseXY = [e.clientX, e.clientY];
    if (click) { this.onClick?.(id); return; }
    this.setHover(id);
  }

  setHover(id) {
    if (id !== this.hover) { this.hover = id; this.paintHighlight(); this.renderer.domElement.style.cursor = id >= 0 ? 'pointer' : 'grab'; }
    this.onHover?.(id, this.mouseXY);
  }
  setSelected(id) { this.selected = id; this.paintHighlight(); }

  paintHighlight() {
    const ctx = this.hctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 2048, 1024);
    ctx.scale(0.5, 0.5);
    const draw = (id, fill, stroke, lw) => {
      if (id < 0) return;
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = lw;
      for (const p of this.polys) if (p.idx === id) { ctx.fill(p.path); ctx.stroke(p.path); }
      for (const d of this.dots) if (d.i === id) { ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, 7); ctx.fill(); ctx.stroke(); }
    };
    draw(this.hover, 'rgba(255,255,255,.18)', 'rgba(255,255,255,.9)', 2.2);
    draw(this.selected, 'rgba(255,255,255,.06)', 'rgba(255,214,102,1)', 3.2);
    this.htex.needsUpdate = true;
  }

  setColors(colors) { this.colors = colors; this.paint(); }

  flyTo(i) {
    const c = this.world.countries[i];
    const dir = latLonToVec3(c.lat, c.lon).normalize();
    const dist = Math.min(this.camera.position.length(), 2.6);
    this.flyT = { from: this.camera.position.clone(), to: dir.multiplyScalar(Math.max(2.2, dist)), t: 0, start: performance.now() };
    this.controls.autoRotate = false;
  }

  // ---------- дуги и маркеры ----------
  arcCurve(i, j, lift) {
    const a = latLonToVec3(this.world.countries[i].cLat, this.world.countries[i].cLon).normalize();
    const b = latLonToVec3(this.world.countries[j].cLat, this.world.countries[j].cLon).normalize();
    const ang = a.angleTo(b), pts = [];
    for (let k = 0; k <= 48; k++) {
      const t = k / 48;
      const v = new THREE.Vector3().copy(a).lerp(b, t).normalize();
      v.multiplyScalar(1.004 + lift * (0.04 + ang * 0.22) * Math.sin(Math.PI * t));
      pts.push(v);
    }
    return new THREE.CatmullRomCurve3(pts);
  }

  // arcs: [{i, j, color, width, speed, dashed}]
  setArcs(list) {
    for (const a of this.arcs) { this.overlay.remove(a.line); a.line.geometry.dispose(); if (a.dot) { this.overlay.remove(a.dot); } }
    this.arcs = [];
    for (const s of list) {
      const curve = this.arcCurve(s.i, s.j, 1);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(60));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: s.opacity ?? 0.8, depthWrite: false }));
      this.overlay.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(s.dotSize ?? 0.007, 8, 8), new THREE.MeshBasicMaterial({ color: s.color }));
      this.overlay.add(dot);
      this.arcs.push({ line, dot, curve, speed: s.speed ?? 0.25, off: Math.random() });
    }
  }

  // markers: [{i, color, kind}]
  setMarkers(list) {
    for (const m of this.markers) this.overlay.remove(m.sprite);
    this.markers = [];
    if (!this.spriteTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 7, 0, 7); g.fill();
      this.spriteTex = new THREE.CanvasTexture(c);
    }
    for (const mk of list) {
      const c = this.world.countries[mk.i];
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.spriteTex, color: mk.color, transparent: true, depthWrite: false }));
      sprite.position.copy(latLonToVec3(c.cLat, c.cLon, 1.012));
      this.overlay.add(sprite);
      this.markers.push({ sprite, size: mk.size ?? 0.05, phase: Math.random() * 6 });
    }
  }

  animate() {
    requestAnimationFrame(this.animate);
    const nowMs = performance.now(), dt = Math.min(0.05, (nowMs - this.tPrev) / 1000), t = (nowMs - this.t0) / 1000;
    this.tPrev = nowMs;
    if (this.flyT) {
      this.flyT.t = Math.min(1, (performance.now() - this.flyT.start) / 1100);
      const e = 1 - Math.pow(1 - this.flyT.t, 3);
      const p = new THREE.Vector3().copy(this.flyT.from).normalize().lerp(this.flyT.to.clone().normalize(), e).normalize();
      this.camera.position.copy(p.multiplyScalar(this.flyT.from.length() + (this.flyT.to.length() - this.flyT.from.length()) * e));
      if (this.flyT.t >= 1) this.flyT = null;
    }
    if (!this.controls.autoRotate && !this.flyT && this.idleTimer && performance.now() - this.idleTimer > 12000 && this.selected < 0) { this.controls.autoRotate = true; this.idleTimer = 0; }
    this.controls.update();
    for (const a of this.arcs) { a.dot.position.copy(a.curve.getPoint((t * a.speed + a.off) % 1)); }
    for (const m of this.markers) { const k = 1 + 0.35 * Math.sin(t * 3 + m.phase); m.sprite.scale.setScalar(m.size * k); m.sprite.material.opacity = 0.55 + 0.35 * Math.sin(t * 3 + m.phase); }
    this.renderer.render(this.scene, this.camera);
  }
}
