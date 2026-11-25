// 함선 건조 (shipbuilding): the ships a port keeps, by kind, and how they
// are built and kept; and 수군 (the navy), the men who sail them (below).
//
// A port's ships are counted in the men they carry, by kind (f.fleet;
// f.ships is their sum). Each kind fights differently on the water (its
// atk/def in js/units.js) and costs differently to build and keep:
//   몽충 (mengchong): small fast rams, cheap and quick to build;
//   투함 (douhan): the warship of the line, built with 조선 2단계;
//   누선 (louchuan): the great tower ship, slow and dear to build, with
//     조선 2단계, and only at a port whose city lies south of the 장강
//     (S.SPECIAL.louchuan).
// Every port has room for S.portMax (berths), and a kind takes room for
// each man it carries: the great hulls carry more men to the berth (누선
// above all), so a port of 누선 carries the most men; 몽충 take the most room
// for their men but are quick on the water and hunt down passing fleets
// (chase, 요격); 누선 are slow (speed, on voyages) and burn well. A port builds
// what it is told (f.shipOrder: a kind and how many more) each month, as fast as
// its level of 조선 and the gold and timber of its city allow, and its city
// pays every month to keep the ships it has; unpaid, they rot.
// A computer port (and one left to a 도독) gives its own orders: a modest
// fleet in quiet waters, more where a foe holds ports on the same waters,
// and all it can hold when its lord means to campaign across the water
// (원정 의지, js/will.js) or hears that a foe means to come.
// why: the user's design (수의 조조, 질의 손권): the north can only answer
// the 강남 fleets with numbers of plainer ships, built for a campaign.
(function (S) {
  S.SHIPS = {
    // room: berths a man's worth takes; speed: x the time of a voyage;
    // chase: + the strength of a port's fleet coming out to 요격, by share
    mengchong: { lv: 1, gold: 0.1, wood: 0, rate: 1.5, upkeep: 0.001, room: 1, speed: 0.8, chase: 0.3 },
    douhan: { lv: 2, gold: 0.15, wood: 0.3, rate: 1, upkeep: 0.0015, room: 0.9, speed: 1, chase: 0 },
    louchuan: { lv: 2, gold: 0.3, wood: 1, rate: 0.6, upkeep: 0.0025, room: 0.8, speed: 1.25, chase: -0.2, south: true },
  };
  S.SHIP_KINDS = Object.keys(S.SHIPS);
  // A computer port's fleet, as a share of what it can hold: quiet waters,
  // foes on the same waters, a campaign planned or feared. rot: of the ships
  // a month when their upkeep cannot be paid. min: the smallest order.
  S.SHIP_AI = { quiet: 0.3, foe: 0.6, war: 1, rot: 0.03, min: 500 };

  // The ships of a port by kind (a save from before: all 몽충).
  S.fleetOf = function (f) {
    if (!f.fleet) f.fleet = { mengchong: f.ships || 0 };
    return f.fleet;
  };
  const sync = (f) => { f.ships = Math.round(S.SHIP_KINDS.reduce((s, k) => s + (f.fleet[k] || 0), 0)); };
  // Berths taken, and berths free.
  S.roomUsed = (f) => S.SHIP_KINDS.reduce((s, k) => s + (S.fleetOf(f)[k] || 0) * S.SHIPS[k].room, 0);
  S.roomFree = (state, f) => Math.max(0, S.portMax(state, f) - S.roomUsed(f));
  // What a mix of ships does on the water, weighted by share: speed, chase.
  S.fleetTrait = (mix, key) => Object.entries(S.mixOf(mix || "mengchong")).reduce((s, [k, w]) => s + w * (S.SHIPS[k] ? S.SHIPS[k][key] : 0), 0);
  // The kinds of a port's ships as shares (for the fight on the water).
  S.shipMix = function (f) {
    const fl = f && f.kind === "port" ? S.fleetOf(f) : null;
    return fl && Object.values(fl).some((n) => n > 0) ? S.mixOf(fl) : S.mixOf("mengchong");
  };
  // A force's fleet as a whole, for plans made before a port is chosen.
  S.forceShipMix = function (state, fid) {
    const sum = {};
    for (const f of Object.values(state.forts || {})) {
      if (f.kind !== "port" || f.owner !== fid) continue;
      for (const [k, n] of Object.entries(S.fleetOf(f))) sum[k] = (sum[k] || 0) + n;
    }
    return Object.values(sum).some((n) => n > 0) ? S.mixOf(sum) : S.mixOf("mengchong");
  };
  S.addShips = function (state, f, kind, n) {
    const fl = S.fleetOf(f);
    fl[kind] = (fl[kind] || 0) + Math.max(0, n);
    sync(f);
  };
  // Ships lost or taken out of a port, each kind by its share; returns the
  // mix of those taken.
  S.takeShips = function (f, n) {
    const fl = S.fleetOf(f);
    const total = S.SHIP_KINDS.reduce((s, k) => s + (fl[k] || 0), 0);
    const mix = S.shipMix(f);
    n = Math.min(total, Math.max(0, n));
    if (total > 0) for (const k of S.SHIP_KINDS) fl[k] = Math.max(0, (fl[k] || 0) - n * ((fl[k] || 0) / total));
    sync(f);
    return mix;
  };
  // Ships come back to a port (of the kinds in mix), up to what it holds.
  S.putShips = function (state, f, n, mix) {
    const m = S.mixOf(mix || "mengchong");
    n = Math.min(S.roomFree(state, f) / Math.max(0.1, S.fleetTrait(m, "room")), Math.max(0, Math.round(n)));
    for (const k of Object.keys(m)) S.fleetOf(f)[k] = (S.fleetOf(f)[k] || 0) + n * m[k];
    sync(f);
  };
  // Can this port build ships of this kind?
  S.canBuildShip = function (state, f, kind) {
    const s = S.SHIPS[kind];
    if (!s || !f.owner) return false;
    if ((S.lineLevel ? S.lineLevel(state, f.owner, "navy") : 1) < s.lv) return false;
    return !s.south || S.specialLand("louchuan", state.cities[f.home]);
  };
  S.shipCostText = (kind, n) => `금 ${Math.ceil(n * S.SHIPS[kind].gold)}` + (S.SHIPS[kind].wood ? `, 목재 ${Math.ceil(n * S.SHIPS[kind].wood)}` : "");
  // Men's worth of a kind a port builds in a month at most.
  S.shipRate = (state, f, kind) => Math.round(S.PORT.build * (S.lineLevel ? S.lineLevel(state, f.owner, "navy") : 1) * S.SHIPS[kind].rate);
  // A month's upkeep of the ships of the ports of these cities.
  S.portsUpkeep = (state, cities) => {
    const ids = new Set(cities.map((c) => c.id));
    return Object.values(state.forts || {}).reduce((s, f) => s + (f.kind === "port" && f.owner && ids.has(f.home) ? S.shipUpkeep(f) : 0), 0);
  };
  S.shipUpkeep = (f) => Math.ceil(S.SHIP_KINDS.reduce((s, k) => s + (S.fleetOf(f)[k] || 0) * S.SHIPS[k].upkeep, 0));

  // The player's order at a port: build n more of a kind (n 0: stop).
  S.orderShips = function (state, portId, kind, n) {
    const f = state.forts && state.forts[portId];
    if (!f || f.kind !== "port" || f.owner !== state.playerForce) return { ok: false, msg: "우리 항구가 아닙니다." };
    n = Math.max(0, Math.floor(n || 0));
    if (!n) { f.shipOrder = null; return { ok: true, msg: `${f.name}의 함선 건조를 멈췄습니다.` }; }
    if (!S.canBuildShip(state, f, kind)) return { ok: false, msg: `${f.name}에서는 ${S.unitName(kind)}을 지을 수 없습니다.` };
    f.shipOrder = { kind, left: n };
    return { ok: true, msg: `${f.name}에서 ${S.unitName(kind)} 병사 ${n.toLocaleString()}명분을 짓기 시작합니다. (한 달에 최대 ${S.shipRate(state, f, kind).toLocaleString()}명분, ${S.shipCostText(kind, n)})` };
  };

  // How a port's waters stand: "quiet", a "foe" holding ports on them, or
  // "war" (a campaign across them planned or feared, js/will.js).
  S.portMood = function (state, f) {
    const fid = f.owner;
    const foes = new Set();
    for (const p of Object.values(state.forts || {})) {
      if (p.kind !== "port" || !p.owner || p.owner === fid || !S.isPortLink(f.id, p.id) || S.allied(state, fid, p.owner)) continue;
      foes.add(p.owner);
    }
    let mood = foes.size ? "foe" : "quiet";
    for (const foe of foes) {
      const ours = S.willOf ? S.willOf(state, fid, foe) : 0;
      const theirs = S.willOf && state.forces[foe] && state.forces[foe].will ? state.forces[foe].will[fid] || 0 : 0;
      if (ours >= S.WILL.prep || theirs >= S.WILL.prep) mood = "war";
    }
    return mood;
  };
  // What a computer port should be told to build.
  function portAI(state, f) {
    const home = state.cities[f.home];
    const want = S.SHIP_AI[S.portMood(state, f)];
    const shortRoom = S.portMax(state, f) * want - S.roomUsed(f);
    const men = (k) => Math.round(shortRoom / S.SHIPS[k].room);
    if (men("mengchong") < S.SHIP_AI.min) { if (f.shipOrder && f.shipOrder.ai) f.shipOrder = null; return; }
    // The best kind the port can build and its city afford for a while.
    const rich = (k) => home.gold >= men(k) * S.SHIPS[k].gold * 0.5 && ((home.res && home.res.wood) || 0) >= men(k) * S.SHIPS[k].wood * 0.5;
    const kind = ["louchuan", "douhan", "mengchong"].find((k) => S.canBuildShip(state, f, k) && rich(k)) || "mengchong";
    f.shipOrder = { kind, left: men(kind), ai: true };
  }

  // Each month at a port (js/forts.js): the order worked on, the ships kept.
  S.runShipyard = function (state, f) {
    const home = state.cities[f.home];
    if (!f.owner || !home || home.owner !== f.owner) return;
    S.fleetOf(f);
    // Upkeep: unpaid, the ships rot.
    const cost = S.shipUpkeep(f);
    if (home.gold >= cost) home.gold -= cost;
    else if (f.ships > 0) S.takeShips(f, f.ships * S.SHIP_AI.rot);
    if (S.corpsRunsItself && S.corpsRunsItself(state, f.owner, S.placeCorps(state, f))) portAI(state, f);
    const o = f.shipOrder;
    if (!o) return;
    if (!S.canBuildShip(state, f, o.kind)) { f.shipOrder = null; return; }
    const s = S.SHIPS[o.kind];
    const wood = (home.res && home.res.wood) || 0;
    const n = Math.floor(Math.min(o.left, S.shipRate(state, f, o.kind), S.roomFree(state, f) / s.room,
      home.gold / s.gold, s.wood ? wood / s.wood : Infinity));
    if (n <= 0) return;
    home.gold -= Math.ceil(n * s.gold);
    if (s.wood) home.res.wood -= Math.ceil(n * s.wood);
    S.addShips(state, f, o.kind, n);
    o.left -= n;
    if (o.left <= 0) {
      f.shipOrder = null;
      if (f.owner === state.playerForce && !o.ai) S.addLog(state, `${f.name}에서 ${S.unitName(o.kind)} 건조를 마쳤습니다.`, "mine");
    }
  };
  // ---------- 수군 (the navy) ----------
  // The men of a port are its navy: they man its ships, meet a crossing on
  // the water and are the only men who cross to an enemy port. The soldiers
  // of the cities do not fight on the water: they cross only to a port
  // already held, once the navy has taken one on the far bank.
  // A port fills its navy from its city, as many as its ships carry (goal,
  // or what the player sets), a few at a time; the new men come green
  // (rookie) and are drilled month by month, more quickly under an officer
  // skilled on the water (수전), up to what the force's 조선 allows (top).
  // A navy that takes an enemy port keeps its ships there: the fleet moves
  // down (or up) the river with it.
  // why: the user's design. 조조 drilled a navy on the 현무지 at 업 before he
  // went south, and 형주's navy went over to him with 채모 and 장윤; 왕준
  // drilled his for years in 익주 before 진 crossed to take 오. Who held the
  // water decided where armies could cross (장강 방어선).
  //   guard: the fewest men a port keeps and fills to; draft: men a month
  //   per level of 조선; rookie: the drill of new men; drill/skill: drill a
  //   month (+ with 수전); top: the most drill, by level of 조선; keep: of the
  //   navy that stays when it sails to attack; cargo: the strength on the
  //   water of soldiers carried by ships, not their crews; start: navy at
  //   the start, of the ships; south/north: drill at the start, + for a port
  //   of the lands south of the 장강 (S.southWater); share: of all the men of its
  //   corps a computer lord gives to its navies, by how its waters stand at
  //   the most (S.portMood), x (1 + water) by the part of its front that is
  //   on the water; weight: how the navy is shared among its ports, by their
  //   ships and how their waters stand
  S.NAVY = { guard: 2000, draft: 1000, rookie: 30, drill: 3, skill: 2, top: [0, 70, 85, 100], keep: 0.2, cargo: 0.35, start: 0.6, south: 15, north: -10,
    share: { quiet: 0.05, foe: 0.15, war: 0.3 }, water: 1.5, weight: { quiet: 0.2, foe: 1, war: 2 } };
  const navyLevel = (state, f) => Math.min(3, Math.max(1, f.owner && S.lineLevel ? S.lineLevel(state, f.owner, "navy") : 1));
  S.navyTop = (state, f) => S.NAVY.top[navyLevel(state, f)];
  // The men a port fills its navy to, never fewer than its guard: the
  // player's number, or its ships manned; a computer port its share of its
  // corps' men (S.NAVY.share), at most its ships manned.
  S.navyGoal = function (state, f) {
    const ships = Math.round(f.ships || 0);
    if (!f.owner) return S.NAVY.guard;
    const k = S.placeCorps ? S.placeCorps(state, f) : 1;
    if (!(S.corpsRunsItself && S.corpsRunsItself(state, f.owner, k))) return Math.max(S.NAVY.guard, f.navyGoal != null ? f.navyGoal : ships);
    const day = S.today(state);
    if (f.navyAim && f.navyAim.day === day) return f.navyAim.n;
    // Worked out for all the corps' ports at once, once a day.
    const fid = f.owner;
    const realm = S.corpsCities(state, fid, k);
    const ids = new Set(realm.map((c) => c.id));
    const ports = Object.values(state.forts || {}).filter((p) => p.kind === "port" && p.owner === fid && p.built && ids.has(p.home));
    if (!ports.includes(f)) ports.push(f);
    const mood = new Map(ports.map((p) => [p, S.portMood(state, p)]));
    const rank = { quiet: 0, foe: 1, war: 2 };
    const top = [...mood.values()].reduce((a, m) => (rank[m] > rank[a] ? m : a), "quiet");
    // The front on land: the corps' cities next to a foe by a road.
    const foeNear = (c) => S.links(state, c.id).some((id) => { const p = S.place(state, id); return p && p.owner && p.owner !== fid && !S.allied(state, fid, p.owner) && !S.isPortLink(c.id, id); });
    const landFront = realm.filter(foeNear).length;
    const waterFront = ports.filter((p) => mood.get(p) !== "quiet").length;
    const water = waterFront ? waterFront / (waterFront + landFront) : 0;
    const budget = S.corpsMen(state, fid, k, realm) * S.NAVY.share[top] * (1 + S.NAVY.water * water);
    const w = (p) => (p.ships || 0) * S.NAVY.weight[mood.get(p)];
    const all = ports.reduce((s, p) => s + w(p), 0);
    for (const p of ports) {
      const n = Math.max(S.NAVY.guard, Math.round(Math.min(p.ships || 0, all > 0 ? budget * w(p) / all : 0)));
      p.navyAim = { day, n };
    }
    return f.navyAim.n;
  };
  // Men of a port's navy who can sail to attack: what its ships carry, a
  // part left behind.
  S.navySortie = (state, f) => Math.max(0, Math.floor(Math.min((f.troops || 0) * (1 - S.NAVY.keep), f.ships || 0)));
  // The own port a crossing to an enemy port leaves from (null if the path
  // does not end on the water, or the port is not ours).
  S.navalPort = function (state, path, fid) {
    if (!S.landingLink(path)) return null;
    const p = state.forts && state.forts[path[path.length - 2]];
    return p && p.kind === "port" && p.owner === fid ? p : null;
  };
  // The officers who lead a navy out of its port: those stationed there
  // first, the most skilled on the water (수전) foremost, one left behind
  // when there are more; then those of the city (ids) to fill the team.
  S.navyTeam = function (state, port, ids) {
    const water = (o) => (S.hasSkill(o, "수전") ? 50 : 0) + o.cmd;
    const here = S.idle(state, port.id).sort((a, b) => water(b) - water(a));
    const go = here.slice(0, here.length > 1 ? here.length - 1 : here.length).map((o) => o.id);
    return [...new Set([...go, ...ids])].slice(0, S.MAX_SORTIE_OFFICERS);
  };
  // An attack along a way, if it crosses to an enemy port: the own port it
  // sails from (null if none, and then it cannot go), the men who sail, the
  // team (officers of the port first), the navy's mix, and how the crossing
  // would go (S.landingForecast). null if the way stays on land.
  S.navyPlan = function (state, way, fid, ids) {
    if (!way || !S.landingLink(way.path)) return null;
    const port = S.navalPort(state, way.path, fid);
    if (!port) return { port: null, men: 0 };
    const men = S.navySortie(state, port);
    const go = S.navyTeam(state, port, ids || []);
    const land = men > 0 ? S.landingForecast(state, way.id, fid, go.map((id) => state.officers[id]), men, port.train, men) : null;
    return { port, men, go, unit: S.garrisonUnit(port), land, left: land ? land.left : men };
  };
  // The player's number for a port's navy (the ships manned if none).
  S.setNavyGoal = function (state, portId, n) {
    const f = state.forts && state.forts[portId];
    if (!f || f.kind !== "port" || f.owner !== state.playerForce) return { ok: false, msg: "우리 항구가 아닙니다." };
    f.navyGoal = Math.max(0, Math.floor(n || 0));
    return { ok: true, msg: `${f.name} 수군 정원을 ${S.navyGoal(state, f).toLocaleString()}명으로 정했습니다. 매달 ${state.cities[f.home].name}에서 채우거나 돌려보냅니다.` };
  };
  // The lands south of the 장강 whose men knew the water: where 누선 are
  // built (S.SPECIAL.louchuan), and 예장 (시상, the 파양호), 회계 (the
  // coast) and 무릉 (잔릉, the 동정호), which built no 누선 but drilled
  // navies all the same.
  S.SOUTH_WATER = ["yuzhang", "kuaiji", "wuling"];
  S.southWater = (c) => !!c && ((S.specialLand && S.specialLand("louchuan", c)) || S.SOUTH_WATER.includes(c.id));
  // A port's navy at the start of a game: its ships part manned, drilled as
  // the waters it knows.
  S.startNavy = function (state, f) {
    const home = state.cities[f.home];
    if (!f.owner || !home) return;
    f.troops = Math.max(f.troops, Math.round((f.ships || 0) * S.NAVY.start));
    const south = S.southWater(home);
    f.train = S.clamp(home.train + (south ? S.NAVY.south : S.NAVY.north), 20, S.navyTop(state, f));
  };
  // Each month (js/forts.js): men over the goal go to the city, men short of
  // it come from the city (green), and the navy is drilled.
  S.runNavy = function (state, f) {
    const home = state.cities[f.home];
    if (!f.owner || !home || home.owner !== f.owner) return;
    const goal = S.navyGoal(state, f);
    const free = !S.besieged(state, f.id) && !S.besieged(state, home.id);
    if (free && f.troops > goal) {
      const over = Math.floor(f.troops - goal);
      S.addTroops(home, S.garrisonUnit(f), over);
      f.troops -= over;
    } else if (free && f.troops < goal) {
      // From its city, else from the seat of its corps (the men sent on).
      const guardMin = S.WAR ? S.WAR.expedition.guardMin : 2000;
      const spareOf = (c) => (c && c.owner === f.owner && !S.besieged(state, c.id) ? Math.floor(S.marchable(c) - Math.max(guardMin, c.troops * 0.3)) : 0);
      const seat = S.corpsSeat ? state.cities[S.corpsSeat(state, f.owner, S.placeCorps(state, f))] : null;
      const src = spareOf(home) >= 100 || !seat ? home : seat;
      const n = Math.min(goal - f.troops, S.NAVY.draft * navyLevel(state, f), spareOf(src));
      if (n >= 100) {
        const home = src;
        const counts = S.mixCounts(S.garrisonUnit(home), n);
        const got = S.countsTotal(counts);
        const unit = got > 0 ? S.takeTroops(home, counts) : null;
        if (unit) {
          f.train = Math.round(((f.train || 0) * Math.max(0, f.troops) + Math.min(home.train, S.NAVY.rookie) * got) / Math.max(1, f.troops + got));
          S.addTroops(f, unit, got);
        }
      }
    }
    if (f.troops > 0) {
      const skilled = S.serving(state, f.id).concat(S.serving(state, home.id)).some((o) => o.force === f.owner && S.hasSkill(o, "수전"));
      f.train = Math.min(S.navyTop(state, f), Math.max(f.train || 0, (f.train || 0) + S.NAVY.drill + (skilled ? S.NAVY.skill : 0)));
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
