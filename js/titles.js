// Titles (작위) for rulers. While the Han stands, a ruler who has grown
// enough is named to a higher title by 헌제: the month after he first meets
// its terms, an imperial envoy (칙사) arrives with the appointment, if the
// terms still hold then. A title, once given, is kept, and the heir keeps it.
// 황제 comes only by abdication (선양) or proclamation (칭제), js/court.js.
//
//   제후      everyone at first
//   열후      5 cities or more, with no whole province (주)
//   주목      a whole province
//   표기장군  2 whole provinces, or 10 cities
//   대장군    3 whole provinces, or 15 cities
//   승상      4 whole provinces, or 20 cities
//   공        a whole region (지방, S.REGIONS) and fame 60
//   왕        the title of 공 already, and fame 80
//
// Which offices each title may give is still to be decided.
// why: the user's design for ruler titles.
(function (S) {
  const T = S.TITLE_RULE = {
    lord: { cities: 5 },
    general: { provs: 2, cities: 10 },
    marshal: { provs: 3, cities: 15 },
    chancellor: { provs: 4, cities: 20 },
    duke: { fame: 60 },
    king: { fame: 80 },
  };
  S.TITLES = [
    { key: "noble", name: "제후", need: "처음 작위" },
    { key: "lord", name: "열후", need: `온전한 주 없이 성 ${T.lord.cities}개 이상` },
    { key: "governor", name: "주목", need: "주 하나를 온전히" },
    { key: "general", name: "표기장군", need: `주 ${T.general.provs}개를 온전히, 또는 성 ${T.general.cities}개 이상` },
    { key: "marshal", name: "대장군", need: `주 ${T.marshal.provs}개를 온전히, 또는 성 ${T.marshal.cities}개 이상` },
    { key: "chancellor", name: "승상", need: `주 ${T.chancellor.provs}개를 온전히, 또는 성 ${T.chancellor.cities}개 이상` },
    { key: "duke", name: "공", need: `지방 하나를 온전히, 명성 ${T.duke.fame} 이상` },
    { key: "king", name: "왕", need: `공 작위, 명성 ${T.king.fame} 이상` },
  ];
  const RANK = {};
  S.TITLES.forEach((t, i) => { RANK[t.key] = i; });
  const BY = Object.fromEntries(S.TITLES.map((t) => [t.key, t]));

  // Whole provinces and regions a force holds (only cities in this scenario count).
  function wholeOf(state, fid) {
    const all = {}, mine = {};
    for (const c of Object.values(state.cities)) {
      all[c.prov] = (all[c.prov] || 0) + 1;
      if (c.owner === fid) mine[c.prov] = (mine[c.prov] || 0) + 1;
    }
    const provs = Object.keys(mine).filter((p) => mine[p] === all[p]);
    const regions = Object.keys(S.REGIONS).filter((r) => {
      const ps = S.REGIONS[r].provs.filter((p) => all[p]);
      return ps.length && ps.every((p) => provs.includes(p));
    });
    return { provs, regions };
  }
  S.wholeLands = wholeOf;

  S.titleKey = (state, fid) => (state.forces[fid].title || "noble");
  S.titleName = (state, fid) => (state.forces[fid].emperor ? "황제" : BY[S.titleKey(state, fid)].name);
  S.titleRank = (key) => RANK[key];

  // The highest title the force has earned now, given the one it holds.
  S.titleEarned = function (state, fid) {
    const f = state.forces[fid];
    const have = S.titleKey(state, fid);
    const n = S.citiesOf(state, fid).length;
    const { provs, regions } = wholeOf(state, fid);
    const fame = (state.officers[f.ruler] || {}).fame || 0;
    const p = provs.length;
    let best = "noble";
    if (p === 0 && n >= T.lord.cities) best = "lord";
    if (p >= 1) best = "governor";
    if (p >= T.general.provs || n >= T.general.cities) best = "general";
    if (p >= T.marshal.provs || n >= T.marshal.cities) best = "marshal";
    if (p >= T.chancellor.provs || n >= T.chancellor.cities) best = "chancellor";
    if (regions.length && fame >= T.duke.fame) best = "duke";
    if (RANK[have] >= RANK.duke && fame >= T.king.fame) best = "king";
    return RANK[best] > RANK[have] ? best : have;
  };

  // Envoys come only while the Han stands and the emperor is somewhere.
  S.titlesOpen = (state) => !!(state.emperor && state.han && !state.han.ended);

  // At the start, every ruler holds what his realm already earns, at once.
  S.initTitles = function (state) {
    for (const f of Object.values(state.forces)) {
      if (!f.alive || f.title) continue;
      f.title = "noble";
      if (!S.titlesOpen(state)) continue;
      for (let i = 0; i < S.TITLES.length; i++) {
        const k = S.titleEarned(state, f.id);
        if (k === f.title) break;
        f.title = k;
      }
    }
  };

  function grant(state, f, key) {
    const before = BY[S.titleKey(state, f.id)].name;
    f.title = key;
    const ruler = state.officers[f.ruler];
    const name = BY[key].name;
    const mine = f.id === state.playerForce;
    if (mine || RANK[key] >= RANK.governor) {
      S.addLog(state, `헌제의 칙사가 ${S.forceName(state, f.id)}에 이르러 ${ruler.name}에게 ${name} 작위를 내렸습니다. (${before} → ${name})`, mine ? "sys" : "info");
    }
  }

  // Each day: a force that has earned more is sent an envoy; he arrives a month later.
  S.runTitles = function (state) {
    const open = S.titlesOpen(state);
    const today = S.today(state);
    for (const f of Object.values(state.forces)) {
      if (!f.alive) continue;
      if (!f.title) f.title = "noble";
      if (!open || f.emperor) { delete f.titleDue; continue; }
      const due = f.titleDue;
      if (due && today >= due.at) {
        delete f.titleDue;
        const k = S.titleEarned(state, f.id);
        if (k !== f.title) grant(state, f, k);
        else if (f.id === state.playerForce) S.addLog(state, "헌제의 칙사가 이르렀지만, 그사이 작위를 받을 만한 땅이나 명성을 잃어 그냥 돌아갔습니다.", "warn");
        continue;
      }
      if (due) continue;
      const k = S.titleEarned(state, f.id);
      if (k === f.title) continue;
      f.titleDue = { at: today + S.DAYS_PER_MONTH, key: k };
      if (f.id === state.playerForce) S.addLog(state, `헌제가 ${S.forceName(state, f.id)}에 칙사를 보냈습니다. 한 달 뒤에 ${BY[k].name} 작위를 가지고 이릅니다.`, "sys");
    }
  };

  // New games begin with the titles their realms have earned.
  const newGame = S.newGame;
  S.newGame = function () {
    const state = newGame.apply(this, arguments);
    S.initTitles(state);
    return state;
  };
})(globalThis.SAM = globalThis.SAM || {});
