// Battles that last for days. An army that reaches an enemy city or
// stronghold lays siege to it; a defender may instead march out and meet the
// army on the road (요격), which makes a field battle, or a battle on the
// water where the road crosses a great river. Each day the two sides clash
// once; troops, morale and food decide when one side breaks.
//
// Supply (internal only, nothing is drawn on the map): in a field battle both
// sides have a supply line (보급로) and a depot (군량고); in a siege only the
// besiegers do. Raiders hunt for them: a cut line saps morale until it is
// mended, a burnt depot (as at 관도) breaks it. A besieged city cannot march
// out, so its relief must come from other cities (원군), and whether to send
// one weighs the chance of cutting the besiegers' supply.
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });

  // Daily losses as a share of the other side's fighting power.
  S.BATTLE_RATE = { siege: 0.035, field: 0.07 };
  S.SIEGE_MAX_DAYS = 120;
  S.FIELD_MAX_DAYS = 10;
  S.HOME_GROUND = 1.15; // interceptors fight on ground they know

  // Links of the network that cross or follow a great river: a battle there is
  // fought on the water. A road split by a fort is listed by its pieces.
  // A pass never marches out, so on a link to a pass only the other end meets an army.
  const WATER = {};
  for (const [a, b] of [
    // 장강
    ["jiujiang", "danyang"], ["lujiang", "danyang"], ["guangling", "danyang"], ["guangling", "wujun"], ["wujun", "kuaiji"],
    ["nanjun", "wuchang"], ["nanjun", "changsha"], ["nanjun", "wuling"], ["wuchang", "changsha"], ["wuchang", "yuzhang"],
    ["wuchang", "lujiang"], ["lujiang", "yuzhang"], ["jiangxia", "wuchang"], ["danyang", "hefei"], // 유수구
    // 황하
    ["henan", "henei"], ["henan", "hedong"], ["dongjun", "weijun"], ["dongjun", "pingyuan"],
    ["hedong", "hongnong"], ["hedong", "zuopingyi"], ["hongnong", "zuopingyi"], ["pingyuan", "jinan"],
    // 한수: 번성에서 양양으로 건넌다
    ["xinye", "xiangyang"],
    // 바닷길
    ["donglai", "liaodong"], ["donglai", "daifang"], ["donglai", "wujun"],
  ]) WATER[S.roadKey(a, b)] = true;
  const isPass = (state, id) => S.isFort(state, id) && state.forts[id].kind === "pass";
  S.isWater = (a, b) => !!WATER[S.roadKey(a, b)];
  // Sea routes, drawn differently on the map.
  const SEA = { [S.roadKey("donglai", "liaodong")]: true, [S.roadKey("donglai", "daifang")]: true, [S.roadKey("donglai", "wujun")]: true };
  S.isSea = (a, b) => !!SEA[S.roadKey(a, b)];
  S.waterLink = (state, a, b) => S.isWater(a, b);

  const crewOf = (state, ids, force) => ids.map((id) => state.officers[id]).filter((o) => o && o.status === "serving" && o.force === force);
  const has = (list, k) => list.some((o) => S.hasSkill(o, k));
  const top = (list, k) => (list.length ? S.best(list, k)[k] : 30);
  const moraleMul = (m) => 0.6 + clamp(m, 0, 110) / 250;
  // 야전 helps on land. On a river the 수전 specialty shows in the ships (S.fleet).
  const skillMul = (list, water) => (!water && has(list, "야전") ? 1.15 : 1);
  // What a side fights as: its unit type, or its ships on a river.
  const fightAs = (state, side, list, water) => (water ? S.fleet(state, side.force, list) : side.unit);
  const startMorale = (list) => (list.length && S.hasTrait(S.best(list, "cmd"), "과감") ? 105 : 100);
  const newSupply = () => ({ line: true, cut: 0, burnt: false });
  // Morale follows who got the better of the day: the side that lost more men
  // than it killed loses heart, up to cap a day.
  const swing = (lost, killed, cap) => clamp((killed / Math.max(1, lost + killed) - 0.5) * cap * 2, -cap, cap);

  S.battlesAt = (state, id) => (state.battles || []).filter((b) => b.place === id);
  S.battleOf = (state, id) => (state.battles || []).find((b) => b.id === id);
  S.besieged = (state, id) => (state.battles || []).some((b) => b.kind === "siege" && b.place === id);

  function say(b, line) {
    b.log.push(line);
    b.last = line;
  }
  function hold(state, b, ids) {
    for (const id of ids) if (state.officers[id]) state.officers[id].transit = "b" + b.id;
  }
  function letGo(state, b, ids) {
    for (const id of ids) if (state.officers[id] && state.officers[id].transit === "b" + b.id) state.officers[id].transit = null;
  }
  function newBattle(state, spec) {
    state.battles = state.battles || [];
    state.battleSeq = (state.battleSeq || 0) + 1;
    const b = Object.assign({ id: state.battleSeq, day: 0, start: S.today(state), log: [], last: "" }, spec);
    state.battles.push(b);
    return b;
  }

  // ---------- one-off clashes inside a battle ----------
  function duel(state, b, us, them, onLose) {
    if (!us.length || !them.length) return;
    const a = S.best(us, "war"), d = S.best(them, "war");
    if (a.war < 70 && d.war < 70) return;
    const pct = 30 + (S.hasTrait(a, "과감") ? 15 : 0) + (S.hasTrait(d, "과감") ? 15 : 0) - (S.hasTrait(d, "신중") ? 20 : 0);
    if (!S.chance(state, pct)) return;
    const roll = (a.war - d.war) / 2 + (S.rand(state) - 0.5) * 40;
    if (Math.abs(roll) < 4) say(b, `일기토! ${S.josa(a.name, "과", "와")} ${S.josa(d.name, "이", "가")} 맞붙었으나 승부가 나지 않았습니다.`);
    else if (roll > 0) { onLose("def"); say(b, `일기토! ${S.josa(a.name, "이", "가")} ${S.josa(d.name, "을", "를")} 물리쳤습니다. ${S.forceName(state, d.force)}의 사기가 꺾입니다.`); }
    else { onLose("att"); say(b, `일기토! ${S.josa(d.name, "이", "가")} ${S.josa(a.name, "을", "를")} 물리쳤습니다. ${S.forceName(state, a.force)}의 사기가 꺾입니다.`); }
  }
  // A schemer's ruse; the other side's sharpest mind may see through it.
  function ruse(state, b, us, them, foes, names) {
    if (!us.length) return 0;
    const p = S.best(us, "plot");
    if (!S.chance(state, S.ruseAttempt(p) / 3)) return 0;
    const w = them.length ? S.best(them, "wit") : null;
    const lead = them.length ? S.best(them, "cmd") : null;
    const temper = S.hasTrait(lead, "신중") ? -15 : S.hasTrait(lead, "과감") ? 10 : 0;
    const name = names[Math.floor(S.rand(state) * names.length)];
    if (!S.chance(state, clamp(S.ruseChance(p, w) + temper, 5, 95))) {
      if (w) say(b, `${p.name}의 ${name}! 그러나 ${S.josa(w.name, "이", "가")} 간파했습니다.`);
      return 0;
    }
    const loss = Math.round(foes * (0.03 + p.plot / 2000));
    say(b, `${p.name}의 ${S.josa(name, "이", "가")} 적중했습니다! 적 ${loss}명이 쓰러집니다.`);
    return loss;
  }

  // ---------- surprise attack (기습) ----------
  // On the first day a field (or naval) specialist among the interceptors
  // strikes before the marching army is ready; a sharp strategist on the
  // other side may have seen it coming.
  S.surpriser = (list, water) => {
    const sp = list.filter((o) => S.hasSkill(o, water ? "수전" : "야전"));
    return sp.length ? sp.reduce((a, o) => (o.war + o.cmd > a.war + a.cmd ? o : a)) : null;
  };
  S.surpriseChance = (sp, foes) => clamp(Math.round(20 + (sp.war + sp.cmd) / 2 - top(foes, "strat") * 0.7), 5, 90);
  function surprise(state, b, dfs, atk) {
    const sp = S.surpriser(dfs, b.water);
    if (!sp) return;
    const pct = S.surpriseChance(sp, atk);
    if (S.chance(state, pct)) {
      b.att.morale -= 25;
      b.def.morale += 15;
      say(b, `${S.josa(sp.name, "이", "가")} ${b.water ? "물길을 타고" : "샛길로 돌아"} 기습을 걸었습니다! ${S.forceName(state, b.att.force)}이 크게 흔들립니다. (성공률 ${pct}%)`);
    } else {
      const guard = atk.length ? S.best(atk, "strat") : null;
      b.att.morale += 5;
      say(b, `${sp.name}의 기습! 그러나 ${guard ? S.josa(guard.name, "이", "가") + " 미리 대비하고 있었습니다" : "적이 대비하고 있었습니다"}. (성공률 ${pct}%)`);
    }
  }

  // ---------- supply lines and depots ----------
  // Raiders: the best of 군략 and 모략. Guards: the best of 지략 and 용병,
  // sharper under a cautious commander. Fighting on home ground helps.
  S.raidChance = function (raiders, guards, home) {
    const r = Math.max(top(raiders, "strat"), top(raiders, "plot"));
    const lead = guards.length ? S.best(guards, "cmd") : null;
    const g = Math.max(top(guards, "wit"), top(guards, "cmd")) + (S.hasTrait(lead, "신중") ? 10 : 0);
    return {
      cut: clamp(Math.round((4 + (r - g) * 0.25 + (home ? 3 : 0)) * 10) / 10, 1, 25),
      burn: clamp(Math.round((1 + (r - g) * 0.12 + (home ? 1 : 0)) * 10) / 10, 0.5, 10),
    };
  };
  // One day of hunting for the other side's supply.
  function raid(state, b, raidSide, raiders, guardSide, guards, home) {
    const sup = guardSide.supply;
    if (!sup || !raiders.length) return;
    const pc = S.raidChance(raiders, guards, home);
    const who = S.best(raiders, raiders.some((o) => o.plot > o.strat) ? "plot" : "strat").name;
    if (!sup.burnt && S.chance(state, pc.burn)) {
      sup.burnt = true;
      guardSide.morale -= 25;
      if (guardSide.rations != null) guardSide.rations = 0;
      say(b, `${S.josa(who, "이", "가")} ${S.forceName(state, guardSide.force)}의 군량고를 찾아내 불태웠습니다! 적진이 크게 동요합니다.`);
    } else if (sup.line && S.chance(state, pc.cut)) {
      sup.line = false;
      sup.cut = 0;
      guardSide.morale -= 10;
      say(b, `${S.josa(who, "이", "가")} ${S.forceName(state, guardSide.force)}의 보급로를 끊었습니다.`);
    }
  }
  // The line is mended in time; while it is cut, morale ebbs.
  function tendSupply(state, b, side) {
    const sup = side.supply;
    if (!sup || sup.line) return;
    sup.cut++;
    side.morale -= 2;
    if (sup.cut >= 2 && S.chance(state, 20)) {
      sup.line = true;
      say(b, `${S.forceName(state, side.force)}이 끊긴 보급로를 다시 이었습니다.`);
    }
  }
  // Besiegers eat from the depot, which is refilled from home while the line holds.
  function feedBesiegers(state, b) {
    const A = b.att;
    // A day's food, dearer the rougher the road it comes by.
    const need = S.fieldFood(A.troops, 1, A.path ? S.pathRough(state, A.path) : 1);
    const home = S.place(state, A.origin);
    if (A.supply.line && home && home.owner === A.force) {
      const want = Math.min(Math.max(0, A.troops / 10 - A.rations), need * 2, home.food);
      home.food -= Math.ceil(want);
      A.rations += want;
    } else if (A.supply.line && (!home || home.owner !== A.force)) {
      A.supply.line = false;
      A.supply.cut = -999; // the base is lost: no mending
      say(b, `본거지를 잃어 ${S.forceName(state, A.force)}의 보급이 끊겼습니다.`);
    }
    A.rations -= need;
    if (A.rations <= 0) {
      A.rations = 0;
      if (!b.hungry) say(b, `포위군의 군량이 떨어졌습니다.`);
      b.hungry = true;
      A.morale -= 8;
    } else b.hungry = false;
  }

  // ---------- siege ----------
  // An army reached an enemy place: it surrounds it, or joins its own force's siege there.
  S.startSiege = function (state, m) {
    const t = S.place(state, m.target);
    const ids = m.officers.filter((id) => { const o = state.officers[id]; return o && o.status === "serving" && o.force === m.force; });
    S.releaseMarch(state, m);
    const old = (state.battles || []).find((x) => x.kind === "siege" && x.place === m.target && x.att.force === m.force);
    if (old) {
      old.att.train = Math.round((old.att.train * old.att.troops + m.train * m.troops) / Math.max(1, old.att.troops + m.troops));
      old.att.unit = S.blend(old.att.unit, old.att.troops, m.unit, m.troops);
      old.att.troops += m.troops;
      old.att.troops0 += m.troops;
      old.att.rations += m.troops / 10;
      old.att.officers.push(...ids);
      hold(state, old, ids);
      say(old, `${S.forceName(state, m.force)} 원군 ${S.unitName(m.unit)} ${m.troops}명이 도착해 포위에 가세했습니다.`);
      return old;
    }
    const atk = crewOf(state, ids, m.force);
    const defs = S.serving(state, m.target).filter((o) => o.force === t.owner);
    const b = newBattle(state, {
      kind: "siege", place: m.target, x: t.x, y: t.y, from: S.placeName(state, m.origin),
      att: { force: m.force, officers: ids, troops: m.troops, troops0: m.troops, unit: m.unit, train: m.train, morale: startMorale(atk) + S.houseMorale(state, m.force, m.target),
        rations: m.troops / 10, supply: newSupply(), origin: m.origin, path: m.path },
      def: { force: t.owner, troops0: Math.max(1, t.troops), morale: startMorale(defs) },
    });
    hold(state, b, ids);
    say(b, `${S.forceName(state, m.force)} ${S.unitName(m.unit)} ${m.troops}명이 ${t.name}(${S.forceName(state, t.owner)}, 수비 ${S.unitName(S.garrisonUnit(t))} ${t.troops}명)을 에워쌌습니다.`);
    if (t.troops <= 0 && !defs.length) { say(b, `${t.name}에는 지키는 병사가 없습니다.`); b.ending = "capture"; }
    else duel(state, b, atk, defs, (side) => { b[side].morale -= 15; });
    return b;
  };

  function siegeDay(state, b) {
    const t = S.place(state, b.place);
    const A = b.att;
    b.day++;
    if (b.ending) return b.ending;
    if (t.owner === A.force) return "joined";
    if (t.owner && S.allied(state, A.force, t.owner)) return "allied";
    if (t.owner !== b.def.force) {
      b.def = { force: t.owner, troops0: Math.max(1, t.troops), morale: 100 };
      say(b, `${S.josa(t.name, "은", "는")} 이제 ${S.forceName(state, t.owner)}의 땅입니다. 포위를 이어 갑니다.`);
      if (b.relief && b.relief.force !== t.owner) endRelief(state, b, "home");
    }
    const atk = crewOf(state, A.officers, A.force);
    const defs = S.serving(state, b.place).filter((o) => o.force === t.owner);
    if (t.troops <= 0 && !defs.length) return "capture";
    let wb = S.wallBonus(t) * S.gentryDefense(t);
    if (has(defs, "수성")) wb *= 1.15;
    if (has(atk, "공성")) wb = 1 + (wb - 1) * 0.75;
    const rnd = () => 0.8 + S.rand(state) * 0.4;
    // With a relief army in the field the besiegers must split their men.
    const split = b.relief ? 0.7 : 1;
    const gu = S.garrisonUnit(t);
    const aPow = S.power(A.troops, S.sideStats(atk, 30), A.train, 1) * S.unitMul(A.unit, gu, "siegeA", 1) * moraleMul(A.morale) * split;
    const dPow = S.power(t.troops, S.sideStats(defs, t.owner ? 40 : 35), t.train, wb) * S.unitMul(gu, A.unit, "siegeD", 1) * moraleMul(b.def.morale) * S.houseDefense(t, state);
    let lossD = Math.round(aPow * S.BATTLE_RATE.siege * rnd());
    let lossA = Math.round(dPow * S.BATTLE_RATE.siege * rnd());
    lossD += ruse(state, b, atk, defs, t.troops, ["화공", "위계", "야습", "땅굴"]);
    lossA += ruse(state, b, defs, atk, A.troops, ["야습", "역습", "화공"]);
    lossD = Math.min(t.troops, lossD);
    lossA = Math.min(A.troops, lossA);
    const D0 = t.troops;
    S.loseTroops(t, lossD);
    A.troops -= lossA;
    b.killedA = (b.killedA || 0) + lossA;
    b.killedD = (b.killedD || 0) + lossD;
    t.wall = Math.max(0, t.wall - Math.round(lossD * 0.02 * (has(atk, "공성") ? 1.5 : 1)));
    // Morale follows the day's exchange; a long siege wears the besiegers down,
    // and broken walls dishearten the defenders.
    A.morale += swing(lossA, lossD, 6) - (b.day > 20 ? 1 : 0);
    b.def.morale += swing(lossD, lossA, 6) - (t.wall < 100 ? 2 : 0);
    if (b.relief) reliefDay(state, b, atk);
    tendSupply(state, b, A);
    feedBesiegers(state, b);
    if (t.food <= 0) b.def.morale -= 8;
    if (b.day <= 3 || b.day % 5 === 0 || lossA + lossD > (A.troops + t.troops) * 0.06 || b.reliefLine) {
      say(b, `${b.day}일째: 공격군 -${lossA} (${A.troops}), 수비군 -${lossD} (${t.troops}) · 성벽 ${t.wall}${b.reliefLine ? " · " + b.reliefLine : ""}`);
    }
    b.reliefLine = null;
    if (t.troops <= 0 || t.troops < b.def.troops0 * 0.15 || b.def.morale <= 20) return "capture";
    if (A.troops < A.troops0 * 0.3 || A.morale <= 25 || b.day >= S.SIEGE_MAX_DAYS) return "retreat";
    return null;
  }

  // The besiegers break in.
  function capture(state, b, report) {
    const t = S.place(state, b.place);
    const A = b.att;
    const fort = S.isFort(state, b.place);
    const defForce = t.owner;
    const atk = crewOf(state, A.officers, A.force);
    const defs = S.serving(state, b.place).filter((o) => o.force === defForce);
    say(b, `${t.name} 함락! ${S.josa(S.forceName(state, A.force), "이", "가")} ${fort ? S.FORT_KINDS[t.kind] : "성"}을 차지했습니다.`);
    const escapes = defForce ? S.links(state, b.place).filter((n) => S.place(state, n).owner === defForce) : [];
    for (const d of defs) {
      if (escapes.length && S.chance(state, S.isRuler(state, d) ? 85 : 55)) {
        d.city = escapes[Math.floor(S.rand(state) * escapes.length)];
        S.officersMoved(state);
        say(b, `${S.josa(d.name, "은", "는")} ${S.ro(S.placeName(state, d.city))} 달아났습니다.`);
      } else {
        d.lord = S.isRuler(state, d); // a ruler is freed or killed, never kept
        d.status = "captive";
        d.captor = A.force;
        d.tries = 0;
        d.caught = S.today(state); // the day's three free tries (S.persuade)
        if (fort) d.city = S.place(state, A.origin) && S.place(state, A.origin).owner === A.force ? A.origin : (S.citiesOf(state, A.force)[0] || {}).id || d.city;
        S.officersMoved(state);
        report.captured.push(d.id);
        say(b, `${S.josa(d.name, "을", "를")} 사로잡았습니다.`);
      }
    }
    for (const p of S.officersIn(state, b.place, (x) => x.status === "captive" && x.captor === defForce)) {
      if (p.force === A.force) { p.status = "serving"; p.captor = null; say(b, `포로였던 ${S.josa(p.name, "이", "가")} 풀려나 합류했습니다.`); }
      else S.freeCaptive(state, p);
    }
    const remainingD = Math.max(0, t.troops);
    t.owner = A.force;
    t.posts = S.emptyPosts();
    const stay = Math.floor(remainingD * 0.3); // some defenders go over
    t.unit = S.blend(A.unit, A.troops, S.garrisonUnit(t), stay);
    t.troops = A.troops + stay;
    t.retainers = fort ? 0 : Math.floor(remainingD * 0.3);
    t.consent = Math.min(t.consent, 30);
    t.train = A.train;
    t.gold = Math.floor(t.gold / 2);
    if (t.res) for (const k of S.RES_KEYS) t.res[k] = Math.floor(t.res[k] / 2);
    t.food = Math.floor(t.food / 2) + Math.floor(A.rations || 0);
    t.order = Math.max(10, t.order - 20);
    letGo(state, b, A.officers);
    for (const o of atk) o.city = b.place;
    S.officersMoved(state);
    report.attackerWon = true;
    if (!fort) {
      const from = S.place(state, A.origin);
      const base = from && state.cities[S.homeCity(state, from.id)];
      t.delegate = base && base.owner === A.force && S.delegateOf(state, base) === "full" ? { fid: A.force, policy: "full" } : null;
    }
    if (defForce && !fort && state.forces[defForce].capital === t.id && S.citiesOf(state, defForce).length) S.capitalFell(state, defForce, A.force, report);
    if (defForce) S.checkForce(state, defForce, report);
  }

  // ---------- relief armies (원군) ----------
  // Own besieged places a city can send relief to, through own ground.
  S.reliefTargets = function (state, cid) {
    const me = S.place(state, cid).owner;
    const out = [];
    for (const b of state.battles || []) {
      if (b.kind !== "siege" || b.place === cid || S.place(state, b.place).owner !== me) continue;
      const r = S.route(state, cid, b.place, "army");
      if (r) out.push({ id: b.place, battle: b.id, path: r.path, km: r.km, days: r.days });
    }
    return out;
  };
  S.relieve = function (state, cid, targetId, oids, troops, unit) {
    const c = S.place(state, cid);
    const way = c && S.reliefTargets(state, cid).find((x) => x.id === targetId);
    if (!way) return fail("포위당한 아군 도시나 거점에만 원군을 보낼 수 있습니다.");
    if (S.besieged(state, cid)) return fail("포위당한 곳에서는 군대를 내보낼 수 없습니다.");
    if (!oids.length || oids.length > S.MAX_SORTIE_OFFICERS) return fail(`무장을 1~${S.MAX_SORTIE_OFFICERS}명 골라 주세요.`);
    for (const id of oids) {
      const o = state.officers[id];
      if (!o || o.status !== "serving" || o.city !== cid || o.force !== c.owner || o.done || o.transit || S.postOf(state, o)) return fail("이곳에서 쉬고 있는 무장만 보낼 수 있습니다.");
    }
    const counts = S.sortieCounts(c, troops, unit);
    troops = S.countsTotal(counts);
    if (troops < S.MIN_SORTIE_TROOPS || troops > S.marchable(c)) return fail(`원군 병력은 ${S.MIN_SORTIE_TROOPS}~${S.marchable(c)}명이어야 합니다.`);
    if (!S.hasTroops(c, counts)) return fail("그만큼의 병사가 없습니다.");
    const speed = S.unitSpeed(counts);
    const days = S.travelDays(way.km, speed);
    const food = S.marchFood(troops, days, S.pathRough(state, way.path));
    if (c.food < food) return fail(`군량이 부족합니다. (필요 ${food})`);
    unit = S.takeTroops(c, counts);
    c.food -= food;
    const m = S.launch(state, { kind: "relief", force: c.owner, path: way.path, km: way.km, speed,
      officers: oids, troops, unit, train: c.train, origin: cid, target: targetId, battle: way.battle });
    const names = oids.map((id) => state.officers[id].name).join(", ");
    const msg = `${names}의 원군 ${S.unitName(unit)} ${troops}명이 ${S.ro(S.placeName(state, targetId))} 떠났습니다. ${days}일 뒤 도착합니다.`;
    if (c.owner !== state.playerForce) S.addLog(state, `${S.forceName(state, c.owner)}의 ${msg}`, "info");
    return { ok: true, march: m, msg };
  };
  // A relief army arrived: it takes the field against the besiegers.
  S.reliefArrives = function (state, m) {
    const b = (state.battles || []).find((x) => x.kind === "siege" && x.place === m.target && S.place(state, x.place).owner === m.force);
    if (!b) return false;
    const ids = m.officers.filter((id) => { const o = state.officers[id]; return o && o.status === "serving" && o.force === m.force; });
    S.releaseMarch(state, m);
    if (b.relief) {
      b.relief.unit = S.blend(b.relief.unit, b.relief.troops, m.unit, m.troops);
      b.relief.troops += m.troops;
      b.relief.troops0 += m.troops;
      b.relief.officers.push(...ids);
    } else {
      const rel = crewOf(state, ids, m.force);
      b.relief = { force: m.force, officers: ids, troops: m.troops, troops0: m.troops, unit: m.unit, train: m.train, morale: startMorale(rel), origin: m.origin, path: m.path };
    }
    hold(state, b, ids);
    say(b, `${S.forceName(state, m.force)} 원군 ${S.unitName(m.unit)} ${m.troops}명이 ${S.placeName(state, m.origin)}에서 달려왔습니다!`);
    return true;
  };
  // The relief army fights the besiegers in the open and hunts for their supply.
  function reliefDay(state, b, atk) {
    const R = b.relief, A = b.att;
    const rel = crewOf(state, R.officers, R.force);
    const rnd = () => 0.8 + S.rand(state) * 0.4;
    const rPow = S.power(R.troops, S.sideStats(rel, 35), R.train, 1) * S.unitMul(R.unit, A.unit, "field", 1) * skillMul(rel, false) * moraleMul(R.morale) * S.HOME_GROUND;
    const aPow = S.power(A.troops, S.sideStats(atk, 30), A.train, 1) * S.unitMul(A.unit, R.unit, "field", 1) * moraleMul(A.morale) * 0.3;
    const lossA = Math.min(A.troops, Math.round(rPow * S.BATTLE_RATE.field * 0.6 * rnd()));
    const lossR = Math.min(R.troops, Math.round(aPow * S.BATTLE_RATE.field * rnd()));
    A.troops -= lossA;
    R.troops -= lossR;
    b.killedA = (b.killedA || 0) + lossA;
    b.killedR = (b.killedR || 0) + lossR;
    A.morale += swing(lossA, lossR, 4);
    R.morale += swing(lossR, lossA, 6);
    b.reliefLine = `원군 -${lossR} (${R.troops}), 포위군 -${lossA}`;
    raid(state, b, R, rel, A, atk, true);
    if (R.troops < R.troops0 * 0.4 || R.morale <= 30) endRelief(state, b, "beaten");
  }
  function endRelief(state, b, why) {
    const R = b.relief;
    if (!R) return;
    b.relief = null;
    letGo(state, b, R.officers);
    if (why === "beaten") say(b, `원군이 무너져 ${S.ro(S.placeName(state, R.origin))} 물러납니다.`);
    else if (why === "home") say(b, `원군은 ${S.ro(S.placeName(state, R.origin))} 물러납니다.`);
    else if (why === "enter") say(b, `포위가 풀려 원군 ${R.troops}명이 성에 들어갑니다.`);
    const home = S.place(state, b.place);
    if (why === "enter" && home.owner === R.force) {
      // The siege is lifted: the relief army enters the city.
      S.addTroops(home, R.unit, R.troops);
      for (const o of crewOf(state, R.officers, R.force)) o.city = b.place;
      S.officersMoved(state);
      return;
    }
    S.launch(state, { kind: "return", force: R.force, path: R.path.slice().reverse(), speed: S.unitSpeed(R.unit),
      officers: crewOf(state, R.officers, R.force).map((o) => o.id), troops: R.troops, unit: R.unit, train: R.train, origin: b.place, target: R.origin });
  }

  // Computer forces decide whether to send relief to a besieged place: when
  // relief and garrison together outnumber the besiegers, or when a raid on
  // the besiegers' supply has a fair chance within a couple of weeks.
  S.reliefAI = function (state, fid) {
    for (const b of state.battles || []) {
      const t = S.place(state, b.place);
      if (b.kind !== "siege" || t.owner !== fid || b.relief) continue;
      if ((state.marches || []).some((m) => m.kind === "relief" && m.target === b.place)) continue;
      let best = null;
      for (const c of S.citiesOf(state, fid)) {
        if (c.id === b.place || S.besieged(state, c.id)) continue;
        const idle = S.idle(state, c.id);
        const spare = Math.min(S.marchable(c) - Math.max(3000, Math.round(c.troops * 0.3)), c.troops);
        if (!idle.length || spare < 2000) continue;
        const way = S.reliefTargets(state, c.id).find((x) => x.id === b.place);
        if (!way || way.days > 25) continue;
        if (!best || spare > best.spare) best = { c, spare, idle };
      }
      if (!best) continue;
      const team = best.idle.slice().sort((a, x) => x.cmd + x.war - a.cmd - a.war).slice(0, Math.min(S.MAX_SORTIE_OFFICERS, Math.max(1, best.idle.length - 1)));
      const chief = S.best(team, "cmd");
      const nerve = S.hasTrait(chief, "과감") ? 0.8 : S.hasTrait(chief, "신중") ? 1.2 : 1;
      const atk = crewOf(state, b.att.officers, b.att.force);
      const pc = S.raidChance(team, atk, true);
      const daily = (pc.burn + pc.cut * 0.4) / 100;
      const raidOdds = 1 - Math.pow(1 - daily, 15);
      const direct = best.spare + t.troops >= b.att.troops * nerve;
      const raidWorth = raidOdds >= 0.45 * nerve && best.spare >= b.att.troops * 0.3;
      if (direct || raidWorth) {
        const counts = S.pickTroops(best.c, best.spare, (k) => Math.pow(S.unitEdge(k, b.att.unit, "field", 1), 2));
        S.relieve(state, best.c.id, b.place, team.map((o) => o.id), best.spare, counts);
      }
    }
  };

  // ---------- field battles (요격) ----------
  // The defender's sortie met the marching army on the road.
  function startField(state, m, sortie) {
    const pos = S.marchPos(state, sortie, 0);
    const atkIds = m.officers.filter((id) => { const o = state.officers[id]; return o && o.status === "serving" && o.force === m.force; });
    const defIds = sortie.officers.filter((id) => { const o = state.officers[id]; return o && o.status === "serving" && o.force === sortie.force; });
    S.releaseMarch(state, m);
    S.releaseMarch(state, sortie);
    const atk = crewOf(state, atkIds, m.force), dfs = crewOf(state, defIds, sortie.force);
    const water = !!sortie.water;
    const rough = S.linkRough(state, sortie.path[0], sortie.path[1]);
    const b = newBattle(state, {
      kind: water ? "water" : "field", place: m.target, x: pos.x, y: pos.y, from: S.placeName(state, m.origin), water, rough,
      march: m, sortie,
      att: { force: m.force, officers: atkIds, troops: m.troops, troops0: m.troops, unit: m.unit, train: m.train, morale: startMorale(atk) + S.houseMorale(state, m.force, m.target), supply: newSupply() },
      def: { force: sortie.force, officers: defIds, troops: sortie.troops, troops0: sortie.troops, unit: sortie.unit, train: sortie.train, morale: startMorale(dfs), supply: newSupply() },
    });
    hold(state, b, atkIds.concat(defIds));
    const chief = dfs.length ? S.best(dfs, "cmd").name : "수비군";
    const dAs = S.unitName(fightAs(state, b.def, dfs, water)), aAs = S.unitName(fightAs(state, b.att, atk, water));
    say(b, `${S.josa(chief, "이", "가")} ${dAs} ${b.def.troops}명을 이끌고 나와 ${S.forceName(state, m.force)} ${aAs} ${m.troops}명을 ${water ? "강 위에서" : rough > 1 ? "험한 산길에서" : "길에서"} 맞받아칩니다.`);
    surprise(state, b, dfs, atk);
    duel(state, b, atk, dfs, (side) => { b[side].morale -= 15; });
    return b;
  }

  function fieldDay(state, b) {
    const A = b.att, D = b.def;
    b.day++;
    const atk = crewOf(state, A.officers, A.force), dfs = crewOf(state, D.officers, D.force);
    const rnd = () => 0.8 + S.rand(state) * 0.4;
    const where = b.water ? "water" : "field";
    const aU = fightAs(state, A, atk, b.water), dU = fightAs(state, D, dfs, b.water);
    const aPow = S.power(A.troops, S.sideStats(atk, 30), A.train, 1) * S.unitMul(aU, dU, where, b.rough) * skillMul(atk, b.water) * moraleMul(A.morale);
    const dPow = S.power(D.troops, S.sideStats(dfs, 35), D.train, 1) * S.unitMul(dU, aU, where, b.rough) * skillMul(dfs, b.water) * moraleMul(D.morale) * S.HOME_GROUND;
    let lossD = Math.round(aPow * S.BATTLE_RATE.field * rnd());
    let lossA = Math.round(dPow * S.BATTLE_RATE.field * rnd());
    const names = b.water ? ["화공", "야습", "위계"] : ["매복", "화공", "야습", "위계"];
    lossD += ruse(state, b, atk, dfs, D.troops, names);
    lossA += ruse(state, b, dfs, atk, A.troops, names);
    lossD = Math.min(D.troops, lossD);
    lossA = Math.min(A.troops, lossA);
    A.troops -= lossA;
    D.troops -= lossD;
    b.killedA = (b.killedA || 0) + lossA;
    b.killedD = (b.killedD || 0) + lossD;
    A.morale += swing(lossA, lossD, 10);
    D.morale += swing(lossD, lossA, 10);
    // Both sides hunt for the other's supply; the defenders know the land.
    raid(state, b, D, dfs, A, atk, true);
    raid(state, b, A, atk, D, dfs, false);
    tendSupply(state, b, A);
    tendSupply(state, b, D);
    say(b, `${b.day}일째: 진군 측 -${lossA} (${A.troops}), 요격 측 -${lossD} (${D.troops})`);
    const dBroke = D.troops < D.troops0 * 0.4 || D.morale <= 30;
    const aBroke = A.troops < A.troops0 * 0.4 || A.morale <= 30;
    if (dBroke && (!aBroke || D.morale <= A.morale)) return "attacker";
    if (aBroke) return "defender";
    if (b.day >= S.FIELD_MAX_DAYS) return A.morale >= D.morale ? "attacker" : "defender";
    return null;
  }

  // After a field battle: the loser is chased and falls back; a winning
  // attacker presses on to its target, a winning defender goes home.
  function endField(state, b, winner, report) {
    const m = b.march, s = b.sortie;
    const A = b.att, D = b.def;
    const total = S.pathKm(state, m.path);
    const at = Math.min(total, total - S.legKm(state, m.path[m.path.length - 2], m.target) / 2);
    letGo(state, b, A.officers.concat(D.officers));
    const chase = (side) => { const n = Math.round(side.troops * 0.1); side.troops -= n; return n; };
    if (winner === "attacker") {
      const n = chase(D);
      say(b, `요격군이 무너져 ${n}명을 더 잃고 물러납니다. ${S.forceName(state, A.force)}이 진군을 이어 갑니다.`);
      report.attackerWon = true;
      S.launch(state, { kind: "army", force: A.force, path: m.path, skip: at, km: total - at, speed: S.unitSpeed(A.unit),
        officers: crewOf(state, A.officers, A.force).map((o) => o.id), troops: A.troops, unit: A.unit, train: A.train, origin: m.origin, target: m.target });
    } else {
      const n = chase(A);
      say(b, b.retreatOrder ? `${S.forceName(state, A.force)}이 명에 따라 물러나며 ${n}명을 잃었습니다.` : `${S.forceName(state, A.force)}이 무너져 ${n}명을 더 잃고 물러납니다.`);
      S.launch(state, { kind: "return", force: A.force, path: m.path.slice().reverse(), skip: total - at, km: at, speed: S.unitSpeed(A.unit),
        officers: crewOf(state, A.officers, A.force).map((o) => o.id), troops: A.troops, unit: A.unit, train: A.train, origin: m.target, target: m.origin });
    }
    const leg = S.legKm(state, s.path[0], s.path[1]);
    S.launch(state, { kind: "return", force: D.force, path: s.path.slice().reverse(), skip: leg - s.km, km: s.km, speed: S.unitSpeed(D.unit),
      officers: crewOf(state, D.officers, D.force).map((o) => o.id), troops: D.troops, unit: D.unit, train: D.train, origin: s.target, target: s.origin });
  }

  // ---------- the defender's choice: meet them on the road, or hold the walls ----------
  S.DEFENSE_POLICY = { auto: "태수에게 맡김", intercept: "요격 우선", hold: "농성" };
  S.defensePolicy = (state, id) => (state.policy && state.policy[id]) || "auto";
  S.setDefensePolicy = function (state, id, policy) {
    if (!S.DEFENSE_POLICY[policy]) return fail("알 수 없는 방침입니다.");
    state.policy = state.policy || {};
    state.policy[id] = policy;
    return { ok: true, msg: `${S.placeName(state, id)}의 방어 방침을 「${S.DEFENSE_POLICY[policy]}」으로 정했습니다.` };
  };
  // How the place would fare in the field against an army. Exposed for the UI.
  S.interceptOdds = function (state, id, m) {
    const t = S.place(state, id);
    if (S.besieged(state, id)) return null; // a besieged place cannot march out
    if (isPass(state, id)) return null; // a pass holds its walls
    const pool = S.serving(state, id).filter((o) => o.force === t.owner && !S.postOf(state, o));
    const P = m.path[m.path.length - 2];
    const water = S.waterLink(state, P, id);
    const rough = S.linkRough(state, P, id);
    const where = water ? "water" : "field";
    const want = Math.max(0, Math.min(S.marchable(t) - Math.max(1000, Math.round(t.troops * 0.2)), t.troops));
    if (!pool.length || want < 1000) return null;
    // The governor sends out the soldiers who fare best against what is coming.
    const counts = S.pickTroops(t, want, (k) => (water ? 1 : Math.pow(S.unitEdge(k, m.unit, where, rough), 2)));
    const unit = S.mixOf(counts);
    const troops = S.countsTotal(counts);
    const score = (o) => o.cmd + o.war / 2 + (S.hasSkill(o, water ? "수전" : "야전") ? 20 : 0);
    const team = pool.slice().sort((a, b) => score(b) - score(a)).slice(0, S.MAX_SORTIE_OFFICERS);
    if (team.length === pool.length && pool.length > 1) team.pop(); // someone stays to hold the walls
    const atk = crewOf(state, m.officers, m.force);
    // The defenders know the ground they fight on.
    const oU = water ? S.fleet(state, t.owner, team) : unit, tU = water ? S.fleet(state, m.force, atk) : m.unit;
    const ours = S.power(troops, S.sideStats(team, 35), t.train, 1) * S.unitMul(oU, tU, where, rough) * skillMul(team, water) * S.HOME_GROUND;
    const theirs = S.power(m.troops, S.sideStats(atk, 30), m.train, 1) * S.unitMul(tU, oU, where, rough) * skillMul(atk, water);
    const chief = S.best(team, "cmd");
    const sp = S.surpriser(team, water);
    const surprisePct = sp ? S.surpriseChance(sp, atk) : 0;
    let need = 1.0;
    if (S.hasTrait(chief, "과감")) need -= 0.25;
    if (S.hasTrait(chief, "신중")) need += 0.35;
    if (sp) need -= 0.35 + (surprisePct / 100) * 0.4; // a specialist, and how likely the ambush is to land
    if (has(pool, "수성")) need += 0.2;
    const policy = S.defensePolicy(state, id);
    if (policy === "intercept") need -= 0.4;
    return { team, troops, unit, counts, water, ratio: ours / Math.max(1, theirs), need, policy, P, surprise: sp ? { name: sp.name, pct: surprisePct } : null };
  };
  S.planDefense = function (state, m) {
    const t = S.place(state, m.target);
    if (m.kind !== "army" || !t.owner || t.owner === m.force || m.path.length < 2) return;
    if (S.defensePolicy(state, m.target) === "hold") return;
    const odds = S.interceptOdds(state, m.target, m);
    if (!odds || odds.ratio < odds.need) return;
    // Meet halfway along the last stretch of road.
    const L = S.legKm(state, odds.P, m.target);
    const total = (m.skip || 0) + m.km;
    const meet = m.start + Math.ceil((total - L / 2 - (m.skip || 0)) / S.SPEED[m.speed || "army"]);
    const now = S.today(state);
    if (meet <= now) return;
    if (!S.takeTroops(t, odds.counts)) return;
    const s = S.launch(state, { kind: "sortie", force: t.owner, path: [m.target, odds.P], km: L / 2, days: meet - now, speed: "army",
      officers: odds.team.map((o) => o.id), troops: odds.troops, unit: odds.unit, train: t.train, origin: m.target, target: m.target, vs: m.id, water: odds.water });
    m.intercept = s.id;
    const names = odds.team.map((o) => o.name).join(", ");
    const msg = `${t.name}의 ${S.josa(names, "이", "가")} ${S.unitName(odds.unit)} ${odds.troops}명을 이끌고 ${S.forceName(state, m.force)}을 요격하러 나섰습니다.`;
    if (t.owner === state.playerForce) S.addLog(state, msg, "sys");
    else if (m.force === state.playerForce) S.addLog(state, msg, "threat");
  };
  // A sortie reached the meeting point.
  S.sortieArrives = function (state, s) {
    const m = (state.marches || []).find((x) => x.id === s.vs && x.kind === "army");
    if (m) {
      state.marches = state.marches.filter((x) => x !== m);
      startField(state, m, s);
      return;
    }
    // The enemy never came: go home.
    const leg = S.legKm(state, s.path[0], s.path[1]);
    const ids = s.officers.filter((id) => state.officers[id] && state.officers[id].transit === s.id);
    S.releaseMarch(state, s);
    S.launch(state, { kind: "return", force: s.force, path: s.path.slice().reverse(), skip: leg - s.km, km: s.km, speed: S.unitSpeed(s.unit),
      officers: ids, troops: s.troops, unit: s.unit, train: s.train, origin: s.target, target: s.origin });
  };

  // ---------- ending and running ----------
  function finish(state, b, outcome, onEvent) {
    state.battles = state.battles.filter((x) => x !== b);
    const A = b.att, D = b.def;
    const report = { kind: b.kind, lines: b.log, attackerWon: false, from: b.from, to: S.placeName(state, b.place), captured: [], attacker: A.force, defender: D.force, days: b.day };
    const origin = S.place(state, A.origin || (b.march && b.march.origin));
    if (b.kind === "siege") {
      if (outcome === "capture") capture(state, b, report);
      else if (outcome === "joined") {
        say(b, `${S.josa(S.placeName(state, b.place), "은", "는")} 이미 아군의 손에 들어왔습니다. 포위군이 성에 들어갑니다.`);
        letGo(state, b, A.officers);
        const t = S.place(state, b.place);
        S.addTroops(t, A.unit, A.troops);
        for (const o of crewOf(state, A.officers, A.force)) o.city = b.place;
        S.officersMoved(state);
        report.attackerWon = true;
      } else {
        say(b, outcome === "allied"
          ? `${S.josa(S.placeName(state, b.place), "이", "가")} 동맹인 ${S.forceName(state, S.place(state, b.place).owner)}의 손에 들어가 포위를 풀고 물러납니다.`
          : `공격 실패. ${S.forceName(state, A.force)}이 ${A.troops}명을 이끌고 물러납니다.`);
        letGo(state, b, A.officers);
        S.sendHome(state, { officers: A.officers, force: A.force, path: A.path, target: b.place, origin: A.origin, train: A.train, unit: A.unit }, A.troops);
      }
      if (b.relief) endRelief(state, b, report.attackerWon ? "home" : "enter");
      const t = S.place(state, b.place);
      if (origin) S.returnManpower(origin, (b.killedA || 0) * 0.3);
      S.returnManpower(t, (b.killedD || 0) * 0.3);
    } else {
      endField(state, b, outcome, report);
      if (origin) S.returnManpower(origin, (b.killedA || 0) * 0.3);
      const home = S.place(state, b.sortie.origin);
      if (home) S.returnManpower(home, (b.killedD || 0) * 0.3);
    }
    const won = report.attackerWon;
    S.addWeariness(state, A.force, ((b.killedA || 0) / S.forcePop(state, A.force)) * 1500 + (won ? -2 : 3));
    if (D.force) S.addWeariness(state, D.force, (((b.killedD || 0) + (b.killedR || 0)) / S.forcePop(state, D.force)) * 1500 + (won ? 5 : -1));
    const where = S.placeName(state, b.place);
    const text = b.kind === "siege"
      ? (report.attackerWon ? `${S.josa(S.forceName(state, A.force), "이", "가")} ${S.forceName(state, D.force)}의 ${S.josa(where, "을", "를")} 함락했습니다. (${b.day}일)`
        : outcome === "allied" ? `${S.forceName(state, A.force)}이 동맹의 땅이 된 ${where}에서 물러났습니다.`
        : `${S.forceName(state, A.force)}의 ${where} 공격이 실패했습니다. (${b.day}일)`)
      : (report.attackerWon ? `${S.forceName(state, A.force)}이 ${where} 앞에서 ${S.forceName(state, D.force)}의 요격을 물리쳤습니다.`
        : `${S.forceName(state, D.force)}이 ${where} 앞에서 ${S.forceName(state, A.force)}을 요격해 물리쳤습니다.`);
    S.addLog(state, text, report.attackerWon ? "war" : "warfail");
    // A computer force (or the player's, left wholly to its governors) tries
    // three times to win a captive over, then keeps him. A captured ruler it
    // sets free. (When it would rather kill is yet to be decided.)
    if (A.force !== state.playerForce || S.spectating(state)) {
      for (const pid of report.captured) {
        const p = state.officers[pid];
        if (p.status !== "captive") continue;
        if (p.lord) { S.release(state, p.city, pid); continue; }
        for (let i = 0; i < S.CAPTIVE_TRIES && p.status === "captive"; i++) {
          if (!S.persuade(state, pid).ok) break;
        }
      }
    }
    if (onEvent) onEvent({ ok: true, report, msg: b.last });
  }

  // The player calls off an attack.
  S.retreat = function (state, id) {
    const b = S.battleOf(state, id);
    if (!b || b.att.force !== state.playerForce) return fail("물러날 수 있는 전투가 아닙니다.");
    b.retreatOrder = true;
    return { ok: true, msg: `${S.placeName(state, b.place)}에서 물러나라는 명을 내렸습니다.` };
  };

  S.runBattles = function (state, onEvent) {
    for (const b of (state.battles || []).slice()) {
      if (!state.battles.includes(b)) continue;
      let out;
      if (b.retreatOrder) { say(b, "퇴각 명령이 내려왔습니다."); out = b.kind === "siege" ? "retreat" : "defender"; }
      else out = b.kind === "siege" ? siegeDay(state, b) : fieldDay(state, b);
      for (const side of [b.att, b.def, b.relief]) if (side) side.morale = clamp(side.morale, 0, 110);
      if (out) finish(state, b, out, onEvent);
      if (S.checkOver(state)) return;
    }
  };

  // An army reached its target (called from the march rules).
  S.fight = function (state, m) {
    return S.startSiege(state, m);
  };
})(globalThis.SAM = globalThis.SAM || {});
