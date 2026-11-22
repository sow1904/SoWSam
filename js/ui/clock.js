// The clock: time flows by itself and the player pauses to think. Days tick
// at the chosen speed, computer forces act on their own days, and battles
// involving the player appear as report cards on the map, a line at a time.
(function (S) {
  const UI = S.UI, $ = UI.$;
  const { fmt } = UI;
  let state = null;
  UI.bind((s) => { state = s; });

  const SPEEDS = [8000, 4000, 2000, 500]; // milliseconds per month
  const CLOCK_KEY = "sowsam.clock";
  // v: settings version; v2 made pausing on the 1st the default.
  const CLOCK_DEFAULTS = { v: 2, speed: 1, modal: true, threat: true, attacked: true, bad: true, court: true, captured: true, month: true, season: true };
  const CLOCK_LABELS = {
    modal: "명령 창이나 정보 창을 열면 멈춤",
    threat: "적 군단이 아군 도시로 진군을 시작하면 멈춤",
    attacked: "아군 도시에서 전투가 벌어지면 멈춤",
    bad: "나쁜 소식(무장 이탈, 도시 함락, 반란 등)이 오면 멈춤",
    court: "헌제의 청이나 선양 조서가 오면 멈추고 황실 창 열기",
    captured: "아군이 성을 빼앗으면 멈추고 그 도시를 보여 주기",
    month: "매달 1일마다 멈춤 (새 달의 명령을 내리기 좋음)",
    season: "계절이 바뀌면 잠시 멈추고 지도가 바뀌는 모습 보여 주기 (끄면 계절 소식만)",
  };
  const clock = { running: false, resumeOnClose: false, acc: 0, last: 0, seenN: 0, pending: null, settings: loadSettings() };
  const battles = []; // finished battles, shown as cards until dismissed

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(CLOCK_KEY) || "{}");
      if (!(saved.v >= 2)) { delete saved.month; delete saved.v; }
      return Object.assign({}, CLOCK_DEFAULTS, saved);
    } catch (e) { return Object.assign({}, CLOCK_DEFAULTS); }
  }
  function saveSettings() {
    try { localStorage.setItem(CLOCK_KEY, JSON.stringify(clock.settings)); } catch (e) { /* ignore */ }
  }
  function setRunning(on) {
    clock.running = !!on && !!state && !state.over;
    clock.acc = 0;
    clock.last = 0;
    UI.renderClock();
  }
  function pause(reason) {
    clock.resumeOnClose = false;
    clock.holds = null;
    if (!clock.running) return;
    setRunning(false);
    if (reason) UI.toast(`일시정지: ${reason}`);
  }
  // A window opening stops the clock; when the last one closes it runs again.
  UI.holdClock = function () {
    if (clock.running && clock.settings.modal) { setRunning(false); clock.resumeOnClose = true; }
  };
  // Holds: a card over the map (the season's change and news, the fall of
  // a force) stops the running clock until it is gone; when the last hold
  // is let go the clock runs again. Any other pause in between keeps it
  // stopped (pause() drops the holds).
  UI.holdFor = function (name) {
    if (clock.running) { setRunning(false); clock.holds = new Set([name]); }
    else if (clock.holds && clock.holds.size) clock.holds.add(name);
  };
  UI.releaseHold = function (name) {
    if (!clock.holds || !clock.holds.has(name)) return;
    clock.holds.delete(name);
    if (clock.holds.size) return;
    clock.holds = null;
    if (!state || state.over) return;
    if (UI.modalOpen()) clock.resumeOnClose = clock.settings.modal; // a window is up: run when it closes
    else setRunning(true);
  };
  UI.releaseClock = function () {
    if (clock.resumeOnClose && state && !state.over) setRunning(true);
    clock.resumeOnClose = false;
  };
  UI.renderClock = function () {
    const play = $("#clockPlay");
    if (!play) return;
    play.textContent = clock.running ? "⏸ 일시정지" : "▶ 진행";
    play.classList.toggle("running", clock.running);
    document.querySelectorAll("#clock .spd").forEach((b) => b.classList.toggle("on", +b.dataset.s === clock.settings.speed));
    $("#pauseBadge").classList.toggle("hidden", clock.running || !state || UI.modalOpen());
  };
  // Reset when a game starts or loads.
  UI.resetClock = function () {
    clock.running = false;
    clock.resumeOnClose = false;
    clock.holds = null;
    clock.season = S.seasonOf(state.month);
    clock.fallSeen = state.fallN || 0;
    clock.seenN = state.logN || 0;
    clock.pending = state.han && state.han.pending;
    clock.marchCount = (state.marches || []).length;
    battles.length = 0;
    clock.seenBattles = new Set((state.battles || []).map((b) => b.id));
    UI.renderBattles();
    UI.renderClock();
  };

  // A plain timer rather than animation frames, so time keeps flowing while
  // the window is in the background.
  function frame() {
    const ts = performance.now();
    if (!clock.running || !state) { clock.last = 0; return; }
    if (!clock.last) clock.last = ts;
    clock.acc += Math.min(ts - clock.last, 1100);
    clock.last = ts;
    const dayMs = SPEEDS[clock.settings.speed] / S.DAYS_PER_MONTH;
    let steps = 0;
    while (clock.running && clock.acc >= dayMs && steps < 70) {
      clock.acc -= dayMs;
      steps++;
      stepDay();
    }
    if (steps) UI.renderStatus();
    UI.renderMarches(clock.acc / dayMs);
  }

  const involves = (b, me) => !!me && (b.att.force === me || b.def.force === me);
  function stepDay() {
    const me = state.playerForce;
    const reports = [], asked = [];
    const held = new Set(UI.myCities().map((c) => c.id));
    const month = S.tickDay(state, (r) => {
      if (me && r.report && (r.report.defender === me || r.report.attacker === me)) reports.push(r.report);
      if (r.envoy) asked.push(r.envoy);
    });
    for (const r of reports) addBattle(r);
    // Those we have just taken alive: their fate is asked at once.
    const caught = reports.filter((r) => r.attacker === me).flatMap((r) => r.captured)
      .filter((id) => state.officers[id].status === "captive" && state.officers[id].captor === me && !UI.handsOff());
    const hanJoined = UI.handsOff() ? [] : reports.filter((r) => r.attacker === me).flatMap((r) => r.hanJoined || []);
    const fighting = (state.battles || []).some((b) => involves(b, me));
    if (fighting || reports.length || clock.wasFighting) UI.renderBattles();
    clock.wasFighting = fighting;
    // Battles that just began against us.
    const seen = clock.seenBattles || (clock.seenBattles = new Set());
    const started = !me ? [] : (state.battles || []).filter((b) => !seen.has(b.id) && (b.def.force === me || (b.kind !== "siege" && b.att.force === me)));
    for (const b of state.battles || []) seen.add(b.id);
    // New lines are at the end of the log.
    const fresh = [];
    for (let i = state.log.length - 1; i >= 0 && state.log[i].n > clock.seenN; i--) fresh.unshift(state.log[i]);
    clock.seenN = state.logN || clock.seenN;
    const big = month || reports.length || fresh.some((e) => e.kind === "war" || e.kind === "fall" || e.kind === "mine" || e.kind === "threat") ||
      (state.marches || []).length !== clock.marchCount;
    clock.marchCount = (state.marches || []).length;
    if (fresh.length) UI.renderLog();
    if (big) { UI.renderMap(); UI.keepScroll(UI.renderPanel); }
    if (month) UI.saveGame(true);
    if (state.over) { setRunning(false); return UI.showEnd(); }
    // A new season: the map dissolves into the new one while the clock
    // waits (if so set; js/ui/map.js), then, the next day, the season's
    // news comes (js/seasons.js) and stops the clock while it is shown.
    const sea = S.seasonOf(state.month);
    if (clock.season != null && sea !== clock.season && clock.settings.season) {
      UI.holdFor("dissolve");
      setTimeout(() => UI.releaseHold("dissolve"), (UI.SEASON_FADE_MS || 0) + 200);
    }
    clock.season = sea;
    if (state.seasonNews && clock.seasonSeen !== state.seasonNews.key) {
      clock.seasonSeen = state.seasonNews.key;
      if (UI.showSeason) { UI.holdFor("season"); UI.showSeason(state.seasonNews, true); UI.renderPanel(); }
    }
    // A force has fallen: its card, until closed (js/ui/seasons.js).
    const falls = (state.fallNews || []).filter((x) => x.n > (clock.fallSeen || 0) && x.fid !== state.playerForce);
    clock.fallSeen = state.fallN || clock.fallSeen;
    if (falls.length && UI.showCollapse) { UI.holdFor("collapse"); UI.showCollapse(falls); } // shown when watching too
    const s = clock.settings;
    // The player's character died: who carries on (js/ui/persona.js).
    if (state.heirPick) {
      setRunning(false);
      if (clock.heirSeen !== state.heirPick.from) { clock.heirSeen = state.heirPick.from; UI.toast("일시정지: 뒤를 이을 인물을 고르세요"); UI.showHeirPick(); }
      return;
    }
    // Serving a computer lord, wandering or held: his own news stops the clock.
    const meP = S.playerChar(state);
    if (meP && !S.playerRules(state)) {
      clock.pending = state.han && state.han.pending;
      const about = fresh.find((e) => e.kind !== "mine" && e.text.includes(meP.name));
      if (s.bad && about) return pause(about.text);
      const pc = S.playerCity(state);
      const hit = pc && (state.battles || []).find((b) => b.place === pc && !seen.has("p" + b.id));
      if (hit) { seen.add("p" + hit.id); if (s.attacked) return pause(`${UI.battleTitle(hit)}이 시작되었습니다`); }
      if (s.month && month) return pause(`${state.year}년 ${state.month}월`);
      return;
    }
    // With no one playing, or the force left to itself, nothing stops the clock.
    if (UI.handsOff()) { clock.pending = state.han && state.han.pending; return; }
    // A city just taken stands unstaffed: show it so posts and policy can be set.
    const taken = UI.myCities().filter((c) => !held.has(c.id));
    if (s.captured && taken.length) {
      UI.selected = taken[0].id;
      UI.winOpen = true;
      UI.tab = "post";
      UI.renderAll();
      UI.centerOn(taken[0]);
      pause(`${S.josa(taken[0].name, "을", "를")} 차지했습니다. 담당과 위임 방침을 정하세요`);
      if (hanJoined.length) UI.showHanJoined(hanJoined, caught);
      else if (caught.length) UI.showCaptives(caught);
      return;
    }
    if (hanJoined.length) { pause("한조파가 항복했습니다"); UI.showHanJoined(hanJoined, caught); return; }
    if (caught.length) { pause("무장을 사로잡았습니다"); UI.showCaptives(caught); return; }
    // An offer of peace waits for the player's answer.
    const offers = (state.peaceOffers || []).filter((o) => o.winner === state.playerForce || o.loser === state.playerForce);
    const newOffer = offers.find((o) => !(clock.peaceSeen || []).includes(o.id));
    if (newOffer && !S.spectating(state)) {
      clock.peaceSeen = offers.map((o) => o.id);
      pause("강화 제의가 들어왔습니다");
      UI.showPeace();
      return;
    }
    // A councillor brings a proposal.
    const props = (state.proposals || []).filter((a) => a.fid === state.playerForce);
    const newProp = props.find((a) => !(clock.propSeen || []).includes(a.id));
    if (newProp && !S.spectating(state)) {
      clock.propSeen = props.map((a) => a.id);
      pause("진언이 올라왔습니다");
      UI.showCouncil();
      return;
    }
    // A governor raided over the border.
    const raids = (state.raidReports || []).filter((a) => a.fid === state.playerForce);
    const newRaid = raids.find((a) => !(clock.raidSeen || []).includes(a.id));
    if (newRaid && !S.spectating(state)) {
      clock.raidSeen = raids.map((a) => a.id);
      pause("태수가 국경을 습격했습니다");
      UI.showRaids();
      return;
    }
    // An officer asks for a seat at court.
    const asks = (state.officeAsks || []).filter((a) => a.fid === state.playerForce);
    const newAsk = asks.find((a) => !(clock.askSeen || []).includes(a.id));
    if (newAsk && !S.spectating(state)) {
      clock.askSeen = asks.map((a) => a.id);
      pause("관직 요구가 들어왔습니다");
      UI.showOfficeAsks();
      return;
    }
    // Made 공: the player names his realm (js/titles.js).
    const meF = state.forces[state.playerForce];
    const askKey = meF && S.titleName(state, meF.id);
    if (meF && meF.realmAsk && clock.realmAsked !== askKey && !S.spectating(state)) {
      clock.realmAsked = askKey;
      pause(meF.emperor ? "황제에 올랐습니다. 국호를 고르세요" : "공 작위를 받았습니다. 나라 이름을 고르세요");
      UI.showRealmPick();
      return;
    }
    // A slander waits for the player's answer.
    const sl = state.forces[state.playerForce] && state.forces[state.playerForce].slander;
    const slKey = sl ? `${sl.by}>${sl.target}@${sl.until}` : null;
    if (sl && clock.slander !== slKey && !S.spectating(state)) {
      clock.slander = slKey;
      pause("참소가 들어왔습니다");
      UI.showSlander();
      return;
    }
    // A rising of the great families waits for the player's answer.
    const rising = UI.myCities().filter((c) => c.unrest && !S.delegateOf(state, c) && !(clock.risings || []).includes(c.id + "@" + c.unrest.day));
    if (rising.length) {
      clock.risings = UI.myCities().filter((c) => c.unrest).map((c) => c.id + "@" + c.unrest.day);
      pause(`${rising[0].name}의 호족들이 들고일어났습니다`);
      UI.showUnrest();
      return;
    }
    // An envoy with something to ask: the answer is the player's to give.
    if (asked.length) { pause(`${S.forceName(state, asked[0].from)}의 사자가 도착했습니다`); UI.showDiplomacy(); return; }
    const han = state.han;
    const courtNew = han && han.pending && han.holder === me && han.pending !== clock.pending;
    clock.pending = han && han.pending;
    if (s.court && courtNew) { pause("헌제의 소식"); UI.showCourt(); return; }
    const threat = fresh.find((e) => e.kind === "threat");
    if (s.threat && threat) return pause(threat.text);
    if (s.attacked && started.length) return pause(`${UI.battleTitle(started[0])}이 시작되었습니다`);
    const bad = fresh.find((e) => e.kind === "warn" || (e.kind === "fall" && e.text.includes(state.forces[me].name)));
    if (s.bad && bad) return pause(bad.text);
    if (s.month && month) return pause(`${state.year}년 ${state.month}월`);
  }

  // ---------- battle cards ----------
  function addBattle(report) {
    battles.unshift({ id: (battles.length ? Math.max(...battles.map((b) => b.id)) : 0) + 1, report });
    if (battles.length > 4) battles.pop();
  }
  function supplyText(b) {
    const one = (side) => (!side.supply ? "" : side.supply.burnt ? "군량고 불탐" : !side.supply.line ? "보급로 끊김" : "보급 정상");
    if (b.kind === "siege") return `포위군 ${one(b.att)} · 군량 ${fmt(Math.round(b.att.rations))}`;
    return `진군 측 ${one(b.att)} · 요격 측 ${one(b.def)}`;
  }
  function bar(label, troops, troops0, morale, color) {
    const pct = Math.max(0, Math.min(100, Math.round((troops / Math.max(1, troops0)) * 100)));
    return `<div class="bside"><span>${label}</span><span class="bbar"><i style="width:${pct}%;background:${color || ""}"></i></span><b>${fmt(Math.max(0, troops))}</b><span class="hint">사기 ${Math.round(morale)}</span></div>`;
  }
  UI.renderBattles = function () {
    if (!state) return;
    const me = state.playerForce;
    const live = (state.battles || []).filter((b) => involves(b, me)).map((b) => {
      const t = S.place(state, b.place);
      const dTroops = b.kind === "siege" ? t.troops : b.def.troops;
      const dMax = b.kind === "siege" ? Math.max(b.def.troops0, t.troops) : b.def.troops0;
      const attacking = b.att.force === me;
      return `<div class="bcard live" data-action="battleLive" data-b="${b.id}">` +
        `<div class="bh"><span>⚔ ${UI.battleTitle(b)} · ${b.day}일째</span>` +
        (attacking && b.kind === "siege" && !S.digBlock(state, b) ? `<button data-action="tunnel" data-b="${b.id}" title="성벽 밑으로 땅굴을 팝니다. ${S.TUNNEL.days}일이 걸리고, 수비군이 알아채면 무너집니다.">땅굴</button>` : "") +
        (attacking && b.tunnel ? `<span class="hint">땅굴 ${b.tunnel.left}일</span>` : "") +
        (attacking ? `<button data-action="retreat" data-b="${b.id}" title="퇴각 명령">퇴각</button>` : "") + `</div>` +
        bar(`${S.forceName(state, b.att.force)} ${S.unitName(b.att.unit)}`, b.att.troops, b.att.troops0, b.att.morale, UI.forceColor(b.att.force)) +
        bar(`${S.forceName(state, b.def.force)} ${S.unitName(b.kind === "siege" ? S.garrisonUnit(t) : b.def.unit)}`, dTroops, dMax, b.def.morale, UI.forceColor(b.def.force)) +
        (b.relief ? bar(`원군 ${S.unitName(b.relief.unit)}`, b.relief.troops, b.relief.troops0, b.relief.morale, UI.forceColor(b.def.force)) : "") +
        `<div class="hint">${supplyText(b)}</div>` +
        `<div class="bl"><div>${b.last}</div></div></div>`;
    });
    const done = battles.map((x) => {
      const r = x.report;
      const won = r.attacker === me ? r.attackerWon : !r.attackerWon;
      const head = `${r.to} ${r.landing ? "상륙전" : "공방전"}`;
      return `<div class="bcard ${won ? "win" : "lose"}" data-action="battleOpen" data-b="${x.id}">` +
        `<div class="bh"><span>⚔ ${head} (${r.days}일)</span><button data-action="battleClose" data-b="${x.id}" title="닫기">×</button></div>` +
        `<div class="bl"><div>${r.lines[r.lines.length - 1]}</div></div><div class="bs">${won ? "승리" : "패배"}</div></div>`;
    });
    UI.setHTML($("#battles"), live.join("") + done.join(""));
  };
  UI.showReport = function (report) {
    let html = UI.winTitle(report.live ? report.to : `${report.from} → ${report.to} 전투`) +
      `<div class="report">${report.lines.map((l) => `<div>${l}</div>`).join("")}</div>`;
    if (report.captured.length && report.attackerWon) html += `<p class="hint">사로잡은 무장은 도시 화면에서 등용하거나 석방할 수 있습니다.</p>`;
    html += `<div class="footer"><button class="primary" data-action="close">확인</button></div>`;
    UI.openModal(html);
  };

  UI.showClockSettings = function () {
    const s = clock.settings;
    UI.openModal(UI.winTitle("시간 설정") +
      `<p class="hint">스페이스 바로 진행과 일시정지를, 숫자 키 1~4로 배속을 바꿉니다. 1×는 한 달 8초, 16×는 한 달 0.5초(1년 6초)입니다. ` +
      `컴퓨터 세력은 달마다 각자 정해진 날에 움직이고, 수입·수확·충성 변화는 매달 1일에 처리됩니다. 매달 1일에 자동 저장합니다.</p>` +
      `<h3>자동 일시정지</h3><div class="checks">` +
      Object.entries(CLOCK_LABELS).map(([k, v]) => `<label><input type="checkbox" class="cset" data-k="${k}"${s[k] ? " checked" : ""}> ${v}</label>`).join("") +
      `</div><div class="footer"><button class="primary" data-action="close">닫기</button></div>`);
    UI.modalOnInput = () => {
      document.querySelectorAll(".cset").forEach((el) => { clock.settings[el.dataset.k] = el.checked; });
      saveSettings();
    };
  };

  Object.assign(UI.actions, {
    togglePause: () => { if (state && !state.over) { clock.resumeOnClose = false; clock.holds = null; setRunning(!clock.running); } },
    speed: (d) => { clock.settings.speed = +d.s; saveSettings(); UI.renderClock(); },
    clockSettings: () => state && UI.showClockSettings(),
    battleOpen: (d) => { const b = battles.find((x) => x.id === +d.b); if (b) UI.showReport(b.report); },
    battleLive: (d) => {
      const b = S.battleOf(state, +d.b);
      if (b) UI.showReport({ from: b.from, to: UI.battleTitle(b), lines: b.log, captured: [], live: true });
    },
    retreat: (d) => UI.result(S.retreat(state, +d.b)),
    tunnel: (d) => UI.result(S.orderTunnel(state, +d.b)),
    battleClose: (d) => { const i = battles.findIndex((x) => x.id === +d.b); if (i >= 0) battles.splice(i, 1); UI.renderBattles(); },
  });
  UI.stopClock = () => setRunning(false);
  UI.startClock = function () { setInterval(frame, 33); };
})(globalThis.SAM = globalThis.SAM || {});
