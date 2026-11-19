// The windows that give a command: who carries it out, where to, with what.
(function (S) {
  const UI = S.UI, $ = UI.$;
  const { fmt, signed } = UI;
  let state = null;
  UI.bind((s) => { state = s; });

  // A window's parts.
  const title = (text) => `<h2>${text}</h2>`;
  const footer = (go) => `<div class="footer"><button data-action="close">취소</button>${go || ""}</div>`;
  UI.winTitle = title;

  function checkList(list, max) {
    return `<div class="row top"><label>무장</label><div class="checks">${list.map((o, i) =>
      `<label><input type="checkbox" class="pickOfficer" value="${o.id}"${max && i === 0 ? " checked" : ""}> ` +
      `${o.name} <span class="hint">무${o.war} 용${o.cmd} 군${o.strat}</span></label>`).join("")}</div></div>`;
  }
  function rangeRow(id, label, max, value) {
    return `<div class="row"><label>${label}</label><input type="range" id="${id}" min="0" max="${max}" step="1" value="${value || 0}">` +
      `<input type="number" id="${id}N" min="0" max="${max}" value="${value || 0}"></div>`;
  }
  const checked = () => [...document.querySelectorAll(".pickOfficer:checked")].map((x) => x.value);
  const num = (id) => +$("#" + id).value;

  // Unit types (병종): one number box per type a place can send out.
  function unitRows(prefix, place, part) {
    const have = S.available(place);
    const ids = S.mixIds(S.garrisonUnit(place)).filter((k) => have[k] > 0);
    return ids.map((k) => rangeRow(prefix + k, `${S.unitName(k)} <span class="hint">(${S.UNIT_LINES[S.unitOf(k).line]})</span>`, have[k], Math.floor(have[k] * part))).join("");
  }
  const unitPick = (prefix) => {
    const out = {};
    for (const el of document.querySelectorAll(`input[type=range][id^="${prefix}"]`)) if (+el.value > 0) out[el.id.slice(prefix.length)] = +el.value;
    return out;
  };
  const UNIT_HINT = UI.HELP.units;

  const SIMPLE = {
    train: { title: "훈련", stat: "cmd", run: (o, c) => S.drill(state, o, c), preview: (o) => `훈련 +${S.preview.train(o)}` },
    woo: {
      title: "회유", stat: "speech", run: (o, c) => S.woo(state, o, c),
      preview: (o) => `호족 협력 +${S.wooPreview(o)} (금 ${S.COST.woo})`,
    },
    stake: { title: "녹각", stat: "cmd", run: (o, c) => S.stake(state, o, c), preview: () => `녹각 100 (목재 ${S.STAKES.wood})` },
    search: { title: "탐색", stat: "wit", run: (o, c) => S.search(state, o, c), preview: (o) => `인재 발견률 ${S.searchChance(o)}%` },
  };

  function officerPicker(head, desc, list, action, extra) {
    UI.openModal(title(head) + `<p class="hint">${desc}</p>` +
      UI.officerTable(list, { pick: action, extraHead: "효과", extra }) + footer(), true);
  }

  const commands = (UI.commands = {
    draft() {
      const c = state.cities[UI.selected];
      const units = S.raisableAt(state, c);
      const cur = UI.pending && UI.pending.cmd === "draft" && units.includes(UI.pending.unit) ? UI.pending.unit : units[0];
      UI.pending = { cmd: "draft", unit: cur };
      const list = S.idle(state, c.id).sort((a, b) => b.cmd - a.cmd);
      const rows = units.map((k) => `<tr><td>${S.unitName(k)}${S.unitOf(k).note ? ` <span class="hint">${S.unitOf(k).note}</span>` : ""}</td><td>${S.UNIT_LINES[S.unitOf(k).line]}</td><td>${S.costText(k, 1)}</td><td>${fmt(S.armable(c, k))}</td></tr>`).join("");
      UI.openModal(title("징병") + `<p class="hint">병사는 한 병종으로 뽑고, 한 명마다 아래 자원이 듭니다. 뽑는 수는 무장의 용병, 병역 인구, 그리고 이 도시의 자원으로 무장시킬 수 있는 수 가운데 가장 작은 값입니다. ` +
        `자원은 다른 도시에서 수송해 올 수 있습니다. 특수 병종은 그 지역의 도시에서만 뽑습니다(연노병과 보도병은 연구한 뒤 어디서나).</p>` +
        `<table><tr><th>병종</th><th>계열</th><th>1명당</th><th>무장 가능</th></tr>${rows}</table>` +
        `<div class="row"><label>뽑을 병종</label><select id="dfUnit">${units.map((k) => `<option value="${k}"${k === cur ? " selected" : ""}>${S.unitName(k)}</option>`).join("")}</select></div>` +
        UI.officerTable(list, { pick: "doDraft", extraHead: "효과", extra: (o) => {
          const n = Math.min(S.preview.draft(state, c, o), S.armable(c, cur));
          return `${S.unitName(cur)} +${n} (금 ${Math.ceil(n * S.COST.draftPerTroop)})`;
        } }) + footer(), true);
      UI.modalOnInput = () => {
        const v = $("#dfUnit") && $("#dfUnit").value;
        if (v && v !== UI.pending.unit) { UI.pending.unit = v; commands.draft(); }
      };
    },
    simple(cmd) {
      const c = state.cities[UI.selected];
      const def = SIMPLE[cmd];
      const list = S.idle(state, c.id).sort((a, b) => b[def.stat] - a[def.stat]);
      UI.pending = { cmd };
      officerPicker(def.title, `실행할 무장을 고르세요. ${S.STAT_NAMES[def.stat]} 능력이 높을수록 효과가 큽니다.`, list, "doSimple",
        (o) => def.preview(o, c));
    },
    research() {
      const c = state.cities[UI.selected];
      const fid = c.owner;
      const open = Object.keys(S.TECH).filter((k) => !S.techBlock(state, fid, k));
      if (!open.length) { UI.toast("지금 연구할 수 있는 기술이 없습니다."); return; }
      const list = S.idle(state, c.id).sort((a, b) => b.wit - a.wit);
      UI.openModal(title("연구") + `<p class="hint">무장 한 명이 한 달 동안 금 ${S.TECH_COST}을 들여 기술을 연구합니다. 지략이 높을수록 많이 나아갑니다. ` +
        `기술은 세력 전체의 것입니다. 군사 기술은 단계가 오르면 그 계열의 상위 병종을 쓸 수 있고, 내정 기술은 단계마다 생산이나 인구가 늘어납니다. 마정은 목장의 도시, 염철은 소금이 나는 도시가 있어야 연구할 수 있고, 그런 도시를 모두 잃으면 효과가 멈춥니다.</p>` +
        UI.techTable(fid) +
        `<div class="row"><label>연구할 기술</label><select id="rsField">${S.TECH_GROUPS.map((g) => { const ks = open.filter((k) => S.TECH[k].group === g); return ks.length ? `<optgroup label="${g}">${ks.map((k) => `<option value="${k}">${S.TECH[k].name}</option>`).join("")}</optgroup>` : ""; }).join("")}</select></div>` +
        UI.officerTable(list, { pick: "doResearch", extraHead: "진척", extra: (o) => `+${S.researchPoints(o, state)}` }) + footer(), true);
    },
    recruit() {
      const c = state.cities[UI.selected];
      const targets = S.visibleFree(state, c.id).concat(S.captivesIn(state, c.id, c.owner));
      if (!targets.length) { UI.toast("이 도시에는 등용할 인재가 없습니다. 「탐색」으로 재야 인재를 찾아보세요."); return; }
      UI.openModal(title("등용") + `<p class="hint">설득할 대상을 고르세요.</p>` +
        UI.officerTable(targets, { pick: "recruitTarget", extraHead: "신분", extra: (o) => (o.status === "free" ? "재야" : "포로") + (S.liegeOf(state, o) ? ` · ${S.josa(state.officers[o.liege].name, "을", "를")} 기다림` : S.recruitBar(state, c.owner, o) ? " · 섬기지 않음" : "") }) + footer(), true);
    },
    captives() { UI.showCaptives(null); },
    post(kind) {
      const c = state.cities[UI.selected];
      const def = S.POSTS[kind];
      const cur = c.posts[kind];
      const officers = S.serving(state, c.id)
        .filter((o) => !o.done || (cur && cur.type === "officer" && cur.id === o.id))
        .sort((a, b) => def.stat(b) - def.stat(a));
      const effect = (ab) => (def.policy ? UI.tuntianText(ab) : signed(S.postGain(kind, ab)));
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
      UI.openModal(title(`${def.label} 담당 임명`) +
        `<p class="hint">${intro} 무장은 봉급이 없지만 담당하는 동안 다른 명령을 할 수 없습니다. ` +
        `관리는 매달 봉급이 나갑니다. 능력 기준은 ${def.statLabel}입니다.</p>` +
        `<table><tr><th>담당</th><th>능력</th><th>월 변화</th><th>봉급</th><th></th></tr>` +
        clerkRows + officerRows +
        `<tr class="pick" data-action="doPost" data-kind="${kind}" data-empty="1"><td>${def.policy ? "실시하지 않기" : "공석으로 두기"}</td><td>-</td>` +
        `<td>${def.policy ? "호족 세력이 서서히 회복" : signed(S.postPenalty(c, kind))}</td><td>-</td><td>${!cur ? "현재" : ""}</td></tr></table>` + footer());
    },
    reward() {
      const c = state.cities[UI.selected];
      const list = S.serving(state, c.id).filter((o) => !S.isRuler(state, o)).sort((a, b) => a.loyalty - b.loyalty);
      if (!list.length) { UI.toast("포상할 무장이 없습니다."); return; }
      officerPicker("포상", `금 ${S.josa(S.COST.reward, "을", "를")} 하사해 충성을 올립니다. 행동력은 쓰지 않습니다. (보유 금 ${c.gold})`, list, "doReward",
        (o) => `충성 ${o.loyalty}`);
    },
    move() {
      const c = S.place(state, UI.selected);
      const dist = S.reachable(state, c.id, "cargo", true);
      const dests = Object.keys(dist).sort((a, b) => dist[a] - dist[b]);
      if (!dests.length) { UI.toast("아군 영토로 이어진 다른 도시가 없습니다."); return; }
      UI.openModal(title("수송") + `<p class="hint">무장이 병사·금·군량·자원을 이끌고 아군 영토를 지나 다른 아군 도시로 갑니다. ` +
        `수송대는 하루 ${S.SPEED.cargo}km를 가고, 짐 없이 무장만 보내면 하루 ${S.SPEED.officer}km를 갑니다. 보낸 병사와 물자는 도착할 때까지 어느 도시에도 없습니다. ` +
        `호위 병사는 가는 동안 하루 ${S.FIELD_FOOD}명당 군량 1을 먹고, 실어 가는 군량은 하루에 100분의 1씩 줄어듭니다(험한 길에서는 더).</p>` +
        `<div class="row"><label>목적지</label><select id="mvDest">${dests.map((d) => `<option value="${d}">${UI.placeLabel(d)} (${dist[d]}일)</option>`).join("")}</select></div>` +
        checkList(S.idle(state, c.id)) +
        rangeRow("mvTroops", "병사", S.marchable(c)) + rangeRow("mvGold", "금", c.gold) + rangeRow("mvFood", "군량", c.food) +
        (c.res ? S.RES_KEYS.map((k) => rangeRow("mv_" + k, S.RESOURCES[k], c.res[k])).join("") : "") +
        (c.retainers ? `<p class="hint">호족 사병 ${c.retainers}명은 이동하지 않습니다.</p>` : "") +
        `<div class="row"><label>가는 길</label><span id="mvEst" class="est"></span></div>` +
        footer(`<button class="primary" data-action="doMove">수송</button>`));
      UI.modalOnInput = updateMove;
      updateMove();
    },
    trade() {
      const c = state.cities[UI.selected];
      if (S.besieged(state, c.id)) { UI.toast("포위당한 도시에는 상인이 들어오지 못합니다."); return; }
      const p = UI.pending && UI.pending.cmd === "trade" ? UI.pending : { cmd: "trade", good: "horse", sell: false };
      UI.pending = p;
      const price = (k, sell) => S.tradePrice(state, c, k) * (sell ? S.TRADE.sell : 1);
      const per = (v) => (v >= 1 ? `1개에 금 ${v.toFixed(2)}` : `금 1에 ${(1 / v).toFixed(1)}개`);
      const rows = S.TRADE_GOODS.map((k) => `<tr><td>${S.goodName(k)}</td><td>${fmt(S.goodStock(c, k))}</td>` +
        `<td>${per(price(k, false))}</td><td>${per(price(k, true))}</td></tr>`).join("");
      const max = S.tradeMax(state, c, p.good, p.sell);
      UI.openModal(title("교역") + `<p class="hint">상인에게서 군량, 목재, 철, 말을 사거나 팝니다. 무장의 명령을 쓰지 않습니다. ` +
        `한 달에 거래할 수 있는 양은 이 도시의 상업에 비례합니다(금으로 쳐서 상업 × ${S.TRADE.volume}). 팔 때는 살 때 값의 절반을 받습니다. ` +
        `말은 말이 나는 고장(유주, 병주, 량주 등)에서 멀수록 비싸고, 목재와 철은 그것이 특산인 주에서 쌉니다.</p>` +
        `<table><tr><th>물건</th><th>보유</th><th>살 때</th><th>팔 때</th></tr>${rows}</table>` +
        `<div class="stats" style="margin-top:8px">${UI.stat("보유 금", c.gold.toLocaleString())}${UI.stat("이달 남은 거래", `금 ${S.tradeRoom(state, c).toLocaleString()}어치`)}</div>` +
        `<div class="row"><label>물건</label><select id="trGood">${S.TRADE_GOODS.map((k) => `<option value="${k}"${k === p.good ? " selected" : ""}>${S.goodName(k)}</option>`).join("")}</select>` +
        `<select id="trDir"><option value="buy"${p.sell ? "" : " selected"}>산다</option><option value="sell"${p.sell ? " selected" : ""}>판다</option></select></div>` +
        rangeRow("trAmount", "수량", max, 0) +
        `<div class="row"><label>값</label><span id="trEst" class="est"></span></div>` +
        `<div class="footer"><button data-action="close">닫기</button><button class="primary" data-action="doTrade">${p.sell ? "판다" : "산다"}</button></div>`);
      UI.modalOnInput = () => {
        const good = $("#trGood").value, sell = $("#trDir").value === "sell";
        if (good !== p.good || sell !== p.sell) { p.good = good; p.sell = sell; commands.trade(); return; }
        const n = num("trAmount");
        const gold = n * price(p.good, p.sell);
        $("#trEst").innerHTML = n ? `${S.goodName(p.good)} ${fmt(n)} → 금 ${p.sell ? "+" + Math.floor(gold) : "-" + Math.ceil(gold)}` : `최대 ${fmt(max)}`;
      };
      UI.modalOnInput();
    },
    relocate() {
      const c = S.place(state, UI.selected);
      const dist = S.reachable(state, c.id, "officer", true);
      const dests = Object.keys(dist).sort((a, b) => dist[a] - dist[b] || S.placeName(state, a).localeCompare(S.placeName(state, b)));
      if (!dests.length) { UI.toast("아군 영토로 이어진 다른 도시가 없습니다."); return; }
      const idle = S.idle(state, c.id);
      if (!idle.length) { UI.toast("이동할 수 있는 무장이 없습니다."); return; }
      UI.openModal(title("이동") + `<p class="hint">무장만 아군 영토로 이어진 도시로 보냅니다. 하루 ${S.SPEED.officer}km를 가며, 길 위에 있는 동안에는 명령할 수 없습니다.</p>` +
        `<div class="row"><label>목적지</label><select id="rlDest">${dests.map((d) =>
          `<option value="${d}">${UI.placeLabel(d)} (${dist[d]}일 · 무장 ${S.serving(state, d).length})</option>`).join("")}</select></div>` +
        checkList(idle) +
        footer(`<button class="primary" data-action="doRelocate">이동</button>`));
    },
    build() {
      const c = state.cities[UI.selected];
      const sites = S.buildSites(state, c.id);
      const who = S.builders(state, c.id);
      if (!sites.length) { UI.toast("이 도시에서 쌓을 수 있는 터가 없습니다."); return; }
      if (!who.length) { UI.toast(`축성 특기가 있는 무장이 이 도시에 없습니다. (${Object.keys(S.SKILLS).filter((n) => S.hasSkill({ name: n }, "축성")).join(", ")})`); return; }
      UI.openModal(title("축성") + `<p class="hint">축성 특기가 있는 무장이 길 위의 터에 관문이나 요새를 쌓습니다. 금 ${S.BUILD_COST}이 들고 ${S.BUILD_DAYS}일이 걸리며, ` +
        `그동안 그 무장은 다른 명령을 할 수 없습니다. 완성되면 병사를 보내 지키게 하십시오. (보유 금 ${c.gold})</p>` +
        `<div class="row"><label>터</label><select id="bdSite">${sites.map((f) => `<option value="${f.id}">${f.name} (${S.FORT_KINDS[f.kind]}, ${f.road.map((id) => state.cities[id].name).join("–")})</option>`).join("")}</select></div>` +
        UI.officerTable(who, { pick: "doBuild", extraHead: "", extra: () => "쌓기" }) + footer(), true);
    },
    scheme() {
      const c = state.cities[UI.selected];
      const targets = S.schemeTargets(state, c.id);
      if (!targets.length) { UI.toast("계략을 걸 인접한 적 도시가 없습니다. 동맹 세력과 공백지는 대상이 아닙니다."); return; }
      UI.openModal(title("계략") + `<p class="hint">실행 무장의 모략과 대상 도시에서 지략이 가장 높은 무장이 겨룹니다. ` +
        `유언비어는 금 ${S.COST.rumor}, 이간은 금 ${S.COST.discord}이 듭니다. (보유 금 ${c.gold})</p>` +
        `<div class="row"><label>계략</label><select id="scKind"><option value="rumor">유언비어 — 치안·호족 협력 하락</option>` +
        `<option value="discord">이간 — 무장의 충성 하락</option></select></div>` +
        `<div class="row"><label>대상 도시</label><select id="scCity">${targets.map((t) =>
          `<option value="${t.id}">${t.name} (${S.forceName(state, t.owner)})</option>`).join("")}</select></div>` +
        `<div class="row" id="scTargetRow"><label>대상 무장</label><select id="scTarget"></select></div>` +
        `<div id="scInfo" class="hint"></div><div id="scList"></div>` + footer(), true);
      UI.pending = { schemeCity: null };
      UI.modalOnInput = updateScheme;
      updateScheme();
    },
    relieve() {
      const c = S.place(state, UI.selected);
      if (S.besieged(state, c.id)) { UI.toast("포위당한 곳에서는 군대를 내보낼 수 없습니다."); return; }
      const ways = S.reliefTargets(state, c.id);
      if (!ways.length) { UI.toast("원군을 보낼 수 있는, 포위당한 아군 도시나 거점이 없습니다."); return; }
      if (S.marchable(c) < S.MIN_SORTIE_TROOPS) { UI.toast(`보낼 수 있는 병사가 ${S.MIN_SORTIE_TROOPS}명 이상 있어야 합니다.`); return; }
      const idle = S.idle(state, c.id).sort((a, b) => b.cmd + b.war - a.cmd - a.war);
      UI.openModal(title("원군") + `<p class="hint">포위당한 아군 도시나 거점으로 원군을 보냅니다. 원군은 도착하면 성 밖에서 포위군과 싸우고, ` +
        `포위군의 보급로를 끊거나 군량고를 태우려 합니다. 원군이 있는 동안 포위군은 병력을 나눠야 해서 성을 덜 몰아칩니다. ` +
        `포위가 풀리면 원군은 성에 들어갑니다. 군략·모략이 높은 무장은 보급을 끊는 데, 용병·무력이 높은 무장은 싸우는 데 유리합니다.</p>` +
        `<div class="row"><label>목표</label><select id="rlfTarget">${ways.map((w) => {
          const b = S.battleOf(state, w.battle);
          return `<option value="${w.id}">${UI.placeLabel(w.id)} (포위군 ${S.forceName(state, b.att.force)} ${S.unitName(b.att.unit)} ${b.att.troops}명, ${b.day}일째)</option>`;
        }).join("")}</select></div>` +
        checkList(idle, S.MAX_SORTIE_OFFICERS) +
        unitRows("rlfU_", c, 0.7) +
        `<div class="row"><label>전망</label><span id="rlfEst" class="est"></span></div>` +
        footer(`<button class="primary" data-action="doRelieve">원군 출발</button>`));
      UI.modalOnInput = updateRelief;
      updateRelief();
    },
    attack() {
      const c = S.place(state, UI.selected);
      if (S.besieged(state, c.id)) { UI.toast("포위당한 곳에서는 출진할 수 없습니다. 다른 도시에서 원군을 보내야 합니다."); return; }
      const targets = S.attackTargets(state, c.id).map((w) => w.id);
      if (!targets.length) { UI.toast("길로 이어진 적 도시나 거점이 없습니다."); return; }
      if (S.marchable(c) < S.MIN_SORTIE_TROOPS) { UI.toast(`출진 가능한 병사가 ${S.MIN_SORTIE_TROOPS}명 이상 있어야 합니다. 호족 사병은 출진하지 않습니다.`); return; }
      const idle = S.idle(state, c.id).sort((a, b) => b.cmd + b.war - a.cmd - a.war);
      UI.openModal(title("출진") + `<p class="hint">무장은 최대 ${S.MAX_SORTIE_OFFICERS}명입니다. 용병·군략·무력이 가장 높은 무장의 능력이 각각 전투에 반영됩니다. ` +
        `군단은 하루 ${S.SPEED.army}km(기병만이면 ${S.SPEED.cavalry}km, 공성 병기가 섞이면 ${S.SPEED.siege}km)를 행군하고, 도착한 날 그 도시의 병력과 싸웁니다. 군량은 병사 10명당 1에 행군 일수만큼 더 듭니다.</p>` +
        `<div class="row"><label>목표</label><select id="atTarget">${targets.map((d) => {
          const t = S.place(state, d);
          return `<option value="${d}">${UI.placeLabel(d)} (${t.owner || t.troops > 0 ? S.forceName(state, t.owner) : "비어 있음"}, ${S.unitName(S.garrisonUnit(t))} ${t.troops})</option>`;
        }).join("")}</select></div>` +
        `<p class="hint">${UNIT_HINT}</p>` +
        checkList(idle, S.MAX_SORTIE_OFFICERS) +
        unitRows("atU_", c, 0.7) +
        (c.retainers ? `<p class="hint">호족 사병 ${c.retainers}명은 출진하지 않고 성에 남습니다.</p>` : "") +
        `<div class="row"><label>전력</label><span id="atEst" class="est"></span></div>` +
        footer(`<button class="primary" data-action="doAttack">출진</button>`));
      UI.modalOnInput = updateEstimate;
      updateEstimate();
    },
  });

  // The fate of captives. ids: those just taken, each needing an answer (등용
  // with the day's free tries, 포로, 해방 or 참수); with none given, the
  // captives held in the selected place, who can be freed or put to death
  // (recruiting them is then the 등용 command's work).
  // The 한조파 who gave themselves up when we took the emperor's city; the
  // captives of the same fight are asked about after.
  UI.showHanJoined = function (ids, caught) {
    const list = ids.map((id) => state.officers[id]).filter((o) => o && o.force === state.playerForce);
    if (!list.length) { if (caught && caught.length) UI.showCaptives(caught); return; }
    UI.openModal(title("한조파 항복") +
      `<p>헌제가 머무는 성을 차지하자, 한조를 중시하는 ${list.length}명이 포로가 되지 않고 바로 항복해 우리 세력에 합류했습니다.</p>` +
      UI.officerTable(list, { loyalty: true }) +
      `<div class="footer"><button class="primary" data-action="close">확인</button></div>`, true);
    UI.modalOnClose = () => { if (caught && caught.length) setTimeout(() => UI.showCaptives(caught), 0); };
  };
  UI.showCaptives = function (ids) {
    const me = state.playerForce;
    if (ids !== undefined) UI.captives = ids; // null: the selected place's
    const fresh = Array.isArray(UI.captives);
    const list = (fresh ? UI.captives.map((id) => state.officers[id]) : S.captivesIn(state, UI.selected, me))
      .filter((o) => o && o.status === "captive" && o.captor === me);
    if (fresh) UI.captives = list.map((o) => o.id);
    if (!list.length) {
      if (UI.modalOpen()) UI.closeModal();
      else if (!fresh) UI.toast("이곳에는 포로가 없습니다.");
      UI.renderAll();
      return;
    }
    const buttons = (o) => {
      const left = S.captiveTries(state, o), pct = S.persuadeChance(state, o);
      return (fresh && !o.lord ? `<button data-action="captRecruit" data-oid="${o.id}"${left && pct ? "" : " disabled"}>등용 ${pct}% <span class="hint">(${left}번 남음)</span></button>` +
        `<button data-action="captHold" data-oid="${o.id}">포로</button>` : "") +
        (o.begged ? `<button data-action="captSpare" data-oid="${o.id}">살려 준다</button>` : "") +
        `<button data-action="captRelease" data-oid="${o.id}">해방</button>` +
        `<button data-action="captBehead" data-oid="${o.id}">참수</button>`;
    };
    UI.openModal(title(fresh ? "포로 처우" : "포로") +
      `<p class="hint">` + (fresh
        ? `사로잡은 무장을 어떻게 할지 정합니다. 지금은 무장의 명령을 쓰지 않고 한 사람에게 ${S.CAPTIVE_TRIES}번까지 <b>등용</b>을 권할 수 있습니다. 그곳에서 언변이 가장 높은 아군 무장이 설득하고, 매번 새로 주사위를 굴립니다. ` +
          `<b>포로</b>로 두면 그 도시에 가두어 둡니다. 그 뒤로는 「등용」 명령(무장의 한 달 명령)으로 언제든 다시 설득할 수 있고, 「포로」 명령에서 해방하거나 참수할 수 있습니다. `
        : `가두어 둔 포로입니다. 설득은 「등용」 명령으로 합니다(무장의 한 달 명령). 포로는 매달 조금씩 탈출하기도 합니다. `) +
      `<b>해방</b>하면 원래 세력의 가장 가까운 도시로 돌아가고, 그 세력이 멸망했으면 재야가 됩니다. <b>참수</b>하면 죽습니다.</p>` +
      (list.some((o) => o.lord) ? `<p class="hint"><b>군주</b>는 남을 섬기지 않고 가두어 둘 수도 없습니다. 해방하거나 참수해야 하며, 정하지 않고 창을 닫으면 해방합니다. 해방된 군주는 세력이 남아 있으면 돌아가 다시 세력을 이끕니다.</p>` : "") +
      UI.officerTable(list, { loyalty: true, extraHead: "원 소속 · 처우", extra: (o) =>
        `<span class="capt"><span class="hint">${o.lord ? "군주 · " : ""}${o.force && state.forces[o.force] ? S.forceName(state, o.force) : "재야"} · ${S.placeName(state, o.city)}${o.begged ? " · <b>목숨을 구걸함</b>" : ""}${S.liegeOf(state, o) ? ` · <b>옛 주군 ${S.josa(state.officers[o.liege].name, "을", "를")} 기다림</b>` : S.recruitBar(state, me, o) ? " · <b>옛 주군을 기려 섬기지 않음</b>" : ""}</span>${buttons(o)}</span>` }) +
      `<div class="footer"><button class="primary" data-action="close">${fresh ? "나머지는 포로로 둔다" : "닫기"}</button></div>`, true);
    // A ruler left undecided goes free.
    UI.modalOnClose = () => {
      for (const o of list) if (o.status === "captive" && o.captor === me && o.lord) UI.result(S.release(state, o.city, o.id));
    };
  };

  // An offer of peace: who gives what.
  UI.peaceRow = function (o) {
    const me = state.playerForce;
    const other = o.winner === me ? o.loser : o.winner;
    const cities = o.cede.map((id) => state.cities[id] && state.cities[id].name).filter(Boolean);
    const give = !cities.length ? "성을 주고받지 않고" : o.loser === me ? `우리가 ${S.josa(cities.join("·"), "을", "를")} 넘기고` : `${S.josa(S.forceName(state, other), "이", "가")} ${S.josa(cities.join("·"), "을", "를")} 넘기고`;
    return `<p><b>${S.forceName(state, other)}</b>: ${give} ${S.WAR.peace.years}년 동안 서로 치지 않기로 하자고 합니다. ` +
      `<button data-action="peaceYes" data-id="${o.id}">받아들인다</button> <button data-action="peaceNo" data-id="${o.id}">물리친다</button></p>`;
  };
  UI.showPeace = function () {
    const me = state.playerForce;
    const list = (state.peaceOffers || []).filter((o) => o.winner === me || o.loser === me);
    if (!list.length) { if (UI.modalOpen()) UI.closeModal(); UI.renderAll(); return; }
    UI.openModal(title("강화 제의") + list.map((o) => UI.peaceRow(o)).join("") +
      `<p class="hint">${S.WAR.peace.years}년 휴전 동안에는 서로의 성을 칠 수 없고, 이미 나선 군대도 돌아옵니다. 한 달 안에 답하지 않으면 제의는 사라집니다.</p>` +
      `<div class="footer"><button class="primary" data-action="close">나중에 정한다</button></div>`, true);
  };

  // A slander in our court that waits for an answer.
  UI.showSlander = function () {
    const me = state.playerForce;
    const sl = state.forces[me].slander;
    if (!sl) {
      if (UI.modalOpen()) UI.closeModal();
      UI.renderAll();
      return;
    }
    const by = state.officers[sl.by], t = state.officers[sl.target];
    const fac = (o) => { const g = S.factionOf(state, o); return g ? g.name : "무파벌"; };
    const row = (o, role) => `<tr><td>${role}</td><td><b>${o.name}</b></td><td>${fac(o)}</td><td>${S.placeName(state, o.city)}</td>` +
      `<td>${o.loyalty}</td><td>${Math.round(o.bond || 0)}</td><td>${o.pol}</td><td>${o.speech}</td><td>${S.traitsOf(o).join(" ") || "-"}</td></tr>`;
    UI.openModal(title("참소") +
      `<p>${S.josa(by.name, "이", "가")} ${S.josa(t.name, "을", "를")} 헐뜯으며 딴마음을 품었다고 아룁니다.</p>` +
      `<table class="tbl"><tr><th></th><th>이름</th><th>파벌</th><th>소재</th><th>충성</th><th>유대</th><th>정치</th><th>언변</th><th>성격</th></tr>` +
      row(by, "참소한 사람") + row(t, "참소당한 사람") + `</table>` +
      `<p class="hint">믿으면 ${t.name}의 충성 -${S.STRIFE.hit.loyalty}, 유대 -${S.STRIFE.hit.bond}, 맡은 도시가 있으면 수도로 불러들입니다. ` +
      `물리치면 ${by.name}의 충성 -${S.STRIFE.back.loyalty}, 유대 -${S.STRIFE.back.bond}. 컴퓨터 군주라면 믿을 확률 ${S.believeChance(state, me, by, t)}%.</p>` +
      `<div class="links"><button data-action="slanderYes">믿는다</button> <button data-action="slanderNo">물리친다</button></div>` +
      `<div class="footer"><button class="primary" data-action="close">나중에 정한다</button></div>`, true);
  };

  // Risings of the great families in our cities that wait for an answer.
  UI.showUnrest = function () {
    const me = state.playerForce;
    const list = S.cityList(state).filter((c) => c.owner === me && c.unrest && !S.delegateOf(state, c));
    if (!list.length) {
      if (UI.modalOpen()) UI.closeModal();
      UI.renderAll();
      return;
    }
    const row = (c) => {
      const u = c.unrest;
      return `<tr><td><b>${c.name}</b></td><td>둔전으로 깎인 호족 세력 ${u.cut.toFixed(1)}</td>` +
        `<td><button data-action="unrestWoo" data-cid="${c.id}"${c.gold < u.gold ? " disabled" : ""}>회유 · 금 ${fmt(u.gold)}</button> ` +
        `<span class="hint">(가진 금 ${fmt(Math.round(c.gold))})</span></td>` +
        `<td><button data-action="unrestCrush" data-cid="${c.id}">진압 · 병사 ${fmt(Math.min(c.troops, u.troops))}</button></td></tr>`;
    };
    UI.openModal(title("호족 반발") +
      `<p class="hint">${UI.HELP.unrest}</p>` +
      `<table class="tbl"><tbody>${list.map(row).join("")}</tbody></table>` +
      `<div class="footer"><button class="primary" data-action="close">나중에 정한다</button></div>`, true);
  };

  const edgeLabel = (e) => (e >= 1.15 ? `<span class="good">유리 ×${e.toFixed(2)}</span>` : e <= 0.87 ? `<span class="bad">불리 ×${e.toFixed(2)}</span>` : `비슷함 ×${e.toFixed(2)}`);

  function updateMove() {
    const c = S.place(state, UI.selected);
    const route = S.route(state, c.id, $("#mvDest").value, "cargo");
    if (!route) { $("#mvEst").textContent = "길이 끊겼습니다."; return; }
    const troops = num("mvTroops"), food = num("mvFood");
    const loaded = troops || food || num("mvGold") || ($("#mv_wood") && S.RES_KEYS.some((k) => num("mv_" + k)));
    const days = S.travelDays(route.km, loaded ? "cargo" : "officer");
    const rough = S.pathRough(state, route.path);
    const cost = S.convoyFood(troops, food, days, rough);
    $("#mvEst").innerHTML = `${days}일${rough > 1.05 ? ` · <span class="bad">험로 ×${rough.toFixed(2)}</span>` : ""}` +
      (cost.eaten ? ` · 호위 병사가 군량 ${fmt(cost.eaten)}을 먹음` : "") +
      (cost.lost ? ` · 실은 군량 ${fmt(food)} 가운데 ${fmt(cost.lost)}이 줄어 <b>${fmt(Math.max(0, food - cost.lost))}</b> 도착` : "");
  }

  function updateRelief() {
    const el = $("#rlfEst");
    const ids = checked();
    const way = S.reliefTargets(state, UI.selected).find((w) => w.id === $("#rlfTarget").value);
    if (!way) { el.textContent = "포위가 이미 풀렸습니다."; return; }
    if (!ids.length) { el.textContent = "무장을 골라 주세요."; return; }
    const b = S.battleOf(state, way.battle);
    const t = S.place(state, way.id);
    const team = ids.map((id) => state.officers[id]);
    const besiegers = b.att.officers.map((id) => state.officers[id]).filter((o) => o && o.status === "serving");
    const pc = S.raidChance(team, besiegers, true);
    const unit = unitPick("rlfU_");
    const sent = S.countsTotal(unit);
    if (!sent) { el.textContent = "보낼 병사를 정해 주세요."; return; }
    const ours = sent + t.troops;
    const days = S.travelDays(way.km, S.unitSpeed(unit));
    const edge = S.unitMul(unit, b.att.unit, "field", 1) / S.unitMul(b.att.unit, unit, "field", 1);
    el.innerHTML = `원군 ${fmt(sent)} + 성안 ${fmt(t.troops)} : 포위군 ${fmt(b.att.troops)} — ` +
      (ours >= b.att.troops ? `<span class="good">수가 많음</span>` : `<span class="bad">수가 적음</span>`) +
      `<br>병종 상성: ${S.unitName(unit)} 대 ${S.unitName(b.att.unit)} ${edgeLabel(edge)}` +
      `<br><span class="hint">하루에 보급로 절단 ${pc.cut}% · 군량고 소각 ${pc.burn}% · ${days}일 뒤 도착 · 군량 ${S.marchFood(sent, days, S.pathRough(state, way.path))}</span>`;
  }

  // Over water: whether the defenders would meet us on it, and how the fleets compare.
  function landingLine(way, t, ids, sent) {
    if (!way || !S.landingLink(way.path)) return "";
    const from = S.place(state, UI.selected);
    const o = S.landingForecast(state, t.id, from.owner, ids.map((id) => state.officers[id]), sent, from.train);
    const fleets = `아군 ${S.unitName(o.aFleet)} · 적 ${S.unitName(o.dFleet)}, 물 위 전력 ${edgeLabel(1 / Math.max(0.01, o.ratio))}`;
    if (!o.commit) return `상륙전: 적은 물가를 지키지 않을 것 같습니다 (${fleets})<br>`;
    return `<span class="bad">상륙전: 적 함대 ${fmt(o.dTroops)}명이 막아섭니다</span> (${fleets})<br>` +
      (o.pass ? `<span class="hint">예상: 상륙 성공, 뭍에 오르는 병사 약 ${fmt(o.left)}명</span><br>` : `<span class="bad">예상: 상륙 실패</span><br>`);
  }

  function updateEstimate() {
    const ids = checked();
    const el = $("#atEst");
    if (!ids.length) { el.textContent = "무장을 골라 주세요."; return; }
    if (ids.length > S.MAX_SORTIE_OFFICERS) { el.innerHTML = `<span class="bad">무장은 ${S.MAX_SORTIE_OFFICERS}명까지입니다.</span>`; return; }
    const unit = unitPick("atU_");
    const sent = S.countsTotal(unit);
    if (!sent) { el.textContent = "보낼 병사를 정해 주세요."; return; }
    const e = S.estimate(state, UI.selected, $("#atTarget").value, ids, sent, unit);
    const label = e.ratio >= 1.6 ? `<span class="good">압도적 우세</span>` : e.ratio >= 1.2 ? `<span class="good">우세</span>`
      : e.ratio >= 0.9 ? "백중세" : `<span class="bad">열세</span>`;
    const way = S.attackTargets(state, UI.selected).find((x) => x.id === $("#atTarget").value);
    const days = way ? S.travelDays(way.km, S.unitSpeed(unit)) : 0;
    // Who inside might sortie against us, and how our soldiers fare in the open.
    const t = S.place(state, $("#atTarget").value);
    const threat = S.sortieThreat(state, t.id);
    const field = S.unitEdge(unit, S.garrisonUnit(t), "field", 1);
    el.innerHTML = `아군 ${fmt(e.att)} : 적군 ${fmt(e.def)} — ${label} <span class="hint">(공성, 병종 반영)</span><br>` +
      (threat && threat.pct > 0
        ? `출격 위험: ${threat.leader.name}${S.hasSkill(threat.leader, "야전") ? " (야전)" : ""} 하루 ${threat.pct}% · 성 밖 싸움 상성 ${edgeLabel(field)}<br>`
        : `출격 위험: 없음<br>`) +
      landingLine(way, t, ids, sent) +
      `<span class="hint">병사 ${fmt(sent)}명 · ${days}일 뒤 도착 · 군량 ${S.marchFood(sent, days, way ? S.pathRough(state, way.path) : 1)}${way && S.pathRough(state, way.path) > 1.05 ? " (험로)" : ""} · 지금 기준이며 도착할 때까지 적 병력이 바뀔 수 있습니다.</span>`;
  }

  function updateScheme() {
    const kind = $("#scKind").value;
    const city = $("#scCity").value;
    const discord = kind === "discord";
    $("#scTargetRow").style.display = discord ? "" : "none";
    if (UI.pending.schemeCity !== city) {
      UI.pending.schemeCity = city;
      const t = state.cities[city];
      const foes = S.serving(state, city).filter((o) => o.force === t.owner).sort((a, b) => a.loyalty - b.loyalty);
      $("#scTarget").innerHTML = foes.map((o) => `<option value="${o.id}">${o.name} (충성 ${o.loyalty} · 지략 ${o.wit}${S.isRuler(state, o) ? " · 군주" : ""})</option>`).join("");
    }
    const t = state.cities[city];
    const guard = S.cityWit(state, city);
    const victim = discord ? state.officers[$("#scTarget").value] : null;
    $("#scInfo").innerHTML = `${t.name} 치안 ${t.order} · 호족 협력 ${Math.round(t.consent)} · 수비 지략 ${guard ? `${guard.name} ${guard.wit}` : "없음"}`;
    const list = S.idle(state, UI.selected).sort((a, b) => b.plot - a.plot);
    if (discord && !victim) { $("#scList").innerHTML = `<p class="hint">이 도시에는 이간할 무장이 없습니다.</p>`; return; }
    $("#scList").innerHTML = UI.officerTable(list, {
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

  // ---------- carrying the commands out ----------
  // Close the window if the command went through, and report either way.
  const run = (r) => { if (r.ok) UI.closeModal(); UI.result(r); };
  // As above, but a refusal leaves the window as it is.
  const tryRun = (r) => { if (!r.ok) { UI.toast(r.msg); return; } UI.closeModal(); UI.result(r); };

  Object.assign(UI.actions, {
    cmd: (d) => (commands[d.cmd] ? commands[d.cmd]() : commands.simple(d.cmd)),
    post: (d) => commands.post(d.kind),
    doPost: (d) => {
      const spec = d.empty ? null : d.oid ? { type: "officer", id: d.oid } : { type: "clerk", tier: +d.tier };
      run(S.assignPost(state, UI.selected, d.kind, spec));
    },
    doResearch: (d) => tryRun(S.research(state, d.oid, UI.selected, $("#rsField").value)),
    doDraft: (d) => tryRun(S.draft(state, d.oid, UI.selected, UI.pending.unit)),
    doSimple: (d) => {
      const r = SIMPLE[UI.pending.cmd].run(d.oid, UI.selected);
      UI.closeModal();
      UI.result(r);
    },
    recruitTarget: (d) => {
      const target = state.officers[d.oid];
      UI.pending = { target: d.oid };
      const list = S.idle(state, UI.selected).sort((a, b) => b.speech - a.speech);
      officerPicker(`${target.name} 등용`, "설득할 무장을 고르세요. 언변이 높을수록 성공률이 오릅니다.", list, "doRecruit",
        (o) => `성공률 ${S.recruitChance(state, o, target)}%`);
    },
    doRecruit: (d) => {
      const r = S.recruit(state, d.oid, UI.selected, UI.pending.target);
      UI.closeModal();
      UI.result(r);
    },
    doReward: (d) => { if (UI.result(S.reward(state, UI.selected, d.oid))) commands.reward(); },
    unrest: () => UI.showUnrest(),
    slander: () => UI.showSlander(),
    peaceYes: (d) => { UI.result(S.answerPeace(state, +d.id, true)); UI.showPeace(); },
    peaceNo: (d) => { UI.result(S.answerPeace(state, +d.id, false)); UI.showPeace(); },
    askPeace: (d) => {
      const terms = S.peaceAsk(state, state.playerForce, d.force);
      if (terms.ok === false) { UI.toast(terms.msg); return; }
      const cities = terms.cede.map((c) => c.name).join("·");
      const lose = terms.loser === state.playerForce;
      const q = `${S.forceName(state, d.force)}에 강화를 청할까요? ` + (cities ? (lose ? `우리가 ${S.josa(cities, "을", "를")} 넘겨야 합니다.` : `저쪽이 ${S.josa(cities, "을", "를")} 넘깁니다.`) : "성은 주고받지 않습니다.") + ` ${S.WAR.peace.years}년 휴전.`;
      if (!confirm(q)) return;
      UI.result(S.proposePeace(state, state.playerForce, d.force));
      UI.showDiplomacy();
    },
    slanderYes: () => { UI.result(S.answerSlander(state, state.playerForce, true)); UI.showSlander(); },
    slanderNo: () => { UI.result(S.answerSlander(state, state.playerForce, false)); UI.showSlander(); },
    stepDown: () => {
      const me = state.playerForce;
      const ruler = state.officers[state.forces[me].ruler];
      if (!confirm(`${S.josa(ruler.name, "이", "가")} 물러나고 후계자가 뒤를 잇습니다. 후계 내분이 일어날 수 있고, 물러난 군주는 돌아오지 않습니다. 하야할까요?`)) return;
      const r = S.stepDown(state, me); // logs its own lines
      UI.toast(r.msg);
      if (!r.ok) return;
      UI.renderAll();
      UI.showFactions();
    },
    unrestWoo: (d) => { UI.result(S.answerUnrest(state, d.cid, "woo")); UI.showUnrest(); },
    unrestCrush: (d) => { UI.result(S.answerUnrest(state, d.cid, "crush")); UI.showUnrest(); },
    captRecruit: (d) => { UI.result(S.persuade(state, d.oid)); UI.showCaptives(); },
    captHold: (d) => { UI.captives = (UI.captives || []).filter((id) => id !== d.oid); UI.showCaptives(); },
    captRelease: (d) => { UI.result(S.release(state, state.officers[d.oid].city, d.oid)); UI.showCaptives(); },
    captSpare: (d) => { UI.result(S.spare(state, state.officers[d.oid].city, d.oid)); UI.showCaptives(); },
    captBehead: (d) => {
      const t = state.officers[d.oid];
      if (!confirm(t.begged ? `목숨을 구걸하는 ${S.josa(t.name, "을", "를")} 그래도 참수할까요? 되돌릴 수 없습니다.` : `${S.josa(t.name, "을", "를")} 참수할까요? 되돌릴 수 없습니다.`)) return;
      UI.result(S.behead(state, t.city, d.oid));
      UI.showCaptives();
    },
    doMove: () => run(S.move(state, UI.selected, $("#mvDest").value, checked(), num("mvTroops"), num("mvGold"), num("mvFood"),
      $("#mv_wood") ? Object.fromEntries(S.RES_KEYS.map((k) => [k, num("mv_" + k)])) : null)),
    doBuild: (d) => run(S.buildFort(state, UI.selected, $("#bdSite").value, d.oid)),
    doRelocate: () => run(S.relocate(state, UI.selected, $("#rlDest").value, checked())),
    doScheme: (d) => run($("#scKind").value === "discord"
      ? S.discord(state, d.oid, UI.selected, $("#scTarget").value)
      : S.rumor(state, d.oid, UI.selected, $("#scCity").value)),
    doRelieve: () => {
      const pick = unitPick("rlfU_");
      tryRun(S.relieve(state, UI.selected, $("#rlfTarget").value, checked(), S.countsTotal(pick), pick));
    },
    doAttack: () => {
      const pick = unitPick("atU_");
      tryRun(S.attack(state, UI.selected, $("#atTarget").value, checked(), S.countsTotal(pick), pick));
    },
    doTrade: () => {
      const p = UI.pending;
      const r = S.trade(state, UI.selected, p.good, num("trAmount"), p.sell);
      if (UI.result(r)) commands.trade();
    },
    moveCapital: () => {
      const c = state.cities[UI.selected];
      if (!confirm(`${S.capitalLabel(state, c.owner)}를 ${S.ro(c.name)} 옮길까요?`)) return;
      UI.result(S.moveCapital(state, state.playerForce, c.id));
    },
  });
})(globalThis.SAM = globalThis.SAM || {});
