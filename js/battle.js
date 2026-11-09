// Battles that last for days. An army that reaches an enemy city or
// stronghold lays siege to it; a defender may instead march out and meet the
// army on the road (요격), which makes a field battle, or a battle on the
// water where the road crosses a great river. Each day the two sides clash
// once; troops, morale and food decide when one side breaks.
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });

  // Daily losses as a share of the other side's fighting power.
  S.BATTLE_RATE = { siege: 0.035, field: 0.07 };
  S.SIEGE_MAX_DAYS = 120;
  S.FIELD_MAX_DAYS = 10;
  S.HOME_GROUND = 1.15; // interceptors fight on ground they know

  // Roads that cross or follow a great river: a battle there is fought on the water.
  // Provisional; the 장강 crossings in particular may change.
  const WATER = {};
  for (const [a, b] of [
    // 장강
    ["jiujiang", "danyang"], ["lujiang", "danyang"], ["guangling", "danyang"], ["guangling", "wujun"], ["nanjun", "jiangxia"],
    ["nanjun", "wuling"], ["jiangxia", "changsha"], ["jiangxia", "yuzhang"], ["jiangxia", "lujiang"], ["lujiang", "yuzhang"], ["bajun", "nanjun"],
    // 황하
    ["henan", "henei"], ["henei", "chenliu"], ["dongjun", "weijun"], ["jibei", "pingyuan"], ["hedong", "hongnong"], ["hongnong", "zuopingyi"],
    // 한수
    ["nanyang", "nanjun"],
  ]) WATER[S.roadKey(a, b)] = true;
  S.isWater = (a, b) => !!WATER[S.roadKey(a, b)];

  const crewOf = (state, ids, force) => ids.map((id) => state.officers[id]).filter((o) => o && o.status === "serving" && o.force === force);
  const has = (list, k) => list.some((o) => S.hasSkill(o, k));
  const moraleMul = (m) => 0.6 + clamp(m, 0, 110) / 250;
  const skillMul = (list, water) => (water ? (has(list, "수전") ? 1.2 : 0.85) : has(list, "야전") ? 1.15 : 1);
  const startMorale = (list) => (list.length && S.hasTrait(S.best(list, "cmd"), "과감") ? 105 : 100);

  S.battlesAt = (state, id) => (state.battles || []).filter((b) => b.place === id);
  S.battleOf = (state, id) => (state.battles || []).find((b) => b.id === id);

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

  // ---------- siege ----------
  // An army reached an enemy place: it surrounds it, or joins its own force's siege there.
  S.startSiege = function (state, m) {
    const t = S.place(state, m.target);
    const ids = m.officers.filter((id) => { const o = state.officers[id]; return o && o.status === "serving" && o.force === m.force; });
    S.releaseMarch(state, m);
    const old = (state.battles || []).find((x) => x.kind === "siege" && x.place === m.target && x.att.force === m.force);
    if (old) {
      old.att.train = Math.round((old.att.train * old.att.troops + m.train * m.troops) / Math.max(1, old.att.troops + m.troops));
      old.att.troops += m.troops;
      old.att.troops0 += m.troops;
      old.att.rations += m.troops / 10;
      old.att.officers.push(...ids);
      hold(state, old, ids);
      say(old, `${S.forceName(state, m.force)} 원군 ${m.troops}명이 도착해 포위에 가세했습니다.`);
      return old;
    }
    const atk = crewOf(state, ids, m.force);
    const defs = S.serving(state, m.target).filter((o) => o.force === t.owner);
    const b = newBattle(state, {
      kind: "siege", place: m.target, x: t.x, y: t.y, from: S.placeName(state, m.origin),
      att: { force: m.force, officers: ids, troops: m.troops, troops0: m.troops, train: m.train, morale: startMorale(atk), rations: m.troops / 10, origin: m.origin, path: m.path },
      def: { force: t.owner, troops0: Math.max(1, t.troops), morale: startMorale(defs) },
    });
    hold(state, b, ids);
    say(b, `${S.forceName(state, m.force)} ${m.troops}명이 ${t.name}(${S.forceName(state, t.owner)}, 수비 ${t.troops}명)을 에워쌌습니다.`);
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
    }
    const atk = crewOf(state, A.officers, A.force);
    const defs = S.serving(state, b.place).filter((o) => o.force === t.owner);
    if (t.troops <= 0 && !defs.length) return "capture";
    let wb = S.wallBonus(t) * S.gentryDefense(t);
    if (has(defs, "수성")) wb *= 1.15;
    if (has(atk, "공성")) wb = 1 + (wb - 1) * 0.75;
    const rnd = () => 0.8 + S.rand(state) * 0.4;
    const aPow = S.power(A.troops, S.sideStats(atk, 30), A.train, 1) * moraleMul(A.morale);
    const dPow = S.power(t.troops, S.sideStats(defs, t.owner ? 40 : 35), t.train, wb) * moraleMul(b.def.morale);
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
    // Morale follows the day's exchange; a long siege wears the besiegers down.
    const rA = lossA / Math.max(1, A.troops + lossA), rD = lossD / Math.max(1, D0);
    A.morale += clamp((rD - rA) * 300, -8, 6) - (b.day > 20 ? 1 : 0);
    b.def.morale += clamp((rA - rD) * 300, -8, 6);
    A.rations -= A.troops / 1000;
    if (A.rations <= 0) {
      if (!b.hungry) say(b, `포위군의 군량이 떨어졌습니다.`);
      b.hungry = true;
      A.morale -= 8;
    }
    if (t.food <= 0) b.def.morale -= 8;
    if (b.day <= 3 || b.day % 5 === 0 || lossA + lossD > (A.troops + t.troops) * 0.06) {
      say(b, `${b.day}일째: 공격군 -${lossA} (${A.troops}), 수비군 -${lossD} (${t.troops}) · 성벽 ${t.wall}`);
    }
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
        say(b, `${S.josa(d.name, "은", "는")} ${S.ro(S.placeName(state, d.city))} 달아났습니다.`);
      } else {
        d.status = "captive";
        d.captor = A.force;
        if (fort) d.city = S.place(state, A.origin) && S.place(state, A.origin).owner === A.force ? A.origin : (S.citiesOf(state, A.force)[0] || {}).id || d.city;
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
    t.troops = A.troops + Math.floor(remainingD * 0.3);
    t.retainers = fort ? 0 : Math.floor(remainingD * 0.3);
    t.consent = Math.min(t.consent, 30);
    t.train = A.train;
    t.gold = Math.floor(t.gold / 2);
    t.food = Math.floor(t.food / 2);
    t.order = Math.max(10, t.order - 20);
    letGo(state, b, A.officers);
    for (const o of atk) o.city = b.place;
    report.attackerWon = true;
    if (defForce) S.checkForce(state, defForce, report);
  }

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
    const b = newBattle(state, {
      kind: water ? "water" : "field", place: m.target, x: pos.x, y: pos.y, from: S.placeName(state, m.origin), water,
      march: m, sortie,
      att: { force: m.force, officers: atkIds, troops: m.troops, troops0: m.troops, train: m.train, morale: startMorale(atk) },
      def: { force: sortie.force, officers: defIds, troops: sortie.troops, troops0: sortie.troops, train: sortie.train, morale: startMorale(dfs) },
    });
    hold(state, b, atkIds.concat(defIds));
    const chief = dfs.length ? S.best(dfs, "cmd").name : "수비군";
    say(b, `${S.josa(chief, "이", "가")} ${b.def.troops}명을 이끌고 나와 ${S.forceName(state, m.force)} ${m.troops}명을 ${water ? "강 위에서" : "길에서"} 맞받아칩니다.`);
    duel(state, b, atk, dfs, (side) => { b[side].morale -= 15; });
    return b;
  }

  function fieldDay(state, b) {
    const A = b.att, D = b.def;
    b.day++;
    const atk = crewOf(state, A.officers, A.force), dfs = crewOf(state, D.officers, D.force);
    const rnd = () => 0.8 + S.rand(state) * 0.4;
    const aPow = S.power(A.troops, S.sideStats(atk, 30), A.train, 1) * skillMul(atk, b.water) * moraleMul(A.morale);
    const dPow = S.power(D.troops, S.sideStats(dfs, 35), D.train, 1) * skillMul(dfs, b.water) * moraleMul(D.morale) * S.HOME_GROUND;
    let lossD = Math.round(aPow * S.BATTLE_RATE.field * rnd());
    let lossA = Math.round(dPow * S.BATTLE_RATE.field * rnd());
    const names = b.water ? ["화공", "야습", "위계"] : ["매복", "화공", "야습", "위계"];
    lossD += ruse(state, b, atk, dfs, D.troops, names);
    lossA += ruse(state, b, dfs, atk, A.troops, names);
    lossD = Math.min(D.troops, lossD);
    lossA = Math.min(A.troops, lossA);
    const rA = lossA / Math.max(1, A.troops), rD = lossD / Math.max(1, D.troops);
    A.troops -= lossA;
    D.troops -= lossD;
    b.killedA = (b.killedA || 0) + lossA;
    b.killedD = (b.killedD || 0) + lossD;
    A.morale += clamp((rD - rA) * 250, -12, 8);
    D.morale += clamp((rA - rD) * 250, -12, 8);
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
      S.launch(state, { kind: "army", force: A.force, path: m.path, skip: at, km: total - at, speed: "army",
        officers: crewOf(state, A.officers, A.force).map((o) => o.id), troops: A.troops, train: A.train, origin: m.origin, target: m.target });
    } else {
      const n = chase(A);
      say(b, b.retreatOrder ? `${S.forceName(state, A.force)}이 명에 따라 물러나며 ${n}명을 잃었습니다.` : `${S.forceName(state, A.force)}이 무너져 ${n}명을 더 잃고 물러납니다.`);
      S.launch(state, { kind: "return", force: A.force, path: m.path.slice().reverse(), skip: total - at, km: at, speed: "army",
        officers: crewOf(state, A.officers, A.force).map((o) => o.id), troops: A.troops, train: A.train, origin: m.target, target: m.origin });
    }
    const leg = S.legKm(state, s.path[0], s.path[1]);
    S.launch(state, { kind: "return", force: D.force, path: s.path.slice().reverse(), skip: leg - s.km, km: s.km, speed: "army",
      officers: crewOf(state, D.officers, D.force).map((o) => o.id), troops: D.troops, train: D.train, origin: s.target, target: s.origin });
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
    const pool = S.serving(state, id).filter((o) => o.force === t.owner && !S.postOf(state, o));
    const P = m.path[m.path.length - 2];
    const water = !S.isFort(state, id) && !S.isFort(state, P) && S.isWater(P, id);
    const troops = Math.max(0, Math.min(S.marchable(t) - Math.max(1000, Math.round(t.troops * 0.2)), t.troops));
    if (!pool.length || troops < 1000) return null;
    const score = (o) => o.cmd + o.war / 2 + (S.hasSkill(o, water ? "수전" : "야전") ? 20 : 0);
    const team = pool.slice().sort((a, b) => score(b) - score(a)).slice(0, S.MAX_SORTIE_OFFICERS);
    if (team.length === pool.length && pool.length > 1) team.pop(); // someone stays to hold the walls
    const atk = crewOf(state, m.officers, m.force);
    // The defenders know the ground they fight on.
    const ours = S.power(troops, S.sideStats(team, 35), t.train, 1) * skillMul(team, water) * S.HOME_GROUND;
    const theirs = S.power(m.troops, S.sideStats(atk, 30), m.train, 1) * skillMul(atk, water);
    const chief = S.best(team, "cmd");
    let need = 1.0;
    if (S.hasTrait(chief, "과감")) need -= 0.25;
    if (S.hasTrait(chief, "신중")) need += 0.35;
    if (has(team, water ? "수전" : "야전")) need -= 0.2;
    if (has(pool, "수성")) need += 0.2;
    if (S.isFort(state, id) && t.kind === "pass") need += 0.3;
    const policy = S.defensePolicy(state, id);
    if (policy === "intercept") need -= 0.4;
    return { team, troops, water, ratio: ours / Math.max(1, theirs), need, policy, P };
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
    const meet = m.start + Math.ceil((total - L / 2 - (m.skip || 0)) / S.SPEED.army);
    const now = S.today(state);
    if (meet <= now) return;
    t.troops -= odds.troops;
    const s = S.launch(state, { kind: "sortie", force: t.owner, path: [m.target, odds.P], km: L / 2, days: meet - now, speed: "army",
      officers: odds.team.map((o) => o.id), troops: odds.troops, train: t.train, origin: m.target, target: m.target, vs: m.id, water: odds.water });
    m.intercept = s.id;
    const names = odds.team.map((o) => o.name).join(", ");
    const msg = `${t.name}의 ${S.josa(names, "이", "가")} ${odds.troops}명을 이끌고 ${S.forceName(state, m.force)}을 요격하러 나섰습니다.`;
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
    S.launch(state, { kind: "return", force: s.force, path: s.path.slice().reverse(), skip: leg - s.km, km: s.km, speed: "army",
      officers: ids, troops: s.troops, train: s.train, origin: s.target, target: s.origin });
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
        t.troops += A.troops;
        for (const o of crewOf(state, A.officers, A.force)) o.city = b.place;
        report.attackerWon = true;
      } else {
        say(b, outcome === "allied"
          ? `${S.josa(S.placeName(state, b.place), "이", "가")} 동맹인 ${S.forceName(state, S.place(state, b.place).owner)}의 손에 들어가 포위를 풀고 물러납니다.`
          : `공격 실패. ${S.forceName(state, A.force)}이 ${A.troops}명을 이끌고 물러납니다.`);
        letGo(state, b, A.officers);
        S.sendHome(state, { officers: A.officers, force: A.force, path: A.path, target: b.place, origin: A.origin, train: A.train }, A.troops);
      }
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
    if (D.force) S.addWeariness(state, D.force, ((b.killedD || 0) / S.forcePop(state, D.force)) * 1500 + (won ? 5 : -1));
    const where = S.placeName(state, b.place);
    const text = b.kind === "siege"
      ? (report.attackerWon ? `${S.josa(S.forceName(state, A.force), "이", "가")} ${S.forceName(state, D.force)}의 ${S.josa(where, "을", "를")} 함락했습니다. (${b.day}일)`
        : outcome === "allied" ? `${S.forceName(state, A.force)}이 동맹의 땅이 된 ${where}에서 물러났습니다.`
        : `${S.forceName(state, A.force)}의 ${where} 공격이 실패했습니다. (${b.day}일)`)
      : (report.attackerWon ? `${S.forceName(state, A.force)}이 ${where} 앞에서 ${S.forceName(state, D.force)}의 요격을 물리쳤습니다.`
        : `${S.forceName(state, D.force)}이 ${where} 앞에서 ${S.forceName(state, A.force)}을 요격해 물리쳤습니다.`);
    S.addLog(state, text, report.attackerWon ? "war" : "warfail");
    // Computer forces let go of captives who will never serve them.
    if (A.force !== state.playerForce && report.captured.length) {
      const lead = crewOf(state, A.officers, A.force)[0];
      for (const pid of report.captured) {
        const p = state.officers[pid];
        if (lead && p.status === "captive" && S.recruitChance(state, lead, p) === 0) S.release(state, p.city, pid);
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
      if (out) finish(state, b, out, onEvent);
      if (S.checkOver(state)) return;
    }
  };

  // An army reached its target (called from the march rules).
  S.fight = function (state, m) {
    return S.startSiege(state, m);
  };
})(globalThis.SAM = globalThis.SAM || {});
