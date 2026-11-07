// Browser UI: map, side panel, command dialogs, turn flow, save/load.
(function (S) {
  const SAVE_KEY = "sowsam.save.v1";
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
      `<span>도시 <b>${t.cities}</b></span><span>무장 <b>${t.officers}</b></span>` +
      `<span>병력 <b>${fmt(t.troops)}</b></span><span>금 <b>${fmt(t.gold)}</b></span><span>군량 <b>${fmt(t.food)}</b></span>`;
  }

  const LAND = "M40,110 L150,60 L330,40 L560,18 L700,12 L830,18 L905,90 L880,170 L862,250 L905,330 L940,420 L925,525 L885,625 L760,665 L600,695 L450,695 L330,650 L200,628 L90,595 L55,470 L85,360 L28,250 Z";

  function renderMap() {
    const sel = selected && state.cities[selected];
    const targets = new Set(sel && mine(sel) ? S.neighbors(sel.id) : []);
    let svg = `<path class="land" d="${LAND}" stroke-linejoin="round"/>`;
    for (const r of S.RIVERS) svg += `<polyline class="river" points="${r.map((p) => p.join(",")).join(" ")}"/>`;
    for (const [a, b] of S.ROADS) {
      const A = state.cities[a], B = state.cities[b];
      const hl = sel && (a === sel.id || b === sel.id) ? " hl" : "";
      svg += `<line class="road${hl}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
    }
    for (const c of Object.values(state.cities)) {
      const r = 8 + c.size * 2;
      const cls = ["city", c.id === selected ? "sel" : "", targets.has(c.id) ? "target" : "", mine(c) ? "mine" : ""].join(" ");
      svg += `<g class="${cls}" data-city="${c.id}">` +
        `<circle class="ring" cx="${c.x}" cy="${c.y}" r="${r + 5}"/>` +
        `<circle class="node" cx="${c.x}" cy="${c.y}" r="${r}" fill="${forceColor(c.owner)}"/>` +
        `<text class="name" x="${c.x}" y="${c.y + r + 16}">${c.name}</text>` +
        `<text class="troops" x="${c.x}" y="${c.y + r + 29}">${fmt(c.troops)}</text></g>`;
    }
    $("#map").innerHTML = svg;
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
      return `<tr class="${cls}"${attrs}><td>${crown}${o.name}</td><td>${o.lead}</td><td>${o.war}</td><td>${o.int}</td><td>${o.pol}</td>` +
        (opts.loyalty ? `<td>${S.isRuler(state, o) ? "-" : o.loyalty}</td>` : "") +
        (opts.extra ? `<td>${opts.extra(o)}</td>` : "") +
        (opts.status ? `<td>${status}</td>` : "") + `</tr>`;
    }).join("");
    return `<table><tr><th>이름</th><th>통솔</th><th>무력</th><th>지력</th><th>정치</th>` +
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
    let html = `<h2>${c.name}<span class="badge" style="background:${forceColor(c.owner)}">${S.forceName(state, c.owner)}</span></h2>`;
    html += `<div class="stats">` +
      stat("병력", c.troops.toLocaleString()) + stat("훈련", c.train) +
      stat("금", c.gold.toLocaleString()) + stat("군량", c.food.toLocaleString()) +
      stat("인구", c.pop.toLocaleString()) + stat("치안", c.order) +
      stat("농업", `${c.farm}/${c.farmMax}`) + stat("상업", `${c.trade}/${c.tradeMax}`) +
      stat("성벽", `${c.wall}/${c.wallMax}`) +
      (own ? stat("월 수지", signed(S.balance(c))) : "") +
      `</div>`;
    if (own) {
      html += `<h3>월 수지 내역</h3><div class="stats">` +
        stat("수입", "+" + S.income(c)) + stat("병사 봉급", "-" + S.upkeep(c)) +
        stat("관리 봉급", "-" + S.salaries(c)) + `</div>`;
    }
    if (own) html += postsTable(c);
    if (own) {
      html += `<h3>명령</h3><div class="cmds">` +
        cmdButton("draft", "징병") + cmdButton("train", "훈련") + cmdButton("search", "탐색") + cmdButton("recruit", "등용") +
        cmdButton("move", "이동") + cmdButton("attack", "출진") + cmdButton("reward", "포상", true) +
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
    const rows = S.POST_KEYS.map((k) => {
      const max = k === "order" ? 100 : c[k + "Max"];
      return `<tr><td>${S.POSTS[k].label}</td><td>${c[k]}/${max}</td><td>${holderName(c, k)}</td>` +
        `<td>${signed(S.postDelta(state, c, k))}</td>` +
        `<td><button data-action="post" data-kind="${k}">변경</button></td></tr>`;
    }).join("");
    return `<h3>내정 담당</h3><table><tr><th>분야</th><th>수치</th><th>담당</th><th>월 변화</th><th></th></tr>${rows}</table>` +
      `<p class="hint">담당관은 매달 자동으로 내정을 발전시킵니다. 공석이면 수치가 깎입니다. 담당 무장은 다른 명령을 할 수 없습니다.</p>`;
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
      title: "징병", stat: "lead", run: (o, c) => S.draft(state, o, c),
      preview: (o, c) => { const n = S.preview.draft(c, o); return `병사 +${n} (금 ${Math.ceil(n * S.COST.draftPerTroop)})`; },
    },
    train: { title: "훈련", stat: "lead", run: (o, c) => S.drill(state, o, c), preview: (o) => `훈련 +${S.preview.train(o)}` },
    search: { title: "탐색", stat: "int", run: (o, c) => S.search(state, o, c), preview: (o) => `인재 발견률 ${Math.min(100, Math.round(25 + o.int / 2))}%` },
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
      officerPicker(def.title, `실행할 무장을 고르세요. ${S.STAT_NAMES[def.stat]}이(가) 높을수록 효과가 큽니다.`, list, "doSimple",
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
      const officerRows = officers.map((o) => {
        const k = S.postOf(state, o);
        const note = k === kind ? "현재 담당" : k ? `${S.POSTS[k].label} 담당 중` : "";
        return `<tr class="pick" data-action="doPost" data-kind="${kind}" data-oid="${o.id}"><td>${o.name}</td>` +
          `<td>${def.stat(o)}</td><td>${signed(S.postGain(kind, def.stat(o)))}</td><td>-</td><td>${note}</td></tr>`;
      }).join("");
      const clerkRows = S.CLERKS.map((cl, i) =>
        `<tr class="pick" data-action="doPost" data-kind="${kind}" data-tier="${i}"><td>${cl.name}</td>` +
        `<td>${cl.ability}</td><td>${signed(S.postGain(kind, cl.ability))}</td><td>금 ${cl.salary}/월</td>` +
        `<td>${cur && cur.type === "clerk" && cur.tier === i ? "현재 담당" : ""}</td></tr>`).join("");
      openModal(`<h2>${def.label} 담당 임명</h2>` +
        `<p class="hint">현재 ${def.label} ${c[kind]}. 무장은 봉급이 없지만 담당하는 동안 다른 명령을 할 수 없습니다. ` +
        `관리는 매달 봉급이 나갑니다. 능력 기준은 ${def.statLabel}입니다.</p>` +
        `<table><tr><th>담당</th><th>능력</th><th>월 변화</th><th>봉급</th><th></th></tr>` +
        clerkRows + officerRows +
        `<tr class="pick" data-action="doPost" data-kind="${kind}" data-empty="1"><td>공석으로 두기</td><td>-</td>` +
        `<td>${signed(S.postPenalty(c, kind))}</td><td>-</td><td>${!cur ? "현재" : ""}</td></tr></table>` +
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
      openModal(`<h2>이동 · 수송</h2><p class="hint">무장과 함께 병사·금·군량을 인접한 아군 도시로 보냅니다.</p>` +
        `<div class="row"><label>목적지</label><select id="mvDest">${dests.map((d) => `<option value="${d}">${state.cities[d].name}</option>`).join("")}</select></div>` +
        checkList(S.idle(state, c.id)) +
        rangeRow("mvTroops", "병사", c.troops) + rangeRow("mvGold", "금", c.gold) + rangeRow("mvFood", "군량", c.food) +
        `<div class="footer"><button data-action="close">취소</button><button class="primary" data-action="doMove">이동</button></div>`);
    },
    attack() {
      const c = state.cities[selected];
      const targets = S.neighbors(c.id).filter((n) => state.cities[n].owner !== c.owner);
      if (!targets.length) { toast("인접한 적 도시가 없습니다."); return; }
      if (c.troops < S.MIN_SORTIE_TROOPS) { toast(`병사가 ${S.MIN_SORTIE_TROOPS}명 이상 있어야 출진할 수 있습니다.`); return; }
      const idle = S.idle(state, c.id).sort((a, b) => b.lead + b.war - a.lead - a.war);
      openModal(`<h2>출진</h2><p class="hint">무장은 최대 ${S.MAX_SORTIE_OFFICERS}명입니다. 통솔·무력·지력이 가장 높은 무장의 능력이 전투에 반영됩니다. 군량은 병사 10명당 1이 듭니다.</p>` +
        `<div class="row"><label>목표</label><select id="atTarget">${targets.map((d) => {
          const t = state.cities[d];
          return `<option value="${d}">${t.name} (${S.forceName(state, t.owner)}, 병력 ${t.troops})</option>`;
        }).join("")}</select></div>` +
        checkList(idle, S.MAX_SORTIE_OFFICERS) +
        rangeRow("atTroops", "병사", c.troops, Math.round(c.troops * 0.7)) +
        `<div class="row"><label>전력</label><span id="atEst"></span></div>` +
        `<div class="footer"><button data-action="close">취소</button><button class="primary" data-action="doAttack">출진</button></div>`);
      modalOnInput = updateEstimate;
      updateEstimate();
    },
  };

  function checkList(list, max) {
    return `<div class="row" style="align-items:flex-start"><label>무장</label><div>${list.map((o, i) =>
      `<label style="display:block"><input type="checkbox" class="pickOfficer" value="${o.id}"${max && i === 0 ? " checked" : ""}> ` +
      `${o.name} <span class="hint">통${o.lead} 무${o.war} 지${o.int}</span></label>`).join("")}</div></div>`;
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
      .map(({ f, t }) => `<tr><td><span style="color:${f.color}">■</span> ${f.name}군${f.id === state.playerForce ? " (나)" : ""}</td>` +
        `<td>${t.cities}</td><td>${t.officers}</td><td>${fmt(t.troops)}</td><td>${fmt(t.gold)}</td><td>${fmt(t.food)}</td></tr>`).join("");
    openModal(`<h2>세력 정보</h2><table><tr><th>세력</th><th>도시</th><th>무장</th><th>병력</th><th>금</th><th>군량</th></tr>${rows}</table>` +
      `<div class="footer"><button class="primary" data-action="close">닫기</button></div>`, true);
  }

  // ---------- title ----------
  function showTitle() {
    const saved = loadSaved();
    const preview = S.newGame(S.SCENARIO_190, null, 1);
    const cards = Object.values(preview.forces).map((f) => {
      const t = S.totals(preview, f.id);
      const r = preview.officers[f.ruler];
      return `<button class="forcecard" style="border-left-color:${f.color}" data-action="start" data-force="${f.id}">` +
        `<b>${f.name}</b><div>도시 ${t.cities} · 무장 ${t.officers} · 병력 ${fmt(t.troops)}</div>` +
        `<div>${S.citiesOf(preview, f.id).map((c) => c.name).join(", ")}</div>` +
        `<div>통${r.lead} 무${r.war} 지${r.int} 정${r.pol}</div></button>`;
    }).join("");
    openModal(`<div class="title-hero"><h1>SoWSam 삼국지</h1><p>${S.SCENARIO_190.title} — ${S.SCENARIO_190.desc}</p></div>` +
      (saved && !saved.over ? `<div class="footer" style="justify-content:center;margin-bottom:12px"><button class="primary" data-action="continue">이어하기 (${saved.year}년 ${saved.month}월 · ${saved.forces[saved.playerForce].name}군)</button></div>` : "") +
      `<h3>세력을 고르세요</h3><div class="forcegrid">${cards}</div>`, true);
  }

  function start(fid) {
    state = S.newGame(S.SCENARIO_190, fid);
    const home = S.citiesOf(state, fid)[0];
    selected = home.id;
    closeModal();
    renderAll();
    toast(`${state.forces[fid].name}군으로 천하통일을 시작합니다!`);
  }

  // ---------- events ----------
  const actions = {
    close: closeModal,
    title: showTitle,
    forces: () => state && showForces(),
    save: () => state && saveGame(),
    endTurn: () => state && !state.over && endTurn(),
    start: (d) => start(d.force),
    continue: () => {
      state = S.migrate(loadSaved());
      selected = S.citiesOf(state, state.playerForce)[0].id;
      closeModal();
      renderAll();
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
      const list = S.idle(state, selected).sort((a, b) => b.int - a.int);
      officerPicker(`${target.name} 등용`, "설득할 무장을 고르세요. 지력이 높을수록 성공률이 오릅니다.", list, "doRecruit",
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
    doAttack: () => {
      const r = S.attack(state, selected, $("#atTarget").value, checked(), num("atTroops"));
      if (!r.ok) { toast(r.msg); return; }
      if (r.report.attackerWon) selected = state.cities[$("#atTarget").value].id;
      renderAll();
      showReport(r.report);
      if (S.checkOver(state)) setTimeout(showEnd, 0);
    },
  };

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-action], [data-city]");
    if (!el) return;
    if (el.dataset.action) {
      const fn = actions[el.dataset.action];
      if (fn) fn(el.dataset);
    } else if (el.dataset.city && state) {
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
