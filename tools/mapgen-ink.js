// The terrain map in ink and wash (수묵화풍), from the fields tools/mapgen.js
// works out: land, height, dryness, rivers and lakes. Drawn at 2048 on
// paper: the mountains in layered washes of ink that darken at their edges,
// short brush strokes down their slopes (준법), dots of moss on the wooded
// hills (점태), the water left as bare paper behind an inked shore, and a
// faint colour for the season (담채).
// usage: node tools/mapgen.js <out.png> [season] --ink [--places]
const { execFileSync } = require("child_process");
module.exports = function (ctx) {
  const { W, H, P, land, h, dry, riversLL, LAKES, fbm, season, withPlaces, S, M, out, placeOf, lineOnly } = ctx;
  const N = 2048, k = N / W;
  // ---------- the fields at full size (bilinear) ----------
  const up = (src) => {
    const o = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = Math.min(W - 1.001, x / k), fy = Math.min(H - 1.001, y / k), x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      const a = src[y0 * W + x0], b = src[y0 * W + x0 + 1], c = src[(y0 + 1) * W + x0], d = src[(y0 + 1) * W + x0 + 1];
      o[y * N + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
    return o;
  };
  const L = up(Float32Array.from(land)), Hh = up(h), D = up(dry);
  const isLand = (i) => L[i] > 0.5;
  // ---------- ink: how dark each point is (0 paper .. 1 black) ----------
  const ink = new Float32Array(N * N);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const add = (x, y, a) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= N || y >= N) return; const i = y * N + x; ink[i] = Math.min(1, ink[i] + a * (1 - ink[i] * 0.5)); };
  const line = (x1, y1, x2, y2, a, w = 1) => {
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) + 1;
    for (let s = 0; s <= n; s++) {
      const t = s / n, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, taper = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.7 + 0.3;
      add(x, y, a * taper);
      if (w > 1) { add(x + 1, y, a * taper * 0.6); add(x, y + 1, a * taper * 0.6); }
    }
  };
  // A light wash under the high ground.
  for (let i = 0; i < N * N; i++) if (isLand(i)) ink[i] = Math.max(0, Hh[i] - 0.15) * 0.25;
  // Mountains: mounds drawn from the back to the front, each inked darkest
  // along its crest and fading down its flank to the paper, the nearer ones
  // hiding those behind; strokes (준법) down from the crest.
  const mounds = [];
  for (let n = 0; n < 26000; n++) {
    const x = rnd() * N, y = rnd() * N, i = (y | 0) * N + (x | 0);
    if (!isLand(i) || Hh[i] < 0.3 || rnd() > (Hh[i] - 0.25) * 1.1) continue;
    mounds.push({ x, y, v: Hh[i] });
  }
  mounds.sort((p, q) => p.y - q.y);
  for (const m of mounds) {
    const w = 8 + m.v * 26 * (0.7 + rnd() * 0.6), t = 6 + m.v * 26 * (0.6 + rnd() * 0.7);
    const lean = (rnd() - 0.5) * 0.5, dark = 0.4 + Math.min(0.62, m.v) * 0.6, sharp = 0.45 + rnd() * 0.9;
    const top = (dx) => { const u = dx / w; return m.y - t * Math.pow(Math.max(0, 1 - Math.abs(u) ** (1 + sharp)), sharp) * (1 + lean * u) - (fbm(m.x + dx / 3, m.y, 2) - 0.5) * 4; };
    for (let dx = -Math.ceil(w); dx <= w; dx++) {
      const yt = top(dx), xx = Math.round(m.x + dx);
      if (xx < 0 || xx >= N) continue;
      for (let yy = Math.floor(yt); yy <= m.y; yy++) {
        if (yy < 0 || yy >= N) continue;
        const i = yy * N + xx;
        if (!isLand(i)) continue;
        const f = (yy - yt) / Math.max(1, m.y - yt); // 0 at the crest, 1 at the foot
        const tone = dark * Math.pow(1 - f, 2.2) * (dx > 0 ? 1 : 0.75); // the shaded side darker
        ink[i] = ink[i] * 0.25 + tone; // the nearer mound covers what is behind
      }
      add(xx, yt, dark * 0.9); add(xx, yt + 1, dark * 0.4); // the crest line
    }
    // 준법: a few strokes down the flank from the crest
    const k2 = Math.round(w / 4);
    for (let s = 0; s < k2; s++) {
      const dx = (rnd() * 2 - 1) * w * 0.85, yt = top(dx), len = (m.y - yt) * (0.3 + rnd() * 0.4);
      line(m.x + dx, yt + 1, m.x + dx * 1.15 + (rnd() - 0.5) * 3, yt + len, 0.25 + m.v * 0.3);
    }
  }
  // 점태: dots of moss on the wooded low hills of the wetter land.
  for (let n = 0; n < 30000; n++) {
    const x = rnd() * N, y = rnd() * N, i = (y | 0) * N + (x | 0);
    if (!isLand(i) || D[i] > 0.2) continue;
    const v = Hh[i], wood = fbm(x / k / 18 + 60, y / k / 18 + 60, 4);
    if (v < 0.12 || v > 0.5 || wood < 0.55) continue;
    add(x, y, 0.6); add(x + 1, y, 0.35); add(x, y + 1, 0.3);
  }
  // The shore inked, firmer where the land is high.
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x;
    if (!isLand(i)) continue;
    if (!isLand(i - 1) || !isLand(i + 1) || !isLand(i - N) || !isLand(i + N)) {
      const a = 0.55 + 0.3 * fbm(x / 6, y / 6, 2);
      add(x, y, a); add(x + 1, y, a * 0.4);
    }
  }
  // Rivers: a thin ink line, the great ones firmer.
  for (const [width, r] of riversLL) {
    const pts = r.map(([la, lo]) => P(la, lo).map((v) => v * k));
    for (let j = 1; j < pts.length; j++) {
      const [x1, y1] = pts[j - 1], [x2, y2] = pts[j];
      const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3);
      let px = x1, py = y1;
      for (let s = 1; s <= n; s++) {
        const t = s / n, bx = x1 + (x2 - x1) * t, by = y1 + (y2 - y1) * t;
        const wob = (fbm(bx / 16, by / 16, 2) - 0.5) * 10, len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const qx = bx + wob * (y2 - y1) / len, qy = by - wob * (x2 - x1) / len;
        line(px, py, qx, qy, width >= 3 ? 0.75 : width >= 2 ? 0.6 : 0.45, width >= 2 ? 2 : 1);
        px = qx; py = qy;
      }
    }
  }
  // Lakes: an inked shore around bare paper.
  const lakeAt = new Uint8Array(N * N);
  for (const [la, lo, r] of LAKES) {
    const [cx, cy] = P(la, lo).map((v) => v * k), ex = P(la, lo + r)[0] * k, ey = P(la + r, lo)[1] * k;
    const rx = Math.max(4, Math.abs(ex - cx)), ry = Math.max(4, Math.abs(ey - cy));
    for (let y = Math.floor(cy - ry - 4); y <= cy + ry + 4; y++) for (let x = Math.floor(cx - rx - 4); x <= cx + rx + 4; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + (fbm(x / 8 + 200, y / 8 + 200, 2) - 0.5) * 0.5;
      if (d < 1) { lakeAt[y * N + x] = 1; ink[y * N + x] = 0; } else if (d < 1 + 2.5 / rx) add(x, y, 0.6);
    }
  }
  // ---------- paper and colour ----------
  const PAPER = [238, 230, 212], INK = [30, 28, 26];
  const TINT = { spring: [150, 180, 120], summer: [120, 160, 110], autumn: [190, 140, 90], winter: null }[season];
  const SEA = [226, 228, 222], SAND = [214, 196, 150];
  const img = Buffer.alloc(N * N * 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const grain = lineOnly ? 0 : (fbm(x / 1.7, y / 1.7, 2) - 0.5) * 10 + (fbm(x / 40, y / 40, 3) - 0.5) * 8; // the paper's fibre and blotches
    let base = lineOnly ? [255, 255, 255] : PAPER;
    if (lineOnly) { /* white paper, ink only */ } else if (!isLand(i) || lakeAt[i]) {
      // the water: bare paper with a faint wash, and wave strokes near the shore
      base = SEA;
    } else {
      if (D[i] > 0.3) base = base.map((v, c) => v + (SAND[c] - v) * Math.min(1, D[i]) * 0.5);
      // 담채: a faint colour on the low land, more where the ink is light
      if (TINT && Hh[i] < 0.5) { const a = 0.1 * (1 - ink[i]) * (1 - D[i]); base = base.map((v, c) => v + (TINT[c] - v) * a); }
      if (season === "winter" && Hh[i] > 0.55) base = base.map((v) => v + (250 - v) * 0.6); // snow: the ink holds back
    }
    const a = Math.min(0.95, ink[i] * (season === "winter" && Hh[i] > 0.55 ? 0.6 : 1));
    for (let c = 0; c < 3; c++) img[i * 3 + c] = Math.max(0, Math.min(255, Math.round(base[c] * (1 - a) + INK[c] * a + grain)));
  }
  if (withPlaces) {
    for (const [id, m] of Object.entries(M.cities)) {
      const [px, py] = placeOf(id, m);
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const xx = Math.round(px) + dx, yy = Math.round(py) + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N || dx * dx + dy * dy > 16) continue;
        const j = (yy * N + xx) * 3; img[j] = 190; img[j + 1] = 30; img[j + 2] = 30; // 낙관 red
      }
    }
  }
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${N}x${N}`, "-i", "-", out], { input: img, maxBuffer: 1 << 28 });
  console.log("wrote", out, season, "ink");
};
