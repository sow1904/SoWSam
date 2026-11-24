// A terrain map drawn from the game's own data: the land outline and rivers
// of js/data/map.js, mountain ranges listed below, noise for the rest. The
// same input always gives the same picture, and it lines up with the places
// on the map (both go through the first painting's warp, S.project).
// Drawn at half size and doubled for a pixel-art look.
// usage: node tools/mapgen.js <out.png> [season] [--places]
//   season: spring | summer | autumn | winter (default summer)
//   --places: dots and names of the cities, to check the fit
const fs = require("fs"), path = require("path"), vm = require("vm");
const { execFileSync } = require("child_process");
for (const f of ["data/map.js"]) vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), { filename: f });
const S = globalThis.SAM;
S.MAP = S.MAPS.main;
const out = process.argv[2] || "mapgen.png";
const season = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "summer";
const withPlaces = process.argv.includes("--places");

const W = 1024, H = 1024, K = 2048 / W; // drawn at W x H, shown at 2048
const P = (la, lo) => { const [x, y] = S.project(la, lo); return [x / K, y / K]; };

// ---------- noise ----------
let seed = 20261124;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const G = 256, grid = Float32Array.from({ length: G * G }, rnd);
const lerp = (a, b, t) => a + (b - a) * t, fade = (t) => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = fade(x - xi), fy = fade(y - yi);
  const g = (i, j) => grid[((j & (G - 1)) * G + (i & (G - 1)))];
  return lerp(lerp(g(xi, yi), g(xi + 1, yi), fx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), fx), fy);
}
const fbm = (x, y, oct = 5) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03; } return s; };

// ---------- the land ----------
const M = S.MAPS.main;
const raw = (name) => { const src = fs.readFileSync(path.join(__dirname, "..", "js", "data", "map.js"), "utf8"); return src; };
// The outline as [lat, lon] (taken from the source, before projection).
const src = raw();
const grab = (name) => {
  const i = src.indexOf(`const ${name} = [`);
  const j = src.indexOf("];", i);
  return eval(src.slice(i + `const ${name} = `.length, j + 1)); // our own data file
};
const landLL = grab("land"), islandsLL = grab("islands"), riversLL = grab("rivers");
const polys = [landLL, ...islandsLL].map((poly) => poly.map(([la, lo]) => P(la, lo)));
const land = new Uint8Array(W * H);
for (const poly of polys) {
  for (let y = 0; y < H; y++) {
    const xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[j];
      if ((y1 <= y + 0.5) !== (y2 <= y + 0.5)) xs.push(x1 + ((y + 0.5 - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k])); x < Math.min(W, xs[k + 1]); x++) land[y * W + x] = 1;
  }
}
// Roughen the coast with noise: a few pixels in or out.
{
  const dist = new Float32Array(W * H).fill(99);
  // distance to the other class, out to 8 px
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = land[y * W + x];
    let best = 99;
    for (let r = 1; r <= 6 && best === 99; r++) for (let d = -r; d <= r; d++) {
      for (const [xx, yy] of [[x + d, y - r], [x + d, y + r], [x - r, y + d], [x + r, y + d]]) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (land[yy * W + xx] !== v) best = Math.min(best, r);
      }
    }
    dist[y * W + x] = v ? best : -best;
  }
  const copy = Uint8Array.from(land);
  for (let i = 0; i < W * H; i++) {
    if (Math.abs(dist[i]) > 6) continue;
    const x = i % W, y = (i / W) | 0;
    const n = (fbm(x / 9, y / 9, 3) - 0.5) * 9;
    copy[i] = dist[i] + n > 0 ? 1 : 0;
  }
  land.set(copy);
}

// ---------- height ----------
// Mountain ranges as [lat, lon] lines: [height 0..1, width in px, points].
const RANGES = [
  [0.95, 26, [[39.6, 95.5], [38.6, 99], [37.4, 102.5]]], // 기련산
  [0.8, 16, [[34.2, 104.5], [34.0, 106.5], [33.9, 108.5], [33.7, 110.5]]], // 진령
  [0.65, 16, [[32.7, 105.6], [32.2, 107.5], [31.8, 109.4]]], // 대파산
  [0.6, 12, [[31.3, 109.4], [30.9, 110.4], [30.8, 111.0]]], // 무산 (삼협)
  [0.7, 14, [[40.2, 114.3], [38.6, 113.8], [37.0, 113.5], [35.6, 113.3]]], // 태항산
  [0.55, 11, [[39.2, 111.5], [37.6, 111.2], [36.4, 111.0]]], // 여량산
  [0.55, 13, [[41.0, 108.5], [41.1, 111.0], [40.8, 113.5]]], // 음산
  [0.55, 11, [[40.6, 115.5], [40.4, 117.5], [40.2, 119.0]]], // 연산
  [0.5, 9, [[39.2, 106.1], [38.2, 105.9]]], // 하란산
  [0.5, 9, [[36.3, 106.3], [35.2, 106.2]]], // 육반산
  [0.45, 10, [[31.6, 113.8], [31.2, 115.3], [30.8, 116.4]]], // 대별산
  [0.35, 8, [[36.3, 116.8], [36.0, 117.6]]], // 태산
  [0.55, 15, [[25.8, 109.8], [25.3, 111.8], [25.1, 113.8], [24.9, 115.6]]], // 남령
  [0.5, 13, [[28.6, 116.8], [27.3, 117.4], [25.8, 117.0]]], // 무이산
  [0.45, 11, [[29.0, 110.0], [27.6, 109.6], [26.4, 109.2]]], // 무릉·설봉산
  [0.5, 12, [[29.4, 118.0], [28.6, 119.5], [28.0, 120.3]]], // 천목·괄창산
  [0.9, 22, [[33.5, 101.5], [31.0, 99.8], [28.0, 100.0], [25.5, 99.8]]], // 횡단산맥
  [0.55, 18, [[27.0, 103.0], [25.5, 104.5], [24.5, 106.5]]], // 운귀 고원
  [0.45, 12, [[41.8, 124.0], [40.8, 124.8], [40.2, 124.6]]], // 요동 산지
  [0.55, 16, [[41.8, 127.0], [40.6, 127.3], [39.5, 127.0], [38.3, 127.5]]], // 한반도 등줄기
  [0.55, 12, [[19.2, 109.5], [18.9, 109.7]]], // 오지산 (해남)
  [0.45, 7, [[23.8, 121.0], [22.9, 120.8]]], // 대만 산맥
];
const ranges = RANGES.map(([h, w, pts]) => ({ h, w: w / K * 2.6, pts: pts.map(([la, lo]) => P(la, lo)) }));
// The high west: the Tibetan plateau and the Gansu corridor's south.
const plateau = [[37.5, 90], [37.3, 101.5], [35.0, 103.0], [33.0, 102.8], [30.5, 102.2], [27.5, 101.5], [24.0, 99.5], [24.0, 90]].map(([la, lo]) => P(la, lo));
const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [x1, y1] = poly[i], [x2, y2] = poly[j]; if ((y1 > y) !== (y2 > y) && x < x1 + ((y - y1) / (y2 - y1)) * (x2 - x1)) c = !c; } return c; };
// Dry north: the Ordos and the Gobi; a steppe band south of it.
const desert = [[45, 90], [45, 112], [42.3, 112], [41.3, 109.5], [40.6, 107.0], [39.0, 106.5], [37.8, 104.2], [38.5, 101.0], [39.8, 96.5], [40.5, 90]].map(([la, lo]) => P(la, lo));
const ordos = [[40.5, 107.3], [40.4, 110.2], [39.2, 110.5], [37.8, 108.8], [37.9, 107.0], [39.3, 106.8]].map(([la, lo]) => P(la, lo));
function segDist(px, py, [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}
const h = new Float32Array(W * H), dry = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (!land[i]) continue;
  let m = 0;
  for (const r of ranges) {
    let d = Infinity;
    for (let k = 1; k < r.pts.length; k++) d = Math.min(d, segDist(x, y, r.pts[k - 1], r.pts[k]));
    d += (fbm(x / 12 + 31, y / 12 + 31, 3) - 0.5) * r.w * 1.2; // ragged flanks
    if (d < r.w * 2.5) m = Math.max(m, r.h * Math.exp(-((Math.max(0, d) / r.w) ** 2)));
  }
  if (inPoly(plateau, x, y)) {
    let e = Infinity; // distance to the plateau's edge: it rises over 25 px
    for (let k = 0, j = plateau.length - 1; k < plateau.length; j = k++) e = Math.min(e, segDist(x, y, plateau[j], plateau[k]));
    m = Math.max(m, (0.5 + 0.22 * fbm(x / 26, y / 26)) * Math.min(1, e / 25));
  }
  const rough = fbm(x / 22 + 50, y / 22 + 50); // hills everywhere, mostly low
  const ridge = 1 - Math.abs(fbm(x / 10 + 7, y / 10 + 7) * 2 - 1); // crests inside the ranges
  h[i] = Math.min(1, m * (0.6 + 0.6 * ridge) * (0.8 + 0.4 * fbm(x / 40 + 9, y / 40 + 9)) + Math.max(0, rough - 0.5) * 0.7);
  dry[i] = inPoly(desert, x, y) ? 1 : inPoly(ordos, x, y) ? 0.8 : 0;
}
// The great plains stay low: the north China plain, the 관중, the Yangzi
// lowlands, the 사천 basin.
const PLAINS = [[36.0, 116.0, 70], [34.3, 108.8, 18], [30.5, 113.5, 35], [31.5, 119.5, 30], [30.6, 104.2, 22], [33.5, 117.5, 40]];
for (const [la, lo, r] of PLAINS) {
  const [cx, cy] = P(la, lo);
  const rr = r / K * 2;
  for (let y = Math.max(0, (cy - rr * 2) | 0); y < Math.min(H, cy + rr * 2); y++) for (let x = Math.max(0, (cx - rr * 2) | 0); x < Math.min(W, cx + rr * 2); x++) {
    const d = Math.hypot(x - cx, y - cy) / rr;
    if (d < 2) h[y * W + x] *= Math.min(1, 0.25 + 0.75 * (d / 2) ** 2);
  }
}

// ---------- colour ----------
const PAL = {
  summer: { deep: [31, 79, 134], sea: [44, 102, 166], shore: [150, 196, 230], low: [139, 176, 74], low2: [121, 163, 66], south: [104, 156, 60], hill: [116, 134, 66], brown: [134, 110, 74], rock: [122, 104, 84], snow: [234, 238, 242], sand: [216, 182, 108], sand2: [200, 163, 92], steppe: [181, 178, 104], forest: [62, 106, 46], river: [56, 116, 196] },
  spring: { deep: [33, 82, 138], sea: [48, 108, 170], shore: [156, 200, 232], low: [150, 190, 92], low2: [132, 178, 82], south: [116, 170, 74], hill: [124, 144, 76], brown: [140, 116, 80], rock: [126, 108, 88], snow: [236, 240, 244], sand: [220, 188, 116], sand2: [204, 170, 100], steppe: [176, 184, 112], forest: [74, 124, 56], river: [62, 124, 204] },
  autumn: { deep: [30, 72, 120], sea: [42, 94, 150], shore: [146, 186, 214], low: [186, 168, 84], low2: [170, 150, 72], south: [140, 150, 62], hill: [150, 122, 66], brown: [140, 100, 64], rock: [122, 100, 80], snow: [232, 234, 238], sand: [214, 176, 100], sand2: [198, 156, 84], steppe: [190, 170, 96], forest: [138, 86, 44], river: [54, 108, 180] },
  winter: { deep: [36, 64, 98], sea: [52, 84, 124], shore: [176, 198, 216], low: [196, 196, 182], low2: [176, 178, 164], south: [130, 150, 104], hill: [160, 156, 140], brown: [130, 116, 100], rock: [118, 110, 104], snow: [244, 246, 250], sand: [206, 186, 140], sand2: [190, 170, 126], steppe: [200, 196, 176], forest: [70, 92, 74], river: [92, 132, 176] },
}[season];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const img = Buffer.alloc(W * H * 3);
const put = (i, c, mul = 1) => { for (let k = 0; k < 3; k++) img[i * 3 + k] = Math.max(0, Math.min(255, Math.round(c[k] * mul))); };
// Distance to land for the sea, out to 12 px.
const nearLand = new Float32Array(W * H).fill(99);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (land[y * W + x]) continue;
  let best = 99;
  for (let dy = -12; dy <= 12; dy += 2) for (let dx = -12; dx <= 12; dx += 2) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < W && yy < H && land[yy * W + xx]) best = Math.min(best, Math.hypot(dx, dy));
  }
  nearLand[y * W + x] = best;
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x, b = BAYER[(y & 3) * 4 + (x & 3)];
  if (!land[i]) {
    const d = nearLand[i];
    put(i, d <= 1.5 ? PAL.shore : d + b * 6 < 9 ? PAL.sea : PAL.deep);
    continue;
  }
  // light from the north-west
  const hx = (h[i + 1] || 0) - (h[i - 1] || 0), hy = (h[i + W] || 0) - (h[i - W] || 0);
  const shade = 1 + Math.max(-0.35, Math.min(0.3, (-hx - hy) * 4));
  const v = h[i] + b * 0.08;
  const lat = 42.8 - (y * K - 40) / 80; // rough, for the south's greener ground
  let c;
  if (v > 0.86) c = PAL.snow;
  else if (v > 0.64) c = PAL.rock;
  else if (v > 0.45) c = PAL.brown;
  else if (v > 0.3) c = PAL.hill;
  else if (dry[i] + b * 0.3 > 0.6) c = (fbm(x / 6, y / 6, 2) > 0.5 ? PAL.sand : PAL.sand2);
  else if (dry[i] > 0.2) c = PAL.steppe;
  else c = lat + (fbm(x / 20 + 5, y / 20 + 5, 3) - 0.5) * 6 < 28 ? PAL.south : fbm(x / 14 + 3, y / 14 + 3, 3) + b * 0.1 > 0.52 ? PAL.low2 : PAL.low;
  // forests on the low hills of the wetter land
  const wood = fbm(x / 5 + 90, y / 5 + 90, 3);
  const clump = fbm(x / 18 + 60, y / 18 + 60, 4);
  if (!dry[i] && v > 0.08 && v < 0.62 && clump + (lat < 33 ? 0.06 : -0.04) > 0.56 && wood > 0.42 && !((x * 7 + y * 3) % 5 === 0)) c = PAL.forest;
  put(i, c, shade);
}
// Rivers, 2 px wide.
for (const r of riversLL) {
  const pts = r.map(([la, lo]) => P(la, lo));
  for (let k = 1; k < pts.length; k++) {
    const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2);
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      // a little meander
      const wob = (fbm((x1 + (x2 - x1) * t) / 8, (y1 + (y2 - y1) * t) / 8, 2) - 0.5) * 4;
      const x = Math.round(x1 + (x2 - x1) * t + wob * (y2 - y1) / (Math.hypot(x2 - x1, y2 - y1) || 1));
      const y = Math.round(y1 + (y2 - y1) * t - wob * (x2 - x1) / (Math.hypot(x2 - x1, y2 - y1) || 1));
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) put(yy * W + xx, PAL.river);
      }
    }
  }
}
// Places, to check the fit.
if (withPlaces) {
  for (const [id, m] of Object.entries(M.cities)) {
    const [px, py] = S.placeXY(id, m[3], m[4]);
    const x = Math.round(px / K), y = Math.round(py / K);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) put(yy * W + xx, Math.abs(dx) === 2 || Math.abs(dy) === 2 ? [20, 20, 20] : [230, 40, 40]);
    }
  }
}
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "-", "-vf", "scale=2048:2048:flags=neighbor", out], { input: img, maxBuffer: 1 << 28 });
console.log("wrote", out, season);
