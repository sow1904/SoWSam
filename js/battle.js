// Battles that last for days. Every army that reaches an enemy city or
// stronghold lays siege to it; there are no battles on the road. Each day the
// two sides clash once, and a bold officer inside may lead a sortie (출격)
// against the besiegers' camp, which can go very well or very badly: a siege
// turns on luck as much as on numbers. Troops, morale and food decide when
// one side breaks.
//
// Supply (internal only, nothing is drawn on the map): the besiegers have a
// supply line (보급로) and a depot (군량고). Raiders hunt for them: a cut line
// saps morale until it is mended, a burnt depot (as at 관도) breaks it. Relief
// for a besieged city comes from other cities (원군), and whether to send one
// weighs the chance of cutting the besiegers' supply.
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });

  // Daily losses as a share of the other side's fighting power.
  S.BATTLE_RATE = { siege: 0.035, field: 0.07 };
  S.SIEGE_MAX_DAYS = 120;
  S.HOME_GROUND = 1.15; // a relief army fights on ground it knows

  // Links of the network that cross or follow a great river: a battle there is
  // fought on the water. A road split by a fort is listed by its pieces.
  const WATER = {};
  for (const [a, b] of [
    // 장강
    ["jiujiang", "danyang"], ["lujiang", "danyang"], ["guangling", "danyang"], ["guangling", "wujun"], ["wujun", "kuaiji"],
    ["nanjun", "wuchang"], ["nanjun", "changsha"], ["nanjun", "wuling"], ["wuchang", "changsha"], ["wuchang", "yuzhang"],
    ["wuchang", "lujiang"], ["lujiang", "yuzhang"], ["jiangxia", "wuchang"], ["danyang", "hefei"], // 유수구
    // 황하
    ["henan", "henei"], ["henan", "hedong"], ["dongjun", "weijun"], ["dongjun", "pingyuan"],
    ["hedong", "hongnong"], ["hedong", "zuopingyi"], ["pingyuan", "jinan"],
    // 한수: 번성에서 양양으로 건넌다
    ["xinye", "xiangyang"],
    // 바닷길
    ["donglai", "liaodong"], ["donglai", "daifang"], ["donglai", "wujun"],
  ]) WATER[S.roadKey(a, b)] = true;
  S.isWater = (a, b) => !!WATER[S.roadKey(a, b)];
  // Sea routes, drawn differently on the map.
  const SEA = { [S.roadKey("donglai", "liaodong")]: true, [S.roadKey("donglai", "daifang")]: true, [S.roadKey("donglai", "wujun")]: true };
  S.isSea = (a, b) => !!SEA[S.roadKey(a, b)];
  S.waterLink = (state, a, b) => S.isWater(a, b);

  const crewOf = (state, ids, force) => ids.map((id) => state.officers[id]).filter((o) => o && o.status === "serving" && o.force === force);
  const has = (list, k) => list.some((o) => S.hasSkill(o, k));
  const top = (list, k) => (list.length ? S.best(list, k)[k] : 30);
  const moraleMul = (m) => 0.6 + clamp(m, 0, 110) / 250;
  // 야전 helps outside the walls.
  const skillMul = (list) => (has(list, "야전") ? 1.15 : 1);
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
  //   watch: how well the other side's watch-tower carts see (0-1)
  function ruse(state, b, us, them, foes, names, watch) {
    if (!us.length) return 0;
    const p = S.best(us, "plot");
    if (!S.chance(state, S.ruseAttempt(p) / 3)) return 0;
    const w = them.length ? S.best(them, "wit") : null;
    const lead = them.length ? S.best(them, "cmd") : null;
    const temper = S.hasTrait(lead, "신중") ? -15 : S.hasTrait(lead, "과감") ? 10 : 0;
    const name = names[Math.floor(S.rand(state) * names.length)];
    if (!S.chance(state, clamp(S.ruseChance(p, w) + temper - S.AID.scoutRuse * (watch || 0), 5, 95))) {
      if (w) say(b, `${p.name}의 ${name}! 그러나 ${S.josa(w.name, "이", "가")} 간파했습니다.`);
      return 0;
    }
    const loss = Math.round(foes * (0.03 + p.plot / 2000));
    say(b, `${p.name}의 ${S.josa(name, "이", "가")} 적중했습니다! 적 ${loss}명이 쓰러집니다.`);
    return loss;
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
    // Watch-tower carts see the raiders coming.
    const seen = 1 - S.AID.scoutRaid * (guardSide.unit ? S.aidOf(guardSide.unit).scout : 0);
    pc.cut *= seen;
    pc.burn *= seen;
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
    const need = S.fieldFood(A.troops, 1, A.path ? S.pathRough(state, A.path) : 1) * (1 - S.AID.ox * S.aidOf(A.unit).ox);
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
    // Siege engines: ladders over the wall, towers on the men upon it.
    // Stakes before the wall (녹각) blunt the assault, cost the attackers men
    // as they clear them, and keep every engine from the wall until then.
    const staked = t.stakes > 0;
    const gear = staked ? S.gearOf(null) : S.gearOf(A.unit);
    wb = S.gearWall(wb, gear);
    const rnd = () => 0.8 + S.rand(state) * 0.4;
    // With a relief army in the field the besiegers must split their men.
    const split = b.relief ? 0.7 : 1;
    const gu = S.garrisonUnit(t);
    const aPow = S.power(A.troops, S.sideStats(atk, 30), A.train, 1) * S.unitMul(A.unit, gu, "siegeA", 1) * moraleMul(A.morale) * split * (staked ? S.STAKES.blunt : 1);
    const dPow = S.power(t.troops, S.sideStats(defs, t.owner ? 40 : 35), t.train, wb) * S.unitMul(gu, A.unit, "siegeD", 1) * moraleMul(b.def.morale) * S.houseDefense(t, state) * S.gearSuppress(gear);
    let lossD = Math.round(aPow * S.BATTLE_RATE.siege * rnd() * S.gearKill(gear));
    let lossA = Math.round(dPow * S.BATTLE_RATE.siege * rnd() * (staked ? S.STAKES.bleed : 1));
    lossD += ruse(state, b, atk, defs, t.troops, ["화공", "위계", "야습"], S.aidOf(gu).scout);
    lossA += ruse(state, b, defs, atk, A.troops, ["야습", "역습", "화공"], S.aidOf(A.unit).scout);
    lossD += tunnelDay(state, b, t, atk, defs, gu);
    lossD = Math.min(t.troops, lossD);
    lossA = Math.min(A.troops, lossA);
    const D0 = t.troops;
    S.loseTroops(t, lossD);
    A.troops -= lossA;
    b.killedA = (b.killedA || 0) + lossA;
    b.killedD = (b.killedD || 0) + lossD;
    sortieDay(state, b, t, atk, defs);
    t.wall = Math.max(0, t.wall - Math.round((lossD * 0.02 + S.gearBatter(gear)) * (has(atk, "공성") ? 1.5 : 1)));
    if (staked) {
      t.stakes = Math.max(0, t.stakes - S.STAKES.wear * (has(atk, "공성") ? 1.5 : 1));
      if (t.stakes <= 0) say(b, `${S.forceName(state, A.force)}이 성 앞의 녹각을 모두 걷어 냈습니다.`);
    }
    // The computer digs once the siege has settled in.
    if (A.force !== state.playerForce && b.day === S.TUNNEL.aiDay && t.wall >= S.TUNNEL.aiWall && A.troops > t.troops) S.dig(state, b);
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

  // ---------- tunnels (땅굴) and stakes (녹각) ----------
  // Besiegers may dig under the wall: it takes days, and each day the
  // defenders may hear the digging and collapse it. If it comes through, the
  // wall comes down and the garrison loses heart.
  // why: 원소 took 공손찬's towers at 역경 by mining under them; at 진창 학소
  // cut across 제갈량's tunnels with trenches inside the wall.
  S.TUNNEL = { days: 10, tries: 2, wall: 0, kill: 0.08, morale: 30, find: 4, lost: 0.06, lostMorale: 12, aiDay: 5, aiWall: 300 };
  S.tunnelFind = function (atk, defs, gu) {
    return clamp(Math.round((S.TUNNEL.find + (top(defs, "wit") - top(atk, "plot")) * 0.1 + S.AID.scoutTunnel * S.aidOf(gu).scout) * 10) / 10, 1, 10);
  };
  // Why a siege cannot start a tunnel now, or null.
  S.digBlock = function (state, b) {
    if (!b || b.kind !== "siege") return "성을 에워싼 군단만 땅굴을 팔 수 있습니다.";
    if (b.tunnel) return "이미 땅굴을 파고 있습니다.";
    if ((b.tunnels || 0) >= S.TUNNEL.tries) return "더는 땅굴을 팔 곳이 없습니다.";
    if (S.place(state, b.place).wall <= 0) return "무너뜨릴 성벽이 없습니다.";
    return null;
  };
  S.dig = function (state, b) {
    const blk = S.digBlock(state, b);
    if (blk) return fail(blk);
    b.tunnel = { left: S.TUNNEL.days };
    b.tunnels = (b.tunnels || 0) + 1;
    if (b.att.force === state.playerForce) say(b, `성벽 밑으로 땅굴을 파기 시작했습니다. ${S.TUNNEL.days}일이 걸립니다.`);
    return { ok: true, msg: `${S.placeName(state, b.place)}의 성벽 밑으로 땅굴을 파기 시작했습니다. (${S.TUNNEL.days}일)` };
  };
  // The player orders it.
  S.orderTunnel = function (state, id) {
    const b = S.battleOf(state, id);
    if (!b || b.att.force !== state.playerForce) return fail("땅굴을 팔 수 있는 전투가 아닙니다.");
    return S.dig(state, b);
  };
  // One day of digging. Returns defenders killed when the wall comes down.
  function tunnelDay(state, b, t, atk, defs, gu) {
    if (!b.tunnel) return 0;
    const A = b.att;
    if (S.chance(state, S.tunnelFind(atk, defs, gu))) {
      const lost = Math.min(A.troops, Math.round(A.troops * S.TUNNEL.lost));
      A.troops -= lost;
      b.killedA = (b.killedA || 0) + lost;
      A.morale -= S.TUNNEL.lostMorale;
      b.tunnel = null;
      const w = defs.length ? S.best(defs, "wit") : null;
      say(b, `${w ? S.josa(w.name, "이", "가") : "수비군이"} 땅 파는 소리를 듣고 땅굴을 무너뜨렸습니다. 공격군 ${lost}명이 묻혔습니다.`);
      return 0;
    }
    if (--b.tunnel.left > 0) return 0;
    b.tunnel = null;
    const before = t.wall;
    t.wall = Math.round(t.wall * S.TUNNEL.wall);
    b.def.morale -= S.TUNNEL.morale;
    const killed = Math.round(t.troops * S.TUNNEL.kill);
    say(b, `땅굴이 성벽 밑에 닿았습니다! 성벽이 무너져 내립니다. (성벽 ${before} → ${t.wall})`);
    return killed;
  }
  S.STAKES = { wood: 500, blunt: 0.83, bleed: 1.1, wear: 5 };
  // An officer has stakes and caltrops laid before a city's walls.
  S.stake = function (state, oid, cid) {
    const o = state.officers[oid], c = state.cities[cid];
    if (!o || !c) return fail("도시에서만 녹각을 세울 수 있습니다.");
    if (o.status !== "serving" || o.city !== cid || o.force !== c.owner) return fail("이 도시의 무장이 아닙니다.");
    if (o.done) return fail(`${S.josa(o.name, "은", "는")} 이번 달 이미 행동했습니다.`);
    if (S.postOf(state, o)) return fail(`${S.josa(o.name, "은", "는")} 담당 업무 중입니다.`);
    if (S.besieged(state, cid)) return fail("포위당한 도시에서는 성 밖에 녹각을 세울 수 없습니다.");
    if (c.stakes >= 100) return fail("녹각이 이미 다 세워져 있습니다.");
    if (c.res.wood < S.STAKES.wood) return fail(`목재가 부족합니다. (필요 ${S.STAKES.wood})`);
    c.res.wood -= S.STAKES.wood;
    c.stakes = 100;
    o.done = true;
    return { ok: true, msg: `${S.josa(o.name, "이", "가")} ${c.name}의 성 앞에 녹각과 철질려를 깔았습니다. (목재 ${S.STAKES.wood})` };
  };

  // Fire ships (화선): a force with the third level of 조선 sends them at the
  // enemy fleet on a river. Tall ships burn best.
  // ---------- sorties (출격) ----------
  // Each day an officer inside may open the gates and strike the besiegers'
  // camp with part of the garrison. Field specialists (야전) go out often and
  // can break a siege with one blow; other fierce or bold officers go out now
  // and then. Only the part of the camp they fall on can answer at once. The
  // outcome leans on luck: a rare rout of the besiegers (as 장료 at 합비, or
  // 여포 before 호로관 in the novel), a good blow, a repulse, or now and then
  // a bloody one. After a sortie the garrison rests some days. A rout that
  // leaves the besiegers' morale at S.SORTIE.broken or below lifts the siege.
  S.SORTIE = { rest: 4, share: 0.3, min: 1000, front: 0.25, field: 15, other: 5, big: 0.22, bigOther: 0.1, rout: 0.2, broken: 50 };
  // Who would lead a sortie, if anyone: a field specialist first, else the
  // fiercest of those with 무력 75 or more or a bold temper.
  S.sortieLeader = function (defs) {
    const ok = defs.filter((o) => S.hasSkill(o, "야전") || o.war >= 75 || S.hasTrait(o, "과감"));
    if (!ok.length) return null;
    const score = (o) => (S.hasSkill(o, "야전") ? 200 : 0) + o.war + o.cmd / 2;
    return ok.reduce((a, o) => (score(o) > score(a) ? o : a));
  };
  // The chance (%) of a sortie on a day, with no rest pending.
  S.sortieChance = function (state, place, leader) {
    if (!leader || S.defensePolicy(state, place.id) === "hold") return 0;
    const field = S.hasSkill(leader, "야전");
    let pct = field ? S.SORTIE.field : S.SORTIE.other;
    if (S.hasTrait(leader, "과감")) pct += 2;
    if (S.hasTrait(leader, "신중")) pct *= 0.5;
    if (!field && S.hasSkill(leader, "수성")) pct *= 0.5;
    if (S.defensePolicy(state, place.id) === "intercept") pct *= 1.8;
    return Math.round(pct * 10) / 10;
  };
  // For the attack window: who in the target might come out, and how often.
  S.sortieThreat = function (state, id) {
    const t = S.place(state, id);
    const defs = S.serving(state, id).filter((o) => o.force === t.owner);
    const leader = S.sortieLeader(defs);
    return leader ? { leader, pct: S.sortieChance(state, t, leader) } : null;
  };
  function sortieDay(state, b, t, atk, defs) {
    const A = b.att, D = b.def;
    if (b.sortieRest > 0) { b.sortieRest--; return; }
    if (D.morale < 40 || t.troops < S.SORTIE.min || A.troops <= 0) return;
    const leader = S.sortieLeader(defs);
    if (!S.chance(state, S.sortieChance(state, t, leader))) return;
    // The soldiers who fare best against the besiegers in the open; engines and carts stay.
    const counts = S.pickTroops(t, t.troops * S.SORTIE.share, (k) => (S.unitOf(k).gear || S.unitOf(k).aid ? 0 : Math.pow(S.unitEdge(k, A.unit, "field", 1), 2)));
    const n = S.countsTotal(counts);
    if (n < S.SORTIE.min / 2) return;
    b.sortieRest = S.SORTIE.rest;
    // Up to two more go with the leader: the fiercest of the rest.
    const fierce = (o) => o.war + o.cmd / 2;
    const team = [leader].concat(defs.filter((o) => o !== leader && (S.hasSkill(o, "야전") || o.war >= 70))
      .sort((x, y) => fierce(y) - fierce(x)).slice(0, S.MAX_SORTIE_OFFICERS - 1));
    const unit = S.mixOf(counts);
    const field = has(team, "야전");
    const sPow = S.power(n, S.sideStats(team, 35), t.train, 1) * S.unitMul(unit, A.unit, "field", 1) * skillMul(team) * moraleMul(D.morale);
    const aPow = S.power(A.troops, S.sideStats(atk, 30), A.train, 1) * S.unitMul(A.unit, unit, "field", 1) * moraleMul(A.morale) * S.SORTIE.front;
    const r = sPow / Math.max(1, aPow);
    // Watch-tower carts see them coming.
    let p = 0.45 + 0.2 * Math.log2(Math.max(0.05, r)) + (field ? 0.1 : 0) + (leader.war - 75) / 200 - 0.15 * S.aidOf(A.unit).scout;
    say(b, `${S.josa(leader.name, "이", "가")} 성문을 열고 ${S.unitName(unit)} ${n}명을 이끌고 출격했습니다!`);
    // The besiegers' champion may ride out to meet him.
    duel(state, b, team, atk, (side) => {
      if (side === "def") { p += 0.15; A.morale -= 10; } else { p -= 0.2; D.morale -= 10; }
    });
    p = clamp(p, 0.1, 0.85);
    const big = p * (field ? S.SORTIE.big : S.SORTIE.bigOther);
    const rout = (1 - p) * S.SORTIE.rout;
    const u = S.rand(state);
    const rnd = (lo, hi) => lo + S.rand(state) * (hi - lo);
    const foe = S.forceName(state, A.force);
    let kill, lost;
    if (u < big) {
      kill = A.troops * rnd(0.12, 0.22);
      lost = n * 0.04;
      A.morale -= rnd(40, 60);
      D.morale += 12;
      say(b, `대승! ${foe}의 진영이 무너졌습니다. 포위군 ${Math.round(kill)}명이 쓰러지고 사기가 크게 꺾였습니다.`);
      S.addLog(state, `${S.placeName(state, b.place)}의 ${S.josa(leader.name, "이", "가")} 출격해 ${S.josa(foe, "을", "를")} 크게 무찔렀습니다!`, "war");
      if (A.morale <= S.SORTIE.broken) {
        b.ending = "retreat";
        say(b, `겁에 질린 ${S.josa(foe, "이", "가")} 포위를 풀고 달아납니다.`);
      }
    } else if (u < p) {
      kill = A.troops * rnd(0.03, 0.06) * Math.min(1.5, r);
      lost = n * rnd(0.03, 0.07);
      A.morale -= 6;
      D.morale += 4;
      say(b, `출격 성공. ${foe} ${Math.round(kill)}명을 베고 성으로 돌아왔습니다.`);
    } else if (u > 1 - rout) {
      kill = A.troops * 0.005;
      lost = n * rnd(0.3, 0.4);
      A.morale += 8;
      D.morale -= 15;
      say(b, `출격 참패! 포위망에 갇혀 ${Math.round(lost)}명을 잃고 겨우 성으로 돌아왔습니다.`);
    } else {
      kill = A.troops * 0.01;
      lost = n * rnd(0.1, 0.16);
      A.morale += 4;
      D.morale -= 6;
      say(b, `출격 실패. ${S.josa(foe, "이", "가")} 막아 내어 ${Math.round(lost)}명을 잃고 물러났습니다.`);
    }
    kill = Math.min(A.troops, Math.round(kill));
    lost = Math.min(n, Math.round(lost));
    A.troops -= kill;
    // The sortie's own losses fall on the types that went out.
    if (S.takeTroops(t, counts)) S.addTroops(t, unit, n - lost);
    else S.loseTroops(t, lost);
    b.killedA = (b.killedA || 0) + kill;
    b.killedD = (b.killedD || 0) + lost;
  }

  S.FIRESHIP = { chance: 12, loss: 0.06, tall: 1.5, morale: 10 };
  function fireShips(state, b, us, them, side, foe, foeFleet) {
    if (!S.lineLevel || S.lineLevel(state, side.force, "navy") < 3 || !S.chance(state, S.FIRESHIP.chance)) return 0;
    const lead = us.length ? Math.max(top(us, "plot"), top(us, "strat")) : 40;
    const w = them.length ? S.best(them, "wit") : null;
    if (!S.chance(state, clamp(55 + lead - (w ? w.wit : 40), 20, 90))) {
      say(b, `${S.forceName(state, side.force)}이 화선을 띄웠으나 ${w ? S.josa(w.name, "이", "가") + " 바람을 읽고 피했습니다" : "적이 피했습니다"}.`);
      return 0;
    }
    const tall = foeFleet === "louchuan";
    const loss = Math.round(foe.troops * S.FIRESHIP.loss * (tall ? S.FIRESHIP.tall : 1));
    foe.morale -= S.FIRESHIP.morale;
    say(b, `${S.forceName(state, side.force)}의 화선이 적 함대에 불을 붙였습니다! ${tall ? "높은 누선이 잘 탑니다. " : ""}적 ${loss}명이 쓰러집니다.`);
    return loss;
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
    t.stakes = 0;
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
        d.begged = false;
        d.caught = S.today(state); // the day's three free tries (S.persuade)
        if (fort) d.city = S.place(state, A.origin) && S.place(state, A.origin).owner === A.force ? A.origin : (S.citiesOf(state, A.force)[0] || {}).id || d.city;
        S.officersMoved(state);
        report.captured.push(d.id);
        say(b, `${S.josa(d.name, "을", "를")} 사로잡았습니다.`);
      }
    }
    // Those the defenders held: our own men walk free, the rest change gaolers.
    for (const p of S.officersIn(state, b.place, (x) => x.status === "captive" && x.captor === defForce)) {
      if (p.force === A.force) { p.status = "serving"; p.captor = null; say(b, `포로였던 ${S.josa(p.name, "이", "가")} 풀려나 합류했습니다.`); }
      else if (p.lord) S.freeCaptive(state, p);
      else { p.captor = A.force; p.tries = 0; say(b, `갇혀 있던 포로 ${S.josa(p.name, "을", "를")} 넘겨받았습니다.`); }
    }
    if (defForce) S.relAdd(state, A.force, defForce, S.DIPLO.capture);
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
    if (defForce) S.checkForce(state, defForce, report, A.force);
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
    const rPow = S.power(R.troops, S.sideStats(rel, 35), R.train, 1) * S.unitMul(R.unit, A.unit, "field", 1) * skillMul(rel) * moraleMul(R.morale) * S.HOME_GROUND;
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
        const counts = S.pickTroops(best.c, best.spare, (k) => (S.unitOf(k).gear ? 0 : Math.pow(S.unitEdge(k, b.att.unit, "field", 1), 2)));
        S.relieve(state, best.c.id, b.place, team.map((o) => o.id), best.spare, counts);
      }
    }
  };

  // ---------- field battles (요격) ----------
  // Battles on the road from before sieges took their place (old saves only):
  // the marching army goes on, the interceptors go home.
  function dissolveField(state, b) {
    const m = b.march, s = b.sortie, A = b.att, D = b.def;
    state.battles = state.battles.filter((x) => x !== b);
    letGo(state, b, A.officers.concat(D.officers));
    const total = S.pathKm(state, m.path);
    const at = Math.min(total, total - S.legKm(state, m.path[m.path.length - 2], m.target) / 2);
    S.launch(state, { kind: "army", force: A.force, path: m.path, skip: at, km: total - at, speed: S.unitSpeed(A.unit),
      officers: crewOf(state, A.officers, A.force).map((o) => o.id), troops: A.troops, unit: A.unit, train: A.train, origin: m.origin, target: m.target });
    const leg = S.legKm(state, s.path[0], s.path[1]);
    S.launch(state, { kind: "return", force: D.force, path: s.path.slice().reverse(), skip: leg - s.km, km: s.km, speed: S.unitSpeed(D.unit),
      officers: crewOf(state, D.officers, D.force).map((o) => o.id), troops: D.troops, unit: D.unit, train: D.train, origin: s.target, target: s.origin });
  }

  // ---------- the defender's choice: sortie freely, or hold the walls ----------
  S.DEFENSE_POLICY = { auto: "태수에게 맡김", intercept: "적극 출격", hold: "농성" };
  S.defensePolicy = (state, id) => (state.policy && state.policy[id]) || "auto";
  S.setDefensePolicy = function (state, id, policy) {
    if (!S.DEFENSE_POLICY[policy]) return fail("알 수 없는 방침입니다.");
    state.policy = state.policy || {};
    state.policy[id] = policy;
    return { ok: true, msg: `${S.placeName(state, id)}의 방어 방침을 「${S.DEFENSE_POLICY[policy]}」으로 정했습니다.` };
  };
  // An interceptor march from an old save: it goes home.
  S.sortieArrives = function (state, s) {
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
    }
    const won = report.attackerWon;
    // Those who win together grow closer to their lord.
    for (const o of won ? crewOf(state, A.officers, A.force)
      : D.force ? S.serving(state, b.place).filter((x) => x.force === D.force) : []) S.bondAdd(state, o, S.BOND.win);
    S.addWeariness(state, A.force, ((b.killedA || 0) / S.forcePop(state, A.force)) * 1500 + (won ? -2 : 3));
    if (D.force) S.addWeariness(state, D.force, (((b.killedD || 0) + (b.killedR || 0)) / S.forcePop(state, D.force)) * 1500 + (won ? 5 : -1));
    const where = S.placeName(state, b.place);
    const text = report.attackerWon ? `${S.josa(S.forceName(state, A.force), "이", "가")} ${S.forceName(state, D.force)}의 ${S.josa(where, "을", "를")} 함락했습니다. (${b.day}일)`
      : outcome === "allied" ? `${S.forceName(state, A.force)}이 동맹의 땅이 된 ${where}에서 물러났습니다.`
      : `${S.forceName(state, A.force)}의 ${where} 공격이 실패했습니다. (${b.day}일)`;
    S.addLog(state, text, report.attackerWon ? "war" : "warfail");
    // A computer force (or the player's, left wholly to its governors) tries
    // three times to win a captive over, then weighs whether to put him to
    // death (S.judgeCaptive) or keep him. A captured ruler it kills or frees.
    if (A.force !== state.playerForce || S.spectating(state)) {
      for (const pid of report.captured) {
        const p = state.officers[pid];
        if (p.status !== "captive") continue;
        if (p.lord) { S.judgeCaptive(state, p, true); continue; }
        for (let i = 0; i < S.CAPTIVE_TRIES && p.status === "captive"; i++) {
          if (!S.persuade(state, pid).ok) break;
        }
        if (p.status === "captive") S.judgeCaptive(state, p, true);
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
      if (b.kind !== "siege") { dissolveField(state, b); continue; }
      let out;
      if (b.retreatOrder) { say(b, "퇴각 명령이 내려왔습니다."); out = "retreat"; }
      else out = siegeDay(state, b);
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
