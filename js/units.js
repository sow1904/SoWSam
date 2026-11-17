// Unit types (병종). Soldiers are drafted as one type and stay that type.
// A place's garrison and an army are a mix of types (비율 혼성), kept as
// shares that add up to 1 (place.unit, march.unit, side.unit): losses fall
// evenly, so the shares hold until two bodies merge or a type is taken out.
// A plain type id is a mix of one.
//
// Types come in lines (계열). Matchups are between lines; a later type in a
// line is the same kind of soldier, only better armed. Han foot soldiers
// carried sword and shield together, so there is no separate shield line.
// Terrain matters too: walls favour archers, mountain roads hamper horsemen.
//
// Ships are not chosen: a battle on a great river is fought in whatever
// ships a side has. 몽충 by default; 투함 when a naval specialist (수전) leads
// or with 조선 technology; 누선 instead of 투함 for a force holding a city on
// the Yangzi.
//
// Later types in a line wait for technology (js/tech.js). Special types come
// from certain lands (S.SPECIAL below). Drafting spends wood, iron and horses
// (js/resources.js), one per soldier for each item in a type's cost.
//
// Siege engines (공성 병기) are a line of their own: the crews of rams,
// towers, ladders and stone-throwers. They are counted as soldiers like any
// other part of a mix, fight poorly in the open and slow the march, and earn
// their keep only before walls (S.GEAR below).
//
// Carts (수레) are another: wagons that make a moving wall against horsemen,
// watch-tower carts, and the wooden oxen that carry grain. They help an army
// by their share of it (S.AID below). 화선 is not drafted: it is what a force
// with the third level of 조선 sends against the enemy fleet (js/battle.js).
(function (S) {
  S.UNIT_LINES = { spear: "창", sword: "검", bow: "궁", horse: "기", horsebow: "궁기", siege: "공성", cart: "수레", navy: "수군" };

  // atk/def scale what a side deals and how much it shrugs off; tier and
  // special decide when it can be raised; cost is what each soldier is
  // drafted with: spears iron, swords more iron (shield and armour),
  // bows wood, horses horses. 몽충 and 투함 are the ordinary fleet and cost
  // nothing; the 누선 tower ship takes a lot of timber.
  S.UNITS = {
    jibing: { name: "극병", line: "spear", tier: 1, atk: 1, def: 1, cost: { iron: 1 } },
    spearman: { name: "창병", line: "spear", tier: 2, atk: 1.1, def: 1.1, cost: { iron: 1, wood: 1 } },
    lightfoot: { name: "경보병", line: "sword", tier: 1, atk: 1, def: 1, cost: { iron: 2 } },
    heavyfoot: { name: "중보병", line: "sword", tier: 2, atk: 1.1, def: 1.15, cost: { iron: 3 } },
    mountain: { name: "산악병", line: "sword", tier: 2, special: true, atk: 1.05, def: 1, rough: 1.35, cost: { iron: 2 } },
    rattan: { name: "등갑병", line: "sword", tier: 2, special: true, atk: 1, def: 1.3, fireWeak: true, cost: { wood: 2 } },
    // 보도병: heavy armour and a two-handed blade, no shield; made to cut
    // down horsemen, but open to arrows.
    bodao: { name: "보도병", line: "sword", tier: 3, special: true, atk: 1.15, def: 1.2, antiHorse: 1.4, noShield: true, cost: { iron: 5 } },
    archer: { name: "궁병", line: "bow", tier: 1, atk: 1, def: 0.9, cost: { wood: 1 } },
    crossbow: { name: "노병", line: "bow", tier: 2, atk: 1.15, def: 0.9, cost: { wood: 1, iron: 1 } },
    repeater: { name: "연노병", line: "bow", tier: 3, special: true, atk: 1.22, def: 0.9, cost: { wood: 2, iron: 2 } },
    lighthorse: { name: "경기병", line: "horse", tier: 1, atk: 1.05, def: 0.95, fast: true, cost: { horse: 1 } },
    heavyhorse: { name: "중기병", line: "horse", tier: 2, atk: 1.15, def: 1.1, fast: true, cost: { horse: 1, iron: 1 } },
    elephant: { name: "상병", line: "horse", tier: 3, special: true, atk: 1.3, def: 1.2, cost: { iron: 1 } },
    horsearcher: { name: "궁기병", line: "horsebow", tier: 1, atk: 1, def: 0.9, fast: true, cost: { horse: 1, wood: 1 } },
    raider: { name: "돌기병", line: "horsebow", tier: 2, special: true, atk: 1.15, def: 0.95, fast: true, cost: { horse: 1, wood: 1 } },
    // siege engines: gear is what the crew works (S.GEAR); note is for the lists
    ram: { name: "충차", line: "siege", tier: 2, atk: 0.8, def: 0.8, slow: true, gear: "ram", cost: { wood: 3 }, note: "성벽을 매일 부숩니다" },
    tower: { name: "정란", line: "siege", tier: 3, atk: 0.8, def: 0.8, slow: true, gear: "tower", cost: { wood: 4 }, note: "성 위의 수비군을 쏘아 수비 전력을 낮춥니다" },
    ladder: { name: "운제", line: "siege", tier: 3, atk: 0.8, def: 0.8, slow: true, gear: "ladder", cost: { wood: 2 }, note: "성벽을 넘어 성벽 효과를 줄입니다" },
    trebuchet: { name: "벽력거", line: "siege", tier: 4, atk: 0.8, def: 0.8, slow: true, gear: "treb", cost: { wood: 5, iron: 1 }, note: "돌을 날려 성벽을 크게 부수고 수비군을 죽입니다" },
    // carts: aid is what they do for the army (S.AID)
    wagon: { name: "편상거", line: "cart", tier: 2, atk: 0.6, def: 1, aid: "wagon", cost: { wood: 3 }, note: "들판에서 적 기병에게 입는 피해와 기습의 충격을 줄입니다" },
    scout: { name: "소차", line: "cart", tier: 2, atk: 0.6, def: 1, aid: "scout", cost: { wood: 2 }, note: "기습, 책략, 보급로 습격, 땅굴을 미리 알아챕니다" },
    woodox: { name: "목우유마", line: "cart", tier: 3, atk: 0.6, def: 1, aid: "ox", cost: { wood: 3 }, note: "성을 에워싼 동안 먹는 군량을 줄입니다" },
    // ships
    mengchong: { name: "몽충", line: "navy", tier: 1, atk: 1, def: 1 },
    douhan: { name: "투함", line: "navy", tier: 2, atk: 1.15, def: 1.15 },
    louchuan: { name: "누선", line: "navy", tier: 3, special: true, atk: 1.3, def: 1.3, cost: { wood: 4 } },
    fireship: { name: "화선", line: "navy", tier: 3, atk: 1, def: 1, note: "강 위의 싸움에서 적 함대에 불을 놓습니다(징병하지 않음)" },
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
  const LINE_AT = Object.fromEntries(LINE_ORDER.map((k, i) => [k, i]));
  S.lineMatch = (a, b) => (MATCH[a] && b in LINE_AT ? MATCH[a][LINE_AT[b]] : 1);

  const MOUNTED = { horse: true, horsebow: true };
  // How well a line fights in a setting:
  //   field  - in the open (a sortie, a relief army)
  //   water  - a landing, fought in ships only (see S.fleet)
  //   siegeA - storming walls; siegeD - holding them
  const SETTING = {
    field: { siege: 0.4, other: 1 },
    water: { other: 1 },
    siegeA: { horse: 0.6, horsebow: 0.65, other: 1 },
    siegeD: { bow: 1.2, horse: 0.8, horsebow: 0.85, siege: 0.7, other: 1 },
  };

  // What siege engines do for besiegers. A kind works in full once its crews
  // are a tenth of the army (full), and in proportion below that.
  //   ram: wall lost each day; treb: the same, and more defenders killed;
  //   tower: the garrison's strength it takes away; ladder: the part of the
  //   wall's protection it cancels.
  // why: at 관도 원소 raised towers to shoot into 조조's camp and 조조 broke
  // them with stone-throwers (벽력거); at 진창 제갈량 brought ladders, rams
  // and towers against 학소.
  S.GEAR = { full: 0.1, ram: 18, treb: 25, trebLoss: 0.1, tower: 0.12, ladder: 0.35 };
  S.gearOf = function (spec) {
    const g = { ram: 0, tower: 0, ladder: 0, treb: 0 };
    if (!spec) return g; // no engines at work
    const mix = S.mixOf(spec);
    for (const k in mix) if (S.UNITS[k].gear) g[S.UNITS[k].gear] += mix[k];
    for (const k in g) g[k] = Math.min(1, g[k] / S.GEAR.full);
    return g;
  };
  S.gearShare = function (spec) {
    const mix = S.mixOf(spec);
    let s = 0;
    for (const k in mix) if (S.UNITS[k].gear) s += mix[k];
    return s;
  };
  // A wall bonus (1 = no wall) as ladders leave it; what towers leave of the
  // garrison's strength; wall battered down in a day; defenders' losses.
  S.gearWall = (wb, g) => 1 + (wb - 1) * (1 - S.GEAR.ladder * g.ladder);
  S.gearSuppress = (g) => 1 - S.GEAR.tower * g.tower;
  S.gearBatter = (g) => S.GEAR.ram * g.ram + S.GEAR.treb * g.treb;
  S.gearKill = (g) => 1 + S.GEAR.trebLoss * g.treb;

  // What carts do for an army. A kind works in full once it is a twentieth
  // of the army (full), and in proportion below that.
  //   wagon: the part of the losses dealt by horsemen it turns aside, and of
  //     the shock of a surprise; scout: taken off the enemy's chance of a
  //     surprise and of a ruse (points), and the part of his supply raids
  //     that fail; ox: the part of a besieging army's daily food saved.
  // why: 마륭 crossed 량주 in 279 behind 편상거, wagons with a wall on one
  // side; 소차 is the watch-tower cart of the old armies; 목우유마 are the
  // wooden oxen 제갈량 built to carry grain over the 촉 roads.
  S.AID = { full: 0.05, wagon: 0.3, wagonShock: 0.5, scoutSurprise: 25, scoutRuse: 15, scoutRaid: 0.4, scoutTunnel: 3, ox: 0.3 };
  S.aidOf = function (spec) {
    const mix = S.mixOf(spec), g = { wagon: 0, scout: 0, ox: 0 };
    for (const k in mix) if (S.UNITS[k].aid) g[S.UNITS[k].aid] += mix[k];
    for (const k in g) g[k] = Math.min(1, g[k] / S.AID.full);
    return g;
  };
  S.aidShare = function (spec) {
    const mix = S.mixOf(spec);
    let s = 0;
    for (const k in mix) if (S.UNITS[k].aid) s += mix[k];
    return s;
  };
  S.mountedShare = function (spec) {
    const mix = S.mixOf(spec);
    let s = 0;
    for (const k in mix) if (MOUNTED[S.UNITS[k].line]) s += mix[k];
    return s;
  };
  // What is left of a side's losses in the open, behind its wagons.
  S.wagonGuard = (spec, foe) => 1 - S.AID.wagon * S.aidOf(spec).wagon * S.mountedShare(foe);

  S.unitOf = (id) => S.UNITS[id] || S.UNITS[S.DEFAULT_UNIT];

  // ---------- mixes ----------
  // A mix as shares: {id: share}, shares adding up to 1. Accepts a plain id.
  // Mixes made here are frozen and remembered, so reading one again (the
  // matchup sums do it constantly) costs nothing. Never change a mix in
  // place: make a new one.
  const MIXES = new WeakSet();
  const ONE = {};
  const keep = (mix) => { MIXES.add(Object.freeze(mix)); return mix; };
  const one = (id) => ONE[id] || (ONE[id] = keep({ [id]: 1 }));
  S.mixOf = function (spec) {
    if (typeof spec === "string") return one(S.UNITS[spec] ? spec : S.DEFAULT_UNIT);
    if (spec && MIXES.has(spec)) return spec;
    const out = {};
    let sum = 0;
    for (const k in spec) { const v = spec[k]; if (S.UNITS[k] && v > 0) { out[k] = v; sum += v; } }
    if (!sum) return one(S.DEFAULT_UNIT);
    for (const k in out) out[k] /= sum;
    return keep(out);
  };
  // Shares of n soldiers of a and m of b put together.
  S.blend = function (a, n, b, m) {
    const A = S.mixOf(a), B = S.mixOf(b), out = {};
    n = Math.max(0, n || 0);
    m = Math.max(0, m || 0);
    if (n + m <= 0) return A;
    for (const k in A) out[k] = (out[k] || 0) + A[k] * n;
    for (const k in B) out[k] = (out[k] || 0) + B[k] * m;
    return S.mixOf(out);
  };
  // Whole soldiers of each type in n soldiers of a mix (largest remainder).
  S.mixCounts = function (spec, n) {
    const mix = S.mixOf(spec);
    n = Math.max(0, Math.floor(n || 0));
    const rows = Object.entries(mix).map(([k, v]) => ({ k, x: v * n, c: Math.floor(v * n) }));
    let left = n - rows.reduce((s, r) => s + r.c, 0);
    rows.sort((a, b) => (b.x - b.c) - (a.x - a.c));
    for (const r of rows) if (left > 0) { r.c++; left--; }
    const out = {};
    for (const r of rows) if (r.c > 0) out[r.k] = r.c;
    return out;
  };
  S.countsTotal = (counts) => Object.values(counts || {}).reduce((s, v) => s + v, 0);
  // Ids of a mix, largest share first.
  S.mixIds = (spec) => Object.entries(S.mixOf(spec)).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  S.mainUnit = (spec) => S.mixIds(spec)[0];
  // A short name: the type itself, or the two largest parts of a mix.
  S.unitName = function (spec) {
    const mix = S.mixOf(spec);
    const ids = S.mixIds(mix).filter((k) => mix[k] >= 0.05);
    if (ids.length <= 1) return S.unitOf(ids[0] || S.mainUnit(mix)).name;
    return ids.slice(0, 2).map((k) => S.unitOf(k).name).join("·") + (ids.length > 2 ? " 등" : "") + " 혼성";
  };
  // The full make-up of n soldiers: "극병 3000, 궁병 2000".
  S.mixText = (spec, n) => Object.entries(S.mixCounts(spec, n)).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${S.unitOf(k).name} ${v}`).join(", ") || "없음";
  // Shares by line, for the research AI and the like.
  S.lineShares = function (spec) {
    const out = {};
    for (const [k, v] of Object.entries(S.mixOf(spec))) out[S.unitOf(k).line] = (out[S.unitOf(k).line] || 0) + v;
    return out;
  };

  // What a place's garrison fights as: its mix of land types.
  S.garrisonUnit = function (place) {
    const mix = S.mixOf(place && place.unit);
    let ships = false;
    for (const k in mix) if (S.UNITS[k].line === "navy") ships = true;
    if (!ships) return mix;
    const land = {};
    for (const k in mix) if (S.UNITS[k].line !== "navy") land[k] = mix[k];
    return S.mixOf(land);
  };
  // Soldiers of each type a place can send out (gentry retainers stay).
  S.available = (place) => S.mixCounts(S.garrisonUnit(place), Math.max(0, place.troops - (place.retainers || 0)));
  // Take whole soldiers of given types out of a place. Returns the shares of
  // what left, or null if the place lacks them.
  S.takeTroops = function (place, counts) {
    const have = S.available(place);
    const n = S.countsTotal(counts);
    if (n <= 0) return null;
    for (const [k, v] of Object.entries(counts)) if (v > 0 && (have[k] || 0) < v) return null;
    const all = S.mixCounts(S.garrisonUnit(place), place.troops);
    for (const [k, v] of Object.entries(counts)) all[k] = (all[k] || 0) - v;
    place.troops -= n;
    if (place.troops > 0) place.unit = S.mixOf(all);
    return S.mixOf(counts);
  };
  // Soldiers of a mix join a place.
  S.addTroops = function (place, spec, n) {
    if (!(n > 0)) return;
    place.unit = S.blend(S.garrisonUnit(place), Math.max(0, place.troops), spec, n);
    place.troops += n;
  };
  // Choose n soldiers from what a place has, leaning toward types weighted
  // higher (weight(id) > 0). Returns whole counts.
  S.pickTroops = function (place, n, weight) {
    const have = S.available(place);
    const out = {};
    const room = (k) => have[k] - (out[k] || 0);
    let left = Math.min(Math.floor(n), S.countsTotal(have));
    // Each type's weight once: weighing is the costly part.
    const wt = {};
    for (const k of Object.keys(have)) wt[k] = Math.max(0.0001, weight ? weight(k) : 1);
    const w = (k) => room(k) * wt[k];
    while (left > 0) {
      const open = Object.keys(have).filter((k) => room(k) > 0);
      if (!open.length) break;
      const sum = open.reduce((s, k) => s + w(k), 0);
      let given = 0;
      for (const k of open) {
        const v = Math.min(room(k), Math.floor((left * w(k)) / sum));
        out[k] = (out[k] || 0) + v;
        given += v;
      }
      if (!given) {
        const k = open.reduce((a, b) => (w(b) > w(a) ? b : a));
        const v = Math.min(left, room(k));
        out[k] = (out[k] || 0) + v;
        given = v;
      }
      left -= given;
    }
    for (const k of Object.keys(out)) if (!out[k]) delete out[k];
    return out;
  };

  // Special types and the lands they come from. Most are local soldiers,
  // drafted only in those cities (troops can then go anywhere). 연노병 and
  // 보도병 are inventions: researched in the capital once the force holds a
  // city there (js/tech.js), then drafted in any city. 누선 is not drafted:
  // it is the fleet of a force holding a city on the Yangzi (S.fleet).
  //   cities: exact commanderies; prov: a whole province
  // why: 무릉만 and 산월 were the hill peoples south of the river line; 남중
  // is the far south of 익주; elephants came up through 교주; 오환 riders
  // served 유주; the Yangzi fleets were built from 남양 down to 오.
  S.SPECIAL = {
    mountain: { cities: ["wuling", "lingling", "guiyang", "yuzhang", "kuaiji"], label: "무릉, 영릉, 계양, 예장, 회계" },
    rattan: { prov: "nanzhong", label: "남중" },
    elephant: { prov: "jiao", label: "교주" },
    raider: { prov: "you", label: "유주" },
    louchuan: { cities: ["nanjun", "wuchang", "changsha", "lujiang", "danyang", "wujun"], label: "장강 남쪽(강릉, 무창, 장사, 여강, 건업, 오군)" },
    repeater: { prov: "yi", research: "repeater", label: "익주" },
    bodao: { prov: "yi", research: "bodao", label: "익주" },
  };
  S.specialLand = (id, c) => {
    const s = S.SPECIAL[id];
    return !!s && !!c && (s.cities ? s.cities.includes(c.id) : c.prov === s.prov);
  };
  S.holdsSpecialLand = (state, fid, id) => !!fid && S.citiesOf(state, fid).some((c) => S.specialLand(id, c));
  // Local special types drafted in a city.
  S.specialsHere = (c) => Object.keys(S.SPECIAL).filter((id) => !S.SPECIAL[id].research && S.UNITS[id].line !== "navy" && S.specialLand(id, c));

  // Which land types a force can draft: up to its technology in the line
  // (js/tech.js); special types by their lands or research.
  S.canRaise = (state, fid, id) => {
    const u = S.UNITS[id];
    if (!u || u.line === "navy") return false;
    if (u.special) {
      const s = S.SPECIAL[id];
      return !!s && (s.research ? S.techLevel(state, fid, s.research) >= 2 : S.holdsSpecialLand(state, fid, id));
    }
    return u.tier <= (S.lineLevel ? S.lineLevel(state, fid, u.line) : 1);
  };
  // ...and in this city: local special types only in their lands.
  S.canRaiseAt = (state, c, id) => S.canRaise(state, c.owner, id) && (!S.UNITS[id].special || !!S.SPECIAL[id].research || S.specialLand(id, c));
  S.raisableAt = (state, c) => Object.keys(S.UNITS).filter((id) => S.canRaiseAt(state, c, id));
  S.raisable = (state, fid) => Object.keys(S.UNITS).filter((id) => S.canRaise(state, fid, id));
  // An army marches at the pace of its slowest part.
  S.unitSpeed = function (spec) {
    const ids = Object.keys(S.mixOf(spec));
    if (ids.some((k) => S.unitOf(k).slow)) return "siege";
    return ids.every((k) => S.unitOf(k).fast) ? "cavalry" : "army";
  };
  // How many soldiers of a type a city's stores can arm.
  S.armable = function (c, id) {
    let n = Infinity;
    for (const [k, v] of Object.entries(S.unitOf(id).cost || {})) n = Math.min(n, Math.floor(((c.res && c.res[k]) || 0) / v));
    return n === Infinity ? 1e9 : n;
  };
  S.costText = (id, n) => Object.entries(S.unitOf(id).cost || {}).map(([k, v]) => `${S.RESOURCES[k]} ${v * n}`).join(", ");
  S.payCost = function (c, id, n) {
    for (const [k, v] of Object.entries(S.unitOf(id).cost || {})) c.res[k] -= v * n;
  };

  // The ships a side fights in on a great river: 투함 under a naval
  // specialist or with 조선 technology, else 몽충. A force that would sail
  // 투함 and holds a city on the Yangzi builds 누선 instead.
  S.fleet = (state, fid, officers) => {
    const big = officers.some((o) => S.hasSkill(o, "수전")) || (S.lineLevel && S.lineLevel(state, fid, "navy") >= 2);
    if (!big) return "mengchong";
    return S.holdsSpecialLand(state, fid, "louchuan") ? "louchuan" : "douhan";
  };

  // One type's multiplier on what it deals, against a foe type.
  //   where: "water" | "field" | "siegeA" | "siegeD"; rough: the road's roughness (1 = easy)
  function typeMul(id, foe, where, rough) {
    const u = S.unitOf(id), f = foe ? S.unitOf(foe) : null;
    const set = SETTING[where] || SETTING.field;
    let m = u.atk * (set[u.line] || set.other);
    // Behind walls the lines meet less squarely, so matchups count for less.
    const siege = where === "siegeA" || where === "siegeD";
    if (f) m *= (siege ? Math.sqrt(S.lineMatch(u.line, f.line)) : S.lineMatch(u.line, f.line)) / f.def;
    // 보도병 cut down horsemen; without shields they take arrows harder.
    if (f && u.antiHorse && f.line === "horse") m *= u.antiHorse;
    if (f && f.noShield && u.line === "bow") m *= 1.2;
    if (rough > 1 && where !== "water") {
      if (MOUNTED[u.line]) m *= 0.8;
      if (u.rough) m *= u.rough;
    }
    return m;
  }
  // A side's multiplier against another: every part of one mix against every
  // part of the other, weighted by their shares. Plain ids work too.
  S.unitMul = function (spec, foe, where, rough) {
    const A = S.mixOf(spec), F = foe ? S.mixOf(foe) : null;
    let m = 0;
    for (const a in A) {
      if (!F) { m += A[a] * typeMul(a, null, where, rough); continue; }
      for (const f in F) m += A[a] * F[f] * typeMul(a, f, where, rough);
    }
    return m;
  };
  // How one side fares against the other: the ratio of what each deals.
  S.unitEdge = (spec, foe, where, rough) => S.unitMul(spec, foe, where, rough) / S.unitMul(foe, spec, where, rough);

  // The type a force would most like to draft against a foe.
  S.bestUnitVs = function (state, fid, foe, where, rough) {
    let best = null;
    for (const id of S.raisable(state, fid)) {
      const v = S.unitEdge(id, foe, where, rough);
      if (!best || v > best.v) best = { id, v };
    }
    return best ? best.id : S.DEFAULT_UNIT;
  };

  // The garrison a city starts a game with: mostly foot, archers on the
  // walls, and more horsemen in the horse country.
  S.startMix = (c) => (S.horseCountry && S.horseCountry(c)
    ? { jibing: 0.25, lightfoot: 0.2, archer: 0.2, lighthorse: 0.2, horsearcher: 0.15 }
    : { jibing: 0.35, lightfoot: 0.3, archer: 0.25, lighthorse: 0.1 });
})(globalThis.SAM = globalThis.SAM || {});
