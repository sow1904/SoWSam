// 함선 건조 (shipbuilding): the ships a port keeps, by kind, and how they
// are built and kept.
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

  // What a computer port should be told to build.
  function portAI(state, f) {
    const fid = f.owner;
    const home = state.cities[f.home];
    // Foes holding ports on the same waters.
    const foes = new Set();
    for (const p of Object.values(state.forts || {})) {
      if (p.kind !== "port" || !p.owner || p.owner === fid || !S.isPortLink(f.id, p.id) || S.allied(state, fid, p.owner)) continue;
      foes.add(p.owner);
    }
    let want = foes.size ? S.SHIP_AI.foe : S.SHIP_AI.quiet;
    for (const foe of foes) {
      const ours = S.willOf ? S.willOf(state, fid, foe) : 0;
      const theirs = S.willOf && state.forces[foe] && state.forces[foe].will ? state.forces[foe].will[fid] || 0 : 0;
      if (ours >= S.WILL.prep || theirs >= S.WILL.prep) want = S.SHIP_AI.war;
    }
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
})(globalThis.SAM = globalThis.SAM || {});
