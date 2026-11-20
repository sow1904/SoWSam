// The main menu, the scenario screen with its small map, and the save slots.
(function (S) {
  const UI = S.UI, $ = UI.$, fmt = UI.fmt;
  let state = null;
  UI.bind((s) => { state = s; });

  const hero = (sub) => `<div class="title-hero"><div class="seal">SoW</div><h1>삼국지</h1>${sub || ""}</div>`;
  const pad = (n) => String(n).padStart(2, "0");
  const when = (t) => {
    if (!t) return "";
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // ---------- main menu ----------
  UI.showTitle = function () {
    const slots = UI.slotList().filter((s) => s.info);
    const last = slots.slice().sort((a, b) => (b.info.savedAt || 0) - (a.info.savedAt || 0))[0];
    UI.openModal(hero(`<p class="scn">천하를 다투는 군웅의 시대</p>`) +
      `<div class="mainmenu">` +
      `<button class="primary big" data-action="newGame">새로하기</button>` +
      `<button class="big" data-action="loadMenu" data-from="title"${slots.length ? "" : " disabled"}>이어하기</button>` +
      `</div>` +
      `<p class="hint center">${last ? `마지막 저장: ${UI.slotName(last.slot)} · ${last.info.text}` : "저장한 게임이 없습니다."}</p>`);
    $("#modal .box").classList.add("titlebox", "menubox");
  };

  // ---------- scenario screen ----------
  UI.newOpts = { lifespan: "real", fiction: true, women: true };
  let cache = null;
  function previewOf(sc) {
    const key = `${sc.id}|${UI.newOpts.fiction}|${UI.newOpts.women}`;
    if (!cache || cache.key !== key) cache = { key, st: S.newGame(sc, null, 1, { fiction: UI.newOpts.fiction, women: UI.newOpts.women }) };
    return cache.st;
  }
  // The land in small: roads, and every city in its owner's colour. The
  // chosen force stands out and the rest fade.
  function miniMap(st, pick) {
    const cs = Object.values(st.cities);
    const seen = new Set();
    let roads = "";
    for (const c of cs) for (const n of S.neighbors(c.id)) {
      const k = c.id < n ? c.id + n : n + c.id;
      if (seen.has(k) || !st.cities[n]) continue;
      seen.add(k);
      roads += `<line x1="${c.x}" y1="${c.y}" x2="${st.cities[n].x}" y2="${st.cities[n].y}"/>`;
    }
    const dot = (c) => {
      const f = c.owner && st.forces[c.owner];
      const on = pick && c.owner === pick;
      const cap = f && S.capitalOf(st, f.id) === c.id;
      const r = 15 + c.size * 6 + (on ? 8 : 0);
      return `<g class="${on ? "on" : pick ? "off" : ""}"${f ? ` data-action="pickForce" data-force="${f.id}"` : ""}>` +
        (cap ? `<rect x="${c.x - r - 9}" y="${c.y - r - 9}" width="${2 * r + 18}" height="${2 * r + 18}" class="cap"/>` : "") +
        `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="${f ? f.color : "#77736a"}"/>` +
        `<title>${c.name} (${f ? f.name + "군" : "공백지"})</title>` +
        (on ? `<text x="${c.x}" y="${c.y - r - 14}">${c.name}</text>` : "") + `</g>`;
    };
    // Chosen cities last, so their names lie on top.
    const order = cs.slice().sort((a, b) => (a.owner === pick) - (b.owner === pick));
    return `<svg class="minimap" viewBox="60 -40 2060 2140" preserveAspectRatio="xMidYMid meet"><g class="roads">${roads}</g>${order.map(dot).join("")}</svg>`;
  }
  function forceDetail(st, fid) {
    const f = st.forces[fid], r = st.officers[f.ruler], t = S.totals(st, fid);
    const cap = S.capitalOf(st, fid);
    const cities = S.citiesOf(st, fid);
    return `<div class="scn-force" style="--force:${f.color}"><h3><span class="swatch"></span>${f.name}군 <span class="fc-han">${S.HAN_NAMES[r.han]}</span></h3>` +
      `<div class="fc-abil">${S.ABILITY_KEYS.map((k) => `${S.ABILITY_SHORT[k]}<b>${r[k]}</b>`).join(" ")}` +
      (S.traitsOf(r).length ? ` ${S.traitsOf(r).map((x) => `<span class="trait">${x}</span>`).join(" ")}` : "") + `</div>` +
      `<div class="stats">` + UI.stat("도시", t.cities) + UI.stat("무장", t.officers) + UI.stat("병력", fmt(t.troops)) +
      UI.stat("세력 수도", cap ? st.cities[cap].name : "-") + UI.stat("체제", S.regime(st, fid).label) + `</div>` +
      `<p class="scn-cities">${cities.map((c) => (c.id === cap ? `<b>${c.name}</b>` : c.name)).join(" · ")}</p></div>`;
  }
  UI.showScenario = function () {
    const sc = S.scenarioOf(UI.scenario) || S.SCENARIOS[0];
    UI.scenario = sc.id;
    const st = previewOf(sc);
    if (UI.pickForce && !st.forces[UI.pickForce]) UI.pickForce = "";
    const pick = UI.pickForce || "";
    const forces = Object.values(st.forces).map((f) => ({ f, t: S.totals(st, f.id) })).sort((a, b) => b.t.cities - a.t.cities || b.t.troops - a.t.troops);
    const o = UI.newOpts;
    UI.openModal(
      `<div class="scn-head"><div class="seal">SoW</div><b>새로하기</b>` +
      S.SCENARIOS.map((x) => `<button${x.id === sc.id ? ' class="primary"' : ""} data-action="pickScenario" data-id="${x.id}">${x.title}</button>`).join("") + `</div>` +
      `<p class="scn-desc">${sc.desc}</p>` +
      `<div class="scn-layout"><div class="scn-map">${miniMap(st, pick)}</div>` +
      `<div class="scn-side"><div class="scn-list">` +
      forces.map(({ f, t }) => `<button class="${f.id === pick ? "on" : ""}" style="--force:${f.color}" data-action="pickForce" data-force="${f.id}"><span class="swatch"></span>${f.name}<i>${t.cities}</i></button>`).join("") +
      `</div>` + (pick ? forceDetail(st, pick) : `<p class="hint scn-empty">지도나 위의 목록에서 세력을 고르면 그 세력의 땅이 지도에 밝게 표시됩니다. 네모 테두리는 세력 수도입니다.</p>`) +
      `</div></div>` +
      `<div class="scn-opts"><span><b>수명</b> ` +
      Object.entries(S.LIFESPAN).map(([k, v]) => `<label><input type="radio" name="lifespan" value="${k}"${k === o.lifespan ? " checked" : ""}> ${v}</label>`).join(" ") +
      UI.helpTip("무장은 16세가 되면 등장합니다. 사실 수명에서는 병으로 죽은 인물은 정사의 사망 연도 2년 전부터 매년 72면체 주사위를, 전사·처형 등으로 죽은 인물은 48세부터 매년 144면체 주사위를 굴립니다. 1~12가 나오면 그 달에 세상을 떠납니다. 가상 수명에서는 모두 99세까지 살고, 그 뒤 12면체 주사위로 세상을 떠나는 달을 정합니다.") +
      `</span><span><b>등장 인물</b> ` +
      `<label><input type="checkbox" id="optFiction"${o.fiction ? " checked" : ""}> 연의의 인물 <span class="mark">演</span></label> ` +
      `<label><input type="checkbox" id="optWomen"${o.women ? " checked" : ""}> 여성 <span class="mark f">女</span></label>` +
      UI.helpTip("정사에 기록된 인물은 늘 나옵니다. 삼국지연의에만 나오는 인물(주창, 초선, 형도영 등)과 여성(채염, 손상향, 왕이 등)은 뺄 수 있습니다. 세력에 속하지 않은 인물은 고향 도시의 재야 인재로 나오고, 아직 어린 인물은 16세가 되는 해에 등장합니다.") +
      `</span></div>` +
      `<div class="footer"><button data-action="mainMenu">뒤로</button>` +
      `<button data-action="start" data-force="" title="세력을 고르지 않고 모든 세력을 컴퓨터에 맡긴 채 지켜봅니다.">관전 모드</button>` +
      `<button class="primary" data-action="start" data-force="${pick}"${pick ? "" : " disabled"}>${pick ? `${st.forces[pick].name}군으로 시작` : "세력을 고르세요"}</button></div>`, true);
    $("#modal .box").classList.add("titlebox", "scnbox");
    UI.modalOnInput = () => {
      const life = document.querySelector('input[name="lifespan"]:checked');
      const next = { lifespan: life ? life.value : "real", fiction: $("#optFiction").checked, women: $("#optWomen").checked };
      const redraw = next.fiction !== o.fiction || next.women !== o.women;
      UI.newOpts = next;
      if (redraw) UI.showScenario(); // the head counts change
    };
  };

  // ---------- save slots ----------
  // mode: "save" | "load"; from: "title" | "game" (where 뒤로 goes back to).
  UI.showSlots = function (mode, from) {
    const rows = UI.slotList().filter((s) => mode === "load" || s.slot !== "auto").map(({ slot, info }) => {
      const act = mode === "load"
        ? (info ? `<button class="primary" data-action="loadSlot" data-slot="${slot}" data-from="${from}">불러오기</button>` : "")
        : `<button class="primary" data-action="saveSlot" data-slot="${slot}"${info ? ' data-used="1"' : ""}>${info ? "덮어쓰기" : "저장"}</button>`;
      return `<tr><td><b>${UI.slotName(slot)}</b></td><td>${info ? info.text : `<span class="hint">비어 있음</span>`}</td>` +
        `<td class="hint">${info ? when(info.savedAt) : ""}</td>` +
        `<td>${act}${info ? ` <button data-action="delSlot" data-slot="${slot}" data-mode="${mode}" data-from="${from}">지우기</button>` : ""}</td></tr>`;
    }).join("");
    UI.openModal(`<h2>${mode === "load" ? "불러오기" : "저장"}</h2>` +
      `<table class="slots"><tr><th>슬롯</th><th>내용</th><th>저장한 때</th><th></th></tr>${rows}</table>` +
      `<p class="hint">${mode === "load"
        ? "자동 저장은 매달 1일과 타이틀로 돌아갈 때 덮어씁니다. 저장은 이 브라우저에만 남습니다."
        : "슬롯에 저장한 게임은 자동 저장과 따로 남아, 언제든 그때로 돌아갈 수 있습니다."}</p>` +
      `<div class="footer"><button data-action="${from === "title" ? "mainMenu" : "system"}">뒤로</button></div>`, true);
    if (from === "title") $("#modal .box").classList.add("titlebox");
  };

  function begin(home, msg) {
    UI.selected = home.id;
    UI.winOpen = false;
    UI.tab = "cmd";
    UI.closeModal();
    UI.resetClock();
    UI.view.zoom = 1;
    UI.renderAll();
    UI.centerOn(home);
    UI.toast(msg);
  }

  Object.assign(UI.actions, {
    mainMenu: () => UI.showTitle(),
    title: () => { if (state && !state.over) UI.saveGame(true); UI.stopClock(); UI.showTitle(); },
    newGame: () => { UI.pickForce = ""; UI.showScenario(); },
    pickScenario: (d) => { UI.scenario = d.id; UI.pickForce = ""; UI.showScenario(); },
    pickForce: (d) => { UI.pickForce = d.force === UI.pickForce ? "" : d.force; UI.showScenario(); },
    start: (d) => {
      const o = UI.newOpts;
      UI.setState(S.newGame(S.scenarioOf(UI.scenario) || S.SCENARIOS[0], d.force || null, null, { lifespan: o.lifespan, fiction: o.fiction, women: o.women }));
      if (!d.force) { begin(state.cities[state.emperor] || S.cityList(state)[0], "관전을 시작합니다. 스페이스 바나 ▶ 진행 버튼으로 시간을 흐르게 합니다."); return; }
      // Who to play: the ruler, or anyone of the force (js/ui/persona.js).
      UI.showCharPick(d.force, () => {
        const me = S.playerChar(state);
        const rules = S.playerRules(state);
        begin(state.cities[rules ? S.capitalOf(state, d.force) : me.city] || S.citiesOf(state, d.force)[0],
          rules ? `${state.forces[d.force].name}군으로 천하통일을 시작합니다! 스페이스 바나 ▶ 진행 버튼으로 시간을 흐르게 합니다.`
            : `${S.josa(me.name, "으로", "로")} 시작합니다(${UI.roleLabel()}). 「인물」 창(P)에서 할 일을 고르고, 스페이스 바로 시간을 흐르게 합니다.`);
      });
    },
    saveMenu: () => state && UI.showSlots("save", "game"),
    loadMenu: (d) => UI.showSlots("load", d.from || "game"),
    saveSlot: (d) => {
      if (!state) return;
      if (d.used && !confirm(`${UI.slotName(d.slot)}에 저장된 게임을 덮어쓸까요?`)) return;
      if (UI.saveGame(false, d.slot)) UI.showSlots("save", "game");
    },
    loadSlot: (d) => {
      const saved = UI.loadSaved(d.slot);
      if (!saved) { UI.toast("불러올 수 없는 저장입니다."); return; }
      if (d.from === "game" && state && !state.over && !confirm("지금 하던 게임에서 저장하지 않은 진행은 사라집니다. 불러올까요?")) return;
      UI.setState(S.migrate(saved));
      const me = S.playerChar(state);
      const cap = me && !S.playerRules(state) ? me.city : state.playerForce ? S.capitalOf(state, state.playerForce) : S.capitalOf(state, UI.viewForce());
      begin(state.cities[cap] || UI.myCities()[0] || S.cityList(state)[0], `${UI.slotName(d.slot)}을 불러왔습니다. 스페이스 바나 ▶ 진행 버튼으로 시간을 흐르게 합니다.`);
    },
    delSlot: (d) => {
      if (!confirm(`${UI.slotName(d.slot)}의 저장을 지울까요? 되돌릴 수 없습니다.`)) return;
      UI.clearSave(d.slot);
      UI.showSlots(d.mode, d.from);
    },
  });
})(globalThis.SAM = globalThis.SAM || {});
