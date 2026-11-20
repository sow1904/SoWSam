// The season's news (js/seasons.js): on the first day of each season a card
// over the map shows what the season brings and where, on the small map of
// the land (UI.miniMap, js/ui/menu.js). It closes by itself after a while.
(function (S) {
  const UI = S.UI, $ = UI.$;
  let state = null;
  UI.bind((s) => { state = s; });
  const SE = S.SEASON;
  const COLORS = { plague: "#a77bd8", drought: "#e0a040", flood: "#4aa3e8", typhoon: "#5fd0c0", locust: "#9c7a3c", crop: "#d0503c", rich: "#6cc070" };
  const LABEL = { plague: "역병", drought: "가뭄", flood: "홍수", typhoon: "태풍", locust: "황충", crop: "흉작", rich: "풍작" };
  const kindOf = (it) => (it.kind === "crop" ? (it.crop === 2 ? "rich" : "crop") : it.kind);
  const placeOf = (it) => (it.city ? state.cities[it.city].name : S.PROVINCES[it.prov]);
  const pc = (v) => `${Math.round(v * 100)}%`;
  const EFFECT = {
    plague: `석 달 동안 인구·병역 인구 -${pc(SE.plague.toll[0])}~${pc(SE.plague.toll[1])}`,
    flood: `석 달 동안 병역 인구 -${pc(SE.flood.manpower)}, 회복 없음`,
    typhoon: `석 달 동안 목재 생산 ${pc(SE.typhoon.wood)}`,
    drought: `가을 수확 ${pc(SE.drought.harvest)}`,
    locust: `석 달 동안 비축 군량 -${pc(SE.locust.store)}, 수확 ${pc(SE.locust.harvest)}`,
    crop: `수확 ${pc(SE.crop.mul[0])}`, rich: `수확 ${pc(SE.crop.mul[2])}`,
  };
  let timer = 0;

  UI.showSeason = function (news, auto) {
    news = news || state.seasonNews;
    if (!news) { UI.toast("아직 계절 소식이 없습니다."); return; }
    // Where each thing falls: cities directly, provinces by their cities.
    const marks = {};
    for (const it of news.items) {
      const k = kindOf(it);
      const cs = it.cities || (it.city ? [it.city] : Object.values(state.cities).filter((c) => c.prov === it.prov).map((c) => c.id));
      for (const id of cs) (marks[id] = marks[id] || []).includes(k) || marks[id].push(k);
    }
    const groups = {};
    for (const it of news.items) (groups[kindOf(it)] = groups[kindOf(it)] || []).push(it);
    const order = ["plague", "flood", "typhoon", "drought", "locust", "crop", "rich"];
    const lines = order.filter((k) => groups[k]).map((k) => {
      const list = groups[k];
      return `<li><span class="sw" style="background:${COLORS[k]}"></span><b>${LABEL[k]}</b> ` + list.map(placeOf).join(", ") + ` <span class="hint">${EFFECT[k]}</span></li>`;
    }).join("");
    const name = SE.names[news.season];
    const quiet = { 0: "봄에는 큰 재해가 없습니다. 씨를 뿌리는 계절입니다.", 1: "올여름은 큰 재해 없이 지나갈 듯합니다.", 2: "올가을은 어디나 평작입니다.", 3: "올겨울은 역병 없이 지나갈 듯합니다." }[news.season];
    let el = $("#seasonPop");
    if (!el) {
      el = document.createElement("div");
      el.id = "seasonPop";
      document.body.appendChild(el);
      el.addEventListener("click", () => UI.hideSeason());
    }
    el.className = `season s${news.season}`;
    UI.setHTML(el, `<div class="card"><h2>${news.year}년 ${name}</h2>` +
      (news.plagueYear ? `<p class="bad">역병이 크게 도는 해입니다.</p>` : "") +
      `<div class="season-map">${UI.miniMap(state, null, { marks, colors: COLORS })}</div>` +
      (lines ? `<ul>${lines}</ul>` : `<p class="hint">${quiet}</p>`) +
      `<p class="hint">누르면 닫힙니다. 상태 줄의 계절 버튼으로 다시 볼 수 있습니다.</p></div>`);
    el.classList.remove("hidden");
    clearTimeout(timer);
    if (auto) timer = setTimeout(() => UI.hideSeason(), lines ? 9000 : 4000);
  };
  UI.hideSeason = function () {
    clearTimeout(timer);
    const el = $("#seasonPop");
    if (el) el.classList.add("hidden");
  };
  // The city panel: what weighs on it now.
  UI.woeLine = function (c) {
    const w = S.woesOf ? S.woesOf(state, c) : [];
    return w.length ? `<p class="woes">${w.map((x) => `<span class="woe" style="--c:${COLORS[x.kind] || "#999"}">${x.label}</span>`).join(" ")}</p>` : "";
  };
  UI.actions.season = () => UI.showSeason(state.seasonNews);
})(globalThis.SAM = globalThis.SAM || {});
