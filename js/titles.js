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
//   공    a realm name from S.REALMS + 공 (위(魏)공): the computer takes the
//         first free one for its capital, the player chooses
//   왕    the realm + 왕, or a man's own (한중왕 유비, 사(士)왕 사섭, ...)
//   황제  the realm, or a man's own (중(仲) 원술, 위(魏) 조조, ..., 진(晉)
//         for the whole 사마 house); one who holds the Han dear carries on
//         the Han (한(漢)) once it has ended
// Many may hold the same 주목 (one who lost his province keeps the name); a
// computer 주목 without his province makes winning it back his first aim.
// A realm name is one ruler's alone, a man's own included (if taken, he
// goes by his realm); only heirs of the Han may share 한(漢).
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
    { key: "governor", name: "주목", need: "주 하나를 온전히", named: "그 주 + 목 (서주목). 형남·형북은 형주목, 남중은 익주목, 요동은 유주목, 사례는 사례교위. 여러 군주가 같은 주목일 수 있고, 그 주를 잃은 컴퓨터 주목은 그 주를 되찾으려 함" },
    { key: "general", name: "표기장군", need: `주 ${T.general.provs}개를 온전히, 또는 성 ${T.general.cities}개 이상`, named: "한 왕조가 있는 동안 이미 받은 세력이 있으면 도독이주제군사" },
    { key: "marshal", name: "대장군", need: `주 ${T.marshal.provs}개를 온전히, 또는 성 ${T.marshal.cities}개 이상`, named: "한 왕조가 있는 동안 이미 받은 세력이 있으면 도독삼주제군사" },
    { key: "chancellor", name: "승상", need: `주 ${T.chancellor.provs}개를 온전히, 또는 성 ${T.chancellor.cities}개 이상`, named: "한 왕조가 있는 동안 이미 받은 세력이 있으면 도독사주제군사" },
    { key: "duke", name: "공", need: `지방 하나를 온전히, 명성 ${T.duke.fame} 이상`, named: "나라 이름 + 공 (위(魏)공). 컴퓨터는 수도에 맞는 이름을, 플레이어는 직접 고름" },
    { key: "king", name: "왕", need: `공 작위, 명성 ${T.king.fame} 이상`, named: "나라 이름 + 왕 (위(魏)왕). 한중왕 유비, 사(士)왕 사섭, 요동왕 공손씨, 남만왕 맹획, 덕(德)왕 엄백호, 진(晉)왕 사마씨 (다른 군주가 쓰는 이름이면 제 나라 이름)" },
  ];
  const RANK = {};
  S.TITLES.forEach((t, i) => { RANK[t.key] = i; });
  const BY = Object.fromEntries(S.TITLES.map((t) => [t.key, t]));

  const PROV_TITLE = { jingnan: "형주목", jingbei: "형주목", nanzhong: "익주목", liaodong: "유주목", sili: "사례교위" };
  const DUDU = { general: "도독이주제군사", marshal: "도독삼주제군사", chancellor: "도독사주제군사" };
  // A man's own realm as 왕 and as 황제; given only if no other ruler holds that name.
  const KING_OF = { 유비: "한중", 사섭: "사(士)", 맹획: "남만", 엄백호: "덕(德)" };
  const KING_CLAN = [["공손도", "요동"], ["사마의", "진(晉)"]]; // the whole house
  const EMPEROR_OF = { 원술: "중(仲)", 조조: "위(魏)", 손권: "오(吳)", 유비: "촉한" };
  const EMPEROR_CLAN = [["사마의", "진(晉)"]]; // the whole house, as for 왕
  const HAN = "한(漢)";

  // Realm names (나라 이름) for 공, 왕 and 황제: the Warring States, the
  // Three Kingdoms and their neighbours. One syllable carries its hanja.
  // home: the cities whose capital calls for that name; near: the names to
  // fall back on, in order, when it is taken. A computer ruler takes the
  // first free name for his capital; the player chooses.
  const REALMS = [
    { name: "진(秦)", home: ["jingzhao", "zuopingyi", "youfufeng", "hanyang"], near: ["량(凉)", "강(羌)", "저(氐)"] },
    { name: "량(凉)", home: ["longxi", "wuwei", "jincheng", "jiuquan", "zhangye"], near: ["진(秦)", "강(羌)", "저(氐)"] },
    { name: "진(晉)", home: ["taiyuan", "shangdang", "xihe", "yanmen"], near: ["당(唐)", "흉노", "갈(羯)"] },
    { name: "위(魏)", home: ["weijun", "henei", "hedong", "chenliu", "dongjun"], near: ["상(商)", "하(夏)", "조(趙)"] },
    { name: "한(韓)", home: ["yingchuan", "hongnong", "nanyang"], near: ["정(鄭)", "주(周)"] },
    { name: "주(周)", home: ["henan"], near: ["한(韓)", "정(鄭)", "하(夏)"] },
    { name: "송(宋)", home: ["peiguo", "qiao"], near: ["상(商)", "노(魯)", "초(楚)"] },
    { name: "노(魯)", home: ["taishan", "shanyang"], near: ["제(齊)", "송(宋)"] },
    { name: "조(趙)", home: ["julu", "changshan", "hejian", "bohai", "daijun"], near: ["위(魏)", "선비"] },
    { name: "연(燕)", home: ["guangyang", "zhuo", "liaoxi"], near: ["선비", "요동"] },
    { name: "제(齊)", home: ["qiguo", "beihai", "jinan", "donglai", "pingyuan"], near: ["노(魯)", "송(宋)"] },
    { name: "초(楚)", home: ["xiangyang", "xinye", "xincheng", "jiangxia", "nanjun", "wuling", "lingling", "changsha", "guiyang", "wuchang", "runan", "xiapi", "pengcheng", "donghai", "jiujiang", "lujiang"], near: ["송(宋)", "오(吳)", "정(鄭)"] },
    { name: "오(吳)", home: ["wujun", "kuaiji", "danyang", "yuzhang", "guangling"], near: ["초(楚)", "왜(倭)"] },
    { name: "촉(蜀)", home: ["shujun", "guanghan", "bajun", "badong", "hanzhong"], near: ["저(氐)", "남만"] },
    { name: "남만", home: ["zangke", "yuexi", "yizhoujun", "yongchang"], near: ["촉(蜀)", "대월"] },
    { name: "대월", home: ["nanhai", "cangwu", "jiaozhi", "rinan"], near: ["남만", "오(吳)"] },
    { name: "요동", home: ["liaodong", "xuantu", "lelang", "daifang"], near: ["고구려", "연(燕)", "선비"] },
    { name: "상(商)", home: [], near: [] },
    { name: "정(鄭)", home: [], near: [] },
    { name: "당(唐)", home: [], near: [] },
    { name: "하(夏)", home: [], near: [] },
    { name: "신(新)", home: [], near: [] },
    { name: "왜(倭)", home: [], near: [] },
    { name: "흉노", home: [], near: [] },
    { name: "선비", home: [], near: [] },
    { name: "강(羌)", home: [], near: [] },
    { name: "저(氐)", home: [], near: [] },
    { name: "갈(羯)", home: [], near: [] },
    { name: "고구려", home: [], near: [] },
  ];
  S.REALMS = REALMS;
  S.TITLE_NAMES = { PROV_TITLE, DUDU, KING_OF, KING_CLAN, EMPEROR_OF, EMPEROR_CLAN, HAN };

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
  const capCity = (state, fid) => state.cities[S.capitalOf(state, fid)] || S.citiesOf(state, fid)[0] || null;

  // A realm name is one ruler's: taken while another living force calls its
  // realm or its dynasty by it. Only the Han may have many heirs, once ended.
  S.realmTaken = (state, fid, name) => name !== HAN && Object.values(state.forces).some((x) =>
    x.alive && x.id !== fid && (x.realm === name || x.dynasty === name));
  // Every realm name in order of fitness for a capital: its own, then its
  // neighbours, then the rest. {name, fit: "home"|"near"|"", free}.
  S.realmChoices = function (state, fid, cap) {
    const c = cap || capCity(state, fid);
    const home = c ? REALMS.find((r) => r.home.includes(c.id)) : null;
    const order = home ? [home.name, ...home.near] : [];
    const rest = REALMS.map((r) => r.name).filter((n) => !order.includes(n));
    return order.concat(rest).map((name, i) => ({
      name, fit: home && i === 0 ? "home" : i < order.length ? "near" : "", free: !S.realmTaken(state, fid, name),
    }));
  };
  // The first free name for the capital, or the capital's commandery if all are gone.
  function pickRealm(state, fid, cap) {
    const c = cap || capCity(state, fid);
    const x = S.realmChoices(state, fid, c).find((r) => r.free);
    return x ? x.name : c ? c.jun || c.name : state.forces[fid].name;
  }
  // The realm a force goes by now: its own if still its alone, else a new one.
  const realmNow = (state, fid, cap) => {
    const f = state.forces[fid];
    return f.realm && !S.realmTaken(state, fid, f.realm) ? f.realm : pickRealm(state, fid, cap);
  };
  // A man's own name for his realm as 왕, if free.
  function ownKingdom(state, fid) {
    const r = rulerOf(state, state.forces[fid]);
    const house = KING_CLAN.find(([head]) => head === r.name || (clanOf(r.name) && clanOf(r.name) === clanOf(head)));
    const own = KING_OF[r.name] || (house && house[1]);
    return own && !S.realmTaken(state, fid, own) ? own : null;
  }

  // A man's own name for his dynasty: his (위(魏) 조조) or his house's (진(晉) 사마씨).
  function ownDynasty(r) {
    const house = EMPEROR_CLAN.find(([head]) => head === r.name || (clanOf(r.name) && clanOf(r.name) === clanOf(head)));
    return EMPEROR_OF[r.name] || (house && house[1]) || null;
  }
  // The emperor's dynasty: a man's own, the Han for its loyal heir, else the realm.
  S.dynastyName = function (state, fid) {
    const f = state.forces[fid];
    const own = ownDynasty(rulerOf(state, f));
    if (own && !S.realmTaken(state, fid, own)) return own;
    if (f.hanHeir) return HAN;
    return realmNow(state, fid);
  };
  S.titleKey = (state, fid) => (state.forces[fid].title || "noble");
  // The provinces a 주목 is named for (형주목: 형남 and 형북). Many may hold
  // the same 주목: one who has lost his province keeps the name.
  S.governorProvs = function (state, fid) {
    const f = state.forces[fid];
    if (!f || f.emperor || f.title !== "governor") return [];
    return Object.keys(S.PROVINCES).filter((p) => (PROV_TITLE[p] || `${S.PROVINCES[p]}목`) === f.titleName);
  };
  // A computer 주목 who no longer holds the province he is named for means
  // to win it back before anything else: a pull on its cities (js/ai.js).
  S.TITLE_PULL = { governor: 0.35 };
  S.titlePull = function (state, fid, t) {
    if (fid === state.playerForce) return 0;
    const provs = S.governorProvs(state, fid);
    if (!provs.length || t.owner === fid) return 0;
    if (wholeOf(state, fid).provs.some((p) => provs.includes(p))) return 0;
    const ids = t.road ? t.road : [t.id];
    return ids.some((id) => state.cities[id] && provs.includes(state.cities[id].prov)) ? S.TITLE_PULL.governor : 0;
  };
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
    const cap = state.cities[at.cap] || capCity(state, fid);
    switch (key) {
      case "lord": return cap && /윤$/.test(cap.jun || "") ? cap.jun : cap ? `${cap.seat || cap.name}후` : BY.lord.name;
      case "governor": {
        const { provs } = wholeOf(state, fid);
        const p = provs.includes(at.prov) ? at.prov : placeNow(state, fid).prov || at.prov;
        return p ? PROV_TITLE[p] || `${S.PROVINCES[p]}목` : BY.governor.name;
      }
      case "general": case "marshal": case "chancellor":
        return S.titlesOpen(state) && heldBy(state, fid, key) ? DUDU[key] : BY[key].name;
      case "duke": case "king": return `${realmFor(state, fid, key, cap)}${BY[key].name}`;
      default: return BY[key].name;
    }
  }
  function realmFor(state, fid, key, cap) {
    return (key === "king" && ownKingdom(state, fid)) || realmNow(state, fid, cap);
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
    if (key === "duke" || key === "king") f.realm = f.titleName.slice(0, -1);
    // The player names his own realm when he first becomes 공 (js/ui/screens.js).
    if (key === "duke" && f.id === state.playerForce) f.realmAsk = true;
  }
  // The player names his dynasty whenever he becomes emperor (js/court.js).
  S.askDynasty = function (state, fid) {
    if (fid === state.playerForce) state.forces[fid].realmAsk = true;
  };

  // An emperor's names besides the list: the one he holds now, his realm as
  // 공·왕, his own (위(魏) 조조, ...) and the Han for its heir. {name, fit, free}.
  S.dynastyChoices = function (state, fid) {
    const f = state.forces[fid];
    const extra = [[f.dynasty, "now"], [ownDynasty(rulerOf(state, f)), "own"], [f.hanHeir ? HAN : null, "han"], [f.realm, "realm"]]
      .filter(([n], i, all) => n && all.findIndex(([m]) => m === n) === i)
      .map(([name, fit]) => ({ name, fit, free: !S.realmTaken(state, fid, name) }));
    return extra.concat(S.realmChoices(state, fid).filter((r) => !extra.some((x) => x.name === r.name)));
  };

  // The player's choice of realm name: any name no other ruler holds. For
  // an emperor it names the dynasty, and the realm with it (not the Han).
  S.chooseRealm = function (state, fid, name) {
    const f = state.forces[fid];
    if (f.emperor) {
      if (!S.dynastyChoices(state, fid).some((r) => r.name === name)) return { ok: false, msg: "그 이름은 고를 수 없습니다." };
      if (S.realmTaken(state, fid, name)) return { ok: false, msg: "이미 다른 군주가 쓰는 나라 이름입니다." };
      delete f.realmAsk;
      const was = S.titleName(state, fid);
      f.dynasty = name;
      if (name !== HAN) f.realm = name;
      if (was !== S.titleName(state, fid)) S.addLog(state, `${S.forceName(state, fid)}의 국호를 정했습니다: ${name} (${was} → ${S.titleName(state, fid)})`, "sys");
      return { ok: true, msg: `국호: ${name}` };
    }
    if (!REALMS.some((r) => r.name === name)) return { ok: false, msg: "그런 나라 이름은 없습니다." };
    if (S.realmTaken(state, fid, name)) return { ok: false, msg: "이미 다른 군주가 쓰는 나라 이름입니다." };
    const key = S.titleKey(state, fid);
    if (RANK[key] < RANK.duke) return { ok: false, msg: "나라 이름은 공 작위를 받을 때 정합니다." };
    delete f.realmAsk;
    const before = S.titleName(state, fid);
    f.realm = name;
    f.titleName = name + BY[key].name;
    if (before !== f.titleName) S.addLog(state, `${S.forceName(state, fid)}의 나라 이름을 정했습니다: ${name} (${before} → ${f.titleName})`, "sys");
    return { ok: true, msg: `나라 이름: ${name}` };
  };

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
