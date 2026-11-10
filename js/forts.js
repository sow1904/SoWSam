// Strongholds: passes (관문) and forts (요새) on the roads between
// commanderies. A fort is a small walled town: its garrison may march out
// and meet an army in the field, as a city's can. A pass only holds.
// They hold troops and officers but have no people or domestic
// work; their food comes from a neighbouring own city. An army cannot get past
// an enemy stronghold without taking it. Sites not yet built in a scenario's
// year can be built by an officer with the 축성 specialty.
(function (S) {
  const fail = (msg) => ({ ok: false, msg });

  S.FORT_KINDS = { pass: "관문", fort: "요새" };
  S.FORT_STATS = {
    pass: { wallMax: 1600, troops: 1500 }, // the lie of the land does most of the work
    fort: { wallMax: 1200, troops: 2000 }, // high walls and deep stores
  };
  S.BUILD_COST = 1500;
  S.BUILD_DAYS = 90;

  // Per map. id: [name, kind, road end a, road end b, home commandery, lat, lon, built]
  // b may be a list: the stronghold then sits where the roads from a to each of
  // them meet, and guards all of them.
  // built = already standing in the map's year; otherwise a site to build on.
  S.FORT_SITES = {
    190: {
      hulao: ["호로관", "pass", "henan", "chenliu", "henan", 34.83, 113.25, true], // 성고, 낙양 동쪽 관문
      hangu: ["함곡관", "pass", "henan", "hongnong", "henan", 34.73, 112.12, true], // 후한의 함곡관은 신안
      tongguan: ["동관", "pass", "hongnong", "jingzhao", "hongnong", 34.6, 110.3, true],
      chencang: ["진창", "fort", "youfufeng", "hanzhong", "youfufeng", 34.35, 107.37, true], // 산관을 함께 지킴
      yangping: ["양평관", "pass", "wudu", "hanzhong", "hanzhong", 33.15, 106.1, true],
      jiameng: ["가맹관", "pass", "hanzhong", "guanghan", "guanghan", 32.3, 105.8, true],
      jiange: ["검각", "pass", "hanzhong", "guanghan", "guanghan", 32.0, 105.5, false],
      baidi: ["백제성", "fort", "bajun", "nanjun", "bajun", 31.05, 109.55, true],
      yijing: ["역경", "fort", "zhuo", ["hejian", "zhongshan"], "hejian", 38.95, 116.05, false], // 탁군에서 하간·중산으로 가는 길을 함께 막음
      hefei: ["합비", "fort", "jiujiang", "lujiang", "jiujiang", 31.86, 117.27, true],
      xiangyang: ["양양", "fort", "nanyang", "nanjun", "nanjun", 32.01, 112.14, true], // 유표가 190년부터 형주를 다스린 곳
    },
  };

  function newFort(state, id, site) {
    const [name, kind, , , home, lat, lon, built] = site;
    const [x, y] = S.placeXY(id, lat, lon);
    const st = S.FORT_STATS[kind];
    const owner = built ? state.cities[home].owner : null;
    return {
      id, name, kind, road: S.siteRoad(site), home, lat, lon, x, y, built, owner, building: null,
      troops: owner ? st.troops : 0, train: owner ? state.cities[home].train : 40, food: owner ? 3000 : 0,
      wall: built ? st.wallMax : 0, wallMax: st.wallMax,
      // So the battle rules can treat a stronghold like a city.
      retainers: 0, gentry: 0, consent: 100, order: 100, gold: 0, pop: 0, manpower: 0, size: 1,
      prov: state.cities[home].prov, posts: S.emptyPosts(),
    };
  }
  // The places a stronghold's roads join: [a, b] or [a, b1, b2, ...].
  S.siteRoad = (site) => [site[2], ...[].concat(site[3])];
  S.initForts = function (state) {
    state.forts = {};
    for (const [id, site] of Object.entries(S.FORT_SITES[state.map] || {})) state.forts[id] = newFort(state, id, site);
    state.fortVer = 1;
  };
  // A save from before a site was added to the map gets it now.
  S.addMissingForts = function (state) {
    for (const [id, site] of Object.entries(S.FORT_SITES[state.map] || {})) {
      if (state.forts[id]) { state.forts[id].road = S.siteRoad(site); continue; }
      state.forts[id] = newFort(state, id, site);
      state.fortVer = (state.fortVer || 0) + 1;
    }
  };
  S.fortsOf = (state, fid) => Object.values(state.forts || {}).filter((f) => f.built && f.owner === fid);
  // The city an officer at a stronghold goes back to when he leaves service.
  S.homeCity = (state, id) => (state.forts && state.forts[id] ? state.forts[id].home : id);

  // ---------- building ----------
  // Unbuilt sites on the roads leaving a city.
  S.buildSites = (state, cid) => Object.values(state.forts || {}).filter((f) => !f.built && !f.building && f.road.includes(cid));
  S.builders = (state, cid) => S.idle(state, cid).filter((o) => S.hasSkill(o, "축성"));
  S.buildFort = function (state, cid, fortId, oid) {
    const c = state.cities[cid];
    const f = state.forts && state.forts[fortId];
    const o = state.officers[oid];
    if (!c || !f || f.built || f.building || !f.road.includes(cid)) return fail("이 도시에서 쌓을 수 있는 터가 아닙니다.");
    if (!o || o.status !== "serving" || o.city !== cid || o.force !== c.owner || o.done || o.transit) return fail("이 도시에서 쉬고 있는 무장이 아닙니다.");
    if (!S.hasSkill(o, "축성")) return fail(`${S.josa(o.name, "은", "는")} 축성 특기가 없습니다.`);
    if (S.postOf(state, o)) return fail(`${S.josa(o.name, "은", "는")} 담당 업무 중입니다.`);
    if (c.gold < S.BUILD_COST) return fail(`금이 부족합니다. (필요 ${S.BUILD_COST})`);
    c.gold -= S.BUILD_COST;
    const m = S.launch(state, { kind: "build", force: c.owner, path: [cid, cid], km: 0, days: S.BUILD_DAYS, speed: "officer",
      officers: [oid], origin: cid, target: cid, fort: fortId });
    f.building = { force: c.owner, march: m.id };
    const msg = `${S.josa(o.name, "이", "가")} ${S.josa(f.name, "을", "를")} 쌓기 시작했습니다. ${S.BUILD_DAYS}일 뒤 완성됩니다.`;
    if (c.owner !== state.playerForce) S.addLog(state, `${S.forceName(state, c.owner)}의 ${msg}`, "info");
    return { ok: true, msg };
  };
  S.finishBuild = function (state, m) {
    const f = state.forts[m.fort];
    const c = state.cities[m.origin];
    f.building = null;
    const mine = m.force === state.playerForce;
    if (!state.forces[m.force].alive || c.owner !== m.force) {
      if (mine) S.addLog(state, `${c.name}을 잃어 ${f.name} 공사가 중단되었습니다.`, "warn");
      // The builders cannot go back to a lost city: they head for the nearest own one.
      S.reroute(state, m, m.origin);
      return;
    }
    S.releaseMarch(state, m);
    f.built = true;
    f.owner = m.force;
    f.wall = Math.round(f.wallMax * 0.6);
    f.train = c.train;
    state.fortVer = (state.fortVer || 0) + 1;
    S.addLog(state, `${S.forceName(state, m.force)}이 ${S.josa(f.name, "을", "를")} 완성했습니다. 병사를 보내 지키게 하십시오.`, mine ? "sys" : "info");
  };

  // ---------- monthly upkeep ----------
  // A garrison eats a fiftieth of its men a month. Its stores are topped up
  // from a neighbouring own city; with no food the men desert.
  S.runForts = function (state) {
    for (const f of Object.values(state.forts || {})) {
      if (!f.built) continue;
      if (f.wall < f.wallMax) f.wall = Math.min(f.wallMax, f.wall + 20);
      if (!f.owner || f.troops <= 0) continue;
      const need = Math.ceil(f.troops / 50);
      const src = S.links(state, f.id).map((id) => state.cities[id]).filter((c) => c && c.owner === f.owner).sort((a, b) => b.food - a.food)[0];
      if (src && f.food < need * 3) {
        const amt = Math.min(src.food, need * 3 - f.food);
        src.food -= amt;
        f.food += amt;
      }
      if (src) src.gold = Math.max(0, src.gold - Math.ceil(f.troops / 100));
      f.food -= need;
      if (f.food < 0) {
        f.food = 0;
        const lost = Math.ceil(f.troops * 0.1);
        f.troops -= lost;
        if (f.owner === state.playerForce) S.addLog(state, `${f.name}에 군량이 떨어져 병사 ${lost}명이 달아났습니다.`, "warn");
      }
    }
  };
  // A force that falls loses its strongholds; the men scatter.
  S.dropForts = function (state, fid) {
    for (const f of Object.values(state.forts || {})) {
      if (f.owner !== fid) continue;
      f.owner = null;
      f.troops = 0;
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
