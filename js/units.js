// Unit types (병종). An army takes the field as one unit type, chosen when it
// marches out; a place's garrison has its own type, which it fights with when
// it holds the walls or marches out to meet an army on the road.
//
// Types come in lines (계열). Matchups are between lines; a later type in a
// line is the same kind of soldier, only better armed. Terrain matters too:
// a battle on a great river favours ships, mountain roads hamper horsemen,
// and walls favour archers.
//
// For now only the first type of each line can be raised. Later types wait
// for technology (기술), special ones for holding certain lands; both will
// need weapons made from wood and iron.
// TODO: ratio-mixed armies (비율 혼성) instead of one type per army.
(function (S) {
  S.UNIT_LINES = {
    spear: "창", sword: "검", shield: "방패", bow: "궁", horse: "기", horsebow: "궁기", navy: "수군",
  };

  // atk/def scale what a side deals and how much it shrugs off; tier and
  // special decide when it can be raised.
  S.UNITS = {
    jibing: { name: "극병", line: "spear", tier: 1, atk: 1, def: 1 },
    spearman: { name: "창병", line: "spear", tier: 2, atk: 1.1, def: 1.1 },
    lightfoot: { name: "경보병", line: "sword", tier: 1, atk: 1, def: 0.95 },
    heavyfoot: { name: "중보병", line: "sword", tier: 2, atk: 1.1, def: 1.1 },
    mountain: { name: "산악병", line: "sword", tier: 2, special: true, atk: 1.05, def: 1, rough: 1.35 },
    shield: { name: "방패병", line: "shield", tier: 1, atk: 0.85, def: 1.05 },
    rattan: { name: "등갑병", line: "shield", tier: 2, special: true, atk: 0.9, def: 1.25, fireWeak: true },
    archer: { name: "궁병", line: "bow", tier: 1, atk: 1, def: 0.9 },
    crossbow: { name: "노병", line: "bow", tier: 2, atk: 1.15, def: 0.9 },
    repeater: { name: "연노병", line: "bow", tier: 3, special: true, atk: 1.3, def: 0.9 },
    lighthorse: { name: "경기병", line: "horse", tier: 1, atk: 1.05, def: 0.95, fast: true },
    heavyhorse: { name: "중기병", line: "horse", tier: 2, atk: 1.15, def: 1.1, fast: true },
    elephant: { name: "상병", line: "horse", tier: 3, special: true, atk: 1.3, def: 1.2 },
    horsearcher: { name: "궁기병", line: "horsebow", tier: 1, atk: 1, def: 0.9, fast: true },
    raider: { name: "돌기병", line: "horsebow", tier: 2, special: true, atk: 1.15, def: 0.95, fast: true },
    mengchong: { name: "몽충", line: "navy", tier: 1, atk: 1, def: 1 },
    douhan: { name: "투함", line: "navy", tier: 2, atk: 1.1, def: 1.1 },
    louchuan: { name: "누선", line: "navy", tier: 3, special: true, atk: 1.25, def: 1.25 },
  };
  S.DEFAULT_UNIT = "jibing";

  // How hard one line hits another, as the attacking line (rows) against the
  // line it faces (columns). Spears stop horses, horses ride down archers,
  // archers shoot down spears, swords cut under spears, shields turn arrows
  // and stop swords.
  const LINE_ORDER = ["spear", "sword", "shield", "bow", "horse", "horsebow", "navy"];
  const MATCH = {
    spear: [1, 0.85, 1, 1, 1.35, 1.2, 1],
    sword: [1.2, 1, 0.85, 1.15, 0.9, 1, 1],
    shield: [1, 1.15, 1, 1, 0.95, 1, 1],
    bow: [1.2, 1.1, 0.7, 1, 0.9, 1.05, 1],
    horse: [0.75, 1.15, 0.9, 1.3, 1, 1.1, 1],
    horsebow: [1.15, 1.15, 0.8, 1.05, 0.95, 1, 1],
    navy: [1, 1, 1, 1, 1, 1, 1],
  };
  S.lineMatch = (a, b) => MATCH[a][LINE_ORDER.indexOf(b)];

  const MOUNTED = { horse: true, horsebow: true };
  // How well a line fights in a setting:
  //   water  - a battle on a great river
  //   field  - on the road
  //   siegeA - storming walls; siegeD - holding them
  const SETTING = {
    water: { navy: 1.3, horse: 0.6, horsebow: 0.6, other: 0.8 },
    field: { navy: 0.6, other: 1 },
    siegeA: { sword: 1.1, horse: 0.6, horsebow: 0.65, navy: 0.6, other: 1 },
    siegeD: { bow: 1.2, horse: 0.8, horsebow: 0.85, navy: 0.8, other: 1 },
  };

  S.unitOf = (id) => S.UNITS[id] || S.UNITS[S.DEFAULT_UNIT];
  S.unitName = (id) => S.unitOf(id).name;
  S.garrisonUnit = (place) => (place && S.UNITS[place.unit] ? place.unit : S.DEFAULT_UNIT);
  // Which types a force can raise. Later types wait for technology and land.
  S.canRaise = (state, fid, id) => {
    const u = S.UNITS[id];
    return !!u && u.tier === 1 && !u.special;
  };
  S.raisable = (state, fid) => Object.keys(S.UNITS).filter((id) => S.canRaise(state, fid, id));
  S.unitSpeed = (id) => (S.unitOf(id).fast ? "cavalry" : "army");

  // A side's multiplier on what it deals, against a foe of type `foe`.
  //   where: "water" | "field" | "siegeA" | "siegeD"; rough: the road's roughness (1 = easy)
  S.unitMul = function (id, foe, where, rough) {
    const u = S.unitOf(id), f = foe ? S.unitOf(foe) : null;
    const set = SETTING[where] || SETTING.field;
    let m = u.atk * (set[u.line] || set.other);
    if (f) m *= S.lineMatch(u.line, f.line) / f.def;
    if (rough > 1 && where !== "water") {
      if (MOUNTED[u.line]) m *= 0.8;
      if (u.rough) m *= u.rough;
    }
    return m;
  };
  // Without a foe's type (the walls of a siege): what the type brings by itself.
  S.unitSiegeMul = (id, holding) => S.unitMul(id, null, holding ? "siegeD" : "siegeA", 1);

  // Pick the type that fares best against `foe` in a setting, from those a force can raise.
  S.bestUnitVs = function (state, fid, foe, where, rough) {
    let best = null;
    for (const id of S.raisable(state, fid)) {
      const v = S.unitMul(id, foe, where, rough) / S.unitMul(foe, id, where, rough);
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
