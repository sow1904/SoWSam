// Strongholds: passes (관문) and forts (요새) on the roads between
// commanderies. A fort is a small walled town: its garrison may march out
// and meet an army in the field, as a city's can. A pass only holds.
// They hold troops and officers but have no people or domestic
// work; their food comes from a neighbouring own city. An army cannot get past
// an enemy stronghold without taking it. Sites not yet built in a scenario's
// year can be built by an officer with the 축성 specialty.
(function (S) {
  const fail = (msg) => ({ ok: false, msg });

  S.FORT_KINDS = { pass: "관문", fort: "요새", port: "항구" };
  S.FORT_STATS = {
    pass: { wallMax: 1600, troops: 1500 }, // the lie of the land does most of the work
    fort: { wallMax: 1200, troops: 2000 }, // high walls and deep stores
    port: { wallMax: 500, troops: 2000 }, // a stockade on the shore
  };
  // Ports (항구): strongholds on a great river or the sea where ships are
  // built and kept. A port stands by its city (a road on land) and reaches
  // every other port of its waters (S.PORT_WATERS) by ship: the great river
  // and the coast are crossed only from port to port.
  // why: the user's design (항구망). Ports joined as a mesh, not city to city;
  // the routes between ports are not drawn on the map.
  // The men of a port are its navy (수군, js/ships.js): only they cross to an
  // enemy port, as many as the port has ships for (ships are counted in the
  // men they carry), and only they meet a crossing on the water. The
  // soldiers of the cities cross only to a port already held. A navy that
  // takes a port keeps its ships there; a port taken from the land side
  // loses its ships. A port taken without a main army behind it is soon
  // taken back.
  //   cap: (unused: a port keeps its navy, js/ships.js); per: ships a port
  //   can hold per level of 조선; build: ships built a month per level;
  //   cost: gold per ship (from the port's city); start: ships at the start, of what it can hold
  S.PORT = { cap: 3000, per: 10000, build: 1000, cost: 0.2, start: 0.5 };
  // The waters: every port reaches every other port of the same waters.
  // Each lists its ports in order along the water, with their place on it:
  // the 장강 from upstream (west) to its mouth, the coast from south to north
  // (답진 and 열구 face each other across the sea: neither passes the other).
  // 누현 at the river's mouth belongs to both.
  S.PORT_WATERS = {
    river: { chanling: 0, baqiu: 1, wulin: 2, chibi: 3, shiyang: 4, chaisang: 5, wankou: 6, ruxu: 7, niuzhu: 8, guabu: 9, louxian: 10 },
    sea: { shangyu: 0, louxian: 1, changyang: 2, tajin: 3, liekou: 3 },
  };
  const WATERS_OF = {};
  for (const [w, ids] of Object.entries(S.PORT_WATERS)) for (const id of Object.keys(ids)) (WATERS_OF[id] = WATERS_OF[id] || []).push(w);
  // Do two ports share waters (and which)?
  S.portWaters = (a, b) => (WATERS_OF[a] || []).find((w) => (WATERS_OF[b] || []).includes(w)) || null;
  S.isPortLink = (a, b) => a !== b && !!S.portWaters(a, b);
  // Ships on the water: a voyage is shorter than the road (rough) and eats
  // less, the boats carrying the stores; on the 장강 the current speeds the
  // way down (down) and slows the way up (up).
  // why: the user's design. In these centuries grain and armies went by
  // water wherever they could: 조조 dug canals to feed his northern wars,
  // and 왕준's fleet came down the 장강 from 익주 to take 건업 in 280.
  S.WATERWAY = { rough: 0.6, down: 0.7, up: 1.4 };
  S.currentMul = (a, b) => {
    if (S.portWaters(a, b) !== "river") return 1;
    const R = S.PORT_WATERS.river;
    return R[b] > R[a] ? S.WATERWAY.down : S.WATERWAY.up;
  };
  // The ports a ship sails past between port a and port b, each with how far
  // along the voyage it lies (0..1).
  S.portsPassed = function (a, b) {
    const w = S.portWaters(a, b);
    if (!w) return [];
    const O = S.PORT_WATERS[w], lo = Math.min(O[a], O[b]), hi = Math.max(O[a], O[b]);
    return Object.keys(O).filter((id) => O[id] > lo && O[id] < hi).map((id) => ({ id, at: Math.abs(O[id] - O[a]) / (hi - lo) }));
  };
  S.isPort = (state, id) => !!(state.forts && state.forts[id] && state.forts[id].kind === "port");
  S.portMax = (state, f) => S.PORT.per * (f.owner && S.lineLevel ? S.lineLevel(state, f.owner, "navy") : 1);
  S.BUILD_COST = 1500;
  S.BUILD_DAYS = 90;

  // Per map. id: [name, kind, road end a, road end b, home commandery, lat, lon, built]
  // b may be a list: the stronghold then sits where the roads from a to each of
  // them meet, and guards all of them.
  // built = already standing in the map's year; otherwise a site to build on.
  S.FORT_SITES = {
    main: {
      hulao: ["호로관", "pass", "henan", "chenliu", "henan", 34.83, 113.25, true], // 성고, 낙양 동쪽 관문
      hangu: ["함곡관", "pass", "henan", "hongnong", "henan", 34.73, 112.12, true], // 후한의 함곡관은 신안
      tongguan: ["동관", "pass", "hongnong", "jingzhao", "hongnong", 34.6, 110.3, true],
      chencang: ["진창", "fort", "youfufeng", "hanzhong", "youfufeng", 34.35, 107.37, true], // 산관을 함께 지킴
      yangping: ["양평관", "pass", "hanyang", "hanzhong", "hanzhong", 33.15, 106.1, true], // 기산도가 한중으로 드는 곳
      jiameng: ["가맹관", "pass", "hanzhong", "guanghan", "guanghan", 32.3, 105.8, true],
      jiange: ["검각", "pass", "hanzhong", "guanghan", "guanghan", 32.0, 105.5, false],
      yiling: ["이릉", "fort", "badong", "nanjun", "nanjun", 30.7, 111.3, true], // 삼협이 끝나는 곳
      yijing: ["역경", "fort", "zhuo", "hejian", "hejian", 38.95, 116.05, false],
      hefei: ["합비", "fort", "jiujiang", "lujiang", "jiujiang", 31.86, 117.27, true],
      // 길목 터 (way: the 9th field): a road of its own from a to b through
      // the site, open from the start; anyone may pass while it stands empty,
      // and either end may build a fort there to hold it.
      // why: the user's design. The roads from 한중 into 관중 besides 기산도
      // and 진창도 (산관): 포사도 out at 오장원 (제갈량, 234), 당락도 out at
      // 낙곡 (조상's 흥세 campaign, 244), 자오도 out at 자오곡 (위연's plan).
      wuzhang: ["오장원", "fort", "hanzhong", "youfufeng", "youfufeng", 34.25, 107.62, false, true],
      luogu: ["낙곡", "pass", "hanzhong", "jingzhao", "jingzhao", 34.05, 108.2, false, true],
      ziwu: ["자오곡", "pass", "hanzhong", "jingzhao", "jingzhao", 34.02, 108.9, false, true],
      // Ports: a port's road is its city alone (road end b null); the waters
      // join it to the other ports (S.PORT_WATERS).
      // TODO(항구망): ships passing an enemy port, the current (downstream
      // faster), and what the long voyages cost.
      wulin: ["오림", "port", "nanjun", null, "nanjun", 29.93, 113.55, true],
      chanling: ["잔릉", "port", "wuling", null, "wuling", 30.05, 112.2, true],
      baqiu: ["파구", "port", "changsha", null, "changsha", 29.37, 113.1, true],
      shiyang: ["석양", "port", "jiangxia", null, "jiangxia", 30.62, 114.28, true],
      chaisang: ["시상", "port", "yuzhang", null, "yuzhang", 29.72, 116.0, true],
      chibi: ["적벽", "port", "wuchang", null, "wuchang", 29.95, 113.95, true],
      wankou: ["환구", "port", "lujiang", null, "lujiang", 30.5, 117.05, true],
      ruxu: ["유수", "port", "jiujiang", null, "jiujiang", 31.35, 117.9, true], // 유수구: by land to 합비
      niuzhu: ["우저", "port", "danyang", null, "danyang", 31.6, 118.45, true],
      guabu: ["과보", "port", "guangling", null, "guangling", 32.3, 118.9, true],
      louxian: ["누현", "port", "wujun", null, "wujun", 31.4, 121.0, true],
      shangyu: ["상우", "port", "kuaiji", null, "kuaiji", 30.03, 120.87, true],
      changyang: ["창양", "port", "donglai", null, "donglai", 36.95, 120.7, true],
      tajin: ["답진", "port", "liaodong", null, "liaodong", 38.9, 121.4, true],
      liekou: ["열구", "port", "daifang", null, "daifang", 38.5, 125.2, true],
    },
  };

  function newFort(state, id, site) {
    const [name, kind, , , home, lat, lon, built] = site;
    const [x, y] = S.placeXY(id, lat, lon);
    const st = S.FORT_STATS[kind];
    const owner = built ? state.cities[home].owner : null;
    return {
      id, name, kind, road: S.siteRoad(site), way: !!site[8], home, lat, lon, x, y, built, owner, building: null,
      troops: owner ? st.troops : 0, train: owner ? state.cities[home].train : 40, food: owner ? 3000 : 0,
      wall: built ? st.wallMax : 0, wallMax: st.wallMax,
      // So the battle rules can treat a stronghold like a city.
      retainers: 0, gentry: 0, consent: 100, order: 100, gold: 0, pop: 0, manpower: 0, size: 1,
      prov: state.cities[home].prov, posts: S.emptyPosts(),
    };
  }
  // A port's ships at the start: a share of what it can hold, of the best
  // kind its owner builds there (js/ships.js).
  function stockPort(state, f) {
    if (f.kind !== "port") return;
    f.fleet = {};
    f.ships = 0;
    f.shipsOf = f.owner;
    if (!f.owner) return;
    const kind = ["louchuan", "douhan", "mengchong"].find((k) => S.canBuildShip(state, f, k)) || "mengchong";
    S.addShips(state, f, kind, Math.round(S.portMax(state, f) * S.PORT.start / S.SHIPS[kind].room));
    S.startNavy(state, f);
  }
  // The places a stronghold's roads join: [a, b] or [a, b1, b2, ...].
  S.siteRoad = (site) => [site[2], ...[].concat(site[3] == null ? [] : site[3])];
  S.initForts = function (state) {
    state.forts = {};
    for (const [id, site] of Object.entries(S.FORT_SITES[state.map] || {})) stockPort(state, state.forts[id] = newFort(state, id, site));
    state.fortVer = 1;
  };
  // A save from before a site was added to the map gets it now (and loses
  // a port taken off the map; names and roads follow the map).
  S.addMissingForts = function (state) {
    const sites = S.FORT_SITES[state.map] || {};
    for (const id of Object.keys(state.forts)) {
      if (!sites[id] && state.forts[id].kind === "port") { delete state.forts[id]; state.fortVer = (state.fortVer || 0) + 1; }
    }
    for (const [id, site] of Object.entries(sites)) {
      if (state.forts[id]) { Object.assign(state.forts[id], { road: S.siteRoad(site), name: site[0], way: !!site[8] }); continue; }
      stockPort(state, state.forts[id] = newFort(state, id, site));
      state.fortVer = (state.fortVer || 0) + 1;
    }
  };
  // A 길목 터: its own road between its two ends, passable while empty.
  S.isWaypoint = (f) => !!(f && f.way);
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
      if (f.kind === "port") runPort(state, f);
      if (f.wall < f.wallMax) f.wall = Math.min(f.wallMax, f.wall + 20);
      if (!f.owner || f.troops <= 0) continue;
      const need = S.foodUse(f.troops);
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
  // A port: ships burnt when it changes hands (and the orders with them),
  // ships built and kept, its navy filled and drilled (js/ships.js).
  function runPort(state, f) {
    if (f.shipsOf !== f.owner) { f.fleet = {}; f.ships = 0; f.shipOrder = null; f.navyGoal = null; f.shipsOf = f.owner; }
    const home = state.cities[f.home];
    if (!f.owner || !home || home.owner !== f.owner) return;
    S.runShipyard(state, f);
    S.runNavy(state, f);
  }
  // Ships come back to a port (of the kinds in mix): only to one still held.
  S.returnShips = function (state, force, portId, n, mix) {
    const f = state.forts && state.forts[portId];
    if (f && f.owner === force && n > 0) S.putShips(state, f, n, mix);
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
