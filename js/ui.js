// Browser UI: map, side panel, command dialogs, turn flow, save/load.
(function (S) {
  // v2: commandery map. Saves from the 32-city prototype are not carried over.
  const SAVE_KEY = "sowsam.save.v3";
  const $ = (sel) => document.querySelector(sel);
  let state = null;
  let selected = null;
  let modalOnInput = null;

  const fmt = (n) => (n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + "만" : String(n));
  const forceColor = (fid) => (fid && state.forces[fid] ? state.forces[fid].color : "#9c9c9c");
  const mine = (c) => c && c.owner === state.playerForce;

  // ---------- storage ----------
  function saveGame(quiet) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      if (!quiet) toast("저장했습니다.");
    } catch (e) {
      toast("저장하지 못했습니다: " + e.message);
    }
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- rendering ----------
  function renderAll() {
    renderStatus();
    renderMap();
    renderPanel();
    renderLog();
  }

  function renderStatus() {
    const f = state.forces[state.playerForce];
    const t = S.totals(state, state.playerForce);
    const ruler = state.officers[f.ruler];
    $("#status").innerHTML =
      `<span><b>${state.year}년 ${state.month}월</b></span>` +
      `<span style="color:${f.color}">■</span><span><b>${f.name}군</b> (군주 ${ruler.name})</span>` +
      `<span>체제 <b>${S.regime(state, state.playerForce).label}</b></span>` +
      `<span>도시 <b>${t.cities}</b></span><span>무장 <b>${t.officers}</b></span>` +
      `<span>병력 <b>${fmt(t.troops)}</b></span><span>병역 인구 <b>${fmt(t.manpower)}</b></span>` +
      `<span>전쟁 피로 <b class="${f.weariness >= 40 ? "bad" : ""}">${Math.round(f.weariness)} (${S.wearinessLabel(f.weariness)})</b></span><span>금 <b>${fmt(t.gold)}</b></span><span>군량 <b>${fmt(t.food)}</b></span>`;
  }

  // ---------- map view (zoom and pan on the SVG viewBox) ----------
  const view = { x: 0, y: 0, w: 1000, h: 700, zoom: 1 };
  const pts = (list) => list.map((p) => p.join(",")).join(" ");

  function applyView() {
    const svg = $("#map");
    const r = svg.getBoundingClientRect();
    view.w = Math.max(200, r.width / view.zoom);
    view.h = Math.max(200, r.height / view.zoom);
    const W = S.MAP_SIZE.w, H = S.MAP_SIZE.h;
    view.x = Math.min(Math.max(view.x, -view.w * 0.3), W - view.w * 0.7);
    view.y = Math.min(Math.max(view.y, -view.h * 0.3), H - view.h * 0.7);
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    svg.classList.toggle("far", view.zoom < 0.75);
  }
  function centerOn(c) {
    const r = $("#map").getBoundingClientRect();
    view.x = c.x - r.width / view.zoom / 2;
    view.y = c.y - r.height / view.zoom / 2;
    applyView();
  }
  function zoomAt(factor, cx, cy) {
    const svg = $("#map"), r = svg.getBoundingClientRect();
    const px = view.x + ((cx - r.left) / r.width) * view.w;
    const py = view.y + ((cy - r.top) / r.height) * view.h;
    view.zoom = Math.min(2.5, Math.max(0.35, view.zoom * factor));
    view.x = px - ((cx - r.left) / r.width) * (r.width / view.zoom);
    view.y = py - ((cy - r.top) / r.height) * (r.height / view.zoom);
    applyView();
  }
  let drag = null;
  let dragged = false;
  function setupMapControls() {
    const svg = $("#map");
    svg.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.clientX, ev.clientY);
    }, { passive: false });
    svg.addEventListener("pointerdown", (ev) => {
      drag = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, id: ev.pointerId };
      dragged = false;
    });
    window.addEventListener("pointermove", (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!dragged && Math.hypot(dx, dy) < 5) return;
      dragged = true;
      view.x = drag.vx - dx / view.zoom;
      view.y = drag.vy - dy / view.zoom;
      applyView();
    });
    window.addEventListener("pointerup", () => { drag = null; });
    window.addEventListener("resize", () => state && applyView());
  }

  // City icons by size (1-5); the emperor's city shows the palace.
  // Art: CroN (조조전 모드 클럽), see assets/CREDITS.md.
  const CITY_ICONS = {
    basic: [50, 58], town: [63, 70], city: [60, 68], metropolis: [71, 71], palace: [78, 73],
  };
  function cityIcon(c) {
    if (c.id === state.emperor) return "palace";
    return ["basic", "basic", "town", "city", "metropolis", "metropolis"][c.size] || "city";
  }

  function renderMap() {
    const sel = selected && state.cities[selected];
    const targets = new Set(sel && mine(sel) ? S.neighbors(sel.id) : []);
    const M = S.MAP;
    let svg = `<rect class="sea" x="-2000" y="-2000" width="${S.MAP_SIZE.w + 4000}" height="${S.MAP_SIZE.h + 4000}"/>` +
      `<polygon class="land" points="${pts(M.land)}"/>` +
      M.islands.map((i) => `<polygon class="land" points="${pts(i)}"/>`).join("") +
      M.rivers.map((r) => `<polyline class="river" points="${pts(r)}"/>`).join("");
    // Province names at the centre of their commanderies.
    for (const [pid, pname] of Object.entries(S.PROVINCES)) {
      const cs = S.provinceCities(state, pid);
      if (!cs.length) continue;
      const x = cs.reduce((s, c) => s + c.x, 0) / cs.length, y = cs.reduce((s, c) => s + c.y, 0) / cs.length;
      svg += `<text class="prov" x="${Math.round(x)}" y="${Math.round(y)}">${pname}</text>`;
    }
    for (const [a, b] of M.roads) {
      const A = state.cities[a], B = state.cities[b];
      const hl = sel && (a === sel.id || b === sel.id) ? " hl" : "";
      svg += `<line class="road${hl}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
    }
    for (const c of Object.values(state.cities)) {
      const r = 6 + c.size * 1.5;
      const icon = cityIcon(c), [iw, ih] = CITY_ICONS[icon];
      const w = 20 + c.size * 4 + (icon === "palace" ? 6 : 0), h = Math.round(w * ih / iw);
      const cls = ["city", c.id === selected ? "sel" : "", targets.has(c.id) ? "target" : "", mine(c) ? "mine" : ""].join(" ");
      svg += `<g class="${cls}" data-city="${c.id}">` +
        `<circle class="ring" cx="${c.x}" cy="${c.y}" r="${r + 4}"/>` +
        `<ellipse class="node" cx="${c.x}" cy="${c.y + h * 0.3}" rx="${w * 0.64}" ry="${w * 0.3}" fill="${forceColor(c.owner)}"/>` +
        `<image class="icon" href="assets/cities/${icon}.png" x="${c.x - w / 2}" y="${c.y - h * 0.62}" width="${w}" height="${h}"/>` +
        `<text class="name" x="${c.x}" y="${c.y + r + 13}">${c.name}</text>` +
        `<text class="troops" x="${c.x}" y="${c.y + r + 24}">${fmt(c.troops)}</text></g>`;
    }
    $("#map").innerHTML = svg;
    applyView();
  }

  function stat(label, value) {
    return `<div><span>${label}</span><b>${value}</b></div>`;
  }

  function officerTable(list, opts) {
    if (!list.length) return `<p class="hint">없음</p>`;
    const rows = list.map((o) => {
      const status = opts.status ? opts.status(o) : "";
      const cls = [o.done && opts.showDone ? "done" : "", opts.pick ? "pick" : ""].join(" ");
      const attrs = opts.pick ? ` data-action="${opts.pick}" data-oid="${o.id}"` : "";
      const crown = S.isRuler(state, o) && o.status === "serving" ? "♛ " : "";
      return `<tr class="${cls}"${attrs}><td>${crown}${o.name}</td><td>${S.age(state, o)}</td>${S.ABILITY_KEYS.map((k) => `<td>${o[k]}</td>`).join("")}` +
        `<td class="han-${o.han}">${S.HAN_NAMES[o.han].slice(2)}</td>` +
        (opts.loyalty ? `<td>${S.isRuler(state, o) ? "-" : o.loyalty}</td>` : "") +
        (opts.extra ? `<td>${opts.extra(o)}</td>` : "") +
        (opts.status ? `<td>${status}</td>` : "") + `</tr>`;
    }).join("");
    return `<table><tr><th>이름</th><th>나이</th>${S.ABILITY_KEYS.map((k) => `<th>${S.ABILITY_NAMES[k]}</th>`).join("")}<th>한조</th>` +
      (opts.loyalty ? `<th>충성</th>` : "") + (opts.extraHead ? `<th>${opts.extraHead}</th>` : "") +
      (opts.status ? `<th>상태</th>` : "") + `</tr>${rows}</table>`;
  }

  function renderPanel() {
    const p = $("#panel");
    if (!selected) {
      p.innerHTML = `<h2>도시를 선택하세요</h2><p class="hint">지도에서 도시를 누르면 정보와 명령이 나옵니다. ` +
        `무장마다 한 달에 한 번 명령할 수 있고, 명령을 마치면 「턴 종료」를 누릅니다.</p>` +
        `<h3>내 도시</h3><div class="links">${S.citiesOf(state, state.playerForce)
          .map((c) => `<button data-action="select" data-city="${c.id}">${c.name} (${S.idle(state, c.id).length})</button>`).join("")}</div>`;
      return;
    }
    const c = state.cities[selected];
    const own = mine(c);
    const ally = S.allied(state, state.playerForce, c.owner) ? " · 동맹" : "";
    let html = `<h2>${c.name}<span class="badge" style="background:${forceColor(c.owner)}">${S.forceName(state, c.owner)}${ally}</span></h2>`;
    const ph = c.owner ? S.provinceHold(state, c.prov, c.owner) : null;
    html += `<p class="hint">${S.PROVINCES[c.prov]} · 치소 ${c.seat}` +
      (ph ? ` · ${S.forceName(state, c.owner)}이 ${S.PROVINCES[c.prov]} ${ph.total}개 군 중 ${ph.held}개 보유` : "") + `</p>`;
    html += `<div class="stats">` +
      stat("병력", c.troops.toLocaleString()) + stat("훈련", c.train) +
      stat("금", c.gold.toLocaleString()) + stat("군량", c.food.toLocaleString()) +
      stat("인구", c.pop.toLocaleString()) + stat("치안", c.order) +
      stat("병역 인구", `${fmt(c.manpower)}/${fmt(S.manpowerMax(c))}`) + stat("월 회복", "+" + S.manpowerRegen(c)) +
      stat("농업", `${c.farm}/${c.farmMax}`) + stat("상업", `${c.trade}/${c.tradeMax}`) +
      stat("성벽", `${c.wall}/${c.wallMax}`) +
      (own ? stat("월 수지", signed(S.balance(c))) : "") +
      `</div>` +
      `<h3>호족</h3><div class="stats">` +
      stat("호족 세력", Math.round(c.gentry)) + stat("호족 협력", Math.round(c.consent)) +
      stat("호족 사병", c.retainers.toLocaleString()) + stat("출진 가능", S.marchable(c).toLocaleString()) +
      `</div>` +
      (own ? `<p class="hint">호족 사병은 이 도시를 지킬 때는 함께 싸우지만 출진·이동하지 않습니다. ` +
        `호족 세력이 강하고 협력이 낮을수록 사병 비중이 커집니다. 협력 목표치 ${Math.round(S.consentTarget(state, c))}.</p>` : "");
    if (own) {
      html += `<h3>월 수지 내역</h3><div class="stats">` +
        stat("수입", "+" + S.income(c)) + stat("병사 봉급", "-" + S.upkeep(c)) +
        stat("관리 봉급", "-" + S.salaries(c)) + `</div>`;
    }
    if (own) html += postsTable(c);
    if (own) {
      html += `<h3>명령</h3><div class="cmds">` +
        cmdButton("draft", "징병") + cmdButton("train", "훈련") + cmdButton("search", "탐색") + cmdButton("recruit", "등용") +
        cmdButton("relocate", "이동") + cmdButton("move", "수송") + cmdButton("attack", "출진") + cmdButton("scheme", "계략") +
        cmdButton("woo", "회유") + cmdButton("reward", "포상", true) +
        `</div>`;
    }
    const servants = S.serving(state, c.id);
    html += `<h3>무장 (${servants.length})</h3>` + officerTable(servants, {
      loyalty: true, showDone: own,
      status: own ? (o) => {
        const k = S.postOf(state, o);
        return k ? `${S.POSTS[k].label} 담당` : o.done ? "완료" : "대기";
      } : null,
    });
    const free = S.visibleFree(state, c.id);
    if (free.length) html += `<h3>재야 인재</h3>` + officerTable(free, {});
    if (own) {
      const caps = S.captivesIn(state, c.id, c.owner);
      if (caps.length) {
        html += `<h3>포로</h3>` + officerTable(caps, {
          extraHead: "", extra: (o) => `<button data-action="release" data-oid="${o.id}">석방</button>`,
        });
      }
    }
    html += `<h3>인접 도시</h3><div class="links">${S.neighbors(c.id).map((n) => {
      const nc = state.cities[n];
      return `<button data-action="select" data-city="${n}" style="border-left:4px solid ${forceColor(nc.owner)}">${nc.name} ${fmt(nc.troops)}</button>`;
    }).join("")}</div>`;
    p.innerHTML = html;
  }

  function signed(n) {
    return `<span class="${n >= 0 ? "good" : "bad"}">${n >= 0 ? "+" : ""}${n}</span>`;
  }

  function holderName(c, kind) {
    const p = c.posts[kind];
    if (!p) return `<span class="bad">공석</span>`;
    if (p.type === "clerk") return `${S.CLERKS[p.tier].name}`;
    return `<b>${state.officers[p.id].name}</b>`;
  }

  function postsTable(c) {
    const rows = S.DEV_KEYS.map((k) => {
      const max = k === "order" ? 100 : c[k + "Max"];
      return `<tr><td>${S.POSTS[k].label}</td><td>${c[k]}/${max}</td><td>${holderName(c, k)}</td>` +
        `<td>${signed(S.postDelta(state, c, k))}</td>` +
        `<td><button data-action="post" data-kind="${k}">변경</button></td></tr>`;
    }).join("");
    const tt = c.posts.tuntian;
    const ttRow = `<tr><td>둔전</td><td>호족 ${Math.round(c.gentry)}</td><td>${tt ? holderName(c, "tuntian") : "미실시"}</td>` +
      `<td>${tt ? tuntianText(S.postAbility(state, tt, "tuntian")) : "-"}</td>` +
      `<td><button data-action="post" data-kind="tuntian">변경</button></td></tr>`;
    return `<h3>내정 담당</h3><table><tr><th>분야</th><th>수치</th><th>담당</th><th>월 변화</th><th></th></tr>${rows}${ttRow}</table>` +
      `<p class="hint">담당관은 매달 자동으로 내정을 발전시킵니다. 공석이면 수치가 깎입니다. 담당 무장은 다른 명령을 할 수 없습니다. ` +
      `둔전은 선택 정책입니다. 군량을 생산하고 호족 세력을 줄이지만, 실시하는 동안 호족 협력이 떨어집니다.</p>`;
  }

  function tuntianText(ability) {
    const e = S.tuntianEffect(ability);
    return `<span class="good">군량 +${Math.round(e.food)}</span>, 호족 -${(e.gentry * 12).toFixed(1)}/년`;
  }

  function cmdButton(cmd, label, free) {
    const c = state.cities[selected];
    const disabled = !free && !S.idle(state, c.id).length;
    return `<button data-action="cmd" data-cmd="${cmd}"${disabled ? " disabled" : ""}>${label}</button>`;
  }

  function renderLog() {
    const entries = state.log.slice(-80).reverse();
    $("#log").innerHTML = entries.map((e) => `<div class="${e.kind}">[${e.y}.${e.m}] ${e.text}</div>`).join("");
  }

  // ---------- modal / toast ----------
  function openModal(html, wide) {
    const box = $("#modal .box");
    box.className = "box" + (wide ? " wide" : "");
    box.innerHTML = html;
    $("#modal").classList.remove("hidden");
    modalOnInput = null;
  }
  function closeModal() {
    $("#modal").classList.add("hidden");
    modalOnInput = null;
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
  }

  function result(r) {
    if (!r.ok) { toast(r.msg); return false; }
    S.addLog(state, r.msg, "mine");
    toast(r.msg);
    renderAll();
    return true;
  }

  // ---------- commands ----------
  const SIMPLE = {
    draft: {
      title: "징병", stat: "cmd", run: (o, c) => S.draft(state, o, c),
      preview: (o, c) => { const n = S.preview.draft(state, c, o); return `병사 +${n} (금 ${Math.ceil(n * S.COST.draftPerTroop)})`; },
    },
    train: { title: "훈련", stat: "cmd", run: (o, c) => S.drill(state, o, c), preview: (o) => `훈련 +${S.preview.train(o)}` },
    woo: {
      title: "회유", stat: "speech", run: (o, c) => S.woo(state, o, c),
      preview: (o) => `호족 협력 +${S.wooPreview(o)} (금 ${S.COST.woo})`,
    },
    search: { title: "탐색", stat: "wit", run: (o, c) => S.search(state, o, c), preview: (o) => `인재 발견률 ${S.searchChance(o)}%` },
  };

  function officerPicker(title, desc, list, action, extra) {
    openModal(`<h2>${title}</h2><p class="hint">${desc}</p>` +
      officerTable(list, { pick: action, extraHead: "효과", extra }) +
      `<div class="footer"><button data-action="close">취소</button></div>`);
  }

  let pending = null;

  const commands = {
    simple(cmd) {
      const c = state.cities[selected];
      const def = SIMPLE[cmd];
      const list = S.idle(state, c.id).sort((a, b) => b[def.stat] - a[def.stat]);
      pending = { cmd };
      officerPicker(def.title, `실행할 무장을 고르세요. ${S.STAT_NAMES[def.stat]} 능력이 높을수록 효과가 큽니다.`, list, "doSimple",
        (o) => def.preview(o, c));
    },
    recruit() {
      const c = state.cities[selected];
      const targets = S.visibleFree(state, c.id).concat(S.captivesIn(state, c.id, c.owner));
      if (!targets.length) { toast("이 도시에는 등용할 인재가 없습니다. 「탐색」으로 재야 인재를 찾아보세요."); return; }
      openModal(`<h2>등용</h2><p class="hint">설득할 대상을 고르세요.</p>` +
        officerTable(targets, { pick: "recruitTarget", extraHead: "신분", extra: (o) => (o.status === "free" ? "재야" : "포로") }) +
        `<div class="footer"><button data-action="close">취소</button></div>`);
    },
    post(kind) {
      const c = state.cities[selected];
      const def = S.POSTS[kind];
      const cur = c.posts[kind];
      const officers = S.serving(state, c.id)
        .filter((o) => !o.done || (cur && cur.type === "officer" && cur.id === o.id))
        .sort((a, b) => def.stat(b) - def.stat(a));
      const effect = (ab) => (def.policy ? tuntianText(ab) : signed(S.postGain(kind, ab)));
      const officerRows = officers.map((o) => {
        const k = S.postOf(state, o);
        const note = k === kind ? "현재 담당" : k ? `${S.POSTS[k].label} 담당 중` : "";
        return `<tr class="pick" data-action="doPost" data-kind="${kind}" data-oid="${o.id}"><td>${o.name}</td>` +
          `<td>${def.stat(o)}</td><td>${effect(def.stat(o))}</td><td>-</td><td>${note}</td></tr>`;
      }).join("");
      const clerkRows = S.CLERKS.map((cl, i) =>
        `<tr class="pick" data-action="doPost" data-kind="${kind}" data-tier="${i}"><td>${cl.name}</td>` +
        `<td>${cl.ability}</td><td>${effect(cl.ability)}</td><td>금 ${cl.salary}/월</td>` +
        `<td>${cur && cur.type === "clerk" && cur.tier === i ? "현재 담당" : ""}</td></tr>`).join("");
      const intro = def.policy
        ? `둔전을 실시하면 군량을 생산하고, 국가가 직접 관리하는 호구를 늘려 호족 세력을 줄입니다. ` +
          `대신 땅을 잃는 호족들의 협력이 떨어집니다. 현재 호족 세력 ${Math.round(c.gentry)}.`
        : `현재 ${def.label} ${c[kind]}.`;
      openModal(`<h2>${def.label} 담당 임명</h2>` +
        `<p class="hint">${intro} 무장은 봉급이 없지만 담당하는 동안 다른 명령을 할 수 없습니다. ` +
        `관리는 매달 봉급이 나갑니다. 능력 기준은 ${def.statLabel}입니다.</p>` +
        `<table><tr><th>담당</th><th>능력</th><th>월 변화</th><th>봉급</th><th></th></tr>` +
        clerkRows + officerRows +
        `<tr class="pick" data-action="doPost" data-kind="${kind}" data-empty="1"><td>${def.policy ? "실시하지 않기" : "공석으로 두기"}</td><td>-</td>` +
        `<td>${def.policy ? "호족 세력이 서서히 회복" : signed(S.postPenalty(c, kind))}</td><td>-</td><td>${!cur ? "현재" : ""}</td></tr></table>` +
        `<div class="footer"><button data-action="close">취소</button></div>`);
    },
    reward() {
      const c = state.cities[selected];
      const list = S.serving(state, c.id).filter((o) => !S.isRuler(state, o)).sort((a, b) => a.loyalty - b.loyalty);
      if (!list.length) { toast("포상할 무장이 없습니다."); return; }
      officerPicker("포상", `금 ${S.COST.reward}을(를) 하사해 충성을 올립니다. 행동력은 쓰지 않습니다. (보유 금 ${c.gold})`, list, "doReward",
        (o) => `충성 ${o.loyalty}`);
    },
    move() {
      const c = state.cities[selected];
      const dests = S.neighbors(c.id).filter((n) => state.cities[n].owner === c.owner);
      if (!dests.length) { toast("인접한 아군 도시가 없습니다."); return; }
      openModal(`<h2>수송</h2><p class="hint">무장과 함께 병사·금·군량을 인접한 아군 도시로 보냅니다.</p>` +
        `<div class="row"><label>목적지</label><select id="mvDest">${dests.map((d) => `<option value="${d}">${state.cities[d].name}</option>`).join("")}</select></div>` +
        checkList(S.idle(state, c.id)) +
        rangeRow("mvTroops", "병사", S.marchable(c)) + rangeRow("mvGold", "금", c.gold) + rangeRow("mvFood", "군량", c.food) +
        (c.retainers ? `<p class="hint">호족 사병 ${c.retainers}명은 이동하지 않습니다.</p>` : "") +
        `<div class="footer"><button data-action="close">취소</button><button class="primary" data-action="doMove">이동</button></div>`);
    },
    relocate() {
      const c = state.cities[selected];
      const dist = S.reachable(state, c.id);
      const dests = Object.keys(dist).sort((a, b) => dist[a] - dist[b] || state.cities[a].name.localeCompare(state.cities[b].name));
      if (!dests.length) { toast("아군 영토로 이어진 다른 도시가 없습니다."); return; }
      const idle = S.idle(state, c.id);
      if (!idle.length) { toast("이동할 수 있는 무장이 없습니다."); return; }
      openModal(`<h2>이동</h2><p class="hint">무장만 아군 영토로 이어진 도시로 보냅니다. 거리에 상관없이 이번 달 안에 도착하고, 이동한 무장은 이번 달 행동을 마칩니다.</p>` +
        `<div class="row"><label>목적지</label><select id="rlDest">${dests.map((d) => {
          const t = state.cities[d];
          return `<option value="${d}">${t.name} (${dist[d]}칸 · 무장 ${S.serving(state, d).length})</option>`;
        }).join("")}</select></div>` +
        checkList(idle) +
        `<div class="footer"><button data-action="close">취소</button><button class="primary" data-action="doRelocate">이동</button></div>`);
    },
    scheme() {
      const c = state.cities[selected];
      const targets = S.schemeTargets(state, c.id);
      if (!targets.length) { toast("계략을 걸 인접한 적 도시가 없습니다. 동맹 세력과 공백지는 대상이 아닙니다."); return; }
      openModal(`<h2>계략</h2><p class="hint">실행 무장의 모략과 대상 도시에서 지략이 가장 높은 무장이 겨룹니다. ` +
        `유언비어는 금 ${S.COST.rumor}, 이간은 금 ${S.COST.discord}이 듭니다. (보유 금 ${c.gold})</p>` +
        `<div class="row"><label>계략</label><select id="scKind"><option value="rumor">유언비어 — 치안·호족 협력 하락</option>` +
        `<option value="discord">이간 — 무장의 충성 하락</option></select></div>` +
        `<div class="row"><label>대상 도시</label><select id="scCity">${targets.map((t) =>
          `<option value="${t.id}">${t.name} (${S.forceName(state, t.owner)})</option>`).join("")}</select></div>` +
        `<div class="row" id="scTargetRow"><label>대상 무장</label><select id="scTarget"></select></div>` +
        `<div id="scInfo" class="hint"></div><div id="scList"></div>` +
        `<div class="footer"><button data-action="close">취소</button></div>`);
      pending = { schemeCity: null };
      modalOnInput = updateScheme;
      updateScheme();
    },
    attack() {
      const c = state.cities[selected];
      const targets = S.neighbors(c.id).filter((n) => state.cities[n].owner !== c.owner && !S.allied(state, c.owner, state.cities[n].owner));
      if (!targets.length) { toast("인접한 적 도시가 없습니다."); return; }
      if (S.marchable(c) < S.MIN_SORTIE_TROOPS) { toast(`출진 가능한 병사가 ${S.MIN_SORTIE_TROOPS}명 이상 있어야 합니다. 호족 사병은 출진하지 않습니다.`); return; }
      const idle = S.idle(state, c.id).sort((a, b) => b.cmd + b.war - a.cmd - a.war);
      openModal(`<h2>출진</h2><p class="hint">무장은 최대 ${S.MAX_SORTIE_OFFICERS}명입니다. 용병·군략·무력이 가장 높은 무장의 능력이 각각 전투에 반영됩니다. 군량은 병사 10명당 1이 듭니다.</p>` +
        `<div class="row"><label>목표</label><select id="atTarget">${targets.map((d) => {
          const t = state.cities[d];
          return `<option value="${d}">${t.name} (${S.forceName(state, t.owner)}, 병력 ${t.troops})</option>`;
        }).join("")}</select></div>` +
        checkList(idle, S.MAX_SORTIE_OFFICERS) +
        rangeRow("atTroops", "병사", S.marchable(c), Math.round(S.marchable(c) * 0.7)) +
        (c.retainers ? `<p class="hint">호족 사병 ${c.retainers}명은 출진하지 않고 성에 남습니다.</p>` : "") +
        `<div class="row"><label>전력</label><span id="atEst"></span></div>` +
        `<div class="footer"><button data-action="close">취소</button><button class="primary" data-action="doAttack">출진</button></div>`);
      modalOnInput = updateEstimate;
      updateEstimate();
    },
  };

  function checkList(list, max) {
    return `<div class="row" style="align-items:flex-start"><label>무장</label><div>${list.map((o, i) =>
      `<label style="display:block"><input type="checkbox" class="pickOfficer" value="${o.id}"${max && i === 0 ? " checked" : ""}> ` +
      `${o.name} <span class="hint">무${o.war} 용${o.cmd} 군${o.strat}</span></label>`).join("")}</div></div>`;
  }
  function rangeRow(id, label, max, value) {
    return `<div class="row"><label>${label}</label><input type="range" id="${id}" min="0" max="${max}" step="1" value="${value || 0}">` +
      `<input type="number" id="${id}N" min="0" max="${max}" value="${value || 0}"></div>`;
  }
  const checked = () => [...document.querySelectorAll(".pickOfficer:checked")].map((x) => x.value);
  const num = (id) => +$("#" + id).value;

  function updateEstimate() {
    const ids = checked();
    const el = $("#atEst");
    if (!ids.length) { el.textContent = "무장을 골라 주세요."; return; }
    if (ids.length > S.MAX_SORTIE_OFFICERS) { el.innerHTML = `<span class="bad">무장은 ${S.MAX_SORTIE_OFFICERS}명까지입니다.</span>`; return; }
    const e = S.estimate(state, selected, $("#atTarget").value, ids, num("atTroops"));
    const label = e.ratio >= 1.6 ? `<span class="good">압도적 우세</span>` : e.ratio >= 1.2 ? `<span class="good">우세</span>`
      : e.ratio >= 0.9 ? "백중세" : `<span class="bad">열세</span>`;
    el.innerHTML = `아군 ${fmt(e.att)} : 적군 ${fmt(e.def)} — ${label}`;
  }

  function updateScheme() {
    const kind = $("#scKind").value;
    const city = $("#scCity").value;
    const discord = kind === "discord";
    $("#scTargetRow").style.display = discord ? "" : "none";
    if (pending.schemeCity !== city) {
      pending.schemeCity = city;
      const t = state.cities[city];
      const foes = S.serving(state, city).filter((o) => o.force === t.owner).sort((a, b) => a.loyalty - b.loyalty);
      $("#scTarget").innerHTML = foes.map((o) => `<option value="${o.id}">${o.name} (충성 ${o.loyalty} · 지략 ${o.wit}${S.isRuler(state, o) ? " · 군주" : ""})</option>`).join("");
    }
    const t = state.cities[city];
    const guard = S.cityWit(state, city);
    const victim = discord ? state.officers[$("#scTarget").value] : null;
    $("#scInfo").innerHTML = `${t.name} 치안 ${t.order} · 호족 협력 ${Math.round(t.consent)} · 수비 지략 ${guard ? `${guard.name} ${guard.wit}` : "없음"}`;
    const list = S.idle(state, selected).sort((a, b) => b.plot - a.plot);
    if (discord && !victim) { $("#scList").innerHTML = `<p class="hint">이 도시에는 이간할 무장이 없습니다.</p>`; return; }
    $("#scList").innerHTML = officerTable(list, {
      pick: "doScheme", extraHead: "효과",
      extra: (o) => {
        if (!discord) {
          const e = S.schemeEffect.rumor(o);
          return `성공률 ${S.rumorChance(state, o, city)}% · 치안 -${e.order}, 협력 -${e.consent}`;
        }
        const p = S.discordChance(state, o, victim);
        return p ? `성공률 ${p}% · 충성 -${S.schemeEffect.discord(o)}` : "통하지 않음 (군주·혈족)";
      },
    });
  }

  function showReport(report) {
    let html = `<h2>${report.from} → ${report.to} 전투</h2><div class="report">${report.lines.map((l) => `<div>${l}</div>`).join("")}</div>`;
    if (report.captured.length && report.attackerWon) html += `<p class="hint">사로잡은 무장은 도시 화면에서 등용하거나 석방할 수 있습니다.</p>`;
    html += `<div class="footer"><button class="primary" data-action="close">확인</button></div>`;
    openModal(html);
  }

  // ---------- turn ----------
  function endTurn() {
    const start = state.log.length;
    const defenses = [];
    S.advanceTurn(state, (r) => {
      if (r.report && r.report.defender === state.playerForce) defenses.push(r.report);
    });
    saveGame(true);
    renderAll();
    if (state.over) return showEnd();
    const news = state.log.slice(start).filter((e) => e.kind !== "mine");
    let html = `<h2>${state.year}년 ${state.month}월</h2>`;
    html += news.length ? `<div class="report">${news.map((e) => `<div class="${e.kind}">${e.text}</div>`).join("")}</div>` : `<p class="hint">조용한 한 달이었습니다.</p>`;
    for (const r of defenses) {
      html += `<h3>${r.from} → ${r.to} 전투</h3><div class="report">${r.lines.map((l) => `<div>${l}</div>`).join("")}</div>`;
    }
    html += courtPending();
    html += `<div class="footer"><button class="primary" data-action="close">확인</button></div>`;
    openModal(html);
  }

  function showEnd() {
    const o = state.over;
    const win = o.result === "win" && o.force === state.playerForce;
    openModal(`<div class="title-hero"><h1>${win ? "천하통일" : "패배"}</h1><p>${win
      ? `${state.year}년 ${state.month}월, ${state.forces[state.playerForce].name}군이 천하를 통일했습니다!`
      : o.result === "win" ? `${state.forces[o.force].name}군이 천하를 통일했습니다.` : "모든 도시를 잃었습니다."}</p></div>` +
      `<div class="footer"><button class="primary" data-action="title">타이틀로</button></div>`);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  function showForces() {
    const rows = Object.values(state.forces).filter((f) => f.alive)
      .map((f) => ({ f, t: S.totals(state, f.id) }))
      .sort((a, b) => b.t.cities - a.t.cities || b.t.troops - a.t.troops)
      .map(({ f, t }) => `<tr><td><span style="color:${f.color}">■</span> ${f.name}군${f.emperor ? " (황제)" : ""}${f.id === state.playerForce ? " (나)" : ""}</td>` +
        `<td>${S.regime(state, f.id).label}</td><td>${t.cities}</td><td>${t.officers}</td><td>${fmt(t.troops)}</td><td>${fmt(t.manpower)}</td>` +
        `<td>${Math.round(f.weariness)} ${S.wearinessLabel(f.weariness)}</td><td>${fmt(t.gold)}</td><td>${fmt(t.food)}</td>` +
        `<td>${S.allies(state, f.id).map((a) => state.forces[a].name).join(", ") || "-"}</td><td>${diplomacyCell(f.id)}</td></tr>`).join("");
    openModal(`<h2>세력 정보</h2><table><tr><th>세력</th><th>체제</th><th>도시</th><th>무장</th><th>병력</th><th>병역 인구</th><th>전쟁 피로</th><th>금</th><th>군량</th><th>동맹</th><th>외교</th></tr>${rows}</table>` +
      `<p class="hint">동맹을 맺은 세력끼리는 서로 공격하지 않습니다. 동맹 제의에는 예물로 금 ${S.PACT_COST}이 들고, 같은 세력에는 한 달에 한 번만 제의할 수 있습니다. ` +
      `동맹을 파기하면 내 모든 도시의 치안이 5 떨어지고, ${S.PACT_COOLDOWN}개월 동안 다시 동맹을 맺을 수 없습니다. 컴퓨터 세력도 더 싸울 상대가 없거나 동맹이 훨씬 약해지면 동맹을 깰 수 있습니다.</p>` +
      `<p class="hint">병역 인구는 징병할 수 있는 장정 수입니다. 전사자는 돌아오지 않고, 인구에서 조금씩 회복됩니다. ` +
      `전쟁 피로는 전사자·패전·대규모 징병으로 오르고 평화로울 때 내려갑니다. 30을 넘으면 치안이 떨어지고, 60을 넘으면 민란이 일어날 수 있습니다. ` +
      `체제는 영토의 호족 세력(인구 가중 평균)으로 정해집니다. 55 이상은 호족연합형, 25 이하는 중앙집권형, 그 사이는 부곡형입니다.</p>` +
      `<div class="footer"><button class="primary" data-action="close">닫기</button></div>`, true);
  }

  // ---------- the Han court ----------
  function courtPending() {
    const han = state.han;
    if (!han || !han.pending || han.holder !== state.playerForce) return "";
    const p = han.pending;
    if (p.type === "abdicate") {
      return `<h3>선양 조서</h3><p>헌제가 제위를 물려주겠다고 합니다. 받으면 황제에 오르고 한 왕조는 끝납니다. ` +
        `한조중시 무장의 충성이 15, 한조이용 무장의 충성이 4 떨어집니다. 사양하면 헌제의 우호도가 5 오릅니다.</p>` +
        `<div class="links"><button class="primary" data-action="abdicate" data-yes="1">선양을 받는다</button>` +
        `<button data-action="abdicate">사양한다</button></div>`;
    }
    const c = state.cities[state.emperor];
    const can = S.canPayDemand(state, p);
    return `<h3>헌제의 청</h3><p>헌제가 ${S.josa(p.label, "을", "를")} 청합니다: <b>${S.demandCargo(p)}</b> ` +
      `(${c.name} 보유: 금 ${fmt(c.gold)}, 군량 ${fmt(c.food)})</p>` +
      `<p class="hint">들어주면 우호도 +${S.COURT.accept}, 거절하거나 이번 달 안에 답하지 않으면 우호도 -${S.COURT.refuse}.</p>` +
      `<div class="links"><button class="primary" data-action="demand" data-yes="1"${can ? "" : " disabled"}>바친다</button>` +
      `<button data-action="demand">거절한다</button></div>`;
  }

  function showCourt() {
    S.syncCourt(state);
    const han = state.han;
    const me = state.playerForce;
    let html = `<h2>황실</h2>`;
    if (!state.emperor) {
      html += `<p class="hint">이 시나리오에는 헌제가 없습니다.</p>`;
    } else if (han.ended) {
      html += `<p>한 왕조는 ${han.endedYear}년 헌제가 ${S.forceName(state, han.endedBy)}에 제위를 물려주며 막을 내렸습니다.</p>`;
    } else {
      const c = state.cities[state.emperor];
      const h = han.holder;
      html += `<div class="stats">` + stat("헌제의 거처", c.name) + stat("옹립 세력", h ? S.forceName(state, h) : "없음 (공백지)") +
        stat("헌제의 우호도", `${han.favor} ${S.favorLabel(han.favor)}`) +
        (h ? stat("옹립 세력 영토", `${Math.round(S.cityShare(state, h) * 100)}%`) : "") + `</div>`;
      html += courtPending();
      if (h === me) {
        const dist = S.reachable(state, state.emperor);
        const dests = Object.keys(dist).sort((a, b) => dist[a] - dist[b]);
        html += `<h3>천도</h3><p class="hint">헌제를 아군 영토로 이어진 다른 도시로 옮깁니다. ${c.name}의 금 ${S.COURT.moveCost}이 들고, ` +
          `헌제의 우호도가 3 떨어집니다. 한 번 옮기면 ${S.COURT.moveCooldown}개월 동안 다시 옮길 수 없습니다.</p>` +
          (dests.length ? `<div class="row"><label>새 도읍</label><select id="ctDest">${dests.map((d) =>
            `<option value="${d}">${state.cities[d].name} (${dist[d]}칸)</option>`).join("")}</select>` +
            `<button data-action="moveEmperor">천도</button></div>` : `<p class="hint">옮길 수 있는 도시가 없습니다.</p>`);
      }
    }
    const emperors = Object.values(state.forces).filter((f) => f.alive && f.emperor);
    html += `<h3>황제</h3><p>${emperors.length ? emperors.map((f) => `${f.name} (${f.emperorYear}년${f.hanHeir ? ", 한 황실 계승" : ""})`).join(", ") : "아직 황제를 칭한 군주가 없습니다."}</p>`;
    const can = S.canProclaim(state, me);
    if (!state.forces[me].emperor) {
      const heir = S.isHanHeir(state, me);
      html += `<p class="hint">${heir
        ? "한 왕조가 끝났으므로, 한조를 중시하는 군주는 한 황실을 잇는다는 명분으로 칭제할 수 있습니다. 무장의 충성이 떨어지지 않습니다."
        : "칭제하면 한조중시 무장의 충성이 25, 한조이용 무장의 충성이 8 떨어지고, 한조를 중시하는 군주와의 동맹이 끊깁니다."} ` +
        `황제가 되면 한조무관·이용 인재를 등용하기 조금 쉬워집니다. 도시 ${S.COURT.proclaimCities}개 이상이 필요하고, 헌제를 모시는 동안에는 칭제할 수 없습니다.</p>` +
        `<div class="links"><button data-action="proclaim"${can.ok ? "" : " disabled"}>칭제</button>${can.ok ? "" : ` <span class="hint">${can.msg}</span>`}</div>`;
    }
    html += `<p class="hint">헌제를 모시는 세력은 한조중시 인재를 등용하기 쉽고(우호도 40 이상), 우호도가 50 이상이면 한조중시 무장의 충성이 조금씩 오릅니다. ` +
      `헌제는 석 달마다 금이나 군량을 청하기도 합니다. 우호도가 ${S.COURT.abdicateFavor} 이상이고 영토가 ${S.COURT.abdicateShare * 100}% 이상이면 선양을 받을 수 있습니다. ` +
      `우호도가 30 밑이면, 강한 세력에게서는 한조중시 군주에게 밀서를 보내고 약한 세력에게서는 달아날 수 있습니다.</p>` +
      `<div class="footer"><button class="primary" data-action="close">닫기</button></div>`;
    openModal(html, true);
  }

  function diplomacyCell(fid) {
    const me = state.playerForce;
    if (fid === me || state.over) return "";
    if (S.allied(state, me, fid)) return `<button data-action="breakPact" data-force="${fid}">동맹 파기</button>`;
    const cd = S.pactCooldown(state, me, fid);
    if (cd) return `<span class="hint">${cd}개월 후</span>`;
    if (state.pactTried && state.pactTried[fid] === S.monthsElapsed(state)) return `<span class="hint">이번 달 제의함</span>`;
    return `<button data-action="proposePact" data-force="${fid}">동맹 제의 (${S.pactChance(state, me, fid)}%)</button>`;
  }

  // ---------- title ----------
  function showTitle() {
    const saved = loadSaved();
    const preview = S.newGame(S.SCENARIO_191, null, 1);
    const cards = Object.values(preview.forces).map((f) => {
      const t = S.totals(preview, f.id);
      const r = preview.officers[f.ruler];
      return `<button class="forcecard" style="border-left-color:${f.color}" data-action="start" data-force="${f.id}">` +
        `<b>${f.name}</b><div>도시 ${t.cities} · 무장 ${t.officers} · 병력 ${fmt(t.troops)}</div>` +
        `<div>${S.citiesOf(preview, f.id).map((c) => c.name).join(", ")}</div>` +
        `<div>${S.ABILITY_KEYS.map((k) => S.ABILITY_SHORT[k] + r[k]).join(" ")} · ${S.HAN_NAMES[r.han]}</div></button>`;
    }).join("");
    openModal(`<div class="title-hero"><h1>SoWSam 삼국지</h1><p>${S.SCENARIO_191.title} — ${S.SCENARIO_191.desc}</p></div>` +
      (saved && !saved.over ? `<div class="footer" style="justify-content:center;margin-bottom:12px"><button class="primary" data-action="continue">이어하기 (${saved.year}년 ${saved.month}월 · ${saved.forces[saved.playerForce].name}군)</button></div>` : "") +
      `<h3>수명</h3><div class="links">` +
      Object.entries(S.LIFESPAN).map(([k, v]) => `<label><input type="radio" name="lifespan" value="${k}"${k === "real" ? " checked" : ""}> ${v}</label>`).join(" ") +
      `</div><p class="hint">무장은 16세가 되면 등장합니다. 사실 수명에서는 병으로 죽은 인물은 정사의 사망 연도 2년 전부터 매년 72면체 주사위를, ` +
      `전사·처형 등으로 죽은 인물은 48세부터 매년 144면체 주사위를 굴립니다. 1~12가 나오면 그 달에 세상을 떠납니다. ` +
      `가상 수명에서는 모두 99세까지 살고, 그 뒤 12면체 주사위로 세상을 떠나는 달을 정합니다.</p>` +
      `<h3>세력을 고르세요</h3><div class="forcegrid">${cards}</div>`, true);
  }

  function start(fid) {
    const pick = document.querySelector('input[name="lifespan"]:checked');
    state = S.newGame(S.SCENARIO_191, fid, null, { lifespan: pick ? pick.value : "real" });
    const home = S.citiesOf(state, fid)[0];
    selected = home.id;
    closeModal();
    view.zoom = 1;
    renderAll();
    centerOn(home);
    toast(`${state.forces[fid].name}군으로 천하통일을 시작합니다!`);
  }

  // ---------- events ----------
  const actions = {
    close: closeModal,
    title: showTitle,
    forces: () => state && showForces(),
    court: () => state && showCourt(),
    demand: (d) => { if (result(S.answerDemand(state, !!d.yes))) showCourt(); },
    abdicate: (d) => {
      if (d.yes && !confirm("선양을 받아 황제에 오를까요? 한 왕조가 끝납니다.")) return;
      if (result(S.answerAbdication(state, !!d.yes))) showCourt();
    },
    moveEmperor: () => { if (result(S.moveEmperor(state, state.playerForce, $("#ctDest").value))) showCourt(); },
    proclaim: () => {
      if (!confirm("황제를 칭할까요?")) return;
      if (result(S.proclaim(state, state.playerForce))) showCourt();
    },
    proposePact: (d) => { if (result(S.proposePact(state, state.playerForce, d.force))) showForces(); },
    breakPact: (d) => {
      if (!confirm(`${state.forces[d.force].name}군과의 동맹을 파기할까요? 내 모든 도시의 치안이 5 떨어집니다.`)) return;
      if (result(S.breakPact(state, state.playerForce, d.force))) showForces();
    },
    save: () => state && saveGame(),
    endTurn: () => state && !state.over && endTurn(),
    start: (d) => start(d.force),
    continue: () => {
      state = S.migrate(loadSaved());
      selected = S.citiesOf(state, state.playerForce)[0].id;
      closeModal();
      view.zoom = 1;
      renderAll();
      centerOn(state.cities[selected]);
    },
    select: (d) => { selected = d.city; renderAll(); },
    cmd: (d) => (commands[d.cmd] ? commands[d.cmd]() : commands.simple(d.cmd)),
    post: (d) => commands.post(d.kind),
    doPost: (d) => {
      const spec = d.empty ? null : d.oid ? { type: "officer", id: d.oid } : { type: "clerk", tier: +d.tier };
      const r = S.assignPost(state, selected, d.kind, spec);
      if (r.ok) closeModal();
      result(r);
    },
    doSimple: (d) => {
      const r = SIMPLE[pending.cmd].run(d.oid, selected);
      closeModal();
      result(r);
    },
    recruitTarget: (d) => {
      const target = state.officers[d.oid];
      pending = { target: d.oid };
      const list = S.idle(state, selected).sort((a, b) => b.speech - a.speech);
      officerPicker(`${target.name} 등용`, "설득할 무장을 고르세요. 언변이 높을수록 성공률이 오릅니다.", list, "doRecruit",
        (o) => `성공률 ${S.recruitChance(state, o, target)}%`);
    },
    doRecruit: (d) => {
      const r = S.recruit(state, d.oid, selected, pending.target);
      closeModal();
      result(r);
    },
    doReward: (d) => {
      const r = S.reward(state, selected, d.oid);
      if (result(r)) commands.reward();
    },
    release: (d) => result(S.release(state, selected, d.oid)),
    doMove: () => {
      const r = S.move(state, selected, $("#mvDest").value, checked(), num("mvTroops"), num("mvGold"), num("mvFood"));
      if (r.ok) closeModal();
      result(r);
    },
    doRelocate: () => {
      const r = S.relocate(state, selected, $("#rlDest").value, checked());
      if (r.ok) closeModal();
      result(r);
    },
    doScheme: (d) => {
      const r = $("#scKind").value === "discord"
        ? S.discord(state, d.oid, selected, $("#scTarget").value)
        : S.rumor(state, d.oid, selected, $("#scCity").value);
      if (r.ok) closeModal();
      result(r);
    },
    doAttack: () => {
      const r = S.attack(state, selected, $("#atTarget").value, checked(), num("atTroops"));
      if (!r.ok) { toast(r.msg); return; }
      if (r.report.attackerWon) selected = state.cities[$("#atTarget").value].id;
      renderAll();
      showReport(r.report);
      if (S.checkOver(state)) setTimeout(showEnd, 0);
    },
  };

  setupMapControls();
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-action], [data-city]");
    if (!el) return;
    if (el.dataset.action) {
      const fn = actions[el.dataset.action];
      if (fn) fn(el.dataset);
    } else if (el.dataset.city && state) {
      if (dragged) return;
      selected = el.dataset.city;
      renderAll();
    }
  });
  document.addEventListener("input", (ev) => {
    const id = ev.target.id;
    // Keep range sliders and number boxes in sync.
    if (id && $("#" + id + "N")) $("#" + id + "N").value = ev.target.value;
    if (id && id.endsWith("N") && $("#" + id.slice(0, -1))) $("#" + id.slice(0, -1)).value = ev.target.value;
    if (modalOnInput) modalOnInput();
  });
  document.addEventListener("change", () => modalOnInput && modalOnInput());
  $("#modal").addEventListener("click", (ev) => {
    if (ev.target.id === "modal" && state) closeModal();
  });

  showTitle();
})(globalThis.SAM = globalThis.SAM || {});
