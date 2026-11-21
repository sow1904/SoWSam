// Titles (작위) for rulers. While the Han stands, a ruler who has grown
// enough is named to a higher title by 헌제: the month after he first meets
// its terms, an imperial envoy (칙사) arrives with the appointment, if the
// terms still hold then. A title, once given, is kept, and the heir keeps it.
// 황제 comes only by abdication (선양) or proclamation (칭제), js/court.js.
// Once the Han is gone, a ruler takes each title himself (자칭) the moment
// he meets its terms.
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
// Names, fixed when the envoy is sent (the capital and province then):
//   열후  the capital's county + 후 (신야후, 말릉후, 계후); a capital in a
//         윤 is that 윤 (하남윤, 경조윤)
//   주목  the province + 목 (서주목); 형남·형북 형주목, 남중 익주목, 요동
//         유주목, 사례 사례교위 (the Han gave titles to places it did not hold)
//   공    the capital's commandery + 공 (위공, 촉공, 오공): the realm's name
//   왕    the realm + 왕, or a man's own (한중왕 유비, 사왕 사섭, ...)
//   황제  the realm, or a man's own (중 원술, 위 조조, ...); one who holds
//         the Han dear carries on the Han once it has ended
// While the Han stands, 표기장군, 대장군 and 승상 are one man's each: a
// second ruler who earns one is made 도독이주/삼주/사주제군사 instead, and
// named to the title itself when it falls free. Without the Han, anyone may
// call himself anything.
//
// Which offices each title may give is still to be decided.
// why: the user's design for ruler titles and their names.
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
    { key: "noble", name: "제후", need: "처음 작위", named: "제후" },
    { key: "lord", name: "열후", need: `온전한 주 없이 성 ${T.lord.cities}개 이상`, named: "수도의 현 + 후 (신야후). 수도가 윤이면 그 윤 (하남윤)" },
    { key: "governor", name: "주목", need: "주 하나를 온전히", named: "그 주 + 목 (서주목). 형남·형북은 형주목, 남중은 익주목, 요동은 유주목, 사례는 사례교위" },
    { key: "general", name: "표기장군", need: `주 ${T.general.provs}개를 온전히, 또는 성 ${T.general.cities}개 이상`, named: "한 왕조가 있는 동안 이미 받은 세력이 있으면 도독이주제군사" },
    { key: "marshal", name: "대장군", need: `주 ${T.marshal.provs}개를 온전히, 또는 성 ${T.marshal.cities}개 이상`, named: "한 왕조가 있는 동안 이미 받은 세력이 있으면 도독삼주제군사" },
    { key: "chancellor", name: "승상", need: `주 ${T.chancellor.provs}개를 온전히, 또는 성 ${T.chancellor.cities}개 이상`, named: "한 왕조가 있는 동안 이미 받은 세력이 있으면 도독사주제군사" },
    { key: "duke", name: "공", need: `지방 하나를 온전히, 명성 ${T.duke.fame} 이상`, named: "수도의 군 + 공 (위공). 이 이름이 나라 이름이 됨" },
    { key: "king", name: "왕", need: `공 작위, 명성 ${T.king.fame} 이상`, named: "나라 이름 + 왕 (위왕). 한중왕 유비, 사왕 사섭, 요동왕 공손씨, 남만왕 맹획, 덕왕 엄백호, 진왕 사마씨" },
  ];
  const RANK = {};
  S.TITLES.forEach((t, i) => { RANK[t.key] = i; });
  const BY = Object.fromEntries(S.TITLES.map((t) => [t.key, t]));

  const PROV_TITLE = { jingnan: "형주목", jingbei: "형주목", nanzhong: "익주목", liaodong: "유주목", sili: "사례교위" };
  const DUDU = { general: "도독이주제군사", marshal: "도독삼주제군사", chancellor: "도독사주제군사" };
  const KING_OF = { 유비: "한중왕", 사섭: "사왕", 맹획: "남만왕", 엄백호: "덕왕" };
  const KING_CLAN = [["공손도", "요동왕"], ["사마의", "진왕"]]; // the whole house
  const EMPEROR_OF = { 원술: "중", 조조: "위", 손권: "오", 유비: "촉한" };
  S.TITLE_NAMES = { PROV_TITLE, DUDU, KING_OF, KING_CLAN, EMPEROR_OF };

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

  const rulerOf = (state, f) => state.officers[f.ruler] || {};
  const clanOf = (name) => (S.CLAN && S.CLAN[name] ? S.CLAN[name].clan : null);
  const realmOf = (c) => (c ? (c.jun || c.name).replace(/(군|국|윤)$/, "") : "");
  const capCity = (state, fid) => state.cities[S.capitalOf(state, fid)] || S.citiesOf(state, fid)[0] || null;

  // The emperor's dynasty: a man's own, the Han for its loyal heir, else the realm.
  S.dynastyName = function (state, fid) {
    const f = state.forces[fid];
    const r = rulerOf(state, f);
    return EMPEROR_OF[r.name] || (f.hanHeir ? "한" : f.realm || realmOf(capCity(state, fid)) || f.name);
  };
  S.titleKey = (state, fid) => (state.forces[fid].title || "noble");
  S.titleName = function (state, fid) {
    const f = state.forces[fid];
    if (f.emperor) return `${f.dynasty || S.dynastyName(state, fid)} 황제`;
    return f.titleName || BY[S.titleKey(state, fid)].name;
  };
  S.titleRank = (key) => RANK[key];
  S.titlesOpen = (state) => !!(state.emperor && state.han && !state.han.ended);

  // Another living ruler already holds this title under its own name.
  const heldBy = (state, fid, key) => Object.values(state.forces).find((x) =>
    x.alive && x.id !== fid && !x.emperor && x.title === key && x.titleName === BY[key].name);

  // Where the title is fixed: the capital now and the whole province that earns 주목.
  function placeNow(state, fid) {
    const cap = capCity(state, fid);
    const { provs } = wholeOf(state, fid);
    const n = (p) => Object.values(state.cities).filter((c) => c.prov === p).length;
    const prov = cap && provs.includes(cap.prov) ? cap.prov : provs.sort((a, b) => n(b) - n(a))[0] || null;
    return { cap: cap ? cap.id : null, prov };
  }

  function nameFor(state, fid, key, at) {
    const f = state.forces[fid];
    const cap = state.cities[at.cap] || capCity(state, fid);
    const r = rulerOf(state, f);
    switch (key) {
      case "lord": return cap && /윤$/.test(cap.jun || "") ? cap.jun : cap ? `${cap.seat || cap.name}후` : BY.lord.name;
      case "governor": {
        const { provs } = wholeOf(state, fid);
        const p = provs.includes(at.prov) ? at.prov : placeNow(state, fid).prov || at.prov;
        return p ? PROV_TITLE[p] || `${S.PROVINCES[p]}목` : BY.governor.name;
      }
      case "general": case "marshal": case "chancellor":
        return S.titlesOpen(state) && heldBy(state, fid, key) ? DUDU[key] : BY[key].name;
      case "duke": return `${f.realm || realmOf(cap)}공`;
      case "king": {
        if (KING_OF[r.name]) return KING_OF[r.name];
        const house = KING_CLAN.find(([head]) => head === r.name || (clanOf(r.name) && clanOf(r.name) === clanOf(head)));
        return house ? house[1] : `${f.realm || realmOf(cap)}왕`;
      }
      default: return BY[key].name;
    }
  }

  // The highest title the force has earned now, given the one it holds.
  S.titleEarned = function (state, fid) {
    const f = state.forces[fid];
    const have = S.titleKey(state, fid);
    const n = S.citiesOf(state, fid).length;
    const { provs, regions } = wholeOf(state, fid);
    const fame = rulerOf(state, f).fame || 0;
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
  // What the force would be given now: a higher title, or the title itself
  // for one made 도독 in its place once it falls free. null for nothing.
  function wanted(state, fid) {
    const f = state.forces[fid];
    const k = S.titleEarned(state, fid);
    if (k !== S.titleKey(state, fid)) return k;
    if (DUDU[k] && f.titleName === DUDU[k] && (!S.titlesOpen(state) || !heldBy(state, fid, k))) return k;
    return null;
  }

  function setTitle(state, f, key, at) {
    f.title = key;
    f.titleName = nameFor(state, f.id, key, at);
    if (key === "duke") f.realm = f.titleName.replace(/공$/, "");
  }

  function grant(state, f, key, at, self) {
    const before = S.titleName(state, f.id);
    setTitle(state, f, key, at);
    const name = f.titleName;
    const ruler = rulerOf(state, f);
    const mine = f.id === state.playerForce;
    if (!mine && RANK[key] < RANK.governor) return;
    S.addLog(state, self
      ? `${S.josa(ruler.name, "이", "가")} 스스로 ${S.josa(name, "을", "를")} 칭했습니다. (${before} → ${name})`
      : `헌제의 칙사가 ${S.forceName(state, f.id)}에 이르러 ${ruler.name}에게 ${name} 작위를 내렸습니다. (${before} → ${name})`, mine ? "sys" : "info");
  }

  // At the start, every ruler holds what his realm already earns, at once.
  S.initTitles = function (state) {
    for (const f of Object.values(state.forces)) {
      if (!f.alive || f.title) continue;
      f.title = "noble";
      f.titleName = BY.noble.name;
      if (f.emperor) { f.dynasty = f.dynasty || S.dynastyName(state, f.id); continue; }
      for (let i = 0; i < S.TITLES.length; i++) {
        const k = wanted(state, f.id);
        if (!k) break;
        setTitle(state, f, k, placeNow(state, f.id));
      }
    }
  };

  // Each day: under the Han an envoy is sent to a force that has earned
  // more and arrives a month later; without it, the ruler takes it at once.
  S.runTitles = function (state) {
    const open = S.titlesOpen(state);
    const today = S.today(state);
    for (const f of Object.values(state.forces)) {
      if (!f.alive) continue;
      if (!f.title) f.title = "noble";
      if (f.emperor) { delete f.titleDue; if (!f.dynasty) f.dynasty = S.dynastyName(state, f.id); continue; }
      if (!open) {
        delete f.titleDue;
        const k = wanted(state, f.id);
        if (k) grant(state, f, k, placeNow(state, f.id), true);
        continue;
      }
      const due = f.titleDue;
      if (due && today >= due.at) {
        delete f.titleDue;
        const k = wanted(state, f.id);
        if (k) grant(state, f, k, due, false);
        else if (f.id === state.playerForce) S.addLog(state, "헌제의 칙사가 이르렀지만, 그사이 작위를 받을 만한 땅이나 명성을 잃어 그냥 돌아갔습니다.", "warn");
        continue;
      }
      if (due) continue;
      const k = wanted(state, f.id);
      if (!k) continue;
      f.titleDue = Object.assign({ at: today + S.DAYS_PER_MONTH, key: k }, placeNow(state, f.id));
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
