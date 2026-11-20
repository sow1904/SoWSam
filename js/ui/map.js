// The map: zooming and panning, cities, strongholds, roads, and whatever is
// on the road.
(function (S) {
  const UI = S.UI, $ = UI.$;
  let state = null;
  UI.bind((s) => { state = s; });

  // ---------- map view (zoom and pan on the SVG viewBox) ----------
  // While the wheel turns or the map is dragged, only the drawn picture moves
  // (a CSS transform the compositor handles without redrawing). The viewBox
  // is set, and the map redrawn sharp, once the wheel or drag rests: redrawing
  // the big terrain picture and every icon on each wheel tick was slow.
  const view = (UI.view = { x: 0, y: 0, w: 1000, h: 700, zoom: 1 });
  const shown = { x: 0, y: 0, w: 1000, h: 700 }; // the viewBox now on the SVG
  let shownRect = null; // the SVG's box when the viewBox was set
  let settleTimer = 0;
  const pts = (list) => list.map((p) => p.join(",")).join(" ");
  // The SVG's box on screen, untouched by a pending transform.
  const mapRect = () => ($("#map").style.transform && shownRect) || $("#map").getBoundingClientRect();

  function fitView(r) {
    view.w = Math.max(200, r.width / view.zoom);
    view.h = Math.max(200, r.height / view.zoom);
    const W = S.MAP_SIZE.w, H = S.MAP_SIZE.h;
    view.x = Math.min(Math.max(view.x, -view.w * 0.3), W - view.w * 0.7);
    view.y = Math.min(Math.max(view.y, -view.h * 0.3), H - view.h * 0.7);
  }
  // Show the new view at once by moving the old picture; settle it soon.
  function previewView() {
    const svg = $("#map"), r = mapRect();
    fitView(r);
    const s = shown.w / view.w;
    const tx = ((shown.x - view.x) / view.w) * r.width, ty = ((shown.y - view.y) / view.h) * r.height;
    svg.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(applyView, 150);
  }
  function applyView() {
    clearTimeout(settleTimer);
    const svg = $("#map");
    svg.style.transform = "";
    const r = svg.getBoundingClientRect();
    shownRect = r;
    fitView(r);
    Object.assign(shown, { x: view.x, y: view.y, w: view.w, h: view.h });
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    svg.classList.toggle("far", view.zoom < 0.75);
  }
  UI.applyView = applyView;
  UI.centerOn = function (c) {
    const r = mapRect();
    view.x = c.x - r.width / view.zoom / 2;
    view.y = c.y - r.height / view.zoom / 2;
    applyView();
  };
  function zoomAt(factor, cx, cy) {
    const r = mapRect();
    const px = view.x + ((cx - r.left) / r.width) * view.w;
    const py = view.y + ((cy - r.top) / r.height) * view.h;
    view.zoom = Math.min(2.5, Math.max(0.35, view.zoom * factor));
    view.x = px - ((cx - r.left) / r.width) * (r.width / view.zoom);
    view.y = py - ((cy - r.top) / r.height) * (r.height / view.zoom);
    previewView();
  }
  let drag = null;
  UI.dragged = false; // a click that ends a drag selects nothing
  UI.setupMapControls = function () {
    const svg = $("#map");
    svg.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.clientX, ev.clientY);
    }, { passive: false });
    svg.addEventListener("pointerdown", (ev) => {
      drag = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, id: ev.pointerId };
      UI.dragged = false;
    });
    window.addEventListener("pointermove", (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!UI.dragged && Math.hypot(dx, dy) < 5) return;
      UI.dragged = true;
      view.x = drag.vx - dx / view.zoom;
      view.y = drag.vy - dy / view.zoom;
      previewView();
    });
    window.addEventListener("pointerup", () => {
      if (drag && UI.dragged) applyView();
      drag = null;
    });
    window.addEventListener("resize", () => state && applyView());
  };

  // City icons by tier (1-5), each with a ruined form; the Han capital and an
  // emperor's court show the palace. Art: the author's sheet, see assets/CREDITS.md.
  // Icons cut from the sheet (tools/cut_assets.py): [width, height] in pixels.
  const CITY_ICONS = {
    c1: [150, 116], c2: [188, 155], c3: [186, 156], c4: [186, 169], c5: [187, 190], palace: [190, 188],
    c1_ruin: [163, 113], c2_ruin: [188, 160], c3_ruin: [185, 154], c4_ruin: [184, 137], c5_ruin: [184, 162], palace_ruin: [188, 165],
  };
  // Walls this low are a ruin: 낙양 in 191, or a city battered down in a siege.
  S.ruined = (p) => !!p && p.wallMax > 0 && p.wall < Math.max(150, p.wallMax * 0.2);
  // The tier a city is drawn at: its size, raised by growth. Each 40,000
  // people over what a city of its size starts with count one tier, and
  // farmland and trade developed past 40% count up to 1.2 tiers more when
  // fully developed. Growth reaches tier 4 at most; tier 5 is for the great
  // cities from the start, and a city never falls below its size.
  S.cityGrowth = (c) => {
    const dev = (c.farm + c.trade) / (c.farmMax + c.tradeMax);
    return (c.pop - (40000 + c.size * 40000)) / 40000 + Math.max(0, dev - 0.4) / 0.6 * 1.2;
  };
  S.cityTier = (c) => (c.size >= 5 ? 5 : Math.max(c.size, Math.min(4, c.size + Math.floor(S.cityGrowth(c)))));
  function palace(c) {
    if (c.id === state.emperor && !(state.han && state.han.ended)) return true;
    return !!(c.owner && state.forces[c.owner].emperor && S.isCapital(state, c.id));
  }
  // The palace where an emperor sits, else the castle of the city's tier; in
  // ruins while the walls are down. 낙양, the Han capital burnt in 190, lies as
  // a ruined palace until its walls are rebuilt.
  function cityIcon(c) {
    const pal = palace(c);
    if (S.ruined(c)) return pal || c.id === "henan" ? "palace_ruin" : `c${S.cityTier(c)}_ruin`;
    return pal ? "palace" : `c${S.cityTier(c)}`;
  }

  // The layers of the map, bottom to top. Each is redrawn only when what it
  // shows has changed; cities and strongholds one at a time.
  const LAYERS = ["provLayer", "roadLayer", "fortLayer", "cityLayer", "marchLayer"];
  // Replace only the children of a layer whose markup changed.
  function setGlyphs(layer, list) {
    const old = layer.__list;
    if (!old || old.length !== list.length || layer.children.length !== list.length) {
      layer.innerHTML = list.join("");
    } else {
      for (let i = 0; i < list.length; i++) if (old[i] !== list[i]) layer.children[i].outerHTML = list[i];
    }
    layer.__list = list;
  }

  UI.renderMap = function () {
    const sel = UI.selected && S.place(state, UI.selected);
    const targets = new Set(sel && UI.mine(sel) ? S.attackTargets(state, sel.id).map((t) => t.id) : []);
    const M = S.MAP;
    // The painted terrain map when the map has one, else the drawn outline.
    const T = M.terrain;
    const map = $("#map");
    map.classList.toggle("terrain", !!T);
    // The sea and terrain picture are drawn once; only what changes is redrawn.
    const baseKey = T ? T.image : "outline";
    if (map.dataset.base !== baseKey || !$("#cityLayer")) {
      const base = T
        ? `<rect class="sea" x="-2000" y="-2000" width="${T.w + 4000}" height="${T.h + 4000}"/>` +
          `<image class="terrain-img" href="${T.image}" x="0" y="0" width="${T.w}" height="${T.h}" preserveAspectRatio="none"/>`
        : `<rect class="sea" x="-2000" y="-2000" width="${S.MAP_SIZE.w + 4000}" height="${S.MAP_SIZE.h + 4000}"/>` +
          `<polygon class="land" points="${pts(M.land)}"/>` +
          M.islands.map((i) => `<polygon class="land" points="${pts(i)}"/>`).join("") +
          M.rivers.map((r) => `<polyline class="river" points="${pts(r)}"/>`).join("");
      map.innerHTML = base + LAYERS.map((id) => `<g id="${id}"></g>`).join("");
      map.dataset.base = baseKey;
    }
    // Province names at the centre of their cities.
    let svg = "";
    for (const [pid, pname] of Object.entries(S.PROVINCES)) {
      const cs = S.provinceCities(state, pid);
      if (!cs.length) continue;
      const x = cs.reduce((s, c) => s + c.x, 0) / cs.length, y = cs.reduce((s, c) => s + c.y, 0) / cs.length;
      svg += `<text class="prov" x="${Math.round(x)}" y="${Math.round(y)}">${pname}</text>`;
    }
    UI.setHTML($("#provLayer"), svg);

    svg = "";
    const drawn = new Set();
    for (const a of Object.keys(state.cities).concat(Object.keys(state.forts || {}))) {
      for (const b of S.links(state, a)) {
        const k = S.roadKey(a, b);
        if (drawn.has(k)) continue;
        drawn.add(k);
        const A = S.place(state, a), B = S.place(state, b);
        const hl = sel && (a === sel.id || b === sel.id) ? " hl" : "";
        const sea = S.isSea(a, b) ? " sea-road" : "";
        svg += `<line class="road${hl}${sea}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
      }
    }
    UI.setHTML($("#roadLayer"), svg);

    setGlyphs($("#fortLayer"), Object.values(state.forts || {}).map((f) => fortGlyph(f, targets)));
    // The terrain picture packs the north China plain tightly, so icons shrink there.
    const k = T ? 0.72 : 1;
    setGlyphs($("#cityLayer"), S.cityList(state).map((c) => {
      const r = (6 + c.size * 1.5) * k;
      const icon = cityIcon(c), [iw, ih] = CITY_ICONS[icon];
      // The art already grows with the tier; bigger tiers are also drawn a little larger.
      const tier = icon.startsWith("palace") ? 5 : S.cityTier(c);
      const w = iw * 0.2 * (0.9 + tier * 0.04) * k, h = w * ih / iw;
      const cls = ["city", c.id === UI.selected ? "sel" : "", targets.has(c.id) ? "target" : "", UI.home(c) ? "mine" : "", c.id === S.playerCity(state) ? "seat" : ""].join(" ");
      return `<g class="${cls}" data-city="${c.id}">` +
        `<circle class="ring" cx="${c.x}" cy="${c.y}" r="${r + 4}"/>` +
        `<ellipse class="node" cx="${c.x}" cy="${c.y + h * 0.16}" rx="${w * 0.62}" ry="${w * 0.33}" fill="${UI.forceColor(c.owner)}"/>` +
        `<image class="icon" href="assets/cities/${icon}.png" x="${c.x - w / 2}" y="${c.y - h * 0.6}" width="${w}" height="${h}"/>` +
        `<text class="name" x="${c.x}" y="${c.y + h * 0.4 + 9 * k}">${S.isCapital(state, c.id) ? "★" : ""}${c.name}</text>` +
        `<text class="troops" x="${c.x}" y="${c.y + h * 0.4 + 18 * k}">${UI.fmt(c.troops)}</text></g>`;
    }));
    UI.renderMarches();
    if (!(drag && UI.dragged)) applyView();
  };

  // A stronghold on the map: a gatehouse for a pass, a walled square for a
  // fort. Unbuilt sites are drawn faintly.
  const FORT_ICONS = { pass: [28, 26], fort: [30, 22], site: [26, 15], fort_ruin: [26, 24] }; // display sizes
  function fortGlyph(f, targets) {
    const cls = ["fort", f.built ? "" : "site", f.id === UI.selected ? "sel" : "", targets.has(f.id) ? "target" : "", UI.home(f) ? "mine" : ""].join(" ");
    const icon = !f.built ? "site" : S.ruined(f) ? "fort_ruin" : f.kind;
    const [iw, ih] = FORT_ICONS[icon];
    const shape = (f.built ? `<ellipse class="fnode" cx="${f.x}" cy="${f.y + ih * 0.16}" rx="${iw * 0.6}" ry="${iw * 0.3}" fill="${UI.forceColor(f.owner)}"/>` : "") +
      `<image class="ficon" href="assets/forts/${icon}.png" x="${f.x - iw / 2}" y="${f.y - ih * 0.6}" width="${iw}" height="${ih}"/>`;
    const label = f.built ? `${f.name}` : f.building ? `${f.name} (공사 중)` : `${f.name} (터)`;
    return `<g class="${cls}" data-city="${f.id}"><circle class="ring" cx="${f.x}" cy="${f.y}" r="13"/>${shape}` +
      `<text class="name" x="${f.x}" y="${f.y + 17}">${label}</text>` +
      (f.built && f.owner ? `<text class="troops" x="${f.x}" y="${f.y + 25}">${UI.fmt(f.troops)}</text>` : "") + `</g>`;
  }

  UI.battleTitle = function (b) {
    const where = S.placeName(state, b.place);
    if (b.kind === "siege") return `${where} ${b.landing ? "상륙전" : "공방전"}`;
    return `${where} 앞 야전`;
  };

  // Armies, convoys and travelling officers on the roads. Our own marches and
  // enemy armies heading for our cities show their route ahead.
  const TOKEN = {
    foot: "M-11 8h22v-10h-6v-7h-10v7h-6z", footLit: "M-4 -8h8M-10 -1h4M6 -1h4",
    engine: "M-13 8h26v-8h-4v-5h-5v-4h-8v4h-5v5h-4z", engineLit: "M-3 -8h6M-8 -4h3M5 -4h3M-12 1h3M9 1h3",
    horse: "M12 0l-19 -9l5 9l-5 9z",
  };
  UI.renderMarches = function (frac) {
    const layer = $("#marchLayer");
    if (!layer || !state) return;
    const me = state.playerForce;
    const at = (n) => Math.round(n * 10) / 10;
    let svg = "";
    for (const m of state.marches || []) {
      if (m.kind === "build") continue;
      if (me && !S.seenBy(state, m, me)) continue; // not yet heard of (js/war.js)
      const p = S.marchPos(state, m, frac);
      const x = at(p.x), y = at(p.y);
      const dest = S.place(state, m.target);
      const threat = !!me && m.kind === "army" && dest.owner === me && m.force !== me;
      const color = UI.forceColor(m.force);
      if (m.force === me || threat) {
        svg += `<line class="mroute${threat ? " threat" : ""}" x1="${x}" y1="${y}" x2="${dest.x}" y2="${dest.y}"/>`;
      }
      const left = S.daysLeft(state, m);
      const tip = `${S.forceName(state, m.force)} ${m.kind === "army" ? "군단" : m.kind === "sortie" ? "요격" : m.kind === "return" ? "귀환" : m.kind === "wounded" ? "부상병" : "이동"} → ${dest.name}` +
        `${m.troops ? ` · ${m.unit ? S.unitName(m.unit) : "병사"} ${m.troops}` : ""}${m.wounded && m.wounded.n ? ` · 부상병 ${m.wounded.n}` : ""} · ${left}일 남음`;
      if (m.kind === "army" || m.kind === "sortie" || (m.kind === "return" && m.troops)) {
        // A token in the force's colour: 凸 for an army on foot, an arrowhead
        // pointing down the road for horsemen, a broad block for one hauling
        // siege engines. The number of men rides below it.
        const kind = m.speed === "cavalry" ? "horse" : m.speed === "siege" ? "engine" : "foot";
        const deg = Math.round(Math.atan2(dest.y - y, dest.x - x) * 180 / Math.PI);
        svg += `<g class="march army ${kind}${threat ? " threat" : ""}" transform="translate(${x} ${y})"><title>${tip}</title>` +
          `<ellipse class="shade" cx="1" cy="9" rx="13" ry="4"/>` +
          (kind === "horse" ? `<path class="tok" transform="rotate(${deg})" d="${TOKEN.horse}" fill="${color}"/>`
            : `<path class="tok" d="${TOKEN[kind]}" fill="${color}"/><path class="lit" d="${TOKEN[kind + "Lit"]}"/>`) +
          `<text y="19">${UI.fmt(m.troops)}</text></g>`;
      } else {
        svg += `<g class="march"><title>${tip}</title><path class="tok" d="M${x} ${at(y - 6)}l6 6l-6 6l-6-6z" fill="${color}"/></g>`;
      }
    }
    for (const b of state.battles || []) {
      const mineB = b.att.force === me || b.def.force === me;
      svg += `<g class="battle${mineB ? " mineb" : ""}"><title>${UI.battleTitle(b)} · ${b.day}일째</title>` +
        `<circle cx="${b.x}" cy="${b.y - 14}" r="11"/><text x="${b.x}" y="${b.y - 10}">⚔</text></g>`;
    }
    UI.setHTML(layer, svg);
  };
})(globalThis.SAM = globalThis.SAM || {});
