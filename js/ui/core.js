// Browser UI, shared parts: the game in play, what is selected, storage,
// windows and small drawing helpers. The other js/ui files hang their
// functions on S.UI and reach each other through it.
(function (S) {
  // v2: commandery map. Saves from the 32-city prototype are not carried over.
  const SAVE_KEY = "sowsam.save.v3";
  const $ = (sel) => document.querySelector(sel);

  const UI = (S.UI = {
    $,
    state: null,
    selected: null, // the city or stronghold in the panel
    winOpen: false, // whether its command window is open
    tab: "cmd", // the command window's tab
    pending: null, // a command half given (which unit to draft, whom to recruit)
    modalOnInput: null, // called when anything in the open window changes
    actions: {}, // what a click on [data-action] does
  });

  // Every file keeps its own `state`; binding keeps them all on the same game.
  const binders = [];
  UI.bind = (fn) => { binders.push(fn); fn(UI.state); };
  UI.setState = (s) => { UI.state = s; for (const fn of binders) fn(s); };
  let state = null;
  UI.bind((s) => { state = s; });

  UI.fmt = (n) => (n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + "만" : String(n));
  UI.forceColor = (fid) => (fid && state.forces[fid] ? state.forces[fid].color : "#9c9c9c");
  // A game may have no player at all (관전): then nothing is "mine".
  // home: the player's force holds it. mine: the player gives its orders
  // (all of them as ruler, his own city as governor; js/persona.js).
  UI.home = (c) => !!c && !!state.playerForce && c.owner === state.playerForce;
  UI.mine = (c) => UI.home(c) && (S.playerRules(state) || S.playerCity(state) === c.id);
  UI.myCities = () => (state.playerForce ? S.citiesOf(state, state.playerForce) : []);
  // The force whose lists are shown: the player's, or when only watching,
  // that of the selected place, else the largest.
  UI.viewForce = function () {
    if (state.playerForce) return state.playerForce;
    const p = UI.selected && S.place(state, UI.selected);
    if (p && p.owner) return p.owner;
    const fs = Object.values(state.forces).filter((f) => f.alive);
    return fs.length ? fs.reduce((a, b) => (S.citiesOf(state, b.id).length > S.citiesOf(state, a.id).length ? b : a)).id : null;
  };
  // Nothing needs the player's answer: no one plays, or the force runs itself.
  UI.handsOff = () => !state.playerForce || S.spectating(state);
  UI.signed = (n) => `<span class="${n >= 0 ? "good" : "bad"}">${n >= 0 ? "+" : ""}${n}</span>`;
  UI.stat = (label, value) => `<div><span>${label}</span><b>${value}</b></div>`;
  // A small "?" that shows its text when the pointer rests on it.
  UI.helpTip = (text) => `<span class="help" title="${text.replace(/"/g, "&quot;")}">?</span>`;
  UI.placeLabel = (id) => (S.isFort(state, id) ? `${state.forts[id].name}(${S.FORT_KINDS[state.forts[id].kind]})` : state.cities[id].name);

  // Write markup only when it differs from what is there: most redraws change
  // nothing, and leaving the page alone keeps scrolling and hovering steady.
  // Not for windows the player types into.
  UI.setHTML = function (el, html) {
    if (!el || el.__html === html) return false;
    el.innerHTML = html;
    el.__html = html;
    return true;
  };

  // ---------- storage ----------
  // Slots: "auto" is written every month and on leaving for the main menu;
  // the numbered ones only when the player says so.
  UI.SLOTS = ["auto", "1", "2", "3", "4", "5"];
  const slotKey = (slot) => (!slot || slot === "auto" ? SAVE_KEY : "sowsam.slot." + slot);
  UI.slotName = (slot) => (!slot || slot === "auto" ? "자동 저장" : `슬롯 ${slot}`);
  UI.saveGame = function (quiet, slot) {
    try {
      state.savedAt = Date.now();
      localStorage.setItem(slotKey(slot), JSON.stringify(state));
      if (!quiet) UI.toast(`${UI.slotName(slot)}에 저장했습니다.`);
      return true;
    } catch (e) {
      UI.toast("저장하지 못했습니다: " + e.message);
      return false;
    }
  };
  // What each slot holds, for the lists: null info when empty or unusable.
  UI.slotList = () => UI.SLOTS.map((slot) => {
    const g = UI.loadSaved(slot);
    if (!g || g.over) return { slot, info: null };
    const sc = S.scenarioOf && S.scenarioOf(g.scenario);
    const f = g.playerForce && g.forces[g.playerForce];
    const cities = f ? Object.values(g.cities).filter((c) => c.owner === f.id).length : 0;
    const me = g.player && g.officers[g.player];
    const who = me && (!f || f.ruler !== me.id) ? `${me.name} · ` : "";
    return { slot, info: { savedAt: g.savedAt || 0,
      text: `${g.year}년 ${g.month}월 · ${who}${f ? `${f.name}군 (도시 ${cities})` : me ? "재야" : "관전"}${sc ? ` · ${sc.title}` : ""}` } };
  });
  UI.loadSaved = function (slot) {
    try {
      const raw = localStorage.getItem(slotKey(slot));
      const saved = raw ? JSON.parse(raw) : null;
      // A save from a map that is gone, or from before cities were added or
      // removed, cannot be played on.
      const map = saved && S.MAPS[saved.map];
      if (!map || (saved.version || 1) > S.SAVE_VERSION) return null; // gone, or from a newer game
      const now = Object.keys(map.cities), then = Object.keys(saved.cities || {});
      return now.length === then.length && now.every((id) => saved.cities[id]) ? saved : null;
    } catch (e) {
      return null;
    }
  };
  UI.clearSave = function (slot) {
    try { localStorage.removeItem(slotKey(slot)); } catch (e) { /* ignore */ }
  };

  // ---------- windows ----------
  UI.modalOpen = () => !$("#modal").classList.contains("hidden");
  UI.cityWinOpen = () => !$("#cityWin").classList.contains("hidden");
  // A window: a title strip, the body, and buttons along the bottom.
  UI.openModal = function (html, wide) {
    const box = $("#modal .box");
    box.className = "box" + (wide ? " wide" : "");
    box.innerHTML = html;
    box.scrollTop = 0;
    $("#modal").classList.remove("hidden");
    UI.modalOnInput = null;
    UI.modalOnClose = null;
    // Time stands still while a window is open, and runs again when it closes.
    UI.holdClock();
    UI.renderClock();
  };
  UI.closeModal = function () {
    $("#modal").classList.add("hidden");
    UI.modalOnInput = null;
    const closing = UI.modalOnClose; // run once, when the window really closes
    UI.modalOnClose = null;
    if (closing) closing();
    UI.listOpen = null;
    // Keep waiting while the command window behind is still open.
    if (!UI.cityWinOpen()) UI.releaseClock();
    UI.renderClock();
  };
  UI.openCity = function (id) {
    if (UI.selected !== id) UI.tab = "cmd";
    UI.selected = id;
    UI.winOpen = true;
    UI.holdClock();
    UI.renderAll();
  };
  UI.closeCity = function () {
    UI.winOpen = false;
    $("#cityWin").classList.add("hidden");
    if (!UI.modalOpen()) UI.releaseClock();
    UI.renderClock();
  };

  let toastTimer = null;
  UI.toast = function (msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
  };
  // The outcome of a command: say it, log it, redraw.
  UI.result = function (r) {
    if (!r.ok) { UI.toast(r.msg); return false; }
    if (!r.logged) S.addLog(state, r.msg, "mine"); // some say it in the log themselves
    UI.toast(r.msg);
    UI.renderAll();
    return true;
  };

  // ---------- redraw ----------
  let panelOf = null; // the place the panel showed last, to keep its scroll
  UI.renderAll = function () {
    UI.renderStatus();
    UI.renderMap();
    if (panelOf === UI.selected) UI.keepScroll(UI.renderPanel);
    else UI.renderPanel();
    panelOf = UI.selected;
    UI.renderLog();
  };
  UI.keepScroll = function (fn) {
    const box = () => [$("#panelInfo"), $("#cityWin .cwb")];
    const tops = box().map((el) => el && el.scrollTop);
    fn();
    box().forEach((el, i) => { if (el && tops[i] != null) el.scrollTop = tops[i]; });
  };
  // Kinds of news, for the legend under the map that filters the log.
  UI.LOG_KINDS = [
    ["war", "전투", ["war", "warfail"]], ["fall", "큰일", ["fall", "threat"]], ["warn", "경고", ["warn"]],
    ["mine", "명령", ["mine"]], ["sys", "알림", ["sys"]], ["info", "소식", ["info"]], ["strife", "궁정", ["strife"]],
  ];
  const LOG_KEY = "sowsam.logFilter";
  UI.logHidden = (() => { try { return new Set(JSON.parse(localStorage.getItem(LOG_KEY)) || []); } catch (e) { return new Set(); } })();
  UI.toggleLogKind = function (k) {
    if (UI.logHidden.has(k)) UI.logHidden.delete(k); else UI.logHidden.add(k);
    try { localStorage.setItem(LOG_KEY, JSON.stringify([...UI.logHidden])); } catch (e) { /* the filter just is not kept */ }
    UI.renderLog();
  };
  function renderLegend() {
    const el = $("#logLegend");
    if (!el || el.dataset.built) return;
    el.dataset.built = "1";
    UI.setHTML(el, `<span class="lg-title">전황 보기</span>` + UI.LOG_KINDS.map(([k, label]) =>
      `<label class="${k}"><input type="checkbox" data-logkind="${k}"${UI.logHidden.has(k) ? "" : " checked"}><i></i>${label}</label>`).join(""));
    el.addEventListener("change", (e) => { const k = e.target.dataset.logkind; if (k) UI.toggleLogKind(k); });
  }
  UI.renderLog = function () {
    renderLegend();
    const hide = new Set(UI.LOG_KINDS.filter(([k]) => UI.logHidden.has(k)).flatMap(([, , kinds]) => kinds));
    const entries = state.log.filter((e) => !hide.has(e.kind)).slice(-80).reverse();
    UI.setHTML($("#log"), entries.map((e) =>
      `<div class="${e.kind}"><i>${e.y}.${e.m}${e.d ? "." + e.d : ""}</i>${e.text}</div>`).join(""));
  };
})(globalThis.SAM = globalThis.SAM || {});
