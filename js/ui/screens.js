// The windows of the main menu: forces, cities, officers, diplomacy, the
// court, technology, the system menu; and the title and ending screens.
(function (S) {
  const UI = S.UI, $ = UI.$;
  const { fmt, stat } = UI;
  let state = null;
  UI.bind((s) => { state = s; });

  const title = (text) => UI.winTitle(text);
  const closeBar = `<div class="footer"><button class="primary" data-action="close">닫기</button></div>`;
  const swatch = (f) => `<span class="swatch" style="--force:${f.color}"></span>`;

  // ---------- sortable lists ----------
  // cols: [label, value(row), cell(row)?]. A click on a heading sorts by that
  // column, a second click turns the order round. rowAttrs(row) makes a row
  // clickable.
  const sorts = {};
  function listTable(key, cols, rows, rowAttrs) {
    const s = sorts[key];
    if (s && cols[s.col]) {
      const get = cols[s.col][1];
      rows = rows.slice().sort((a, b) => {
        const x = get(a), y = get(b);
        const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko");
        return s.desc ? -d : d;
      });
    }
    const head = cols.map((c, i) => `<th class="sortable${s && s.col === i ? (s.desc ? " desc" : " asc") : ""}" data-action="sort" data-list="${key}" data-col="${i}">${c[0]}</th>`).join("");
    const body = rows.map((r) => `<tr${rowAttrs ? " " + rowAttrs(r) : ""}>${cols.map((c) => `<td>${(c[2] || c[1])(r)}</td>`).join("")}</tr>`).join("");
    return `<div class="otable list"><table><tr>${head}</tr>${body}</table></div>`;
  }
  const lists = {};
  UI.actions.sort = (d) => {
    const s = sorts[d.list], col = +d.col;
    // Numbers are most useful largest first.
    sorts[d.list] = s && s.col === col ? { col, desc: !s.desc } : { col, desc: true };
    if (lists[d.list]) lists[d.list]();
  };
  UI.actions.goto = (d) => {
    UI.closeModal();
    UI.openCity(d.city);
    UI.centerOn(S.place(state, d.city));
  };

  // ---------- forces ----------
  const techText = (fid) => Object.keys(S.TECH).filter((k) => S.techLevel(state, fid, k) > 1).map((k) => S.TECH[k].name + S.techLevel(state, fid, k)).join(" ") || "-";
  const aliveForces = () => Object.values(state.forces).filter((f) => f.alive).map((f) => ({ f, t: S.totals(state, f.id) }));
  UI.showForces = lists.forces = function () {
    if (!sorts.forces) sorts.forces = { col: 3, desc: true };
    const cols = [
      ["세력", (r) => r.f.name, (r) => `${swatch(r.f)}${r.f.name}군${r.f.emperor ? " (황제)" : ""}${r.f.id === state.playerForce ? " <em>나</em>" : ""}` +
        (S.houseOf(state, r.f.id) ? ` <em title="${S.HOUSES[S.houseOf(state, r.f.id)].help}">${S.HOUSES[S.houseOf(state, r.f.id)].name}</em>` : "")],
      ["체제", (r) => S.regime(state, r.f.id).label],
      ["수도", (r) => (state.cities[S.capitalOf(state, r.f.id)] || {}).name || "-"],
      ["도시", (r) => r.t.cities], ["무장", (r) => r.t.officers],
      ["병력", (r) => r.t.troops, (r) => fmt(r.t.troops)], ["병역 인구", (r) => r.t.manpower, (r) => fmt(r.t.manpower)],
      ["전쟁 피로", (r) => Math.round(r.f.weariness), (r) => `${Math.round(r.f.weariness)} ${S.wearinessLabel(r.f.weariness)}`],
      ["금", (r) => r.t.gold, (r) => fmt(r.t.gold)], ["군량", (r) => r.t.food, (r) => fmt(r.t.food)],
      ["기술", (r) => techText(r.f.id)],
      ["동맹", (r) => S.allies(state, r.f.id).map((a) => state.forces[a].name).join(", ") || "-"],
    ];
    UI.openModal(title("세력 일람") + listTable("forces", cols, aliveForces()) +
      `<p class="hint">병역 인구는 징병할 수 있는 장정 수입니다. 전사자는 돌아오지 않고, 인구에서 조금씩 회복됩니다. ` +
      `전쟁 피로는 전사자·패전·대규모 징병으로 오르고 평화로울 때 내려갑니다. 30을 넘으면 치안이 떨어지고, 60을 넘으면 민란이 일어날 수 있습니다. ` +
      `체제는 영토의 호족 세력(인구 가중 평균)으로 정해집니다. 55 이상은 호족연합형, 25 이하는 중앙집권형, 그 사이는 부곡형입니다.</p>` + closeBar, true);
  };

  // ---------- diplomacy ----------
  function diplomacyCell(fid) {
    const me = state.playerForce;
    if (fid === me || state.over) return "";
    if (S.allied(state, me, fid)) return `<button data-action="breakPact" data-force="${fid}">동맹 파기</button>`;
    const cd = S.pactCooldown(state, me, fid);
    if (cd) return `<span class="hint">${cd}개월 후</span>`;
    if (state.pactTried && state.pactTried[fid] === S.monthsElapsed(state)) return `<span class="hint">이번 달 제의함</span>`;
    return `<button data-action="proposePact" data-force="${fid}">동맹 제의 (${S.pactChance(state, me, fid)}%)</button>`;
  }
  UI.showDiplomacy = function () {
    const me = state.playerForce;
    const rows = aliveForces().filter((r) => r.f.id !== me).sort((a, b) => b.t.cities - a.t.cities || b.t.troops - a.t.troops)
      .map(({ f, t }) => `<tr><td>${swatch(f)}${f.name}군${f.emperor ? " (황제)" : ""}</td><td>${state.officers[f.ruler].name}</td>` +
        `<td>${t.cities}</td><td>${fmt(t.troops)}</td>` +
        `<td>${S.allied(state, me, f.id) ? `<span class="good">동맹</span>` : "-"}</td>` +
        `<td>${S.allies(state, f.id).filter((a) => a !== me).map((a) => state.forces[a].name).join(", ") || "-"}</td>` +
        `<td>${diplomacyCell(f.id)}</td></tr>`).join("");
    UI.openModal(title("외교") +
      `<table><tr><th>세력</th><th>군주</th><th>도시</th><th>병력</th><th>우리와</th><th>다른 동맹</th><th></th></tr>${rows}</table>` +
      `<p class="hint">동맹을 맺은 세력끼리는 서로 공격하지 않습니다. 동맹 제의에는 예물로 금 ${S.PACT_COST}이 들고, 같은 세력에는 한 달에 한 번만 제의할 수 있습니다. ` +
      `동맹을 파기하면 내 모든 도시의 치안이 5 떨어지고, ${S.PACT_COOLDOWN}개월 동안 다시 동맹을 맺을 수 없습니다. 컴퓨터 세력도 더 싸울 상대가 없거나 동맹이 훨씬 약해지면 동맹을 깰 수 있습니다.</p>` + closeBar, true);
  };

  // ---------- the player's cities and officers ----------
  UI.showCities = lists.cities = function () {
    const me = state.playerForce;
    const cols = [
      ["도시", (c) => c.name, (c) => `${S.isCapital(state, c.id) ? `<span class="capstar">★</span>` : ""}<b>${c.name}</b>`],
      ["주", (c) => S.PROVINCES[c.prov]],
      ["병력", (c) => c.troops, (c) => fmt(c.troops)], ["훈련", (c) => c.train],
      ["금", (c) => c.gold, (c) => fmt(c.gold)], ["군량", (c) => c.food, (c) => fmt(c.food)],
      ["월 수지", (c) => S.balance(c), (c) => UI.signed(S.balance(c))],
      ["인구", (c) => c.pop, (c) => fmt(c.pop)], ["치안", (c) => c.order],
      ["농업", (c) => c.farm], ["상업", (c) => c.trade], ["성벽", (c) => c.wall],
      ["호족 협력", (c) => Math.round(c.consent)],
      ["무장", (c) => S.serving(state, c.id).length, (c) => `${S.serving(state, c.id).length} <span class="hint">(대기 ${S.idle(state, c.id).length})</span>`],
      ["통치", (c) => S.delegateOf(state, c) || "", (c) => (S.delegateOf(state, c) ? S.DELEGATE[S.delegateOf(state, c)] : "직접")],
    ];
    UI.openModal(title("도시 일람") + listTable("cities", cols, S.citiesOf(state, me), (c) => `class="pick" data-action="goto" data-city="${c.id}"`) +
      `<p class="hint">제목을 누르면 그 열로 정렬합니다. 줄을 누르면 그 도시로 갑니다.</p>` + closeBar, true);
  };
  const whereOf = (o) => S.placeName(state, o.city);
  function officerStatus(o) {
    if (o.transit) return "이동 중";
    const k = S.postOf(state, o);
    return k ? `${S.POSTS[k].label} 담당` : o.done ? "완료" : "대기";
  }
  UI.showOfficers = lists.officers = function () {
    const me = state.playerForce;
    const cols = [
      ["이름", (o) => o.name, (o) => `${S.isRuler(state, o) ? `<span class="crown" title="군주">主</span>` : ""}<b>${o.name}</b>${UI.personMarks(o)}`],
      ["소재", whereOf], ["나이", (o) => S.age(state, o)],
      ...S.ABILITY_KEYS.map((k) => [S.ABILITY_NAMES[k], (o) => o[k]]),
      ["충성", (o) => (S.isRuler(state, o) ? 101 : o.loyalty), (o) => (S.isRuler(state, o) ? "-" : o.loyalty)],
      ["상태", officerStatus],
      ["성격", (o) => S.traitsOf(o).join(" "), UI.traitTags],
      ["특기", (o) => S.skillsOf(o).join(" "), UI.skillTags],
    ];
    const list = S.officersOf(state, me);
    UI.openModal(title(`무장 일람 (${list.length})`) + listTable("officers", cols, list, (o) => `class="pick" data-action="goto" data-city="${o.city}"`) +
      `<p class="hint">제목을 누르면 그 열로 정렬합니다. 줄을 누르면 그 무장이 있는 곳으로 갑니다.</p>` + closeBar, true);
  };

  // ---------- technology ----------
  UI.techTable = function (fid) {
    const rows = Object.keys(S.TECH).map((k) => {
      const lv = S.techLevel(state, fid, k), max = S.techMax(k);
      const t = (state.forces[fid].tech || {})[k];
      const blk = S.techBlock(state, fid, k);
      const next = lv < max ? `${t ? t.pts : 0}/${S.techNeed(lv)} → ${S.techUnlocks(k, lv + 1).join(", ") || "-"}` + (blk ? ` (${blk})` : "") : "완료";
      return `<tr><td>${S.TECH[k].name}</td><td>${"●".repeat(lv)}${"○".repeat(max - lv)}</td><td>${next}</td></tr>`;
    }).join("");
    return `<table><tr><th>기술</th><th>단계</th><th>다음 단계</th></tr>${rows}</table>`;
  };
  UI.showTech = function () {
    const me = state.playerForce;
    const cap = S.capitalOf(state, me);
    UI.openModal(title("기술") + UI.techTable(me) +
      `<p class="hint">연구는 ${S.capitalLabel(state, me)}에서 무장 한 명이 한 달 동안 금 ${S.TECH_COST}을 들여 합니다. 기술은 세력 전체의 것이고, 단계가 오르면 그 계열의 상위 병종을 뽑을 수 있습니다.</p>` +
      `<div class="footer">${cap ? `<button data-action="goto" data-city="${cap}">${state.cities[cap].name}에서 연구하기</button>` : ""}<button class="primary" data-action="close">닫기</button></div>`);
  };

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
  UI.showCourt = function () {
    S.syncCourt(state);
    const han = state.han;
    const me = state.playerForce;
    let html = title("황실");
    if (!state.emperor) {
      html += `<p class="hint">이 시나리오에는 헌제가 없습니다.</p>`;
    } else if (han.ended) {
      html += `<p>한 왕조는 ${han.endedYear}년 헌제가 ${S.forceName(state, han.endedBy)}에 제위를 물려주며 막을 내렸습니다.</p>`;
    } else {
      const c = state.cities[state.emperor];
      const h = han.holder;
      html += `<div class="stats">` + stat("한 수도 (헌제의 거처)", c.name) + stat("옹립 세력", h ? S.forceName(state, h) : "없음 (공백지)") +
        stat("헌제의 우호도", `${han.favor} ${S.favorLabel(han.favor)}`) +
        (h ? stat("옹립 세력 영토", `${Math.round(S.cityShare(state, h) * 100)}%`) : "") + `</div>`;
      html += courtPending();
      if (h === me) {
        const dist = S.reachable(state, state.emperor);
        const dests = Object.keys(dist).sort((a, b) => dist[a] - dist[b]);
        const wait = han.movedAt != null ? han.movedAt + S.COURT.moveCooldown - S.monthsElapsed(state) : 0;
        const mf = S.COURT.moveFavor;
        html += `<h3>천도</h3><p class="hint">헌제를 아군 영토로 이어진 다른 도시로 옮깁니다. ${c.name}의 금 ${S.COURT.moveCost}이 듭니다. ` +
          `헌제는 고향 낙양을 떠나기 싫어합니다. 낙양을 떠나면 우호도 ${mf.leave}, 낙양으로 돌아오면 +${mf.back}, 그 밖의 천도는 ${mf.other}입니다. ` +
          `한 번 옮기면 ${S.COURT.moveCooldown}개월 동안 다시 옮길 수 없고, 헌제를 새로 맞이한 세력은 바로 천도할 수 있습니다.` +
          (wait > 0 ? ` <b>${wait}개월 뒤에 천도할 수 있습니다.</b>` : "") + `</p>` +
          (dests.length ? `<div class="row"><label>새 도읍</label><select id="ctDest">${dests.map((d) =>
            `<option value="${d}">${state.cities[d].name} (${dist[d]}일 거리, 우호도 ${(S.moveFavorDelta(state.emperor, d) > 0 ? "+" : "") + S.moveFavorDelta(state.emperor, d)})</option>`).join("")}</select>` +
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
        `황제가 되면 한조무관·이용 인재를 등용하기 조금 쉬워집니다. 도시 ${S.proclaimNeed(state, state.playerForce)}개 이상(칭제 특기가 있는 군주는 절반)이 필요하고, 헌제를 모시는 동안에는 칭제할 수 없습니다.</p>` +
        `<div class="links"><button data-action="proclaim"${can.ok ? "" : " disabled"}>칭제</button>${can.ok ? "" : ` <span class="hint">${can.msg}</span>`}</div>`;
    }
    html += `<p class="hint">헌제를 모시는 세력은 한조중시 인재를 등용하기 쉽고(우호도 40 이상), 우호도가 50 이상이면 한조중시 무장의 충성이 조금씩 오릅니다. ` +
      `헌제는 석 달마다 금이나 군량을 청하기도 합니다. 우호도가 ${S.COURT.abdicateFavor} 이상이고 영토가 ${S.COURT.abdicateShare * 100}% 이상이면 선양을 받을 수 있습니다. ` +
      `우호도가 30 밑이면, 강한 세력에게서는 한조중시 군주에게 밀서를 보내고 약한 세력에게서는 달아날 수 있습니다.</p>` + closeBar;
    UI.openModal(html, true);
  };

  // ---------- system ----------
  UI.showSystem = function () {
    UI.openModal(title("기록과 설정") +
      `<div class="sysmenu">` +
      `<button data-action="save"><b>저장</b><span>지금 상태를 기록합니다. 매달 1일에도 저절로 저장됩니다.</span></button>` +
      `<button data-action="clockSettings"><b>시간 설정</b><span>배속과 자동 일시정지를 정합니다.</span></button>` +
      `<button data-action="title"><b>타이틀로</b><span>저장한 뒤 첫 화면으로 돌아갑니다.</span></button>` +
      `</div>` + closeBar);
  };

  UI.showEnd = function () {
    const o = state.over;
    const win = o.result === "win" && o.force === state.playerForce;
    UI.openModal(`<div class="title-hero end"><h1>${win ? "천하통일" : "패배"}</h1><p>${win
      ? `${state.year}년 ${state.month}월, ${state.forces[state.playerForce].name}군이 천하를 통일했습니다!`
      : o.result === "win" ? `${state.forces[o.force].name}군이 천하를 통일했습니다.` : "모든 도시를 잃었습니다."}</p></div>` +
      `<div class="footer"><button class="primary" data-action="title">타이틀로</button></div>`);
    UI.clearSave();
  };

  // ---------- title ----------
  UI.showTitle = function () {
    const saved = UI.loadSaved();
    const sc = S.SCENARIO_191;
    const preview = S.newGame(sc, null, 1);
    const cards = Object.values(preview.forces).map((f) => ({ f, t: S.totals(preview, f.id) }))
      .sort((a, b) => b.t.cities - a.t.cities || b.t.troops - a.t.troops).map(({ f, t }) => {
        const r = preview.officers[f.ruler];
        return `<button class="forcecard" style="--force:${f.color}" data-action="start" data-force="${f.id}">` +
          `<b>${f.name}</b><span class="fc-han">${S.HAN_NAMES[r.han]}</span>` +
          `<div class="fc-nums"><span>도시 <b>${t.cities}</b></span><span>무장 <b>${t.officers}</b></span><span>병력 <b>${fmt(t.troops)}</b></span></div>` +
          `<div class="fc-cities">${S.citiesOf(preview, f.id).map((c) => c.name).join(" · ")}</div>` +
          `<div class="fc-abil">${S.ABILITY_KEYS.map((k) => `${S.ABILITY_SHORT[k]}<b>${r[k]}</b>`).join(" ")}</div>` +
          (S.traitsOf(r).length ? `<div class="fc-traits">${S.traitsOf(r).map((x) => `<span class="trait">${x}</span>`).join(" ")}</div>` : "") + `</button>`;
      }).join("");
    UI.openModal(`<div class="title-hero"><div class="seal">SoW</div><h1>삼국지</h1><p class="scn">${sc.title}</p><p>${sc.desc}</p></div>` +
      (saved && !saved.over ? `<div class="footer center"><button class="primary big" data-action="continue">이어하기 — ${saved.year}년 ${saved.month}월 · ${saved.forces[saved.playerForce].name}군</button></div>` : "") +
      `<h3>수명</h3><div class="links">` +
      Object.entries(S.LIFESPAN).map(([k, v]) => `<label><input type="radio" name="lifespan" value="${k}"${k === "real" ? " checked" : ""}> ${v}</label>`).join(" ") +
      `</div><p class="hint">무장은 16세가 되면 등장합니다. 사실 수명에서는 병으로 죽은 인물은 정사의 사망 연도 2년 전부터 매년 72면체 주사위를, ` +
      `전사·처형 등으로 죽은 인물은 48세부터 매년 144면체 주사위를 굴립니다. 1~12가 나오면 그 달에 세상을 떠납니다. ` +
      `가상 수명에서는 모두 99세까지 살고, 그 뒤 12면체 주사위로 세상을 떠나는 달을 정합니다.</p>` +
      `<h3>등장 인물</h3><div class="links">` +
      `<label><input type="checkbox" id="optFiction" checked> 연의의 인물 <span class="mark">演</span></label>` +
      `<label><input type="checkbox" id="optWomen" checked> 여성 <span class="mark f">女</span></label></div>` +
      `<p class="hint">정사에 기록된 인물은 늘 나옵니다. 삼국지연의에만 나오는 인물(주창, 초선, 형도영 등)과 여성(채염, 손상향, 왕이 등)은 뺄 수 있습니다. ` +
      `세력에 속하지 않은 인물은 고향 도시의 재야 인재로 나오고, 아직 어린 인물은 16세가 되는 해에 등장합니다.</p>` +
      `<h3>세력을 고르세요</h3><div class="forcegrid">${cards}</div>`, true);
    $("#modal .box").classList.add("titlebox");
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
    title: () => { if (state && !state.over) UI.saveGame(true); UI.stopClock(); UI.showTitle(); },
    forces: () => state && UI.showForces(),
    cities: () => state && UI.showCities(),
    officers: () => state && UI.showOfficers(),
    diplomacy: () => state && UI.showDiplomacy(),
    court: () => state && UI.showCourt(),
    tech: () => state && UI.showTech(),
    system: () => state && UI.showSystem(),
    save: () => state && UI.saveGame(),
    demand: (d) => { if (UI.result(S.answerDemand(state, !!d.yes))) UI.showCourt(); },
    abdicate: (d) => {
      if (d.yes && !confirm("선양을 받아 황제에 오를까요? 한 왕조가 끝납니다.")) return;
      if (UI.result(S.answerAbdication(state, !!d.yes))) UI.showCourt();
    },
    moveEmperor: () => { if (UI.result(S.moveEmperor(state, state.playerForce, $("#ctDest").value))) UI.showCourt(); },
    proclaim: () => {
      if (!confirm("황제를 칭할까요?")) return;
      if (UI.result(S.proclaim(state, state.playerForce))) UI.showCourt();
    },
    proposePact: (d) => { if (UI.result(S.proposePact(state, state.playerForce, d.force))) UI.showDiplomacy(); },
    breakPact: (d) => {
      if (!confirm(`${state.forces[d.force].name}군과의 동맹을 파기할까요? 내 모든 도시의 치안이 5 떨어집니다.`)) return;
      if (UI.result(S.breakPact(state, state.playerForce, d.force))) UI.showDiplomacy();
    },
    start: (d) => {
      const pick = document.querySelector('input[name="lifespan"]:checked');
      UI.setState(S.newGame(S.SCENARIO_191, d.force, null, {
        lifespan: pick ? pick.value : "real", fiction: $("#optFiction").checked, women: $("#optWomen").checked,
      }));
      begin(S.citiesOf(state, d.force)[0], `${state.forces[d.force].name}군으로 천하통일을 시작합니다! 스페이스 바나 ▶ 진행 버튼으로 시간을 흐르게 합니다.`);
    },
    continue: () => {
      UI.setState(S.migrate(UI.loadSaved()));
      const cap = S.capitalOf(state, state.playerForce);
      begin(state.cities[cap] || S.citiesOf(state, state.playerForce)[0], "스페이스 바나 ▶ 진행 버튼으로 시간을 흐르게 합니다.");
    },
  });
})(globalThis.SAM = globalThis.SAM || {});
