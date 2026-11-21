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
      ["작위", (r) => (r.f.emperor ? 99 : S.titleRank(S.titleKey(state, r.f.id))), (r) => S.titleName(state, r.f.id) + (r.f.titleDue ? ` <span class="hint" title="헌제의 칙사가 오는 중">→${S.TITLES[S.titleRank(r.f.titleDue.key)].name}</span>` : "")],
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
    const what = e.kind === "pact" ? `${S.allied(state, e.from, e.to) ? "동맹을 연장하자고" : "동맹을"} 청합니다. 기간은 ${e.months || S.PACT_MAX}개월이고, 예물로 금 ${e.gold}을 가져왔습니다.`
      : e.kind === "urge" ? surrenderAsk(e)
      : e.kind === "submit" ? submitAsk(e)
      : [e.give.length && `돌려주겠다는 포로: ${capNames(e.give)}`, e.take.length && `돌려받으려는 포로: ${capNames(e.take)}`, e.gold && `몸값 금 ${e.gold}`].filter(Boolean).join(" · ");
    const left = Math.max(0, e.expires - S.today(state));
    return `<div class="ask"><div><b>${S.forceName(state, e.from)}</b>의 사자 <b>${o.name}</b> <span class="hint">(언변 ${o.speech}, ${left}일 더 기다림)</span><br>${what}</div>` +
      `<span><button class="primary" data-action="answerEnvoy" data-id="${e.id}" data-yes="1">수락</button> <button data-action="answerEnvoy" data-id="${e.id}">거절</button></span></div>`;
  }
  // 항복 권고: what giving up means, and what the court says.
  function surrenderAsk(e) {
    const out = S.yieldOutlook(state, e.to, e.from, state.officers[e.officer].speech);
    return `<b class="bad">항복을 권합니다.</b> 받아들이면 우리 세력은 ${S.forceName(state, e.from)}에 들어가고, 군주는 그 신하가 됩니다(병력 ${out.ratio}배). ` +
      `조정 여론: <b>${S.supportLabel(out.d.support)}</b> (${S.councilLine(state, out.d)}). 반대한 이가 성을 가졌다면 갈라져 나갈 수 있습니다.`;
  }
  // 귀순: a force offers itself.
  function submitAsk(e) {
    const out = S.acceptOutlook(state, e.to, e.from);
    const t = S.totals(state, e.from);
    return `<b class="good">귀순을 청합니다.</b> 도시 ${t.cities}, 무장 ${t.officers}, 병력 ${fmt(t.troops)}을 바치겠다고 합니다. ` +
      `조정 여론: <b>${S.supportLabel(out.d.support)}</b> (${S.councilLine(state, out.d)}).`;
  }
  function envoyRow(e) {
    const o = state.officers[e.officer];
    const now = S.today(state);
    const where = e.phase === "out" ? `가는 중 (${Math.max(0, e.arrive - now)}일 뒤 도착)` : e.phase === "wait" ? "답을 기다리는 중" : `돌아오는 중 (${Math.max(0, e.back - now)}일 뒤)`;
    return `<tr><td>${o.name}</td><td>${S.forceName(state, e.to)}</td><td>${S.envoyKind[e.kind]}${e.kind === "tribute" ? ` 금 ${e.gold}` : ""}</td><td>${where}</td></tr>`;
  }
  UI.showDiplomacy = function () {
    const me = UI.viewForce();
    const play = !!state.playerForce && !state.over && S.playerRules(state); // only the ruler sends envoys
    const out = play ? S.envoysOf(state, me) : [];
    const cell = (fid) => {
      if (!play) return "";
      const busy = out.some((e) => e.to === fid);
      return (busy ? `<span class="hint">사자 파견 중</span>` : `<button data-action="envoy" data-force="${fid}">사자 보내기</button>`) +
        (S.allied(state, me, fid) ? ` <button data-action="breakPact" data-force="${fid}">동맹 파기</button>` : "") +
        (S.warRecordOf(state, me, fid) && !S.truceLeft(state, me, fid) ? ` <button data-action="askPeace" data-force="${fid}">강화 요청</button>` : "");
    };
    const rows = aliveForces().filter((r) => r.f.id !== me).sort((a, b) => b.t.cities - a.t.cities || b.t.troops - a.t.troops)
      .map(({ f, t }) => {
        const cd = S.pactCooldown(state, me, f.id);
        const sw = S.swappable(state, me, f.id);
        return `<tr><td>${swatch(f)}${f.name}군${f.emperor ? " (황제)" : ""}</td><td>${state.officers[f.ruler].name}</td>` +
          `<td>${t.cities}</td><td>${fmt(t.troops)}</td><td>${relCell(S.rel(state, me, f.id))}</td>` +
          `<td>${S.allied(state, me, f.id) ? `<span class="good">동맹</span> <span class="hint">${S.pactLeft(state, me, f.id)}개월 남음</span>`
            : S.truceLeft(state, me, f.id) ? `휴전 <span class="hint">${S.truceLeft(state, me, f.id)}개월 남음</span>`
            : S.warRecordOf(state, me, f.id) ? `<span class="bad">교전 중</span>` : cd ? `<span class="hint">파기 후 ${cd}개월</span>` : "-"}</td>` +
          `<td>${S.allies(state, f.id).filter((a) => a !== me).map((a) => state.forces[a].name).join(", ") || "-"}</td>` +
          `<td>${sw.give.length || sw.take.length ? `우리가 ${sw.give.length} · 저쪽이 ${sw.take.length}` : "-"}</td>` +
          `<td>${S.envoyDays(state, me, f.id)}일</td><td>${cell(f.id)}</td></tr>`;
      }).join("");
    const asks = play && !UI.handsOff() ? S.asksFor(state, me) : [];
    const peace = play && !UI.handsOff() ? (state.peaceOffers || []).filter((o) => o.winner === me || o.loser === me) : [];
    UI.openModal(title(state.playerForce ? "외교" : `${S.forceName(state, me)}의 외교`) +
      (asks.length ? `<h3>답을 기다리는 사자</h3>${asks.map(askRow).join("")}` : "") +
      (peace.length ? `<h3>강화 제의</h3>${peace.map((o) => UI.peaceRow(o)).join("")}` : "") +
      `<table><tr><th>세력</th><th>군주</th><th>도시</th><th>병력</th><th>우호도</th><th>우리와</th><th>다른 동맹</th><th>포로</th><th>사자 길</th><th></th></tr>${rows}</table>` +
      (out.length ? `<h3>보낸 사자</h3><table><tr><th>사자</th><th>상대</th><th>용건</th><th>상황</th></tr>${out.map(envoyRow).join("")}</table>` : "") +
      `<div class="footer"><button data-action="help" data-topic="diplomacy">외교 도움말</button><button class="primary" data-action="close">닫기</button></div>`, true);
  };

  // Sending an envoy: who goes, and on what errand.
  UI.showEnvoy = function (fid) {
    const me = state.playerForce;
    const who = S.envoyCandidates(state, me);
    const cap = state.cities[S.capitalOf(state, me)];
    if (!who.length) { UI.toast(`${cap.name}(세력 수도)에 쉬고 있는 무장이 없습니다. 군주는 사자로 갈 수 없습니다.`); return; }
    const sw = S.swappable(state, me, fid);
    const renew = S.pactRenewable(state, me, fid);
    const pactNo = S.allied(state, me, fid) && !renew ? `동맹 중, ${S.pactLeft(state, me, fid)}개월 남음` : S.pactCooldown(state, me, fid) ? `파기 후 ${S.pactCooldown(state, me, fid)}개월` : S.pactSnub(state, me, fid) ? `거절당한 지 얼마 안 됨 (${S.pactSnub(state, me, fid)}개월)` : "";
    const swapNo = sw.give.length || sw.take.length ? "" : "서로 잡아 둔 포로 없음";
    const urgeNo = S.urgeBar(state, me, fid), submitNo = S.submitBar(state, me, fid);
    const kind = (k, label, no) => `<label><input type="radio" name="envKind" value="${k}"${k === "tribute" ? " checked" : ""}${no ? " disabled" : ""}> ${label}${no ? ` <span class="hint">(${no})</span>` : ""}</label>`;
    const boxes = (list, cls) => list.map((o) => `<label><input type="checkbox" class="${cls}" value="${o.id}" checked> ${o.name} <span class="hint">(가치 ${S.captiveWorth(o)} · ${S.placeName(state, o.city)})</span></label>`).join("") || `<span class="hint">없음</span>`;
    UI.openModal(title(`${S.forceName(state, fid)}에 사자 보내기`) +
      `<p class="hint">사자는 ${cap.name}(세력 수도)에서 ${S.placeName(state, S.capitalOf(state, fid))}까지 ${S.envoyDays(state, me, fid)}일을 가고, 도착한 날 용건을 전한 뒤 같은 길을 돌아옵니다. ` +
      `그동안 다른 명령은 받지 못합니다. 지금 우호도는 ${relCell(S.rel(state, me, fid))}입니다.</p>` +
      `<div class="row"><label>사자</label><select id="envWho">${who.map((o) => `<option value="${o.id}">${o.name} (언변 ${o.speech})</option>`).join("")}</select></div>` +
      `<div class="row"><label>용건</label><span class="links">${kind("tribute", "조공")}${kind("pact", renew ? "동맹 연장" : "동맹 제의", pactNo)}${kind("swap", "포로 교환", swapNo)}</span></div>` +
      `<div class="row"><label></label><span class="links">${kind("urge", "항복 권고", urgeNo)}${kind("submit", "귀순", submitNo)}</span></div>` +
      `<div id="envTribute"><div class="row"><label>금</label><input type="number" id="envGold" min="${S.DIPLO.tributeMin}" step="100" value="${Math.min(300, Math.floor(cap.gold / 100) * 100)}"> <span class="hint">${cap.name}의 금 ${fmt(cap.gold)}</span></div></div>` +
      `<div id="envPact" class="hidden"><div class="row"><label>기간</label><select id="envMonths">${Array.from({ length: S.PACT_MAX }, (_, i) => i + 1).map((m) => `<option value="${m}"${m === S.PACT_MAX ? " selected" : ""}>${m}개월</option>`).join("")}</select> ` +
      `<span class="hint">길게 청할수록 수락 확률이 조금 낮아집니다.</span></div>` +
      `<p class="hint">예물로 금 ${S.PACT_COST}을 가져갑니다. 거절당해도 돌려받지 못합니다.${renew ? " 받아들이면 그날부터 새 기간을 셉니다." : ""}</p></div>` +
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
    return { kind: pick ? pick.value : "tribute", oid: $("#envWho").value, gold: +$("#envGold").value || 0, months: +$("#envMonths").value || S.PACT_MAX,
      give: ids("envGive"), take: ids("envTake"), ransom: Math.max(0, +$("#envRansom").value || 0) };
  }
  function updateEnvoy(fid) {
    const me = state.playerForce, f = envoyForm();
    const o = state.officers[f.oid];
    for (const [id, k] of [["envTribute", "tribute"], ["envPact", "pact"], ["envSwap", "swap"]]) $("#" + id).classList.toggle("hidden", f.kind !== k);
    let text;
    if (f.kind === "tribute") text = `우호도 +${S.tributeGain(state, fid, f.gold, o.speech)} <span class="hint">(금이 많을수록, 사자의 언변이 높을수록, 상대 세력이 작을수록 큽니다. 한 번에 ${S.DIPLO.tributeMax}까지)</span>`;
    else if (f.kind === "pact") text = `수락 확률 ${S.pactChance(state, me, fid, o.speech, f.months)}% <span class="hint">(${f.months}개월)</span>`;
    else if (f.kind === "urge") {
      const out = S.yieldOutlook(state, fid, me, o.speech);
      text = `받아들일 확률 ${out.pct}% <span class="hint">(저쪽 조정 여론 ${S.supportLabel(out.d.support)}. 군주가 야심·과감하면 버티고, 무욕·신중하거나 싸움에 약하면 쉽게 꺾입니다. 거절당하면 우호도 ${S.SURRENDER.urge.rel}, ${S.SURRENDER.urge.wait}개월 동안 다시 권할 수 없습니다.)</span>`;
    } else if (f.kind === "submit") {
      const mine = S.yieldOutlook(state, me, fid);
      text = `받아 줄 확률 ${S.acceptOutlook(state, fid, me).pct}% <span class="hint">(우리 조정 여론 ${S.supportLabel(mine.d.support)} — ${S.councilLine(state, mine.d)}. ` +
        `받아들여지면 모든 도시와 무장이 ${S.forceName(state, fid)}에 들어가고 군주는 그 신하가 됩니다. 반대한 이가 성을 가졌다면 갈라져 나갈 수 있습니다.)</span>`;
    }
    else {
      const worth = (ids) => ids.reduce((s, id) => s + S.captiveWorth(state.officers[id]), 0);
      text = `주는 값 ${worth(f.give) + f.ransom} · 받는 값 ${worth(f.take)} · 수락 확률 ${S.swapChance(state, me, fid, f.give, f.take, f.ransom, o.speech)}%`;
    }
    $("#envEst").innerHTML = text;
  }

  // ---------- city and officer lists ----------
  // Each list can show one force (the player's by default), every force, or
  // what belongs to none (vacant cities, free officers).
  const scopes = {};
  const scopeOf = (key) => scopes[key] || UI.viewForce() || "all";
  function scopePicker(key, noneLabel) {
    const cur = scopeOf(key);
    const opt = (v, label) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
    const forces = Object.values(state.forces).filter((f) => f.alive)
      .sort((a, b) => (a.id === state.playerForce ? -1 : b.id === state.playerForce ? 1 : S.citiesOf(state, b.id).length - S.citiesOf(state, a.id).length));
    return `<p class="scope">보기 <select id="listScope">${opt("all", "전체")}` +
      forces.map((f) => opt(f.id, `${f.name}군${f.id === state.playerForce ? " (나)" : ""}`)).join("") + opt("none", noneLabel) + `</select></p>`;
  }
  function watchScope(key) {
    UI.modalOnInput = () => {
      const el = $("#listScope");
      if (el && el.value !== scopeOf(key)) { scopes[key] = el.value; lists[key](); }
    };
  }
  const ownerCell = (fid) => (fid && state.forces[fid] ? `${swatch(state.forces[fid])}${state.forces[fid].name}군` : `<span class="hint">-</span>`);

  UI.showCities = lists.cities = function () {
    const scope = scopeOf("cities");
    const all = S.cityList(state);
    const rows = scope === "all" ? all : scope === "none" ? all.filter((c) => !c.owner) : all.filter((c) => c.owner === scope);
    const mine = (c) => c.owner && c.owner === state.playerForce;
    const cols = [
      ["도시", (c) => c.name, (c) => `${S.isCapital(state, c.id) ? `<span class="capstar">★</span>` : ""}<b>${c.name}</b>`],
      ...(scope === "all" ? [["세력", (c) => (c.owner ? state.forces[c.owner].name : ""), (c) => ownerCell(c.owner)]] : []),
      ["주", (c) => S.PROVINCES[c.prov]], ["군현", (c) => S.fullName(c)],
      ["병력", (c) => c.troops, (c) => fmt(c.troops)], ["훈련", (c) => c.train],
      ["금", (c) => c.gold, (c) => fmt(c.gold)], ["군량", (c) => c.food, (c) => fmt(c.food)],
      ["월 수지", (c) => (c.owner ? S.balance(c) : 0), (c) => (c.owner ? UI.signed(S.balance(c)) : "-")],
      ["인구", (c) => c.pop, (c) => fmt(c.pop)], ["치안", (c) => c.order],
      ["농업", (c) => c.farm], ["상업", (c) => c.trade], ["성벽", (c) => c.wall],
      ["호족 세력", (c) => Math.round(c.gentry)], ["호족 협력", (c) => Math.round(c.consent)],
      ["무장", (c) => S.serving(state, c.id).length, (c) => `${S.serving(state, c.id).length}` + (mine(c) ? ` <span class="hint">(대기 ${S.idle(state, c.id).length})</span>` : "")],
      ["통치", (c) => (mine(c) ? S.delegateOf(state, c) || "" : ""), (c) => (!mine(c) ? "-" : S.delegateOf(state, c) ? S.DELEGATE[S.delegateOf(state, c)] : "직접")],
    ];
    UI.openModal(title(`도시 일람 (${rows.length})`) + scopePicker("cities", "빈 땅") +
      listTable("cities", cols, rows, (c) => `class="pick" data-action="goto" data-city="${c.id}"`) +
      `<p class="hint">제목을 누르면 그 열로 정렬하고, 다시 누르면 순서를 뒤집습니다. 줄을 누르면 그 도시로 갑니다.</p>` + closeBar, true);
    watchScope("cities");
  };
  const whereOf = (o) => S.placeName(state, o.city);
  function officerStatus(o) {
    if (o.status === "captive") return `포로 (${S.forceName(state, o.captor)})`;
    if (o.status === "free") return "재야";
    if (o.transit) return String(o.transit)[0] === "e" ? "사자" : "이동 중";
    const k = S.postOf(state, o);
    if (k) return `${S.POSTS[k].label} 담당`;
    return o.force === state.playerForce ? (o.done ? "완료" : "대기") : "-";
  }
  UI.showOfficers = lists.officers = function () {
    const scope = scopeOf("officers");
    const shown = (o) => o.status === "serving" || o.status === "captive" || (o.status === "free" && !o.hidden);
    const people = Object.values(state.officers).filter(shown);
    const list = scope === "all" ? people : scope === "none" ? people.filter((o) => o.status === "free") : people.filter((o) => o.status === "serving" && o.force === scope);
    const facs = {};
    const facOf = (o) => {
      if (o.status !== "serving") return "-";
      if (S.isRuler(state, o)) return "군주";
      const g = S.factionOf(state, o, facs[o.force] || (facs[o.force] = S.factions(state, o.force)));
      return g ? g.name : "무파벌";
    };
    const serving = (o) => o.status === "serving" && !S.isRuler(state, o);
    const cols = [
      ["이름", (o) => o.name, (o) => `${S.isRuler(state, o) ? `<span class="crown" title="군주">主</span>` : ""}<b>${o.name}</b>${UI.personMarks(o)}`],
      ...(scope === "all" ? [["세력", (o) => (o.status === "serving" ? state.forces[o.force].name : ""), (o) => (o.status === "serving" ? ownerCell(o.force) : `<span class="hint">-</span>`)]] : []),
      ["소재", whereOf], ["나이", (o) => S.age(state, o)],
      ...S.ABILITY_KEYS.map((k) => [S.ABILITY_NAMES[k], (o) => o[k]]),
      ["충성", (o) => (serving(o) ? o.loyalty : -1), (o) => (serving(o) ? o.loyalty : "-")],
      ["유대", (o) => (serving(o) ? o.bond || 0 : -1), (o) => (serving(o) ? o.bond || 0 : "-")],
      ["관직", (o) => (serving(o) ? S.seatValue(state, o) * 10 - (S.officeOf(state, o) ? S.officeOf(state, o).min / 100 : 0) : -1), UI.seatName],
      ["명성", (o) => o.fame || 0],
      ["공적", (o) => (serving(o) ? o.merit || 0 : -1), (o) => (serving(o) ? o.merit || 0 : "-")],
      ["만족", (o) => (serving(o) ? o.content : -1), (o) => (serving(o) ? UI.contentCell(o) : "-")],
      ["야망", (o) => S.ambitionLabels(state, o).join(" "), (o) => `<span title="${UI.ambitionTitle(o)}">${S.ambitionLabels(state, o).join(" ") || "-"}</span>`],
      ["상태", officerStatus],
      ["파벌", facOf],
      ["성격", (o) => S.traitsOf(o).join(" "), UI.traitTags],
      ["성향", (o) => S.REACH.indexOf(S.reachOf(o)), (o) => `<span title="${S.REACH_HELP[S.reachOf(o)]}">${S.reachOf(o)}</span>`],
      ["특기", (o) => S.skillsOf(o).join(" "), UI.skillTags],
    ];
    UI.openModal(title(`무장 일람 (${list.length})`) + scopePicker("officers", "재야") +
      listTable("officers", cols, list, (o) => `class="pick" data-action="goto" data-city="${o.city}"`) +
      `<p class="hint">제목을 누르면 그 열로 정렬하고, 다시 누르면 순서를 뒤집습니다. 줄을 누르면 그 무장이 있는 곳으로 갑니다. 재야는 찾아낸 사람만 보입니다.</p>` +
      `<div class="footer"><button data-action="offices">관직</button> <button data-action="factions">파벌</button> <button class="primary" data-action="close">닫기</button></div>`, true);
    watchScope("officers");
  };

  // ---------- offices (관직) ----------
  UI.seatName = function (o) {
    if (o.status !== "serving") return "-";
    if (S.isRuler(state, o)) return "군주";
    const off = S.officeOf(state, o);
    if (off) return `<b>${off.name}</b>`;
    const c = S.governs(state, o);
    return c ? `<span title="${S.GOVERNOR_TYPES[S.governorType(state, o)]}">${c.name} 태수 · ${S.governorType(state, o)}</span>` : "-";
  };
  UI.contentCell = function (o) {
    const v = o.content == null ? 50 : o.content;
    const cls = v >= 70 ? "good" : v < 25 ? "bad" : v < 45 ? "warnc" : "";
    return `<span class="${cls}" title="${S.contentLabel(v)}">${v}</span>`;
  };
  UI.ambitionTitle = function (o) {
    const a = S.ambitionOf(state, o);
    return Object.entries(a).map(([k, w]) => `${S.AMBITIONS[k]} ${w.toFixed(1)}`).join(", ");
  };
  UI.officeAskRow = function (a) {
    const o = state.officers[a.oid], off = S.officeDef(a.key);
    if (!o || !off) return "";
    const h = S.holder(state, a.fid, a.key);
    return `<p><b>${o.name}</b>${S.josa(o.name, "이", "가").slice(o.name.length)} <b>${off.name}</b> 자리를 청합니다. <span class="hint">(명성 ${o.fame} · 공적 ${o.merit} · 만족 ${o.content})</span> ` +
      (h ? `지금 ${off.name} ${S.josa(h.name, "은", "는")} 밀려납니다. ` : "") +
      `<button data-action="officeYes" data-id="${a.id}">들어준다</button> <button data-action="officeNo" data-id="${a.id}">물리친다</button></p>`;
  };
  UI.showOffices = function () {
    const me = UI.viewForce();
    if (!me || !state.forces[me]) return;
    const edit = me === state.playerForce && !state.over && !UI.handsOff();
    const open = new Set(S.openSeats(state, me));
    const n = S.citiesOf(state, me).length;
    const rows = S.OFFICES.map((x) => {
      if (!open.has(x)) return `<tr class="done"><td><b>${x.name}</b></td><td>${x.role}</td><td colspan="5" class="hint">도시 ${x.min}개부터 (지금 ${n}개)</td></tr>`;
      const h = S.holder(state, me, x.key);
      const cands = edit ? S.officeCandidates(state, me, x.key).filter((o) => o !== h).slice(0, 10) : [];
      const pick = edit ? `<select id="off_${x.key}">${cands.map((o) => `<option value="${o.id}">${o.name} (적성 ${Math.round(S.officeFit(state, me, o, x.key))}${S.officeOf(state, o) ? " · " + S.officeOf(state, o).name : ""})</option>`).join("")}</select> ` +
        `<button data-action="appoint" data-key="${x.key}">임명</button>` + (h ? ` <button data-action="dismissOffice" data-key="${x.key}">파면</button>` : "") : "";
      return `<tr><td title="${x.help}"><b>${x.name}</b></td><td>${x.role}</td>` +
        `<td>${h ? h.name : `<span class="hint">비어 있음</span>`}</td><td>${h ? Math.round(S.officeFit(state, me, h, x.key)) : "-"}</td>` +
        `<td>${h ? UI.contentCell(h) : "-"}</td><td>${h ? S.ambitionLabels(state, h).join(" ") : "-"}</td><td>${pick}</td></tr>`;
    }).join("");
    const asks = edit ? (state.officeAsks || []).filter((a) => a.fid === me) : [];
    UI.openModal(title(`관직 — ${S.forceName(state, me)}`) +
      `<div class="otable"><table><tr><th>관직</th><th>맡은 일</th><th>맡은 사람</th><th>적성</th><th>만족</th><th>야망</th><th></th></tr>${rows}</table></div>` +
      (asks.length ? `<h3>관직 요구</h3>${asks.map(UI.officeAskRow).join("")}` : "") +
      `<p class="hint">관직 이름에 마우스를 올리면 하는 일이 보입니다. 적성은 그 자리에 맞는 능력, 명성, 공적, 군주의 의견을 합친 값입니다. ` +
      `공적과 명성이 높은데 자리가 낮은 출세욕 강한 무장은 만족이 떨어지고 더 높은 자리를 요구합니다. 밀려나거나 파면된 사람은 군주에게 불만을 품습니다.</p>` +
      (edit ? `<p>국경 습격: <b>${state.forces[me].noRaids ? "금지" : "허용"}</b> <button data-action="toggleRaids">${state.forces[me].noRaids ? "허용한다" : "금한다"}</button> ` +
        `<span class="hint">출세형 태수는 공을 세우려 이웃 세력의 성을 습격합니다. 금하면 할거형 태수만 습격합니다.</span></p>` : "") +
      `<div class="footer"><button data-action="officers">무장 일람</button> <button class="primary" data-action="close">닫기</button></div>`, true);
  };
  // ---------- the council (조정 회의) ----------
  const stanceCell = (v) => v == null ? "-" : `<span class="${v > 0.15 ? "good" : v < -0.15 ? "bad" : ""}">${v > 0.15 ? "찬성" : v < -0.15 ? "반대" : "중립"} ${v > 0 ? "+" : ""}${Math.round(v * 100)}</span>`;
  UI.proposalRow = function (a) {
    const o = state.officers[a.oid];
    if (!o) return "";
    const what = a.kind === "war"
      ? `${S.forceName(state, a.foe)}의 <b>${S.place(state, a.target).name}</b> 출정을 진언합니다 (승산 ${a.ratio}).`
      : `${S.forceName(state, a.foe)}과의 <b>강화</b>를 진언합니다.`;
    return `<p><b>${S.josa(o.name, "이", "가")}</b> ${what} <span class="hint">조정 여론: ${S.supportLabel(a.support)}</span> ` +
      `<button data-action="proposalYes" data-id="${a.id}">채택한다</button> <button data-action="proposalNo" data-id="${a.id}">물리친다</button></p>`;
  };
  UI.showCouncil = function () {
    const me = UI.viewForce();
    if (!me || !state.forces[me]) return;
    const mine = me === state.playerForce && !state.over && !S.spectating(state);
    const out = S.warOutlook(state, me);
    const stances = out ? new Map(out.d.seats.map((c) => [c.o, c.stance])) : new Map();
    const seats = S.councilors(state, me);
    const rows = seats.map((c) => `<tr><td><b>${c.o.name}</b></td><td>${UI.seatName(c.o)}${c.memorial ? ' <span class="hint">(진언서)</span>' : ""}</td>` +
      `<td>${c.voice}</td><td>${S.ambitionLabels(state, c.o).join(" ") || "-"}</td><td>${stanceCell(stances.get(c.o))}</td></tr>`).join("");
    const props = mine ? (state.proposals || []).filter((a) => a.fid === me) : [];
    const RES = { won: '<span class="good">성공</span>', lost: '<span class="bad">실패</span>', made: "성사", none: "흐지부지" };
    const recs = S.councilsOf(state, me).map((r) => {
      const foe = state.forces[r.foe] ? S.forceName(state, r.foe) : "?";
      const what = r.kind === "war" ? `${r.target ? S.place(state, r.target).name : "?"} 출정` : r.kind === "surrender" ? `${foe}에 항복`
        : r.kind === "accept" ? `${foe}의 귀순 받기` : `${foe}과 강화`;
      const nm = (ids) => ids.map((id) => state.officers[id] && state.officers[id].name).filter(Boolean).join("·") || "-";
      return `<tr><td>${r.stamp[0]}.${r.stamp[1]}</td><td>${what}</td><td>${S.supportLabel(r.support)}</td><td>${nm(r.pro)}</td><td>${nm(r.con)}</td>` +
        `<td>${r.adopted ? (r.by === "player" ? "군주 결정" : "채택") : '<span class="hint">부결</span>'}</td><td>${RES[r.result] || (r.adopted && r.kind === "war" ? "진행 중" : "-")}</td></tr>`;
    }).join("");
    UI.openModal(title(`조정 회의 — ${S.forceName(state, me)}`) +
      (props.length ? `<h3>진언</h3>${props.map(UI.proposalRow).join("")}` : "") +
      `<h3>조정의 사람들</h3>` +
      (out ? `<p class="hint">지금 가장 승산이 큰 출정: ${S.forceName(state, out.t.owner)}의 ${out.t.name} (승산 ${out.ratio}) — 조정 여론 <b>${S.supportLabel(out.d.support)}</b></p>` : `<p class="hint">지금은 수도에서 주력군을 낼 만한 곳이 없습니다.</p>`) +
      `<div class="otable"><table><tr><th>이름</th><th>자리</th><th>목소리</th><th>야망</th><th>출정 성향</th></tr>${rows || '<tr><td colspan="5" class="hint">조정에 아무도 없습니다.</td></tr>'}</table></div>` +
      `<h3>지난 회의</h3>` +
      (recs ? `<div class="otable"><table><tr><th>때</th><th>의제</th><th>여론</th><th>찬성</th><th>반대</th><th>결정</th><th>결과</th></tr>${recs}</table></div>` : `<p class="hint">아직 회의 기록이 없습니다.</p>`) +
      `<p class="hint">관직을 가진 사람과 수도에 있는 무장이 조정에 앉고, 태수는 진언서로 절반만큼 말합니다. 목소리는 관직, 명성, 언변, 파벌이 정합니다. ` +
      `출정이 성공하면 찬성한 사람이, 실패하면 반대한 사람이 공적과 명성을 얻고, 진 쪽은 체면을 잃습니다. 자세한 것은 도움말 「조정 회의」를 보세요.</p>` +
      `<div class="footer"><button data-action="offices">관직</button> <button data-action="officers">무장 일람</button> <button class="primary" data-action="close">닫기</button></div>`, true);
  };
  // ---------- border raids (국경 습격) ----------
  UI.raidRow = function (a) {
    const o = state.officers[a.oid], t = state.cities[a.city];
    if (!o || !t) return "";
    return `<p><b>${S.josa(o.name, "이", "가")}</b> <span class="hint">(${S.governorType(state, o) || "-"}형)</span> ${S.forceName(state, a.foe)}의 ${S.josa(t.name, "을", "를")} 습격해 ${a.won ? "노획을 거두었습니다" : "쫓겨났습니다"}. ` +
      `<button data-action="raidScold" data-id="${a.id}">문책한다</button> <button data-action="raidPass" data-id="${a.id}">묵인한다</button></p>`;
  };
  UI.showRaids = function () {
    const list = (state.raidReports || []).filter((a) => a.fid === state.playerForce);
    if (!list.length) { if (UI.modalOpen()) UI.closeModal(); UI.renderAll(); return; }
    UI.openModal(title("국경 습격 보고") + list.map(UI.raidRow).join("") +
      `<p class="hint">습격당한 세력은 관계가 나빠지고 보복할 곳을 찾습니다. 문책하면 관계가 조금 풀리지만 태수의 공적이 깎이고 그는 불만을 품습니다. 한 달 안에 정하지 않으면 묵인한 것으로 칩니다.</p>` +
      `<div class="footer"><button data-action="offices">관직 창</button> <button class="primary" data-action="close">나중에 정한다</button></div>`, true);
  };
  UI.showOfficeAsks = function () {
    const me = state.playerForce;
    const list = (state.officeAsks || []).filter((a) => a.fid === me);
    if (!list.length) { if (UI.modalOpen()) UI.closeModal(); UI.renderAll(); return; }
    UI.openModal(title("관직 요구") + list.map(UI.officeAskRow).join("") +
      `<p class="hint">들어주면 그는 크게 만족하고, 밀려난 사람은 불만을 품습니다. 물리치거나 한 달 안에 답하지 않으면 요구한 사람이 불만을 품습니다.</p>` +
      `<div class="footer"><button data-action="offices">관직 창</button> <button class="primary" data-action="close">나중에 정한다</button></div>`, true);
  };

  // ---------- factions ----------
  const FACTION_KIND = { kin: "종친", old: "원종", han: "한조", turned: "구신", region: "출신 지역" };
  // Who would follow the ruler, and how the factions would line up.
  function heirBlock(fid) {
    const out = S.successionOutlook(state, fid);
    if (!out.length) return "";
    const kin = S.heirCandidates(state, fid).length > 0;
    const rows = out.map((x) => `<tr><td><b>${x.o.name}</b>${x.named ? ` <em>${kin ? "후계자" : "유력"}</em>` : ""}</td><td>${S.placeName(state, x.o.city)}</td>` +
      `<td>${Math.round(x.share * 100)}%</td></tr>`).join("");
    const second = out.find((x) => !x.named) || null;
    const risk = second ? S.splitChance(state, fid, second.o, second.share) : 0;
    const mine = fid === state.playerForce && kin;
    const pick = mine ? `<p>후계자 지명 <select id="heirPick"><option value="">가문의 서열대로</option>` +
      S.heirCandidates(state, fid).map((o) => `<option value="${o.id}"${state.forces[fid].heir === o.id ? " selected" : ""}>${o.name}</option>`).join("") + `</select></p>` : "";
    return `<h3>후계 구도</h3>${pick}<table class="tbl"><tr><th>${kin ? "후보" : "후보 (가문 없음)"}</th><th>소재</th><th>파벌 지지</th></tr>${rows}</table>` +
      `<p class="hint">${UI.HELP.succession}` + (second ? ` 지금 군주가 쓰러지면 ${S.josa(second.o.name, "이", "가")} 갈라져 나갈 가능성은 약 ${risk}%입니다.` : "") + `</p>`;
  }
  // Governors who might rise, the faction that might force the ruler out,
  // and (for the player) stepping down.
  function unrestBlock(fid) {
    const risky = S.citiesOf(state, fid).map((c) => ({ c, o: S.cityHead(state, c) }))
      .map((x) => Object.assign(x, { p: x.o ? S.rebelChance(state, x.o, x.c) : 0 })).filter((x) => x.p >= 0.1)
      .sort((a, b) => b.p - a.p);
    const rows = risky.map((x) => `<tr><td><b>${x.o.name}</b></td><td>${x.c.name}</td><td>${x.o.loyalty}</td><td>${Math.round(x.o.bond || 0)}</td>` +
      `<td>${S.rebelCities(state, x.o, x.c).map((c) => c.name).join(" ")}</td><td>월 ${x.p}%</td></tr>`).join("");
    const out = S.forcedOutlook(state, fid);
    const forced = out.g ? `<p class="bad">${S.josa(out.g.name, "이", "가")} 군주를 몰아낼 위험이 있습니다 (월 ${out.p}%, 수장 ${out.g.leader.name}, 유대 ${Math.round(out.g.leader.bond || 0)}).</p>` : "";
    const mine = fid === state.playerForce && S.canStepDown(state, fid);
    const wait = S.rebelWait(state, fid);
    const size = wait == null ? `<p>성이 ${S.REBEL.big.cities}개가 안 되는 세력이라 반란은 일어나지 않습니다.</p>`
      : wait > 0 ? `<p>성을 ${S.REBEL.big.cities}개 이상 가진 지 오래지 않아 ${wait}달 뒤부터 반란이 일어날 수 있습니다.</p>` : "";
    return `<h3>반란과 하야</h3>` + size +
      (wait !== 0 ? "" : rows ? `<table class="tbl"><tr><th>태수</th><th>도시</th><th>충성</th><th>유대</th><th>함께 떨어질 도시</th><th>반란 위험</th></tr>${rows}</table>` : `<p>반기를 들 만한 태수는 없습니다.</p>`) +
      forced + `<p class="hint">${UI.HELP.rebellion} ${UI.HELP.stepDown}</p>` +
      (mine ? `<div class="links"><button data-action="stepDown">하야 (후계자에게 물려주기)</button></div>` : "");
  }
  // The quarrel most likely, the faction in favour, and a slander waiting.
  function strifeBlock(fid) {
    const out = S.strifeOutlook(state, fid);
    const fav = S.favored(state, fid);
    const f = state.forces[fid];
    const sl = fid === state.playerForce && f.slander;
    return `<h3>알력다툼과 참소</h3>` +
      (out ? `<p>${S.josa(out.a.name, "과", "와")} ${out.b.name} 사이 긴장 ${out.tension}, 알력다툼 위험 석 달에 ${out.p}%.</p>` : `<p>맞설 만큼 큰 파벌이 둘이 되지 않아 알력다툼은 없습니다.</p>`) +
      (fav ? `<p>${S.josa(fav.name, "이", "가")} 군주의 총애를 받고 있습니다 (${fav.until - S.monthsElapsed(state)}달 남음).</p>` : "") +
      (sl ? `<p class="bad">${S.josa(state.officers[sl.by].name, "이", "가")} ${S.josa(state.officers[sl.target].name, "을", "를")} 참소했습니다. <button data-action="slander">처리</button></p>` : "") +
      `<p class="hint">${UI.HELP.strife}</p>` + hanBlock(fid);
  }
  function hanBlock(fid) {
    const g = S.hanFaction(state, fid);
    const wait = S.hanFollowIn(state, fid);
    const going = wait != null ? S.hanLoyalists(state, fid) : [];
    if (going.length) {
      return `<h3>한조파</h3><p class="bad">헌제가 다른 세력으로 옮겨 갔습니다. ${S.josa(going.map((o) => o.name).join(" "), "이", "가")} ` +
        `${wait}달 뒤 헌제를 따라 떠납니다 (유대 ${S.HAN_PLOT.stay} 이상이면 남습니다).</p><p class="hint">${UI.HELP.hanPlot}</p>`;
    }
    if (!g) return "";
    const out = S.plotOutlook(state, fid);
    return `<h3>한조파</h3><p>헌제를 모신 세력이라 한조를 중시하는 ${S.josa(g.members.map((o) => o.name).join(" "), "이", "가")} 한조파를 이룹니다. ` +
      (out.g ? `<span class="bad">헌제 우호도가 낮아 군주 암살을 꾀할 위험이 석 달에 ${out.p}%입니다.</span>` : `헌제 우호도가 ${S.HAN_PLOT.favor} 이상이라 암살을 꾀하지 않습니다.`) +
      `</p><p class="hint">${UI.HELP.hanPlot}</p>`;
  }
  // The ruler's reach and what he means to hold.
  function reachLine(fid) {
    const ruler = state.officers[state.forces[fid].ruler];
    const reach = S.reachOf(ruler);
    const dom = S.domainOf(state, fid);
    const names = !dom ? "천하" : !dom.key ? "자기 성" :
      [...dom.want].map((k) => (reach === "주" ? S.PROVINCES[k] : S.REGIONS[k] && S.REGIONS[k].name)).filter(Boolean).join("·");
    const aim = dom && !dom.key ? "빼앗긴 성 말고는 노리지 않습니다" : `${S.josa(names, "을", "를")} 노립니다`;
    return `<p>군주 성향 <b>${reach}</b>: ${S.REACH_HELP[reach]} ` +
      (fid === state.playerForce ? `<span class="hint">(플레이어 세력은 성향과 상관없이 직접 정합니다. 컴퓨터가 맡으면 ${aim}.)</span>` : `지금은 ${aim}.`) + `</p>`;
  }
  UI.showFactions = lists.factions = function () {
    const sc = scopes.officers;
    const me = sc && state.forces[sc] ? sc : UI.viewForce();
    if (!sorts.factions) sorts.factions = { col: 3, desc: true };
    const cols = [
      ["파벌", (g) => g.name, (g) => `<b>${g.name}</b>`],
      ["갈래", (g) => FACTION_KIND[g.kind]],
      ["수장", (g) => g.leader.name],
      ["세력", (g) => Math.round(g.share * 100), (g) => `${Math.round(g.share * 100)}%`],
      ["인원", (g) => g.members.length],
      ["맡은 도시", (g) => g.cities.length, (g) => g.cities.map((c) => c.name).join(" ") || "-"],
      ["병력", (g) => g.troops, (g) => fmt(g.troops)],
      ["평균 유대", (g) => Math.round(g.members.reduce((s, o) => s + (o.bond || 0), 0) / g.members.length)],
      ["구성원", (g) => g.members.length, (g) => `<span class="hint">${g.members.map((o) => o.name).join(" ")}</span>`],
    ];
    UI.openModal(title(`${S.forceName(state, me)} 파벌`) + reachLine(me) + listTable("factions", cols, S.factions(state, me)) +
      `<p class="hint">${UI.HELP.factions}</p>` + heirBlock(me) + unrestBlock(me) + strifeBlock(me) +
      `<div class="footer"><button data-action="officers">무장 일람</button> <button class="primary" data-action="close">닫기</button></div>`, true);
    UI.modalOnInput = () => {
      const el = $("#heirPick");
      if (el && (el.value || null) !== (state.forces[me].heir || null)) { UI.result(S.setHeir(state, me, el.value || null)); UI.showFactions(); }
    };
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
  // Titles (js/titles.js): the ladder, where this force stands, and the envoy on the way.
  function titleSection(me) {
    let html = `<h3>작위</h3>`;
    if (!S.titlesOpen(state)) html += `<p class="hint">한 왕조가 없으므로 칙사는 오지 않고, 군주가 조건을 채우는 즉시 스스로 작위를 칭합니다. 같은 작위를 여럿이 가질 수 있습니다.</p>`;
    if (me) {
      const f = state.forces[me];
      const w = S.wholeLands(state, me);
      html += `<p>지금 작위: <b>${S.titleName(state, me)}</b>` +
        ` <span class="hint">(성 ${S.citiesOf(state, me).length}개, 온전한 주 ${w.provs.map((p) => S.PROVINCES[p]).join("·") || "없음"}, 온전한 지방 ${w.regions.map((r) => S.REGIONS[r].name).join("·") || "없음"}, 군주 명성 ${state.officers[f.ruler].fame || 0})</span></p>` +
        (f.titleDue ? `<p>헌제의 칙사가 ${S.TITLES[S.titleRank(f.titleDue.key)].name} 작위를 가지고 오는 중입니다. (${Math.max(0, f.titleDue.at - S.today(state))}일 뒤)</p>` : "");
    }
    html += `<div class="otable titles"><table><tr><th>작위</th><th>조건</th><th>이름</th><th>지금 받은 세력</th></tr>` +
      S.TITLES.slice().reverse().map((t) => {
        const who = Object.values(state.forces).filter((f) => f.alive && !f.emperor && S.titleKey(state, f.id) === t.key)
          .map((f) => (S.titleName(state, f.id) === t.name ? f.name : `${f.name}(${S.titleName(state, f.id)})`));
        return `<tr${me && !state.forces[me].emperor && S.titleKey(state, me) === t.key ? ' class="me"' : ""}><td><b>${t.name}</b></td><td>${t.need}</td><td class="hint">${t.named}</td><td>${who.join(", ") || "-"}</td></tr>`;
      }).join("") + `</table></div>` +
      `<p class="hint">조건을 채운 지 한 달 뒤에 헌제의 칙사가 이르러 작위를 내립니다. 그때 조건을 잃었으면 그냥 돌아갑니다. 작위 이름은 칙사가 떠날 때의 수도와 주로 정해집니다. 받은 작위는 땅을 잃어도 남고, 군주가 바뀌어도 세력이 이어받습니다. ` +
      `황제는 선양이나 칭제로만 오르며, 나라 이름은 공의 이름을 따릅니다(중 원술, 위 조조, 오 손권, 촉한 유비는 그 이름). 한조중시 군주는 한 왕조가 끝난 뒤 한을 잇고, 한 황제는 여럿일 수 있습니다.</p>`;
    return html;
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
    html += titleSection(me);
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
    UI.openModal(title("시스템") +
      `<div class="sysmenu">` +
      `<button data-action="saveMenu"><b>저장</b><span>슬롯을 골라 지금 상태를 기록합니다. 매달 1일에는 자동 저장 칸에 저절로 저장됩니다.</span></button>` +
      `<button data-action="loadMenu" data-from="game"><b>불러오기</b><span>저장해 둔 게임을 골라 불러옵니다.</span></button>` +
      `<button data-action="clockSettings"><b>시간 설정</b><span>배속과 자동 일시정지를 정합니다.</span></button>` +
      (state.playerForce ? `<button data-action="auto"><b>세력 위임</b><span>${state.auto
        ? "지금 세력 전체를 맡겨 두었습니다. 누르면 다시 직접 다스립니다."
        : "세력 전체를 컴퓨터에 맡깁니다. 도시와 군대, 외교와 황실, 포로 처우까지 알아서 하고, 시간이 저절로 멈추지 않습니다. 언제든 되돌릴 수 있습니다."}</span></button>` : "") +
      `<button data-action="title"><b>타이틀로</b><span>자동 저장한 뒤 메인 메뉴로 돌아갑니다.</span></button>` +
      `</div>` + closeBar);
  };

  UI.showEnd = function () {
    const o = state.over;
    const me = S.playerChar(state);
    if (me) {
      // The character's ending (js/persona.js).
      const won = o.result === "win" || o.mine;
      const head = o.reason === "dead" ? "끝" : won ? "천하통일" : "패배";
      const line = o.reason === "dead" ? `${state.year}년 ${state.month}월, ${o.who || me.name}의 뒤를 이을 사람이 없습니다.`
        : won ? `${state.year}년 ${state.month}월, ${state.forces[o.force].name}군이 천하를 통일했습니다!` + (state.forces[o.force].ruler !== me.id ? ` ${S.josa(me.name, "은", "는")} 그 신하로서 공적 ${me.merit || 0}을 남겼습니다.` : "")
        : `${state.forces[o.force].name}군이 천하를 통일했습니다.`;
      UI.openModal(`<div class="title-hero end"><h1>${head}</h1><p>${line}</p></div><div class="footer"><button class="primary" data-action="title">타이틀로</button></div>`);
      UI.clearSave();
      return;
    }
    const win = o.result === "win" && (o.force === state.playerForce || !state.playerForce);
    UI.openModal(`<div class="title-hero end"><h1>${win ? "천하통일" : "패배"}</h1><p>${!state.playerForce
      ? `${state.year}년 ${state.month}월, ${state.forces[o.force].name}군이 천하를 통일했습니다.`
      : win
      ? `${state.year}년 ${state.month}월, ${state.forces[state.playerForce].name}군이 천하를 통일했습니다!`
      : o.result === "win" ? `${state.forces[o.force].name}군이 천하를 통일했습니다.` : "모든 도시를 잃었습니다."}</p></div>` +
      `<div class="footer"><button class="primary" data-action="title">타이틀로</button></div>`);
    UI.clearSave();
  };

  Object.assign(UI.actions, {
    forces: () => state && UI.showForces(),
    cities: () => state && UI.showCities(),
    officers: () => state && UI.showOfficers(),
    factions: () => state && UI.showFactions(),
    offices: () => state && UI.showOffices(),
    toggleRaids: () => { const f = state.forces[state.playerForce]; if (f && UI.result(S.setRaids(state, f.id, !!f.noRaids))) UI.showOffices(); },
    raidScold: (d) => { UI.result(S.answerRaid(state, +d.id, true)); UI.showRaids(); },
    raidPass: (d) => { UI.result(S.answerRaid(state, +d.id, false)); UI.showRaids(); },
    appoint: (d) => {
      const el = $("#off_" + d.key);
      if (!el || !el.value) return;
      if (UI.result(S.appoint(state, state.playerForce, d.key, el.value))) UI.showOffices();
    },
    dismissOffice: (d) => {
      const h = S.holder(state, state.playerForce, d.key);
      if (!h || !confirm(`${S.josa(h.name, "을", "를")} ${S.officeDef(d.key).name}에서 파면할까요? 그는 불만을 품습니다.`)) return;
      if (UI.result(S.dismiss(state, state.playerForce, d.key))) UI.showOffices();
    },
    officeYes: (d) => { UI.result(S.answerOfficeAsk(state, +d.id, true)); if ($("#off_chancellor")) UI.showOffices(); else UI.showOfficeAsks(); },
    officeNo: (d) => { UI.result(S.answerOfficeAsk(state, +d.id, false)); if ($("#off_chancellor")) UI.showOffices(); else UI.showOfficeAsks(); },
    diplomacy: () => state && UI.showDiplomacy(),
    court: () => state && UI.showCourt(),
    council: () => state && UI.showCouncil(),
    proposalYes: (d) => { UI.result(S.answerProposal(state, +d.id, true)); UI.showCouncil(); },
    proposalNo: (d) => { UI.result(S.answerProposal(state, +d.id, false)); UI.showCouncil(); },
    tech: () => state && UI.showTech(),
    system: () => state && UI.showSystem(),
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
      if (f.kind === "submit" && !confirm(`${state.forces[d.force].name}군에 귀순을 청할까요? 받아들여지면 세력이 사라지고 군주는 그 신하가 됩니다.`)) return;
      const opts = f.kind === "tribute" ? { gold: f.gold } : f.kind === "swap" ? { give: f.give, take: f.take, gold: f.ransom } : { months: f.months };
      if (UI.result(S.sendEnvoy(state, state.playerForce, d.force, f.oid, f.kind, opts))) UI.showDiplomacy();
    },
    answerEnvoy: (d) => {
      const e = (state.envoys || []).find((x) => x.id === +d.id);
      if (d.yes && e && e.kind === "urge" && !confirm(`${state.forces[e.from].name}군에 항복할까요? 세력이 사라지고 군주는 그 신하가 됩니다.`)) return;
      const r = S.answerEnvoy(state, +d.id, !!d.yes);
      if (!UI.result(r)) return;
      if (S.playerRules(state)) UI.showDiplomacy(); else UI.closeModal();
      UI.renderAll();
    },
    breakPact: (d) => {
      if (!confirm(`${state.forces[d.force].name}군과의 동맹을 파기할까요? 내 모든 도시의 치안이 5 떨어지고 우호도가 크게 떨어집니다.`)) return;
      if (UI.result(S.breakPact(state, state.playerForce, d.force))) UI.showDiplomacy();
    },
  });
})(globalThis.SAM = globalThis.SAM || {});
