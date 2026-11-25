// Distances and travel. Every road between two commanderies has a length in
// km, from the seats' latitude and longitude, lengthened for winding roads and
// mountain passes. Strongholds (passes and forts, js/forts.js) sit on roads and
// split them into links: city - stronghold - city. Officers, convoys and armies
// travel link by link at their own speed, so orders take days to carry out.
// Whatever is on the road lives in state.marches until it arrives.
(function (S) {
  const clamp = S.clamp;

  S.SPEED = { officer: 45, cargo: 25, army: 20, cavalry: 28, siege: 14 }; // km per day
  S.ROAD_FACTOR = 1.3; // roads wind; straight-line distance is too short
  // Mountain roads and gorges, by how much longer they take.
  const ROUGH = {
    "youfufeng|hanzhong": 1.6, // 진창도 (고도, 산관)
    "hanzhong|wuzhang": 1.6, // 포사도: 사곡을 넘어 오장원으로
    "hanzhong|luogu": 1.9, // 당락도: 가장 험한 길
    "hanzhong|ziwu": 1.7, // 자오도: 장안 남쪽 자오곡으로
    "hanyang|hanzhong": 1.4, // 기산도
    "hanzhong|guanghan": 1.5, // 금우도
    "bajun|jiameng": 1.2, // 가릉강 골짜기를 거슬러
    "longxi|guanghan": 1.8, // 음평도
    "nanjun|badong": 1.4, // 장강 삼협
    "bajun|badong": 1.2,
    "xincheng|hanzhong": 1.5, "xiangyang|xincheng": 1.3, // 한수 상류의 산길
    "bajun|zangke": 1.5, // 야랑도
    "shujun|yuexi": 1.4, "yuexi|yizhoujun": 1.4, "yuexi|zangke": 1.2,
    "zangke|cangwu": 1.5, "yizhoujun|jiaozhi": 1.4,
    "lingling|cangwu": 1.4, "guiyang|cangwu": 1.4, "guiyang|nanhai": 1.4, // 오령
    "cangwu|jiaozhi": 1.3,
    "hongnong|jingzhao": 1.2, // 동관
    "henan|hongnong": 1.2, // 함곡관
    "zhuo|daijun": 1.3, "guangyang|daijun": 1.3, "daijun|yanmen": 1.3, // 연산과 항산 사이 골짜기
    "guangyang|liaoxi": 1.5, // 노룡새, 조조의 오환 정벌길
    "liaoxi|liaodong": 1.4, "liaoxi|xuantu": 1.5, // 요택
    "hedong|shangdang": 1.3, "shangdang|taiyuan": 1.3, // 태항산
    "henei|shangdang": 1.6, // 태항형: 천정관과 양장판, 조조가 206년 고간을 치러 넘은 길
    "weijun|shangdang": 1.5, // 부구형: 업에서 서쪽으로 태항산을 넘는 길
    "changshan|taiyuan": 1.3, // 정형
  };
  const key = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  S.roadKey = key;
  const ROUGH_KEYED = {};
  for (const [k, v] of Object.entries(ROUGH)) ROUGH_KEYED[key(...k.split("|"))] = v;
  // 수로: land roads along a river or canal boats could use. Armies still
  // march them, but their food goes by boat: hauled cheaply (as a voyage,
  // S.WATERWAY.rough) and not counted among the dear days overland (S.HAUL).
  // This feeds marches, sieges at their end and convoys (수송).
  // why: the user's design. 손권 held to 합비 because the 유수 and the 소호
  // carried his supplies there; 조조 came at it the same way down the 와수,
  // the 회수 and the 비수.
  S.WATER_ROADS = [
    ["hefei", "ruxu"], ["jiujiang", "lujiang"], // 유수·소호, 시수·비수 (합비)
    ["runan", "jiujiang"], ["peiguo", "jiujiang"], ["xiapi", "jiujiang"], ["guangling", "jiujiang"], // 회수와 그 지류
    ["xiapi", "guangling"], // 한구 (邗溝)
    ["yingchuan", "runan"], ["chenliu", "yingchuan"], ["chenliu", "qiao"], // 영수, 낭탕거
    ["nanyang", "xinye"], ["xiangyang", "jiangxia"], ["xiangyang", "xincheng"], ["xincheng", "hanzhong"], // 육수, 한수
    ["weijun", "dongjun"], // 백구 (白溝)
    ["changsha", "lingling"], ["lingling", "cangwu"], // 상수, 영거
    ["jingzhao", "youfufeng"], // 위수
    ["bajun", "badong"], // 천강
  ];
  const WATER_ROAD = {};
  for (const [a, b] of S.WATER_ROADS) WATER_ROAD[key(a, b)] = true;
  // Is this link of the network a 수로 (a road along water, or a piece of
  // one split by a stronghold)?
  S.isWaterRoad = function (state, a, b) {
    if (WATER_ROAD[key(a, b)]) return true;
    const f = state && state.forts && (state.forts[a] || state.forts[b]);
    if (!f || f.road.length < 2) return false;
    const city = f.id === a ? b : a;
    return f.road.some((x) => x !== city && WATER_ROAD[key(city, x)]);
  };
  // How rough a link of the network is: a piece of road split by a stronghold
  // is as rough as the road it belongs to.
  S.linkRough = function (state, a, b) {
    if (S.isPortLink && S.isPortLink(a, b)) return S.WATERWAY.rough; // by ship (js/forts.js)
    if (S.isWaterRoad(state, a, b)) return S.WATERWAY.rough * baseRough(state, a, b); // food by boat
    return baseRough(state, a, b);
  };
  function baseRough(state, a, b) {
    const f = (state && state.forts && (state.forts[a] || state.forts[b])) || null;
    if (!f || (S.isWaypoint && S.isWaypoint(f))) return ROUGH_KEYED[key(a, b)] || 1;
    const city = f.id === a ? b : a;
    if (!S.MAP.cities[city]) return 1;
    return Math.max(1, ...f.road.filter((x) => x !== city).map((x) => ROUGH_KEYED[key(city, x)] || 1));
  };

  // How rough a whole road is: the roughness of its links, weighted by length.
  S.pathRough = function (state, path) {
    let km = 0, sum = 0;
    for (let i = 1; i < path.length; i++) {
      const d = S.legKm(state, path[i - 1], path[i]);
      km += d;
      sum += d * S.linkRough(state, path[i - 1], path[i]);
    }
    return km ? sum / km : 1;
  };

  function greatCircle(la1, lo1, la2, lo2) {
    const R = 6371, rad = Math.PI / 180;
    [la1, lo1, la2, lo2] = [la1 * rad, lo1 * rad, la2 * rad, lo2 * rad];
    const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Latitude and longitude of a city or stronghold.
  S.nodeLL = function (state, id) {
    const c = S.MAP.cities[id];
    if (c) return [c[3], c[4]];
    const f = state && state.forts && state.forts[id];
    return f ? [f.lat, f.lon] : [0, 0];
  };
  // Road length between two neighbouring commanderies.
  S.roadKm = function (a, b) {
    const cache = S.MAP.km || (S.MAP.km = {});
    const k = key(a, b);
    if (!(k in cache)) {
      const A = S.MAP.cities[a], B = S.MAP.cities[b];
      cache[k] = Math.round(greatCircle(A[3], A[4], B[3], B[4]) * S.ROAD_FACTOR * (ROUGH_KEYED[k] || 1));
    }
    return cache[k];
  };
  // Distance across country between any two places (for detours and retreats).
  S.nodeKm = function (state, a, b) {
    const [la1, lo1] = S.nodeLL(state, a), [la2, lo2] = S.nodeLL(state, b);
    return Math.round(greatCircle(la1, lo1, la2, lo2) * S.ROAD_FACTOR);
  };
  S.travelDays = (km, kind) => Math.max(1, Math.ceil(km / S.SPEED[kind]));
  // 육로 보급: food hauled overland is eaten on the way by those who haul it,
  // more the farther it goes. Beyond free days on land roads, each day costs
  // more by 1/grow; voyages (port to port) do not count.
  // why: the user's design, after the histories: of thirty 종 sent to the
  // northern frontier one 석 arrived (주보언). Water carried armies far.
  S.HAUL = { free: 15, grow: 20 };
  S.landDays = function (state, path, kind) {
    let km = 0;
    for (let i = 1; i < (path || []).length; i++) {
      if (!S.isPortLink(path[i - 1], path[i]) && !S.isWaterRoad(state, path[i - 1], path[i])) km += S.legKm(state, path[i - 1], path[i]);
    }
    return km ? S.travelDays(km, kind || "army") : 0;
  };
  // How much dearer a day's food is at the end of land days of road.
  S.haulMul = (land) => 1 + Math.max(0, (land || 0) - S.HAUL.free) / S.HAUL.grow;

  // Absolute day count since the game began (30 days a month).
  S.today = (state) => S.monthsElapsed(state) * S.DAYS_PER_MONTH + (state.day || 1) - 1;

  // ---------- the road network ----------
  S.place = (state, id) => state.cities[id] || (state.forts && state.forts[id]) || null;
  S.isFort = (state, id) => !!(state.forts && state.forts[id]);
  S.placeName = (state, id) => (S.place(state, id) || { name: "?" }).name;

  // Each road as a chain of places: [cityA, built strongholds in order, cityB].
  let net = null;
  function network(state) {
    if (net && net.state === state && net.ver === (state.fortVer || 0) && net.map === S.MAP) return net;
    const onRoad = {};
    for (const f of Object.values(state.forts || {})) {
      if (f.built && !f.way) for (const b of f.road.slice(1)) (onRoad[key(f.road[0], b)] = onRoad[key(f.road[0], b)] || []).push(f);
    }
    const links = {}, rough = {}, km = {};
    const link = (a, b, r) => {
      if (!(links[a] = links[a] || []).includes(b)) links[a].push(b);
      if (!(links[b] = links[b] || []).includes(a)) links[b].push(a);
      rough[key(a, b)] = r;
    };
    for (const [a, b] of S.MAP.roads) {
      // A road to a stronghold that is not yet built leads nowhere.
      if ([a, b].some((id) => !S.MAP.cities[id] && !(state.forts && state.forts[id] && state.forts[id].built))) continue;
      const r = ROUGH_KEYED[key(a, b)] || 1;
      const [la, lo] = S.nodeLL(state, a);
      const forts = (onRoad[key(a, b)] || []).slice().sort((p, q) => greatCircle(la, lo, p.lat, p.lon) - greatCircle(la, lo, q.lat, q.lon));
      const chain = [a, ...forts.map((f) => f.id), b];
      for (let i = 1; i < chain.length; i++) link(chain[i - 1], chain[i], r);
    }
    // Ports (js/forts.js): a land road to the port's city, and the waters to
    // every other port they share.
    // 길목 터 (js/forts.js): a road of their own through the site, built or not.
    for (const f of Object.values(state.forts || {})) {
      if (!S.isWaypoint(f)) continue;
      const [a, b] = f.road;
      link(a, f.id, ROUGH_KEYED[key(a, f.id)] || 1);
      link(f.id, b, ROUGH_KEYED[key(f.id, b)] || 1);
    }
    const ports = Object.values(state.forts || {}).filter((f) => f.built && f.kind === "port" && f.road.length === 1);
    for (const p of ports) {
      link(p.road[0], p.id, 1);
      for (const q of ports) if (p.id < q.id && S.isPortLink(p.id, q.id)) link(p.id, q.id, S.WATERWAY.rough);
    }
    net = { state, ver: state.fortVer || 0, map: S.MAP, links, rough, km };
    return net;
  }
  S.links = (state, id) => network(state).links[id] || [];
  // Length of one link of the network.
  S.linkKm = function (state, a, b) {
    const n = network(state);
    const k = key(a, b);
    if (!(k in n.km)) {
      if (S.MAP.cities[a] && S.MAP.cities[b] && n.rough[k] !== undefined) n.km[k] = S.roadKm(a, b);
      else {
        const [la1, lo1] = S.nodeLL(state, a), [la2, lo2] = S.nodeLL(state, b);
        n.km[k] = Math.round(greatCircle(la1, lo1, la2, lo2) * S.ROAD_FACTOR * (n.rough[k] || 1));
      }
    }
    return n.km[k];
  };
  // A leg of a path: along a link if there is one, else across country.
  // On the 장강 the current makes the way down shorter than the way up.
  S.legKm = (state, a, b) => (a === b ? 0 : S.links(state, a).includes(b) ? Math.round(S.linkKm(state, a, b) * S.currentMul(a, b)) : S.nodeKm(state, a, b));
  S.pathKm = (state, path) => path.slice(1).reduce((s, id, i) => s + S.legKm(state, path[i], id), 0);

  // Who may pass a place: own cities; own, allied or abandoned strongholds.
  S.passable = function (state, id, force) {
    const p = S.place(state, id);
    if (!p) return false;
    if (p.owner === force) return true;
    if (state.cities[id]) return false;
    return (!p.owner && p.troops <= 0) || (!!p.owner && S.allied(state, force, p.owner));
  };

  function shortest(state, from, stopAt) {
    const owner = S.place(state, from).owner;
    const dist = { [from]: 0 }, prev = {}, done = new Set();
    for (;;) {
      let cur = null;
      for (const id in dist) if (!done.has(id) && (cur === null || dist[id] < dist[cur])) cur = id;
      if (cur === null || cur === stopAt) break;
      done.add(cur);
      for (const n of S.links(state, cur)) {
        if (done.has(n) || !S.passable(state, n, owner)) continue;
        const d = dist[cur] + S.legKm(state, cur, n);
        if (!(n in dist) || d < dist[n]) { dist[n] = d; prev[n] = cur; }
      }
    }
    return { dist, prev };
  }
  // Shortest road between two own places through own (or passable) ground.
  // Returns { path, km, days } or null.
  S.route = function (state, from, to, kind) {
    if (from === to) return null;
    const { dist, prev } = shortest(state, from, to);
    if (!(to in dist)) return null;
    const path = [to];
    while (path[0] !== from) path.unshift(prev[path[0]]);
    return { path, km: dist[to], days: S.travelDays(dist[to], kind) };
  };
  // Days to reach each own city (and, with forts, own strongholds).
  S.reachable = function (state, cid, kind, withForts) {
    const owner = S.place(state, cid).owner;
    const { dist } = shortest(state, cid);
    const out = {};
    for (const id in dist) {
      const p = S.place(state, id);
      const empty = !state.cities[id] && p.built && !p.owner && p.troops <= 0; // a site not yet built is only a road
      if (id === cid || (p.owner !== owner && !empty)) continue;
      if (!withForts && !state.cities[id]) continue;
      out[id] = S.travelDays(dist[id], kind || "officer");
    }
    return out;
  };

  // What an army from here can march on: along each road, the first place
  // that is neither ours nor passable; at an own port every water out of it
  // is followed (a place reached more than one way: the shortest is kept).
  // Returns [{ id, path, km, days }].
  S.attackTargets = function (state, from) {
    const me = S.place(state, from).owner;
    const best = {}, seen = {};
    const walk = (path, depth) => {
      const cur = path[path.length - 1], prev = path[path.length - 2];
      const p = S.place(state, cur);
      // A place already reached a shorter way leads nowhere new.
      const sofar = S.pathKm(state, path);
      if (seen[cur] != null && seen[cur] <= sofar) return;
      seen[cur] = sofar;
      const hit = () => { best[cur] = { id: cur, path: path.slice(), km: sofar }; };
      if (state.cities[cur]) {
        if (p.owner !== me && !S.allied(state, me, p.owner)) hit();
        return;
      }
      if (!S.passable(state, cur, me)) { hit(); return; }
      if (depth >= 20) return;
      const next = S.links(state, cur).filter((x) => x !== prev && !path.includes(x));
      // A road goes on one way; a port's waters go every way.
      for (const n of S.isPort(state, cur) ? next : next.slice(0, 1)) walk(path.concat([n]), depth + 1);
    };
    for (const first of S.links(state, from)) walk([from, first], 0);
    const out = Object.values(best);
    for (const t of out) t.days = S.travelDays(t.km, "army");
    return out;
  };

  // ---------- on the road ----------
  // kind: "army" marches on an enemy place; "move" carries officers and goods
  // to an own place; "return" brings a beaten army home; "build" is a
  // stronghold under construction (it stays put); "wounded" carries wounded
  // home on their own. Any march may carry wounded ({n, unit}) and how they
  // will heal (care, see S.WOUNDED).
  S.launch = function (state, spec) {
    state.marches = state.marches || [];
    state.marchSeq = (state.marchSeq || 0) + 1;
    const km = spec.km != null ? spec.km : S.pathKm(state, spec.path);
    const days = spec.days || S.travelDays(km, spec.speed);
    const now = S.today(state);
    const m = Object.assign({ troops: 0, gold: 0, food: 0, train: 0, officers: [] }, spec,
      { id: state.marchSeq, km, start: now, arrive: now + days });
    // The corps it marches for: that of the city it leaves (js/corps.js).
    if (m.corps == null && S.placeCorps) {
      const o = S.place(state, m.origin);
      m.corps = o && o.owner === m.force ? S.placeCorps(state, o) : 1;
    }
    state.marches.push(m);
    for (const id of m.officers) {
      const o = state.officers[id];
      o.transit = m.id;
      o.done = true;
    }
    return m;
  };
  S.marchesOf = (state, fid) => (state.marches || []).filter((m) => m.force === fid);
  S.daysLeft = (state, m) => Math.max(0, m.arrive - S.today(state));

  // Where a march is now, as map coordinates; frac is the part of today gone by.
  S.marchPos = function (state, m, frac) {
    const total = Math.max(1, m.arrive - m.start);
    const p = clamp((S.today(state) + (frac || 0) - m.start) / total, 0, 1);
    let want = (m.skip || 0) + p * m.km;
    for (let i = 1; i < m.path.length; i++) {
      const A = S.place(state, m.path[i - 1]), B = S.place(state, m.path[i]);
      const leg = S.legKm(state, m.path[i - 1], m.path[i]);
      if (want <= leg || i === m.path.length - 1) {
        const f = leg ? clamp(want / leg, 0, 1) : 1;
        return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f };
      }
      want -= leg;
    }
    const c = S.place(state, m.path[0]);
    return { x: c.x, y: c.y };
  };

  // Officers still with the force that sent them.
  function crew(state, m) {
    return m.officers.map((id) => state.officers[id]).filter((o) => o && o.status === "serving" && o.force === m.force);
  }
  function release(state, m) {
    for (const id of m.officers) if (state.officers[id] && state.officers[id].transit === m.id) state.officers[id].transit = null;
  }
  S.releaseMarch = release;
  function deliver(state, m, c) {
    const team = crew(state, m);
    release(state, m);
    for (const o of team) o.city = c.id;
    S.officersMoved(state);
    if (m.troops) {
      c.train = Math.round((c.train * c.troops + m.train * m.troops) / (c.troops + m.troops));
      S.addTroops(c, m.unit || S.garrisonUnit(c), m.troops);
    }
    if (m.wounded && m.wounded.n > 0) S.addWounded(c, m.care || "mid", m.wounded.n, m.wounded.unit);
    // Ships at sea put in here (a navy's own fleet), or sail home.
    if (m.ships > 0 && m.shipPort && S.returnShips) S.returnShips(state, m.force, m.navy && c.kind === "port" ? c.id : m.shipPort, m.ships, m.shipMix);
    c.gold += m.gold || 0;
    c.food += m.food || 0;
    S.addRes(c, m.res);
    if (m.force === state.playerForce) {
      const who = team.map((o) => o.name).join(", ");
      const cargo = [m.troops && `병사 ${m.troops}`, m.gold && `금 ${m.gold}`, m.food && `군량 ${m.food}`, m.res && S.resText(m.res)].filter(Boolean).join(", ");
      S.addLog(state, `${who ? S.josa(who, "이", "가") + " " : ""}${c.name}에 도착했습니다.${cargo ? " (" + cargo + ")" : ""}`, "mine");
    }
  }
  // The ships a march still has at sea go back with it (deliver puts them
  // into port); a battle hands its ships back itself (js/battle.js).
  const shipsAboard = (m) => (m.ships > 0 && m.shipPort ? { ships: m.ships, shipPort: m.shipPort, shipMix: m.shipMix } : {});
  // The destination was lost on the way: head for the nearest own city.
  function reroute(state, m, from) {
    const own = S.citiesOf(state, m.force);
    const team = crew(state, m);
    release(state, m);
    if (!own.length || !state.forces[m.force].alive) return; // the force is gone; the men scatter
    const here = S.place(state, from);
    const to = own.reduce((a, b) => (Math.hypot(b.x - here.x, b.y - here.y) < Math.hypot(a.x - here.x, a.y - here.y) ? b : a));
    S.launch(state, { kind: "return", force: m.force, path: [from, to.id], km: S.nodeKm(state, from, to.id), speed: m.troops ? S.unitSpeed(m.unit) : "officer",
      officers: team.map((o) => o.id), troops: m.troops, unit: m.unit, train: m.train, gold: m.gold, food: m.food, res: m.res, wounded: m.wounded, care: m.care, origin: from, target: to.id,
      ...shipsAboard(m) });
    if (m.force === state.playerForce) S.addLog(state, `${here.name}에 갈 수 없게 되어 ${S.ro(to.name)} 방향을 돌립니다.`, "warn");
  }
  S.reroute = reroute;
  // A beaten army falls back the way it came.
  //   wounded: {n, unit} brought along (they heal as "mid" at home)
  S.sendHome = function (state, m, survivors, wounded) {
    const team = crew(state, m);
    release(state, m);
    if (!survivors && !team.length && !(wounded && wounded.n)) return;
    S.launch(state, { kind: "return", force: m.force, path: m.path.slice().reverse(), speed: S.unitSpeed(m.unit),
      officers: team.map((o) => o.id), troops: survivors, unit: m.unit, train: m.train, wounded: wounded && wounded.n ? wounded : null, care: "mid", origin: m.target, target: m.origin, navy: !!m.navy,
      ...shipsAboard(m) });
  };

  function arrive(state, m, onEvent) {
    if (m.kind === "build") return S.finishBuild(state, m);
    if (m.kind === "sortie") return S.sortieArrives(state, m);
    const t = S.place(state, m.target);
    if (!state.forces[m.force].alive) { release(state, m); return; }
    if (m.kind === "relief" && S.reliefArrives(state, m)) return;
    if (m.kind === "relief" && S.counterArrives && S.counterArrives(state, m)) return;
    // An empty stronghold is ours for the taking.
    if (S.isFort(state, m.target) && !t.owner && t.troops <= 0 && t.built) {
      t.owner = m.force;
      if (m.force === state.playerForce) S.addLog(state, `비어 있던 ${S.josa(t.name, "을", "를")} 차지했습니다.`, "sys");
    }
    if (t.owner === m.force) return deliver(state, m, t);
    if (m.kind !== "army") return reroute(state, m, m.target);
    if (t.owner && S.allied(state, m.force, t.owner)) {
      if (m.force === state.playerForce) S.addLog(state, `${S.josa(S.forceName(state, t.owner), "과", "와")} 동맹을 맺어 ${t.name} 공격을 거두고 돌아갑니다.`, "mine");
      return S.sendHome(state, m, m.troops);
    }
    if (t.owner && S.truceLeft && S.truceLeft(state, m.force, t.owner)) {
      if (m.force === state.playerForce) S.addLog(state, `${S.josa(S.forceName(state, t.owner), "과", "와")} 강화하여 ${t.name} 공격을 거두고 돌아갑니다.`, "mine");
      return S.sendHome(state, m, m.troops);
    }
    S.startSiege(state, m);
  }

  S.runMarches = function (state, onEvent) {
    if (!state.marches || !state.marches.length) return;
    const now = S.today(state);
    if (S.runIntercepts) S.runIntercepts(state); // fleets passing a hostile port (js/battle.js)
    const due = state.marches.filter((m) => m.arrive <= now);
    if (!due.length) return;
    state.marches = state.marches.filter((m) => m.arrive > now);
    for (const m of due) {
      arrive(state, m, onEvent);
      if (S.checkOver(state)) return;
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
