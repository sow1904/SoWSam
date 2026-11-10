// Unit types (병종). An army takes the field as one unit type, chosen when it
// marches out; a place's garrison has its own type, which it fights with when
// it holds the walls or marches out to meet an army on the road.
//
// Types come in lines (계열). Matchups are between lines; a later type in a
// line is the same kind of soldier, only better armed. Han foot soldiers
// carried sword and shield together, so there is no separate shield line.
// Terrain matters too: walls favour archers, mountain roads hamper horsemen.
//
// Ships are not chosen: a battle on a great river is fought in whatever
// ships a side has. 몽충 by default; 투함 when a naval specialist (수전) leads
// (later also by technology); 누선 for a force holding part of 형주 or 양주.
//
// For now only the first type of each line can be raised. Later types wait
// for technology (기술), special ones for holding certain lands; both will
// need weapons made from wood and iron.
// TODO: ratio-mixed armies (비율 혼성) instead of one type per army.
(function (S) {
  S.UNIT_LINES = { spear: "창", sword: "검", bow: "궁", horse: "기", horsebow: "궁기", navy: "수군" };

  // atk/def scale what a side deals and how much it shrugs off; tier and
  // special decide when it can be raised.
  S.UNITS = {
    jibing: { name: "극병", line: "spear", tier: 1, atk: 1, def: 1 },
    spearman: { name: "창병", line: "spear", tier: 2, atk: 1.1, def: 1.1 },
    lightfoot: { name: "경보병", line: "sword", tier: 1, atk: 1, def: 1 },
    heavyfoot: { name: "중보병", line: "sword", tier: 2, atk: 1.1, def: 1.15 },
    mountain: { name: "산악병", line: "sword", tier: 2, special: true, atk: 1.05, def: 1, rough: 1.35 },
    rattan: { name: "등갑병", line: "sword", tier: 2, special: true, atk: 1, def: 1.3, fireWeak: true },
    archer: { name: "궁병", line: "bow", tier: 1, atk: 1, def: 0.9 },
    crossbow: { name: "노병", line: "bow", tier: 2, atk: 1.15, def: 0.9 },
    repeater: { name: "연노병", line: "bow", tier: 3, special: true, atk: 1.3, def: 0.9 },
    lighthorse: { name: "경기병", line: "horse", tier: 1, atk: 1.05, def: 0.95, fast: true },
    heavyhorse: { name: "중기병", line: "horse", tier: 2, atk: 1.15, def: 1.1, fast: true },
    elephant: { name: "상병", line: "horse", tier: 3, special: true, atk: 1.3, def: 1.2 },
    horsearcher: { name: "궁기병", line: "horsebow", tier: 1, atk: 1, def: 0.9, fast: true },
    raider: { name: "돌기병", line: "horsebow", tier: 2, special: true, atk: 1.15, def: 0.95, fast: true },
    // ships
    mengchong: { name: "몽충", line: "navy", tier: 1, atk: 1, def: 1 },
    douhan: { name: "투함", line: "navy", tier: 2, atk: 1.15, def: 1.15 },
    louchuan: { name: "누선", line: "navy", tier: 3, special: true, atk: 1.3, def: 1.3 },
  };
  S.DEFAULT_UNIT = "jibing";

  // How hard one line hits another, as the attacking line (rows) against the
  // line it faces (columns):
  //   spears stop horses; swords (with shields) get under spears and turn
  //   arrows; archers shoot down spears; horses ride down archers and
  //   catch horse archers; horse archers harry foot from a distance.
  const LINE_ORDER = ["spear", "sword", "bow", "horse", "horsebow"];
  const MATCH = {
    //        spear sword bow   horse horsebow
    spear: [1, 0.85, 1, 1.35, 1.15],
    sword: [1.15, 1, 1.1, 0.9, 1],
    bow: [1.2, 0.85, 1, 1, 1.05],
    horse: [0.75, 1.1, 1.2, 1, 1.15],
    horsebow: [1.15, 1.15, 1.05, 0.9, 1],
  };
  S.lineMatch = (a, b) => (MATCH[a] && LINE_ORDER.includes(b) ? MATCH[a][LINE_ORDER.indexOf(b)] : 1);

  const MOUNTED = { horse: true, horsebow: true };
  // How well a line fights in a setting:
  //   field  - on the road (a river battle is fought in ships: see S.fleet)
  //   siegeA - storming walls; siegeD - holding them
  const SETTING = {
    field: { other: 1 },
    water: { other: 1 },
    siegeA: { bow: 1.1, horse: 0.6, horsebow: 0.65, other: 1 },
    siegeD: { bow: 1.2, horse: 0.8, horsebow: 0.85, other: 1 },
  };

  S.unitOf = (id) => S.UNITS[id] || S.UNITS[S.DEFAULT_UNIT];
  S.unitName = (id) => S.unitOf(id).name;
  S.garrisonUnit = (place) => (place && S.canRaise(null, null, place.unit) ? place.unit : S.DEFAULT_UNIT);
  // Which land types a force can raise. Later types wait for technology and land.
  S.canRaise = (state, fid, id) => {
    const u = S.UNITS[id];
    return !!u && u.line !== "navy" && u.tier === 1 && !u.special;
  };
  S.raisable = (state, fid) => Object.keys(S.UNITS).filter((id) => S.canRaise(state, fid, id));
  S.unitSpeed = (id) => (S.unitOf(id).fast ? "cavalry" : "army");

  // The ships a side fights in on a great river.
  // TODO: 투함 by technology; 누선 for a force holding part of 형주 or 양주.
  S.fleet = (state, fid, officers) => (officers.some((o) => S.hasSkill(o, "수전")) ? "douhan" : "mengchong");

  // A side's multiplier on what it deals, against a foe of type `foe`.
  //   where: "water" | "field" | "siegeA" | "siegeD"; rough: the road's roughness (1 = easy)
  // On the water both sides are ships, so only their tiers count.
  S.unitMul = function (id, foe, where, rough) {
    const u = S.unitOf(id), f = foe ? S.unitOf(foe) : null;
    const set = SETTING[where] || SETTING.field;
    let m = u.atk * (set[u.line] || set.other);
    // Behind walls the lines meet less squarely, so matchups count for less.
    const siege = where === "siegeA" || where === "siegeD";
    if (f) m *= (siege ? Math.sqrt(S.lineMatch(u.line, f.line)) : S.lineMatch(u.line, f.line)) / f.def;
    if (rough > 1 && where !== "water") {
      if (MOUNTED[u.line]) m *= 0.8;
      if (u.rough) m *= u.rough;
    }
    return m;
  };
  // How one side fares against the other: the ratio of what each deals.
  S.unitEdge = (id, foe, where, rough) => S.unitMul(id, foe, where, rough) / S.unitMul(foe, id, where, rough);

  // Pick the type that fares best against `foe` in a setting, from those a force can raise.
  S.bestUnitVs = function (state, fid, foe, where, rough) {
    let best = null;
    for (const id of S.raisable(state, fid)) {
      const v = S.unitEdge(id, foe, where, rough);
      if (!best || v > best.v) best = { id, v };
    }
    return best ? best.id : S.DEFAULT_UNIT;
  };

  // Change the type a place's garrison fights with.
  S.setGarrisonUnit = function (state, id, unit) {
    const p = S.place(state, id);
    if (!p || !S.canRaise(state, p.owner, unit)) return { ok: false, msg: "그 병종은 아직 쓸 수 없습니다." };
    p.unit = unit;
    return { ok: true, msg: `${p.name}의 수비 병종을 ${S.unitName(unit)}으로 정했습니다.` };
  };
})(globalThis.SAM = globalThis.SAM || {});
