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
  UI.mine = (c) => !!c && c.owner === state.playerForce;
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
  UI.saveGame = function (quiet) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      if (!quiet) UI.toast("저장했습니다.");
    } catch (e) {
      UI.toast("저장하지 못했습니다: " + e.message);
    }
  };
  UI.loadSaved = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      // A save from a map that is gone (the 99-commandery map) cannot be played on.
      return saved && S.MAPS[saved.map] ? saved : null;
    } catch (e) {
      return null;
    }
  };
  UI.clearSave = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
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
    // Time stands still while a window is open, and runs again when it closes.
    UI.holdClock();
    UI.renderClock();
  };
  UI.closeModal = function () {
    $("#modal").classList.add("hidden");
    UI.modalOnInput = null;
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
    S.addLog(state, r.msg, "mine");
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
  UI.renderLog = function () {
    const entries = state.log.slice(-80).reverse();
    UI.setHTML($("#log"), entries.map((e) =>
      `<div class="${e.kind}"><i>${e.y}.${e.m}${e.d ? "." + e.d : ""}</i>${e.text}</div>`).join(""));
  };
})(globalThis.SAM = globalThis.SAM || {});
