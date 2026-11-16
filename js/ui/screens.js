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
  const relCell = (v) => `<span class="rel r${Math.min(4, Math.floor(v / 20))}"><b>${v}</b> ${S.relLabel(v)}</span>`;
  const capNames = (ids) => ids.map((id) => `${state.officers[id].name}<span class="hint">(${S.captiveWorth(state.officers[id])})</span>`).join(", ");
  // What a waiting envoy asks, and the buttons to answer.
  function askRow(e) {
    const o = state.officers[e.officer];
    const what = e.kind === "pact" ? `동맹을 청합니다. 예물로 금 ${e.gold}을 가져왔습니다.`
      : [e.give.length && `돌려주겠다는 포로: ${capNames(e.give)}`, e.take.length && `돌려받으려는 포로: ${capNames(e.take)}`, e.gold && `몸값 금 ${e.gold}`].filter(Boolean).join(" · ");
    const left = Math.max(0, e.expires - S.today(state));
    return `<div class="ask"><div><b>${S.forceName(state, e.from)}</b>의 사자 <b>${o.name}</b> <span class="hint">(언변 ${o.speech}, ${left}일 더 기다림)</span><br>${what}</div>` +
      `<span><button class="primary" data-action="answerEnvoy" data-id="${e.id}" data-yes="1">수락</button> <button data-action="answerEnvoy" data-id="${e.id}">거절</button></span></div>`;
  }
  function envoyRow(e) {
    const o = state.officers[e.officer];
    const now = S.today(state);
    const where = e.phase === "out" ? `가는 중 (${Math.max(0, e.arrive - now)}일 뒤 도착)` : e.phase === "wait" ? "답을 기다리는 중" : `돌아오는 중 (${Math.max(0, e.back - now)}일 뒤)`;
    return `<tr><td>${o.name}</td><td>${S.forceName(state, e.to)}</td><td>${S.envoyKind[e.kind]}${e.kind === "tribute" ? ` 금 ${e.gold}` : ""}</td><td>${where}</td></tr>`;
  }
  UI.showDiplomacy = function () {
    const me = UI.viewForce();
    const play = !!state.playerForce && !state.over;
    const out = play ? S.envoysOf(state, me) : [];
    const cell = (fid) => {
      if (!play) return "";
      const busy = out.some((e) => e.to === fid);
      return (busy ? `<span class="hint">사자 파견 중</span>` : `<button data-action="envoy" data-force="${fid}">사자 보내기</button>`) +
        (S.allied(state, me, fid) ? ` <button data-action="breakPact" data-force="${fid}">동맹 파기</button>` : "");
    };
    const rows = aliveForces().filter((r) => r.f.id !== me).sort((a, b) => b.t.cities - a.t.cities || b.t.troops - a.t.troops)
      .map(({ f, t }) => {
        const cd = S.pactCooldown(state, me, f.id);
        const sw = S.swappable(state, me, f.id);
        return `<tr><td>${swatch(f)}${f.name}군${f.emperor ? " (황제)" : ""}</td><td>${state.officers[f.ruler].name}</td>` +
          `<td>${t.cities}</td><td>${fmt(t.troops)}</td><td>${relCell(S.rel(state, me, f.id))}</td>` +
          `<td>${S.allied(state, me, f.id) ? `<span class="good">동맹</span>` : cd ? `<span class="hint">파기 후 ${cd}개월</span>` : "-"}</td>` +
          `<td>${S.allies(state, f.id).filter((a) => a !== me).map((a) => state.forces[a].name).join(", ") || "-"}</td>` +
          `<td>${sw.give.length || sw.take.length ? `우리가 ${sw.give.length} · 저쪽이 ${sw.take.length}` : "-"}</td>` +
          `<td>${S.envoyDays(state, me, f.id)}일</td><td>${cell(f.id)}</td></tr>`;
      }).join("");
    const asks = play && !UI.handsOff() ? S.asksFor(state, me) : [];
    UI.openModal(title(state.playerForce ? "외교" : `${S.forceName(state, me)}의 외교`) +
      (asks.length ? `<h3>답을 기다리는 사자</h3>${asks.map(askRow).join("")}` : "") +
      `<table><tr><th>세력</th><th>군주</th><th>도시</th><th>병력</th><th>우호도</th><th>우리와</th><th>다른 동맹</th><th>포로</th><th>사자 길</th><th></th></tr>${rows}</table>` +
      (out.length ? `<h3>보낸 사자</h3><table><tr><th>사자</th><th>상대</th><th>용건</th><th>상황</th></tr>${out.map(envoyRow).join("")}</table>` : "") +
      `<p class="hint">${UI.HELP.diplomacy.replace(/\n/g, "<br>")}</p>` + closeBar, true);
  };

  // Sending an envoy: who goes, and on what errand.
  UI.showEnvoy = function (fid) {
    const me = state.playerForce;
    const who = S.envoyCandidates(state, me);
    const cap = state.cities[S.capitalOf(state, me)];
    if (!who.length) { UI.toast(`${cap.name}(세력 수도)에 쉬고 있는 무장이 없습니다. 군주는 사자로 갈 수 없습니다.`); return; }
    const sw = S.swappable(state, me, fid);
    const pactNo = S.allied(state, me, fid) ? "이미 동맹 중" : S.pactCooldown(state, me, fid) ? `파기 후 ${S.pactCooldown(state, me, fid)}개월` : S.pactSnub(state, me, fid) ? `거절당한 지 얼마 안 됨 (${S.pactSnub(state, me, fid)}개월)` : "";
    const swapNo = sw.give.length || sw.take.length ? "" : "서로 잡아 둔 포로 없음";
    const kind = (k, label, no) => `<label><input type="radio" name="envKind" value="${k}"${k === "tribute" ? " checked" : ""}${no ? " disabled" : ""}> ${label}${no ? ` <span class="hint">(${no})</span>` : ""}</label>`;
    const boxes = (list, cls) => list.map((o) => `<label><input type="checkbox" class="${cls}" value="${o.id}" checked> ${o.name} <span class="hint">(가치 ${S.captiveWorth(o)} · ${S.placeName(state, o.city)})</span></label>`).join("") || `<span class="hint">없음</span>`;
    UI.openModal(title(`${S.forceName(state, fid)}에 사자 보내기`) +
      `<p class="hint">사자는 ${cap.name}(세력 수도)에서 ${S.placeName(state, S.capitalOf(state, fid))}까지 ${S.envoyDays(state, me, fid)}일을 가고, 도착한 날 용건을 전한 뒤 같은 길을 돌아옵니다. ` +
      `그동안 다른 명령은 받지 못합니다. 지금 우호도는 ${relCell(S.rel(state, me, fid))}입니다.</p>` +
      `<div class="row"><label>사자</label><select id="envWho">${who.map((o) => `<option value="${o.id}">${o.name} (언변 ${o.speech})</option>`).join("")}</select></div>` +
      `<div class="row"><label>용건</label><span class="links">${kind("tribute", "조공")}${kind("pact", "동맹 제의", pactNo)}${kind("swap", "포로 교환", swapNo)}</span></div>` +
      `<div id="envTribute"><div class="row"><label>금</label><input type="number" id="envGold" min="${S.DIPLO.tributeMin}" step="100" value="${Math.min(300, Math.floor(cap.gold / 100) * 100)}"> <span class="hint">${cap.name}의 금 ${fmt(cap.gold)}</span></div></div>` +
      `<div id="envPact" class="hidden"><p class="hint">예물로 금 ${S.PACT_COST}을 가져갑니다. 거절당해도 돌려받지 못합니다.</p></div>` +
      `<div id="envSwap" class="hidden"><h3>돌려줄 포로 <span class="hint">우리가 잡아 둔 ${state.forces[fid].name}군 무장</span></h3><div class="checks">${boxes(sw.give, "envGive")}</div>` +
      `<h3>돌려받을 포로 <span class="hint">저쪽에 잡혀 있는 우리 무장</span></h3><div class="checks">${boxes(sw.take, "envTake")}</div>` +
      `<div class="row"><label>몸값</label><input type="number" id="envRansom" min="0" step="50" value="0"> <span class="hint">모자라는 값을 금으로 채웁니다. 거절당하면 돌려받습니다.</span></div></div>` +
      `<div class="row"><label>전망</label><span id="envEst" class="est"></span></div>` +
      `<div class="footer"><button data-action="diplomacy">돌아가기</button><button class="primary" data-action="doEnvoy" data-force="${fid}">사자 출발</button></div>`);
    UI.modalOnInput = () => updateEnvoy(fid);
    updateEnvoy(fid);
  };
  function envoyForm() {
    const pick = document.querySelector('input[name="envKind"]:checked');
    const ids = (cls) => [...document.querySelectorAll("." + cls)].filter((el) => el.checked).map((el) => el.value);
    return { kind: pick ? pick.value : "tribute", oid: $("#envWho").value, gold: +$("#envGold").value || 0,
      give: ids("envGive"), take: ids("envTake"), ransom: Math.max(0, +$("#envRansom").value || 0) };
  }
  function updateEnvoy(fid) {
    const me = state.playerForce, f = envoyForm();
    const o = state.officers[f.oid];
    for (const [id, k] of [["envTribute", "tribute"], ["envPact", "pact"], ["envSwap", "swap"]]) $("#" + id).classList.toggle("hidden", f.kind !== k);
    let text;
    if (f.kind === "tribute") text = `우호도 +${S.tributeGain(state, fid, f.gold, o.speech)} <span class="hint">(금이 많을수록, 사자의 언변이 높을수록, 상대 세력이 작을수록 큽니다. 한 번에 ${S.DIPLO.tributeMax}까지)</span>`;
    else if (f.kind === "pact") text = `수락 확률 ${S.pactChance(state, me, fid, o.speech)}%`;
    else {
      const worth = (ids) => ids.reduce((s, id) => s + S.captiveWorth(state.officers[id]), 0);
      text = `주는 값 ${worth(f.give) + f.ransom} · 받는 값 ${worth(f.take)} · 수락 확률 ${S.swapChance(state, me, fid, f.give, f.take, f.ransom, o.speech)}%`;
    }
    $("#envEst").innerHTML = text;
  }

  // ---------- the player's cities and officers ----------
  UI.showCities = lists.cities = function () {
    const me = UI.viewForce();
    const cols = [
      ["도시", (c) => c.name, (c) => `${S.isCapital(state, c.id) ? `<span class="capstar">★</span>` : ""}<b>${c.name}</b>`],
      ["주", (c) => S.PROVINCES[c.prov]], ["군현", (c) => S.fullName(c)],
      ["병력", (c) => c.troops, (c) => fmt(c.troops)], ["훈련", (c) => c.train],
      ["금", (c) => c.gold, (c) => fmt(c.gold)], ["군량", (c) => c.food, (c) => fmt(c.food)],
      ["월 수지", (c) => S.balance(c), (c) => UI.signed(S.balance(c))],
      ["인구", (c) => c.pop, (c) => fmt(c.pop)], ["치안", (c) => c.order],
      ["농업", (c) => c.farm], ["상업", (c) => c.trade], ["성벽", (c) => c.wall],
      ["호족 협력", (c) => Math.round(c.consent)],
      ["무장", (c) => S.serving(state, c.id).length, (c) => `${S.serving(state, c.id).length} <span class="hint">(대기 ${S.idle(state, c.id).length})</span>`],
      ["통치", (c) => S.delegateOf(state, c) || "", (c) => (S.delegateOf(state, c) ? S.DELEGATE[S.delegateOf(state, c)] : "직접")],
    ];
    UI.openModal(title(state.playerForce ? "도시 일람" : `${S.forceName(state, me)} 도시 일람`) + listTable("cities", cols, S.citiesOf(state, me), (c) => `class="pick" data-action="goto" data-city="${c.id}"`) +
      `<p class="hint">제목을 누르면 그 열로 정렬합니다. 줄을 누르면 그 도시로 갑니다.</p>` + closeBar, true);
  };
  const whereOf = (o) => S.placeName(state, o.city);
  function officerStatus(o) {
    if (o.transit) return String(o.transit)[0] === "e" ? "사자" : "이동 중";
    const k = S.postOf(state, o);
    return k ? `${S.POSTS[k].label} 담당` : o.done ? "완료" : "대기";
  }
  UI.showOfficers = lists.officers = function () {
    const me = UI.viewForce();
    const cols = [
      ["이름", (o) => o.name, (o) => `${S.isRuler(state, o) ? `<span class="crown" title="군주">主</span>` : ""}<b>${o.name}</b>${UI.personMarks(o)}`],
      ["소재", whereOf], ["나이", (o) => S.age(state, o)],
      ...S.ABILITY_KEYS.map((k) => [S.ABILITY_NAMES[k], (o) => o[k]]),
      ["충성", (o) => (S.isRuler(state, o) ? 101 : o.loyalty), (o) => (S.isRuler(state, o) ? "-" : o.loyalty)],
      ["유대", (o) => (S.isRuler(state, o) ? 101 : o.bond || 0), (o) => (S.isRuler(state, o) ? "-" : o.bond || 0)],
      ["상태", officerStatus],
      ["성격", (o) => S.traitsOf(o).join(" "), UI.traitTags],
      ["특기", (o) => S.skillsOf(o).join(" "), UI.skillTags],
    ];
    const list = S.officersOf(state, me);
    UI.openModal(title(`${state.playerForce ? "" : S.forceName(state, me) + " "}무장 일람 (${list.length})`) + listTable("officers", cols, list, (o) => `class="pick" data-action="goto" data-city="${o.city}"`) +
      `<p class="hint">제목을 누르면 그 열로 정렬합니다. 줄을 누르면 그 무장이 있는 곳으로 갑니다.</p>` + closeBar, true);
  };

  // ---------- technology ----------
  UI.techTable = function (fid) {
    const row = (k) => {
      const lv = S.techLevel(state, fid, k), max = S.techMax(k);
      const t = (state.forces[fid].tech || {})[k];
      const blk = S.techBlock(state, fid, k);
      const next = lv < max ? `${t ? t.pts : 0}/${S.techNeed(lv, k)} → ${S.techUnlocks(k, lv + 1).join(", ") || "-"}` + (blk ? ` (${blk})` : "") : "완료";
      const t0 = S.TECH[k];
      const lapsed = t0.land && lv > 1 && !S.holdsLand(state, fid, t0.land) ? " (효과 멈춤)" : "";
      return `<tr><td>${t0.name}${lapsed}</td><td>${"●".repeat(lv)}${"○".repeat(max - lv)}</td><td>${next}</td></tr>`;
    };
    const rows = S.TECH_GROUPS.map((g) => `<tr><th colspan="3">${g}</th></tr>` + Object.keys(S.TECH).filter((k) => S.TECH[k].group === g).map(row).join("")).join("");
    return `<table><tr><th>기술</th><th>단계</th><th>다음 단계</th></tr>${rows}</table>`;
  };
  UI.showTech = function () {
    const me = UI.viewForce();
    const cap = S.capitalOf(state, me);
    UI.openModal(title(state.playerForce ? "기술" : `${S.forceName(state, me)} 기술`) + UI.techTable(me) +
      `<p class="hint">연구는 ${S.capitalLabel(state, me)}에서 무장 한 명이 한 달 동안 금 ${S.TECH_COST}을 들여 합니다. 기술은 세력 전체의 것입니다. 군사 기술은 상위 병종을 열고, 내정 기술은 단계마다 적힌 만큼 효과가 쌓입니다.</p>` +
      `<div class="footer">${cap ? `<button data-action="goto" data-city="${cap}">${state.cities[cap].name}에서 연구하기</button>` : ""}<button class="primary" data-action="close">닫기</button></div>`);
  };

  // ---------- the Han court ----------
  function courtPending() {
    const han = state.han;
    if (!han || !han.pending || !state.playerForce || han.holder !== state.playerForce) return "";
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
      if (me && h === me) {
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
    const can = me ? S.canProclaim(state, me) : { ok: false };
    if (me && !state.forces[me].emperor) {
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
      (state.playerForce ? `<button data-action="auto"><b>세력 위임</b><span>${state.auto
        ? "지금 세력 전체를 맡겨 두었습니다. 누르면 다시 직접 다스립니다."
        : "세력 전체를 컴퓨터에 맡깁니다. 도시와 군대, 외교와 황실, 포로 처우까지 알아서 하고, 시간이 저절로 멈추지 않습니다. 언제든 되돌릴 수 있습니다."}</span></button>` : "") +
      `<button data-action="title"><b>타이틀로</b><span>저장한 뒤 첫 화면으로 돌아갑니다.</span></button>` +
      `</div>` + closeBar);
  };

  UI.showEnd = function () {
    const o = state.over;
    const win = o.result === "win" && (o.force === state.playerForce || !state.playerForce);
    UI.openModal(`<div class="title-hero end"><h1>${win ? "천하통일" : "패배"}</h1><p>${!state.playerForce
      ? `${state.year}년 ${state.month}월, ${state.forces[o.force].name}군이 천하를 통일했습니다.`
      : win
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
      (saved && !saved.over ? `<div class="footer center"><button class="primary big" data-action="continue">이어하기 — ${saved.year}년 ${saved.month}월 · ${saved.playerForce ? saved.forces[saved.playerForce].name + "군" : "관전"}</button></div>` : "") +
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
      `<h3>세력을 고르세요</h3>` +
      `<div class="links watch"><button data-action="start" data-force="">관전 모드</button><span class="hint">세력을 고르지 않고 모든 세력을 컴퓨터에 맡긴 채 지켜봅니다.</span></div>` +
      `<div class="forcegrid">${cards}</div>`, true);
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
    auto: () => {
      if (!state || !state.playerForce) return;
      if (!state.auto && !confirm("세력 전체를 컴퓨터에 맡길까요? 언제든 되돌릴 수 있습니다.")) return;
      UI.result(S.setAuto(state, !state.auto));
      if (UI.modalOpen()) UI.closeModal();
    },
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
    envoy: (d) => UI.showEnvoy(d.force),
    doEnvoy: (d) => {
      const f = envoyForm();
      const opts = f.kind === "tribute" ? { gold: f.gold } : f.kind === "swap" ? { give: f.give, take: f.take, gold: f.ransom } : {};
      if (UI.result(S.sendEnvoy(state, state.playerForce, d.force, f.oid, f.kind, opts))) UI.showDiplomacy();
    },
    answerEnvoy: (d) => { if (UI.result(S.answerEnvoy(state, +d.id, !!d.yes))) UI.showDiplomacy(); },
    breakPact: (d) => {
      if (!confirm(`${state.forces[d.force].name}군과의 동맹을 파기할까요? 내 모든 도시의 치안이 5 떨어지고 우호도가 크게 떨어집니다.`)) return;
      if (UI.result(S.breakPact(state, state.playerForce, d.force))) UI.showDiplomacy();
    },
    start: (d) => {
      const pick = document.querySelector('input[name="lifespan"]:checked');
      UI.setState(S.newGame(S.SCENARIO_191, d.force || null, null, {
        lifespan: pick ? pick.value : "real", fiction: $("#optFiction").checked, women: $("#optWomen").checked,
      }));
      if (!d.force) { begin(state.cities[state.emperor] || S.cityList(state)[0], "관전을 시작합니다. 스페이스 바나 ▶ 진행 버튼으로 시간을 흐르게 합니다."); return; }
      begin(S.citiesOf(state, d.force)[0], `${state.forces[d.force].name}군으로 천하통일을 시작합니다! 스페이스 바나 ▶ 진행 버튼으로 시간을 흐르게 합니다.`);
    },
    continue: () => {
      UI.setState(S.migrate(UI.loadSaved()));
      const cap = state.playerForce ? S.capitalOf(state, state.playerForce) : S.capitalOf(state, UI.viewForce());
      begin(state.cities[cap] || UI.myCities()[0] || S.cityList(state)[0], "스페이스 바나 ▶ 진행 버튼으로 시간을 흐르게 합니다.");
    },
  });
})(globalThis.SAM = globalThis.SAM || {});
