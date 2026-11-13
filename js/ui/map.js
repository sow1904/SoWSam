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

  // City icons by size (1-5); the Han capital and an emperor's court show the palace.
  // Art: CroN (조조전 모드 클럽), see assets/CREDITS.md.
  const CITY_ICONS = {
    basic: [50, 58], town: [63, 70], city: [60, 68], metropolis: [71, 71], palace: [78, 73],
  };
  function cityIcon(c) {
    if (c.id === state.emperor && !(state.han && state.han.ended)) return "palace";
    if (c.owner && state.forces[c.owner].emperor && S.isCapital(state, c.id)) return "palace";
    return ["basic", "basic", "town", "city", "metropolis", "metropolis"][c.size] || "city";
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
      const w = (20 + c.size * 4 + (icon === "palace" ? 6 : 0)) * k, h = Math.round(w * ih / iw);
      const cls = ["city", c.id === UI.selected ? "sel" : "", targets.has(c.id) ? "target" : "", UI.mine(c) ? "mine" : ""].join(" ");
      return `<g class="${cls}" data-city="${c.id}">` +
        `<circle class="ring" cx="${c.x}" cy="${c.y}" r="${r + 4}"/>` +
        `<ellipse class="node" cx="${c.x}" cy="${c.y + h * 0.3}" rx="${w * 0.64}" ry="${w * 0.3}" fill="${UI.forceColor(c.owner)}"/>` +
        `<image class="icon" href="assets/cities/${icon}.png" x="${c.x - w / 2}" y="${c.y - h * 0.62}" width="${w}" height="${h}"/>` +
        `<text class="name" x="${c.x}" y="${c.y + r + 13 * k}">${S.isCapital(state, c.id) ? "★" : ""}${c.name}</text>` +
        `<text class="troops" x="${c.x}" y="${c.y + r + 22 * k}">${UI.fmt(c.troops)}</text></g>`;
    }));
    UI.renderMarches();
    if (!(drag && UI.dragged)) applyView();
  };

  // A stronghold on the map: a gatehouse for a pass, a walled square for a
  // fort. Unbuilt sites are drawn faintly.
  const FORT_ICONS = { pass: [28, 17], fort: [19, 21], site: [17, 19] }; // display sizes
  function fortGlyph(f, targets) {
    const cls = ["fort", f.built ? "" : "site", f.id === UI.selected ? "sel" : "", targets.has(f.id) ? "target" : "", UI.mine(f) ? "mine" : ""].join(" ");
    const icon = f.built ? f.kind : "site";
    const [iw, ih] = FORT_ICONS[icon];
    const shape = (f.built ? `<ellipse class="fnode" cx="${f.x}" cy="${f.y + ih * 0.32}" rx="${iw * 0.55}" ry="${ih * 0.22}" fill="${UI.forceColor(f.owner)}"/>` : "") +
      `<image class="ficon" href="assets/forts/${icon}.png" x="${f.x - iw / 2}" y="${f.y - ih * 0.62}" width="${iw}" height="${ih}"/>`;
    const label = f.built ? `${f.name}` : f.building ? `${f.name} (공사 중)` : `${f.name} (터)`;
    return `<g class="${cls}" data-city="${f.id}"><circle class="ring" cx="${f.x}" cy="${f.y}" r="13"/>${shape}` +
      `<text class="name" x="${f.x}" y="${f.y + 17}">${label}</text>` +
      (f.built && f.owner ? `<text class="troops" x="${f.x}" y="${f.y + 25}">${UI.fmt(f.troops)}</text>` : "") + `</g>`;
  }

  UI.battleTitle = function (b) {
    const where = S.placeName(state, b.place);
    if (b.kind === "siege") return `${where} 공방전`;
    return `${where} 앞 ${b.water ? "수전" : "야전"}`;
  };

  // Armies, convoys and travelling officers on the roads. Our own marches and
  // enemy armies heading for our cities show their route ahead.
  UI.renderMarches = function (frac) {
    const layer = $("#marchLayer");
    if (!layer || !state) return;
    const me = state.playerForce;
    const at = (n) => Math.round(n * 10) / 10;
    let svg = "";
    for (const m of state.marches || []) {
      if (m.kind === "build") continue;
      const p = S.marchPos(state, m, frac);
      const x = at(p.x), y = at(p.y);
      const dest = S.place(state, m.target);
      const threat = !!me && m.kind === "army" && dest.owner === me && m.force !== me;
      const color = UI.forceColor(m.force);
      if (m.force === me || threat) {
        svg += `<line class="mroute${threat ? " threat" : ""}" x1="${x}" y1="${y}" x2="${dest.x}" y2="${dest.y}"/>`;
      }
      const left = S.daysLeft(state, m);
      const tip = `${S.forceName(state, m.force)} ${m.kind === "army" ? "군단" : m.kind === "sortie" ? "요격" : m.kind === "return" ? "귀환" : "이동"} → ${dest.name}` +
        `${m.troops ? ` · ${m.unit ? S.unitName(m.unit) : "병사"} ${m.troops}` : ""} · ${left}일 남음`;
      if (m.kind === "army" || m.kind === "sortie" || (m.kind === "return" && m.troops)) {
        svg += `<g class="march army${threat ? " threat" : ""}"><title>${tip}</title>` +
          `<rect x="${at(x - 13)}" y="${at(y - 8)}" width="26" height="16" rx="3" fill="${color}"/>` +
          `<text x="${x}" y="${at(y + 4)}">${UI.fmt(m.troops)}</text></g>`;
      } else {
        svg += `<g class="march"><title>${tip}</title><circle cx="${x}" cy="${y}" r="5" fill="${color}"/></g>`;
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
