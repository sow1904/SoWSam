// A terrain map drawn from the game's own data: the land outline and rivers
// of js/data/map.js, mountain ranges listed below, noise for the rest. The
// same input always gives the same picture, and it lines up with the places
// on the map (both go through the first painting's warp, S.project).
// Drawn at half size and doubled for a pixel-art look.
// usage: node tools/mapgen.js <out.png> [season] [--places]
//   season: spring | summer | autumn | winter (default summer)
//   --places: dots and names of the cities, to check the fit
//   --ink: in ink and wash (tools/mapgen-ink.js); --lines: ink only, no paper or colour
//   --control: bare shapes for ControlNet (coast, river banks, lakes, crests)
//   --size=4096: the ink map drawn larger (2048 by default)
//   --geo: true latitude and longitude, the cities at their true places
const fs = require("fs"), path = require("path"), vm = require("vm");
const { execFileSync } = require("child_process");
for (const f of ["data/map.js"]) vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), { filename: f });
const S = globalThis.SAM;
S.MAP = S.MAPS.main;
const out = process.argv[2] || "mapgen.png";
const season = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "summer";
const withPlaces = process.argv.includes("--places");

const W = 1024, H = 1024, K = 2048 / W; // drawn at W x H, shown at 2048
// --geo: a plain map of the real latitude and longitude (each degree of
// latitude 1/cos 32° as long as one of longitude), with the cities at their
// true places, instead of the painting's warp and the hand-set places.
const GEO = process.argv.includes("--geo");
const GEO_BOX = { lon0: 96, lon1: 129, lat0: 16, lat1: 43.5 }; // the game's world: 주천 to 낙랑, 일남 to 현도
const geoXY = (la, lo) => {
  const sx = 2048 / (GEO_BOX.lon1 - GEO_BOX.lon0), sy = sx / Math.cos((32 * Math.PI) / 180);
  const top = (2048 - (GEO_BOX.lat1 - GEO_BOX.lat0) * sy) / 2;
  return [(lo - GEO_BOX.lon0) * sx, top + (GEO_BOX.lat1 - la) * sy];
};
const P = (la, lo) => { const [x, y] = GEO ? geoXY(la, lo) : S.project(la, lo); return [x / K, y / K]; };
// Where a city is drawn (2048 px): its true place, or the game's.
const placeOf = (id, m) => (GEO ? geoXY(m[3], m[4]) : S.placeXY(id, m[3], m[4]));

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
// The game's outline is rough; the drawing uses a finer one of its own.
const landLL = [
  [45, 90], [45, 131], [40.5, 129.8], [39.0, 127.8], [37.5, 129.3], [35.5, 129.4], [35.0, 128.5], [34.6, 127.5], [34.4, 126.5],
  [35.0, 126.3], [35.9, 126.6], [36.5, 126.3], [37.1, 126.8], [37.6, 126.5], [37.8, 125.7], [38.1, 124.9], [38.7, 125.2], [39.0, 125.4],
  [39.5, 124.9], [39.8, 124.3], [39.6, 123.5], [39.2, 122.6], [38.9, 121.6], [38.75, 121.2], [39.1, 121.4], [39.6, 121.6], [40.3, 122.0],
  [40.8, 122.3], [41.0, 121.6], [40.8, 121.0], [40.3, 120.3], [39.9, 119.5], [39.4, 118.8], [39.1, 118.2], [38.9, 117.7], [38.3, 117.6],
  [37.9, 118.4], [37.7, 118.9], [37.3, 119.0], [37.1, 119.6], [37.5, 120.3], [37.7, 120.9], [37.5, 121.5], [37.45, 122.1], [37.2, 122.6],
  [36.9, 122.4], [36.8, 121.6], [36.5, 120.8], [36.1, 120.4], [35.6, 119.7], [35.1, 119.4], [34.6, 119.4], [34.3, 120.2], [33.6, 120.6],
  [32.6, 121.0], [32.0, 121.8], [31.6, 121.9], [31.2, 121.9], [30.9, 121.7], [30.6, 121.0], [30.3, 120.6], [30.2, 121.3], [29.9, 121.7],
  [29.3, 121.9], [28.6, 121.5], [28.0, 121.0], [27.4, 120.6], [26.7, 119.9], [26.0, 119.7], [25.5, 119.4], [24.9, 118.8], [24.4, 118.1],
  [23.9, 117.5], [23.4, 116.7], [23.0, 116.0], [22.8, 115.3], [22.6, 114.6], [22.3, 114.2], [22.5, 113.8], [22.2, 113.5], [21.9, 113.0],
  [21.8, 112.2], [21.5, 111.5], [21.4, 110.8], [20.9, 110.6], [20.25, 110.2], [20.5, 109.9], [21.1, 109.7], [21.6, 109.4], [21.5, 108.6],
  [21.6, 108.1], [21.4, 107.6], [21.0, 107.2], [20.8, 106.8], [20.3, 106.6], [19.9, 106.1], [19.4, 105.8], [18.7, 105.8], [17.9, 106.3],
  [17.2, 107.0], [16.4, 107.7], [15.5, 108.7], [13, 109.4], [13, 90],
];
const islandsLL = [
  [[20.15, 110.2], [20.05, 110.7], [19.9, 111.0], [19.3, 110.7], [18.6, 110.3], [18.2, 109.6], [18.4, 108.9], [18.9, 108.6], [19.5, 108.7], [19.9, 109.2]],
  [[25.3, 121.5], [25.0, 121.9], [24.4, 121.8], [23.4, 121.5], [22.6, 121.0], [21.9, 120.8], [22.5, 120.3], [23.1, 120.1], [23.9, 120.3], [24.7, 120.9]],
  [[33.5, 126.2], [33.55, 126.8], [33.25, 126.9], [33.2, 126.3]],
];
// [width, points]: the game's rivers (the Yellow River and the Yangzi the
// widest) and their tributaries.
const riversLL = grab("rivers").map((pts, i) => [[3, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2][i] || 2, pts]).concat([
  [1.5, [[38.8, 111.9], [37.9, 112.5], [37.0, 111.9], [36.0, 111.5], [35.6, 110.6]]], // 분수
  [1.5, [[34.1, 110.6], [34.4, 111.8], [34.68, 112.45], [34.75, 113.0]]], // 낙수
  [1.5, [[34.4, 113.2], [33.6, 114.0], [33.0, 115.0], [32.5, 116.5]]], // 영수
  [1.5, [[33.8, 112.5], [33.0, 114.2], [32.6, 115.4]]], // 여수
  [1.5, [[35.6, 117.4], [34.8, 117.4], [34.0, 117.9], [33.6, 118.4]]], // 사수
  [1.5, [[38.5, 113.0], [38.3, 115.0], [38.6, 116.5], [39.0, 117.3]]], // 호타하
  [1.5, [[40.0, 113.5], [40.3, 115.5], [39.8, 116.3], [39.2, 117.3]]], // 영정하
  [1.5, [[35.9, 106.3], [35.2, 107.6], [34.5, 108.9]]], // 경수
  [2, [[33.9, 106.3], [32.4, 105.8], [31.5, 106.0], [30.5, 106.4], [29.6, 106.6]]], // 가릉강
  [1.5, [[27.0, 105.5], [27.5, 107.5], [28.6, 108.0], [29.7, 107.4]]], // 오강
  [1.5, [[26.5, 108.5], [27.5, 109.8], [28.4, 111.0], [29.1, 112.0]]], // 원수
  [1.5, [[26.8, 110.5], [27.8, 111.4], [28.6, 112.2], [29.0, 112.5]]], // 자수
  [1.5, [[29.0, 118.0], [29.6, 119.6], [30.2, 120.2], [30.4, 120.9]]], // 전당강
  [1.5, [[27.8, 117.5], [26.6, 118.1], [26.0, 119.3]]], // 민강 (복건)
  [1.5, [[25.0, 113.5], [24.0, 113.3], [23.2, 113.3]]], // 북강
  [1.5, [[24.5, 115.5], [23.5, 114.6], [23.0, 113.8]]], // 동강
  [1.5, [[41.5, 126.0], [40.6, 124.9], [39.9, 124.3]]], // 압록강
  [1.5, [[39.4, 127.0], [39.0, 125.8], [38.7, 125.2]]], // 패수
]);
// Lakes: [lat, lon, radius in degrees].
const LAKES = [[29.25, 112.8, 0.38], [29.0, 116.2, 0.32], [31.2, 120.2, 0.22], [31.55, 117.4, 0.13], [36.9, 100.2, 0.3], [33.3, 118.6, 0.15]];
const polys = [landLL, ...islandsLL].map((poly) => poly.map(([la, lo]) => P(la, lo)));
// Long edges get points in between, so the noise can bend them.
for (const poly of polys) for (let i = poly.length - 1; i >= 0; i--) {
  const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6);
  for (let k = n - 1; k >= 1; k--) poly.splice(i + 1, 0, [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
}
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
    const n = (fbm(x / 7, y / 7, 3) - 0.5) * 6;
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
    e += (fbm(x / 9 + 17, y / 9 + 17, 3) - 0.5) * 30; // a ragged edge, cut by valleys
    m = Math.max(m, (0.5 + 0.22 * fbm(x / 26, y / 26)) * Math.max(0, Math.min(1, e / 25)));
  }
  const rough = fbm(x / 22 + 50, y / 22 + 50); // hills everywhere, mostly low
  const ridge = 1 - Math.abs(fbm(x / 10 + 7, y / 10 + 7) * 2 - 1); // crests inside the ranges
  h[i] = Math.min(1, m * (0.6 + 0.6 * ridge) * (0.8 + 0.4 * fbm(x / 40 + 9, y / 40 + 9)) + Math.max(0, rough - 0.5) * 0.7);
  // ragged edges for the dry lands
  const jx = x + (fbm(x / 14 + 70, y / 14, 3) - 0.5) * 40, jy = y + (fbm(x / 14, y / 14 + 70, 3) - 0.5) * 40;
  dry[i] = inPoly(desert, jx, jy) ? 1 : inPoly(ordos, jx, jy) ? 0.8 : 0;
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

// Ink and wash instead (tools/mapgen-ink.js).
if (process.argv.includes("--ink")) {
  require("./mapgen-ink.js")({ W, H, P, land, h, dry, riversLL, LAKES, fbm, season, withPlaces, S, M, out, placeOf, lineOnly: process.argv.includes("--lines"), control: process.argv.includes("--control"), size: +((process.argv.find((x) => x.startsWith("--size=")) || "=2048").split("=")[1]) });
  process.exit(0);
}
// ---------- colour ----------
const PAL = {
  summer: { deep: [31, 79, 134], sea: [44, 102, 166], shore: [150, 196, 230], low: [139, 176, 74], low2: [121, 163, 66], south: [104, 156, 60], hill: [116, 134, 66], brown: [134, 110, 74], rock: [122, 104, 84], snow: [234, 238, 242], sand: [216, 182, 108], sand2: [200, 163, 92], steppe: [181, 178, 104], forest: [62, 106, 46], river: [56, 116, 196] },
  spring: { deep: [33, 82, 138], sea: [48, 108, 170], shore: [156, 200, 232], low: [150, 190, 92], low2: [132, 178, 82], south: [116, 170, 74], hill: [124, 144, 76], brown: [140, 116, 80], rock: [126, 108, 88], snow: [236, 240, 244], sand: [220, 188, 116], sand2: [204, 170, 100], steppe: [176, 184, 112], forest: [74, 124, 56], river: [62, 124, 204] },
  autumn: { deep: [30, 72, 120], sea: [42, 94, 150], shore: [146, 186, 214], low: [186, 168, 84], low2: [170, 150, 72], south: [140, 150, 62], hill: [150, 122, 66], brown: [140, 100, 64], rock: [122, 100, 80], snow: [232, 234, 238], sand: [214, 176, 100], sand2: [198, 156, 84], steppe: [190, 170, 96], forest: [138, 86, 44], river: [54, 108, 180] },
  winter: { deep: [36, 64, 98], sea: [52, 84, 124], shore: [176, 198, 216], low: [196, 196, 182], low2: [176, 178, 164], south: [130, 150, 104], hill: [160, 156, 140], brown: [130, 116, 100], rock: [118, 110, 104], snow: [244, 246, 250], sand: [206, 186, 140], sand2: [190, 170, 126], steppe: [200, 196, 176], forest: [70, 92, 74], river: [92, 132, 176] },
}[season];
const dim0 = (c, k) => c.map((v) => v * k);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const img = Buffer.alloc(W * H * 3);
const forestAt = new Uint8Array(W * H);
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
  if (!dry[i] && v > 0.08 && v < 0.62 && clump + (lat < 33 ? 0.07 : -0.03) > 0.5 && wood > 0.38 && !((x * 7 + y * 3) % 5 === 0)) { c = dim0(PAL.low2, 0.92); forestAt[i] = 1; }
  put(i, c, shade);
}
// Little mountains and trees stamped on the ground, as on a painted map.
{
  const marks = [];
  for (let gy = 0; gy < H; gy += 9) for (let gx = 0; gx < W; gx += 9) {
    const x = gx + ((fbm(gx, gy + 400, 1) * 97) | 0) % 9, y = gy + ((fbm(gx + 400, gy, 1) * 89) | 0) % 9;
    if (x >= W || y >= H) continue;
    const i = y * W + x;
    if (land[i] && h[i] > 0.4) marks.push({ x, y, kind: "peak", v: h[i] });
  }
  for (let gy = 0; gy < H; gy += 4) for (let gx = 0; gx < W; gx += 4) {
    const x = gx + ((gx * 7 + gy * 13) % 3), y = gy + ((gx * 5 + gy * 3) % 3);
    if (x < W && y < H && forestAt[y * W + x]) marks.push({ x, y, kind: "tree" });
  }
  marks.sort((a, b) => a.y - b.y);
  for (const m of marks) {
    if (m.kind === "tree") {
      const pix = [[0, -2, 1.25], [-1, -1, 1.1], [0, -1, 1], [1, -1, 0.8], [-1, 0, 0.9], [0, 0, 0.85], [1, 0, 0.65], [0, 1, 0.5]];
      for (const [dx, dy, k] of pix) { const xx = m.x + dx, yy = m.y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && land[yy * W + xx]) put(yy * W + xx, dim0(PAL.forest, k)); }
      continue;
    }
    const t = 3 + Math.round(m.v * 8), b = 2 + Math.round(m.v * 4);
    const base = m.v > 0.62 ? PAL.rock : PAL.brown;
    for (let r = 0; r <= t; r++) {
      const half = Math.round(b * r / t), yy = m.y - t + r;
      for (let dx = -half; dx <= half; dx++) {
        const xx = m.x + dx;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const edge = dx === -half || dx === half || r === t;
        let c = dx < 0 ? dim0(base, 1.2) : dx === 0 ? base : dim0(base, 0.72);
        if (m.v > 0.66 && r < t * 0.4) c = dx <= 0 ? PAL.snow : dim0(PAL.snow, 0.82);
        put(yy * W + xx, edge ? dim0(base, 0.5) : c);
      }
    }
  }
}
// Rivers.
for (const [width, r] of riversLL) {
  const pts = r.map(([la, lo]) => P(la, lo));
  const brush = width >= 3 ? [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [2, 0], [0, 2]] : width >= 2 ? [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]] : [[0, 0], [1, 0], [0, 1]];
  for (let k = 1; k < pts.length; k++) {
    const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2);
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      // a little meander
      const wob = (fbm((x1 + (x2 - x1) * t) / 8, (y1 + (y2 - y1) * t) / 8, 2) - 0.5) * 4;
      const x = Math.round(x1 + (x2 - x1) * t + wob * (y2 - y1) / (Math.hypot(x2 - x1, y2 - y1) || 1));
      const y = Math.round(y1 + (y2 - y1) * t - wob * (x2 - x1) / (Math.hypot(x2 - x1, y2 - y1) || 1));
      for (const [dx, dy] of brush) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) put(yy * W + xx, PAL.river);
      }
    }
  }
}
// Lakes, with a light shore.
for (const [la, lo, r] of LAKES) {
  const [cx, cy] = P(la, lo), [ex] = P(la, lo + r), [, ey] = P(la + r, lo);
  const rx = Math.max(2, Math.abs(ex - cx)), ry = Math.max(2, Math.abs(ey - cy));
  for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + (fbm(x / 4 + 200, y / 4 + 200, 2) - 0.5) * 0.7;
    if (d < 1) put(y * W + x, PAL.sea);
    else if (d < 1 + 2 / Math.max(rx, 4)) put(y * W + x, PAL.shore);
  }
}
// Places, to check the fit.
if (withPlaces) {
  for (const [id, m] of Object.entries(M.cities)) {
    const [px, py] = placeOf(id, m);
    const x = Math.round(px / K), y = Math.round(py / K);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) put(yy * W + xx, Math.abs(dx) === 2 || Math.abs(dy) === 2 ? [20, 20, 20] : [230, 40, 40]);
    }
  }
}
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "-", "-vf", "scale=2048:2048:flags=neighbor", out], { input: img, maxBuffer: 1 << 28 });
console.log("wrote", out, season);
