// Clicks, keys and the start of the game.
(function (S) {
  const UI = S.UI, $ = UI.$;
  let state = null;
  UI.bind((s) => { state = s; });

  Object.assign(UI.actions, {
    close: () => UI.closeModal(),
    select: (d) => UI.openCity(d.city),
    closeCity: () => UI.closeCity(),
    tab: (d) => { UI.tab = d.tab; UI.renderPanel(); },
    cycle: (d) => UI.cycleCity(+d.step),
  });

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-action], [data-city]");
    if (!el) return;
    if (el.dataset.action) {
      const fn = UI.actions[el.dataset.action];
      if (fn) fn(el.dataset);
    } else if (el.dataset.city && state) {
      if (UI.dragged) return;
      UI.openCity(el.dataset.city);
    }
  });
  document.addEventListener("input", (ev) => {
    const id = ev.target.id;
    // Keep range sliders and number boxes in sync.
    if (id && $("#" + id + "N")) $("#" + id + "N").value = ev.target.value;
    if (id && id.endsWith("N") && $("#" + id.slice(0, -1))) $("#" + id.slice(0, -1)).value = ev.target.value;
    if (UI.modalOnInput) UI.modalOnInput();
  });
  document.addEventListener("change", (ev) => {
    if (ev.target.id === "defPolicy" && state) { UI.result(S.setDefensePolicy(state, ev.target.dataset.place, ev.target.value)); return; }
    if (ev.target.id === "delegate" && state) { UI.result(S.setDelegate(state, ev.target.dataset.place, ev.target.value || null)); return; }
    if (UI.modalOnInput) UI.modalOnInput();
  });
  $("#modal").addEventListener("click", (ev) => {
    if (ev.target.id === "modal" && state) UI.closeModal();
  });

  // Keys: Space runs or pauses, 1-4 set the speed, Esc closes the window on
  // top, Q and E step through the player's cities, and the main menu opens
  // by letter.
  const MENU_KEYS = { KeyF: "forces", KeyC: "cities", KeyG: "officers", KeyD: "diplomacy", KeyJ: "council", KeyH: "court", KeyT: "tech" };
  document.addEventListener("keydown", (ev) => {
    if (!state || state.over || ev.ctrlKey || ev.altKey || ev.metaKey || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    if (ev.code === "Escape") {
      if (UI.modalOpen()) UI.closeModal();
      else if (UI.cityWinOpen()) UI.closeCity();
      return;
    }
    if (ev.code === "F1") {
      ev.preventDefault();
      if (UI.modalOpen()) UI.closeModal(); else UI.showHelp();
      return;
    }
    if (ev.code === "Space") {
      ev.preventDefault();
      if (!UI.modalOpen()) UI.actions.togglePause();
    } else if (/^Digit[1-4]$/.test(ev.code)) {
      UI.actions.speed({ s: +ev.code.slice(5) - 1 });
    } else if (UI.modalOpen()) {
      return;
    } else if (ev.code === "KeyQ" || ev.code === "KeyE") {
      UI.cycleCity(ev.code === "KeyQ" ? -1 : 1);
    } else if (MENU_KEYS[ev.code]) {
      UI.actions[MENU_KEYS[ev.code]]();
    }
  });

  UI.setupMapControls();
  UI.startClock();
  UI.showTitle();
})(globalThis.SAM = globalThis.SAM || {});
