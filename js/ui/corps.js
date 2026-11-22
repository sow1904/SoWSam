// The corps window (군단): the force's corps, and making, changing and
// dissolving them, and ordering one to march (js/corps.js).
(function (S) {
  const UI = S.UI, $ = UI.$;
  let state = null;
  UI.bind((s) => { state = s; });
  const title = (text) => `<h2>${text}</h2>`;
  const canRule = () => !!state.playerForce && S.playerRules(state) && !S.spectating(state);
  const AIMS = () => S.WAR_AIMS;
  // The corps' number banner, coloured by its phase (S.CORPS.colors).
  UI.corpsFlag = (n) => `<span class="corpsflag c${n || 1}" title="${S.corpsName(n)} · ${S.CORPS.phases[(n || 1) - 1]}">${n || 1}</span>`;
  // Beside a force's banner: only for a force cut into more than one corps.
  UI.corpsFlagOf = (place) => (place && place.owner && S.corpsList(state, place.owner).length > 1 ? UI.corpsFlag(S.placeCorps(state, place)) : "");

  function status(fid, k) {
    const out = [];
    if (S.onCampaign(state, fid, k.n)) out.push("출진 중");
    const left = (k.rec.brokenUntil || 0) - S.monthsElapsed(state);
    if (left > 0) out.push(`<span class="bad">꺾임 (${left}개월)</span>`);
    if (k.rec.war) out.push(`${AIMS()[k.rec.war.aim]}: ${S.forceName(state, k.rec.war.foe)}`);
    return out.join(" · ") || "-";
  }

  UI.showCorps = function () {
    const fid = UI.viewForce();
    if (!fid || !state.forces[fid]) return;
    const rule = fid === state.playerForce && canRule();
    const rows = S.corpsList(state, fid).map((k) => {
      const seat = state.cities[k.seat];
      const head = state.officers[k.head];
      const cities = S.corpsCities(state, fid, k.n);
      const btn = rule && k.n > 1
        ? `<button data-action="corpsEdit" data-n="${k.n}">관리</button> <button data-action="corpsOrder" data-n="${k.n}">출진 명령</button>` : "";
      return `<tr><td>${UI.corpsFlag(k.n)} <b>${S.corpsName(k.n)}</b></td><td>${head ? head.name : "-"}${k.n === 1 ? " <span class=\"hint\">(군주)</span>" : ""}</td>` +
        `<td>${seat ? `<a data-action="goto" data-city="${seat.id}">${seat.name}</a>` : "-"}</td>` +
        `<td>${k.n === 1 ? (fid === state.playerForce && !S.spectating(state) ? "직접" : "군주") : S.CORPS.policies[k.policy]}</td>` +
        `<td>${cities.length}</td><td>${seat ? seat.troops.toLocaleString() : "-"}</td><td>${status(fid, k)}</td><td>${btn}</td></tr>`;
    }).join("");
    const homeless = fid === state.playerForce ? S.homelessArmies(state, fid) : [];
    UI.openModal(title(fid === state.playerForce ? "군단" : `${S.forceName(state, fid)} 군단`) +
      `<p class="hint">세력의 땅을 군단으로 나눕니다. 1군단은 군주가 직접 이끌고 수도가 치소입니다. 다른 군단은 도독에게 모두 맡깁니다. ` +
      `군단 도시의 병사·군량·금은 군단 치소로 모이고(치소는 남는 금의 절반을 수도로 보냅니다), 군단의 주력군은 치소에 모여 방침대로 싸웁니다. ` +
      `적의 침공은 그 땅의 군단이 맞섭니다. 빼앗은 도시는 빼앗은 군단에 들어갑니다.</p>` +
      `<table><tr><th>군단</th><th>도독</th><th>치소</th><th>방침</th><th>도시</th><th>주력군</th><th>상태</th><th></th></tr>${rows}</table>` +
      (homeless.length ? `<p class="hint">해체한 군단의 주력군 ${homeless.reduce((s, m) => s + m.troops, 0).toLocaleString()}명이 수도로 가고 있습니다. 새 군단을 세우면 이 병사들을 그 군단으로 돌릴 수 있습니다.</p>` : "") +
      `<div class="footer">${rule ? `<button data-action="corpsEdit" data-n="0">새 군단 세우기</button>` : ""}<button class="primary" data-action="close">닫기</button></div>`);
  };

  // Make (n = 0) or change a corps.
  UI.showCorpsEdit = function (n) {
    const fid = state.playerForce;
    const f = state.forces[fid];
    const k = n ? (f.corps || []).find((x) => x.n === n) : null;
    if (n && !k) return UI.showCorps();
    const capId = S.capitalOf(state, fid);
    const mine = S.citiesOf(state, fid).filter((c) => c.id !== capId);
    // Cities by province: those of this corps or of 1군단 may be ticked.
    const byProv = {};
    for (const c of mine) (byProv[c.prov] = byProv[c.prov] || []).push(c);
    const cityRows = Object.entries(byProv).map(([p, list]) => {
      const boxes = list.map((c) => {
        const at = S.cityCorps(state, c);
        const other = at !== 1 && at !== n;
        return `<label${other ? ' class="hint"' : ""}><input type="checkbox" class="corpsCity" data-prov="${p}" value="${c.id}"${at === n && n ? " checked" : ""}${other ? " disabled" : ""}> ` +
          `${c.name} <span class="hint">${other ? S.corpsName(at) : `병${Math.round(c.troops / 100) / 10}천`}</span></label>`;
      }).join("");
      return `<div class="row top"><label><button data-action="corpsProv" data-prov="${p}" title="이 주의 도시를 모두 넣거나 뺍니다">${S.PROVINCES[p]}</button></label><div class="checks">${boxes}</div></div>`;
    }).join("");
    const seatOpts = mine.filter((c) => { const at = S.cityCorps(state, c); return at === 1 || at === n; })
      .map((c) => `<option value="${c.id}"${k && k.seat === c.id ? " selected" : ""}>${c.name}</option>`).join("");
    const heads = Object.values(state.officers).filter((o) => S.canHeadCorps(state, fid, o, n || -1))
      .sort((a, b) => b.cmd - a.cmd);
    const headOpts = heads.map((o) => `<option value="${o.id}"${k && k.head === o.id ? " selected" : ""}>${o.name} — 용${o.cmd} 무${o.war} 정${o.pol} 충${Math.round(o.loyalty || 0)} · ${S.placeName(state, o.city)}</option>`).join("");
    const pol = Object.entries(S.CORPS.policies).map(([key, label]) => `<option value="${key}"${(k ? k.policy : "war") === key ? " selected" : ""}>${label}</option>`).join("");
    const homeless = n ? [] : S.homelessArmies(state, fid);
    const armyRows = homeless.length ? `<div class="row top"><label>이동 중인 병사</label><div class="checks">${homeless.map((m) =>
      `<label><input type="checkbox" class="corpsArmy" value="${m.id}" checked> ${S.corpsName(m.fromCorps)}였던 ${m.troops.toLocaleString()}명 <span class="hint">(${S.daysLeft(state, m)}일 뒤 수도)</span></label>`).join("")}</div></div>` : "";
    UI.openModal(title(n ? `${S.corpsName(n)} 관리` : "새 군단 세우기") +
      `<p class="hint">도시를 고르고(주 이름을 누르면 그 주의 도시를 한꺼번에 넣거나 뺍니다), 그 가운데 치소와 도독을 정합니다. 세력 수도는 언제나 1군단입니다.<br>` +
      `방침: <b>전쟁 위임</b> 도독이 상대와 전쟁 목표를 알아서 정합니다 · <b>국지전 위임</b> 국경의 도시 한두 곳을 치는 국지전만 스스로 벌입니다 · <b>방어</b> 스스로 싸움을 걸지 않고 침공에만 맞섭니다. 어느 방침이든 출진 명령은 따릅니다.</p>` +
      cityRows +
      `<div class="row"><label>치소</label><select id="corpsSeat">${seatOpts}</select></div>` +
      `<div class="row"><label>도독</label><select id="corpsHead">${headOpts}</select></div>` +
      `<div class="row"><label>방침</label><select id="corpsPolicy">${pol}</select></div>` +
      armyRows +
      `<div class="footer"><button data-action="corps">돌아가기</button>` +
      (n ? `<button data-action="corpsDissolve" data-n="${n}" title="도시는 1군단으로 돌아가고, 주력군은 수도로 행군합니다">해체</button>` : "") +
      `<button class="primary" data-action="corpsSave" data-n="${n || 0}">${n ? "적용" : "세우기"}</button></div>`);
  };

  UI.showCorpsOrder = function (n) {
    const fid = state.playerForce;
    const list = S.corpsExpeditions(state, fid, n);
    const seat = state.cities[S.corpsSeat(state, fid, n)];
    const rows = list.map((e) => `<tr><td>${e.t.name}</td><td>${S.forceName(state, e.t.owner)}</td><td>${e.ratio}</td><td>${e.troops.toLocaleString()}</td>` +
      `<td>${e.team.map((o) => o.name).join(", ")}</td><td><button data-action="corpsGo" data-n="${n}" data-t="${e.t.id}">출진</button></td></tr>`).join("");
    UI.openModal(title(`${S.corpsName(n)} 출진 명령`) +
      `<p class="hint">${seat ? seat.name : "치소"}의 주력군이 출진합니다. 도독이 데려갈 무장과 병력을 정합니다. 승산은 1을 넘으면 유리합니다.</p>` +
      (rows ? `<table><tr><th>목표</th><th>세력</th><th>승산</th><th>병력</th><th>무장</th><th></th></tr>${rows}</table>`
        : S.inTruce(state) ? `<p>지금은 모든 세력이 싸움을 멈춘 때라 출진할 수 없습니다.</p>`
        : `<p>지금은 출진할 수 없습니다. 치소의 병력이나 무장이 모자라거나, 이미 출진 중이거나, 주력군이 꺾였거나, 닿는 적이 없습니다.</p>`) +
      `<div class="footer"><button data-action="corps">돌아가기</button><button class="primary" data-action="close">닫기</button></div>`);
  };

  const ticked = (cls) => [...document.querySelectorAll("." + cls)].filter((el) => el.checked && !el.disabled).map((el) => el.value);
  Object.assign(UI.actions, {
    corps: () => state && UI.showCorps(),
    corpsEdit: (d) => UI.showCorpsEdit(+d.n),
    corpsOrder: (d) => UI.showCorpsOrder(+d.n),
    corpsProv: (d) => {
      const boxes = [...document.querySelectorAll(`.corpsCity[data-prov="${d.prov}"]`)].filter((el) => !el.disabled);
      const on = !boxes.every((el) => el.checked);
      for (const el of boxes) el.checked = on;
    },
    corpsSave: (d) => {
      const n = +d.n;
      const spec = { cities: ticked("corpsCity"), seat: $("#corpsSeat").value, head: $("#corpsHead").value, policy: $("#corpsPolicy").value };
      const r = n ? S.editCorps(state, state.playerForce, n, spec) : S.formCorps(state, state.playerForce, Object.assign(spec, { armies: ticked("corpsArmy").map(Number) }));
      if (UI.result(r)) UI.showCorps();
    },
    corpsDissolve: (d) => { if (UI.result(S.dissolveCorps(state, state.playerForce, +d.n))) UI.showCorps(); },
    corpsGo: (d) => { if (UI.result(S.orderCorps(state, state.playerForce, +d.n, d.t))) UI.showCorps(); },
  });
})(globalThis.SAM = globalThis.SAM || {});
