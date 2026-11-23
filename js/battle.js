// Battles that last for days. Every army that reaches an enemy city or
// stronghold lays siege to it; there are no battles on the road. An army
// that crosses a great river or the sea may first have to fight its way
// ashore against the defenders' ships (상륙). Each day the
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
  S.BATTLE_RATE = { siege: 0.025, field: 0.07 };
  S.SIEGE_MAX_DAYS = 120;
  // The besiegers give up below this share of their men, or this morale.
  S.SIEGE_BREAK = { troops: 0.5, morale: 30 };
  S.HOME_GROUND = 1.15; // a relief army fights on ground it knows

  // Links of the network on the water: an army that comes this way must land
  // (상륙). The great river and the sea are crossed only from port to port
  // (js/forts.js, S.PORT_WATERS); every other road is on land (the 한수 at
  // 번성 included, by the user's choice).
  S.isWater = (a, b) => S.isPortLink(a, b);
  // Sea routes.
  S.isSea = (a, b) => S.portWaters(a, b) === "sea";
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

  // ---------- the wounded (부상병) ----------
  // Part of every side's losses are wounded, not dead. They heal back into
  // soldiers month by month, faster the better they are cared for:
  //   fast - treated in a city at once (the garrison's own, or those who
  //          surrendered there)
  //   mid  - brought home with an army that still holds together
  //   slow - straggling home on their own
  // 의술 (medicine) speeds every kind. How a battle ends decides who
  // surrenders, who flees and who is lost (see finish and capture).
  //   share: of losses that are wounded; lost: wounded who die when a
  //   beaten side flees without care; yieldT/yieldW: the share of soldiers /
  //   wounded who give themselves up when a side breaks; heal: the share of
  //   a pool healed each month
  S.WOUNDED = { share: 0.4, lost: 0.3, yieldT: 0.2, yieldW: 0.3, fallT: 0.35, fallW: 0.35, gone: 0.3,
    heal: { fast: 0.5, mid: 0.3, slow: 0.15 } };
  S.WOUND_CARE = { fast: "성안 치료", mid: "귀환 부대", slow: "따로 이동" };
  // Add n wounded of a unit (an id or a mix) to a {n, unit} bundle.
  function addW(w, n, unit) {
    n = Math.round(n);
    if (n <= 0) return w && w.n > 0 ? w : null;
    return w && w.n > 0 ? { n: w.n + n, unit: S.blend(w.unit, w.n, unit, n) } : { n, unit: S.mixOf(unit) };
  }
  S.addW = addW;
  // A side in battle takes wounded among its losses.
  const hurt = (side, n, unit) => { side.wounded = addW(side.wounded, n * S.WOUNDED.share, unit); };
  S.addWounded = function (p, care, n, unit) {
    p.wounded = p.wounded || {};
    p.wounded[care] = addW(p.wounded[care], n, unit);
  };
  S.woundedIn = (p) => Object.values((p && p.wounded) || {}).reduce((s, w) => s + (w ? w.n : 0), 0);
  // Take a share of every pool out of a place, as one bundle.
  function takeWounded(p, share) {
    let out = null;
    for (const k of Object.keys(p.wounded || {})) {
      const w = p.wounded[k];
      if (!w || !w.n) continue;
      const n = Math.round(w.n * share);
      out = addW(out, n, w.unit);
      w.n -= n;
      if (w.n <= 0) p.wounded[k] = null;
    }
    return out;
  }
  const part = (w, share) => (w && w.n ? { n: Math.round(w.n * share), unit: w.unit } : null);
  const rest = (w, share) => (w && w.n ? { n: w.n - Math.round(w.n * share), unit: w.unit } : null);
  // 의술: how much faster the owner's wounded heal.
  S.healMul = (state, fid) => 1 + (fid && S.TECH.medicine ? S.techBonus(state, fid, "medicine") * S.TECH.medicine.per : 0);
  // Once a month the wounded heal back into the garrison.
  S.healMonth = function (state) {
    for (const p of Object.values(state.cities).concat(Object.values(state.forts || {}))) {
      if (!p.wounded) continue;
      for (const k of Object.keys(p.wounded)) {
        const w = p.wounded[k];
        if (!w || !w.n) { p.wounded[k] = null; continue; }
        const n = w.n < 30 ? w.n : Math.round(w.n * Math.min(0.95, S.WOUNDED.heal[k] * S.healMul(state, p.owner)));
        if (p.owner) S.addTroops(p, w.unit, n);
        w.n -= n;
        if (w.n <= 0) p.wounded[k] = null;
      }
    }
  };
  // Wounded sent off on their own (or with the remnant of a broken garrison) to an own place.
  function sendWounded(state, force, path, w, care) {
    if (!w || w.n <= 0 || !path) return;
    const linked = path.length > 2 || S.links(state, path[0]).includes(path[1]);
    S.launch(state, { kind: "wounded", force, path, km: linked ? S.pathKm(state, path) : S.nodeKm(state, path[0], path[1]), speed: "army",
      officers: [], troops: 0, wounded: w, care, origin: path[0], target: path[path.length - 1] });
  }
  // The nearest own city a beaten garrison can flee to.
  function refuge(state, fid, from) {
    const near = S.links(state, from).filter((n) => state.cities[n] && state.cities[n].owner === fid);
    if (near.length) return near[0];
    const here = S.place(state, from);
    const own = S.citiesOf(state, fid).filter((c) => c.id !== from);
    if (!own.length) return null;
    return own.reduce((a, b) => (Math.hypot(b.x - here.x, b.y - here.y) < Math.hypot(a.x - here.x, a.y - here.y) ? b : a)).id;
  }


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
    // A day's food, dearer the rougher the road it comes by and the farther
    // it is hauled overland from where the army set out (S.HAUL).
    if (A.haul == null) A.haul = S.haulMul(S.landDays(state, A.path));
    const need = S.fieldFood(A.troops, 1, A.path ? S.pathRough(state, A.path) : 1) * A.haul * (1 - S.AID.ox * S.aidOf(A.unit).ox);
    // Fed from the supply base: the last own city on the road (js/war.js).
    const home = S.place(state, A.base || A.origin);
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
      if (old.landing) old.landing.a0 += m.troops;
      if (m.ships && m.shipPort) S.returnShips(state, m.force, m.shipPort, m.ships, m.shipMix); // they unload behind the lines
      hold(state, old, ids);
      say(old, `${S.forceName(state, m.force)} 원군 ${S.unitName(m.unit)} ${m.troops}명이 도착해 포위에 가세했습니다.`);
      return old;
    }
    const atk = crewOf(state, ids, m.force);
    const defs = S.serving(state, m.target).filter((o) => o.force === t.owner);
    const b = newBattle(state, {
      kind: "siege", place: m.target, x: t.x, y: t.y, from: S.placeName(state, m.origin),
      att: { force: m.force, officers: ids, troops: m.troops, troops0: m.troops, unit: m.unit, train: m.train, morale: startMorale(atk) + S.houseMorale(state, m.force, m.target),
        rations: m.troops / 10, supply: newSupply(), origin: m.origin, path: m.path, base: m.base || m.origin, campaign: m.campaign || null, corps: m.corps || 1,
        ships: m.ships || 0, shipPort: m.shipPort || null, shipMix: m.shipMix || null },
      def: { force: t.owner, troops0: Math.max(1, t.troops), morale: startMorale(defs) },
    });
    hold(state, b, ids);
    if (S.intelReveal) S.intelReveal(state, m.force, m.target); // the walls are in plain sight now
    b.att.fortune = fortune(state);
    say(b, `${S.forceName(state, m.force)} ${S.unitName(m.unit)} ${m.troops}명이 ${t.name}(${S.forceName(state, t.owner)}, 수비 ${S.unitName(S.garrisonUnit(t))} ${t.troops}명)${S.landingLink(m.path) ? "에 물길로 다다랐습니다" : "을 에워쌌습니다"}.`);
    if (t.troops <= 0 && !defs.length) { say(b, `${t.name}에는 지키는 병사가 없습니다.`); b.ending = "capture"; }
    else if (!(S.landingLink(m.path) && startLanding(state, b, t, atk))) duel(state, b, atk, defs, (side) => { b[side].morale -= 15; });
    return b;
  };

  // ---------- landing (상륙) ----------
  // An army that comes over a great river or the sea must first get ashore.
  // If the defenders' ships are the stronger, they put out with all the men
  // they can spare and fight on the water, where only the ships (몽충, 투함,
  // 누선, fire ships) and the naval specialists (수전) who lead them count; the
  // kind of soldier aboard does not matter. Thrown back, the army goes home;
  // once ashore it lays siege as usual. Weaker on the water, the defenders
  // stay behind their walls and let it land.
  // why: 유수구 kept 위 off the Yangzi for decades, while 오 crossing the
  // other way to 합비 landed freely and broke on its walls. The northern men
  // at 적벽 were sick and unsteady on the river.
  //   share: of the garrison that puts out; favour/keen: the edge on the water
  //   the defenders want before they do (on their own / told to strike out);
  //   rate: daily losses; days: the longest the fight on the water lasts;
  //   skill: 수전 on the water; green: men in 몽충, with no naval leader nor
  //   shipwrights, who are not at home on the water; fail/beaten: the share of the attackers / of
  //   the defenders' fleet left when that side gives up; broken: morale
  S.LANDING = { share: 0.8, min: 1000, favour: 1, keen: 0.8, rate: 0.06, days: 8, skill: 1.2, green: 0.75, fail: 0.65, beaten: 0.5, broken: 40 };
  // Whether a march ends by crossing water.
  S.landingLink = (path) => !!path && path.length >= 2 && S.isWater(path[path.length - 2], path[path.length - 1]);
  // Men a force can put on the water where it has no port, by its level of
  // 조선: the boats it can gather on the shore. The rest wait on the bank and
  // cross once the landing is won.
  S.FERRY = { 1: 8000, 2: 15000, 3: 25000 };
  S.ferryOf = (state, fid) => S.FERRY[Math.min(3, S.lineLevel ? S.lineLevel(state, fid, "navy") : 1)] || S.FERRY[1];
  // Of an army crossing by this road, how many fight on the water: from an
  // own port, as many as its ships carry; elsewhere, what the force can ferry.
  S.waterMen = function (state, path, force, troops) {
    const p = state.forts && state.forts[path[path.length - 2]];
    if (p && p.kind === "port") return Math.min(troops, p.owner === force ? p.ships || 0 : 0);
    return Math.min(troops, S.ferryOf(state, force));
  };
  // Who meets a crossing: a port's men and its city's, as many as the port's
  // ships carry; elsewhere the garrison, as many as the force can ferry.
  //   pool: the men they could put out; cap: the most the boats carry
  function shoreGuard(state, t) {
    const home = t.kind === "port" ? state.cities[t.home] : null;
    const withHome = !!home && !!t.owner && home.owner === t.owner;
    const mine = (id) => S.serving(state, id).filter((o) => o.force === t.owner);
    return {
      home: withHome ? home : null,
      pool: t.troops + (withHome ? home.troops : 0),
      defs: mine(t.id).concat(withHome ? mine(home.id) : []),
      cap: t.kind === "port" ? t.ships || 0 : t.owner ? S.ferryOf(state, t.owner) : 0,
    };
  }
  S.shoreGuard = shoreGuard;
  // ---------- 요격 (a fleet passing a hostile port) ----------
  // A fleet sailing from port to port passes the ports between (S.portsPassed).
  // The day it passes one held by a force not at peace with it, that port's
  // fleet may come out (as it would meet a landing: S.landingOdds) and fight
  // it for days of the voyage (losing at most most of its men); the fleet
  // then sails on with what is left.
  // why: the user's design. A river held by the enemy cannot simply be
  // sailed past (적벽, 하구).
  S.INTERCEPT = { days: 2, most: 0.6 };
  const hostilePort = (state, p, fid) => p && p.built && p.kind === "port" && p.owner && p.owner !== fid &&
    !S.allied(state, fid, p.owner) && !S.truceLeft(state, fid, p.owner) &&
    !(S.rel(state, fid, p.owner) >= 70 && !S.atWarWith(state, fid, p.owner)) && (p.ships || 0) > 0 && p.troops > 0;
  S.runIntercepts = function (state) {
    const now = S.today(state);
    for (const m of state.marches || []) {
      if (!(m.troops > 0) || !m.path || m.path.length < 2 || m.arrive <= m.start) continue;
      const gone = (m.skip || 0) + ((now - m.start) / (m.arrive - m.start)) * m.km;
      let at = 0;
      for (let i = 1; i < m.path.length; i++) {
        const a = m.path[i - 1], b = m.path[i];
        const leg = S.legKm(state, a, b);
        if (S.isPortLink(a, b)) {
          for (const pass of S.portsPassed(a, b)) {
            if ((m.passed || []).includes(pass.id) || gone < at + leg * pass.at) continue;
            m.passed = (m.passed || []).concat([pass.id]);
            const p = S.place(state, pass.id);
            if (hostilePort(state, p, m.force)) intercept(state, m, p);
          }
        }
        at += leg;
      }
    }
  };
  function intercept(state, m, p) {
    const crew = crewOf(state, m.officers, m.force);
    const odds = S.landingOdds(state, p.id, m.force, crew, m.troops, m.train || 50, 100, m.troops, m.shipMix ? { fleet: m.shipMix } : null);
    if (!odds.commit) return;
    const g = shoreGuard(state, p);
    const rnd = () => 0.8 + S.rand(state) * 0.4;
    const aPow = navalPower(state, m.force, m.troops, crew, 30, m.train || 50, odds.aFleet, odds.dFleet, 100);
    const dPow = navalPower(state, p.owner, odds.dTroops, g.defs, 40, p.train, odds.dFleet, odds.aFleet, 100);
    const I = S.INTERCEPT;
    const lossA = Math.min(Math.floor(m.troops * I.most), Math.round(dPow * S.LANDING.rate * I.days * rnd()));
    const lossD = Math.min(odds.dTroops, Math.round(aPow * S.LANDING.rate * I.days * rnd()));
    m.troops -= lossA;
    m.wounded = addW(m.wounded, lossA * S.WOUNDED.share, m.unit || S.DEFAULT_UNIT);
    if (m.ships) m.ships = Math.max(0, m.ships - lossA);
    shoreLoss(state, p, g, lossD);
    const fName = S.forceName(state, m.force), pName = S.forceName(state, p.owner);
    const mine = m.force === state.playerForce || p.owner === state.playerForce;
    if (mine || lossA >= 1000) S.addLog(state, `요격: ${p.name}의 ${pName} 함대가 지나가던 ${fName} 함대를 덮쳤습니다. ${fName} -${lossA}, ${pName} -${lossD}.`,
      m.force === state.playerForce ? "warn" : p.owner === state.playerForce ? "sys" : "info");
    if (S.intelReveal) S.intelReveal(state, m.force, p.id); // the fleet has seen the port's ships
  }
  // Losses on the water: a port's men first, then its city's; ships too.
  function shoreLoss(state, t, g, n) {
    const here = Math.min(n, t.troops);
    S.loseTroops(t, here);
    if (g.home && n > here) S.loseTroops(g.home, Math.min(g.home.troops, n - here));
    if (t.kind === "port") S.takeShips(t, n);
  }
  // The attackers' ships that are left sail home.
  function shipsHome(state, b) {
    const A = b.att;
    if (A.ships > 0 && A.shipPort) S.returnShips(state, A.force, A.shipPort, A.ships, A.shipMix);
    A.ships = 0;
  }
  // A side's strength on the water: its men, its leaders, its ships (a mix
  // of kinds, js/ships.js). Crews with no naval leader of a force without
  // 조선 2단계 are not at home on the water (green).
  S.greenCrew = (state, fid, list) => !has(list, "수전") && (S.lineLevel ? S.lineLevel(state, fid, "navy") : 1) < 2;
  function navalPower(state, fid, troops, list, fallback, train, fleet, foeFleet, morale) {
    return S.power(troops, S.sideStats(list, fallback), train, 1) * S.unitMul(fleet, foeFleet, "water", 1) * (has(list, "수전") ? S.LANDING.skill : 1) *
      (fid && S.greenCrew(state, fid, list) ? S.LANDING.green : 1) * moraleMul(morale);
  }
  // Whether the defenders of a place would meet a crossing army on the water.
  //   ratio: their strength on the water against the attackers'
  //   onWater: the attackers on the water (S.waterMen); aw in the result
  //   view: how the one judging sees each side, as multipliers
  //     {d, dq} on the defenders' men and strength, {a, aq} on the attackers'
  S.landingOdds = function (state, targetId, force, officers, troops, train, morale, onWater, view) {
    const v = Object.assign({ d: 1, dq: 1, a: 1, aq: 1 }, view);
    const t = S.place(state, targetId);
    const g = shoreGuard(state, t);
    const defs = g.defs;
    const aw = Math.max(0, Math.floor(onWater == null ? Math.min(troops, S.ferryOf(state, force)) : Math.min(troops, onWater)));
    // The ships: the attackers' as they sailed (v.fleet), else the force's
    // fleet as a whole; the defenders' those of the port.
    const aFleet = v.fleet || S.forceShipMix(state, force);
    const dFleet = S.shipMix(t);
    const dTroops = Math.floor(Math.min(g.cap, g.pool * S.LANDING.share));
    const a = navalPower(state, force, aw * v.a, officers, 30, train, aFleet, dFleet, morale == null ? 100 : morale) * v.aq;
    const d = navalPower(state, t.owner, dTroops * v.d, defs, 40, t.train, dFleet, aFleet, 100) * v.dq;
    const ratio = a > 0 ? d / a : 99;
    const policy = S.defensePolicy(state, targetId);
    const need = policy === "intercept" ? S.LANDING.keen : S.LANDING.favour;
    const commit = !!t.owner && policy !== "hold" && dTroops >= S.LANDING.min && ratio >= need;
    return { commit, ratio, aFleet, dFleet, dTroops, aw, view: v };
  };
  // How a landing would likely go, without the luck: for the attack window
  // and the computer's plans. The defenders are as the attacker believes
  // them to be (js/intel.js), so a plan can be badly wrong.
  //   pass: whether the army gets ashore; left: its men then; lostD: the
  //   defenders lost on the water
  S.landingForecast = function (state, targetId, force, officers, troops, train, onWater) {
    const t = S.place(state, targetId);
    const view = S.seenTroops && t.troops > 0 ? { d: S.seenTroops(state, force, t) / t.troops, dq: S.seenFleet(state, force, t) } : null;
    const o = S.landingOdds(state, targetId, force, officers, troops, train, 100, onWater, view);
    if (!o.commit) return Object.assign(o, { pass: o.aw > 0, left: o.aw > 0 ? troops : 0, lostD: 0 });
    const defs = shoreGuard(state, t).defs;
    const ashore = troops - o.aw; // waiting on the bank
    o.dTroops = Math.round(o.dTroops * o.view.d); // as believed
    let a = o.aw, d = o.dTroops, am = 100, dm = 100;
    for (let day = 1; ; day++) {
      const aPow = navalPower(state, force, a, officers, 30, train, o.aFleet, o.dFleet, am);
      const dPow = navalPower(state, t.owner, d, defs, 40, t.train, o.dFleet, o.aFleet, dm) * o.view.dq;
      const lossD = Math.min(d, aPow * S.LANDING.rate), lossA = Math.min(a, dPow * S.LANDING.rate);
      a -= lossA; d -= lossD;
      am += swing(lossA, lossD, 8); dm += swing(lossD, lossA, 8);
      const failed = a < o.aw * S.LANDING.fail || am <= S.LANDING.broken;
      const beaten = d < o.dTroops * S.LANDING.beaten || dm <= S.LANDING.broken;
      if (failed && !beaten) return Object.assign(o, { pass: false, left: Math.round(a + ashore), lostD: Math.round(o.dTroops - d) });
      if (beaten || day >= S.LANDING.days) return Object.assign(o, { pass: beaten || aPow >= dPow, left: Math.round(a + ashore), lostD: Math.round(o.dTroops - d) });
    }
  };
  function startLanding(state, b, t, atk) {
    const A = b.att;
    // The defenders judge the fleet by one look as it comes (js/intel.js).
    const look = S.sizeUpFleet && t.owner ? S.sizeUpFleet(state, t.owner, b.place, A.force, (state.year * 12 + state.month) * 31 + (state.day || 0)) : null;
    const odds = S.landingOdds(state, b.place, A.force, atk, A.troops, A.train, A.morale, A.shipPort ? A.ships : S.waterMen(state, A.path, A.force, A.troops),
      Object.assign(look ? { a: look.t, aq: look.q } : {}, A.shipMix ? { fleet: A.shipMix } : {}));
    if (!odds.commit) {
      shipsHome(state, b);
      if (t.owner) say(b, `${S.josa(S.forceName(state, t.owner), "은", "는")} 물가를 지키지 않고 성에 틀어박혔습니다. ${S.josa(S.forceName(state, A.force), "이", "가")} 무사히 뭍에 올랐습니다.`);
      return false;
    }
    b.landing = { day: 0, a0: A.troops, aw: odds.aw, aw0: odds.aw, troops: odds.dTroops, troops0: odds.dTroops, aFleet: odds.aFleet, dFleet: odds.dFleet };
    say(b, `${S.forceName(state, t.owner)}의 ${S.unitName(odds.dFleet)} 함대 ${odds.dTroops}명이 물 위로 나와 상륙을 막아섭니다! ` +
      `(${S.forceName(state, A.force)}은 ${S.unitName(odds.aFleet)} ${odds.aw}명${odds.aw < A.troops ? `, 나머지 ${A.troops - odds.aw}명은 물가에서 기다립니다` : ""})`);
    return true;
  }
  // One day on the water. Returns "retreat" when the attackers give up.
  function landingDay(state, b, t, atk, defs) {
    const A = b.att, D = b.def, L = b.landing;
    L.day++;
    if (L.aw == null) L.aw = L.aw0 = A.troops; // a save from before
    const g = shoreGuard(state, t);
    const R = b.relief;
    if (!R) L.rel = 0;
    defs = g.defs.concat(L.rel ? crewOf(state, R.officers, R.force) : []);
    L.troops = Math.min(L.troops, g.pool + (L.rel || 0));
    L.aw = Math.min(L.aw, A.troops);
    const rnd = () => 0.8 + S.rand(state) * 0.4;
    const aPow = navalPower(state, A.force, L.aw, atk, 30, A.train, L.aFleet, L.dFleet, A.morale);
    const dPow = navalPower(state, D.force, L.troops, defs, 40, t.train, L.dFleet, L.aFleet, D.morale);
    let lossD = Math.round(aPow * S.LANDING.rate * rnd());
    let lossA = Math.round(dPow * S.LANDING.rate * rnd());
    const aSide = { force: A.force, troops: L.aw, morale: A.morale };
    const dSide = { force: D.force, troops: L.troops, morale: D.morale };
    lossD += fireShips(state, b, atk, defs, aSide, dSide, L.dFleet);
    lossA += fireShips(state, b, defs, atk, dSide, aSide, L.aFleet);
    A.morale = aSide.morale;
    D.morale = dSide.morale;
    lossD = Math.min(L.troops, lossD);
    lossA = Math.min(L.aw, lossA);
    const gu = S.garrisonUnit(t);
    // The relief men aboard take their share of the losses.
    const lossR = L.rel ? Math.min(L.rel, R.troops, Math.round(lossD * L.rel / Math.max(1, L.troops))) : 0;
    L.troops -= lossD;
    if (lossR) {
      L.rel -= lossR;
      R.troops -= lossR;
      b.killedR = (b.killedR || 0) + lossR;
      hurt(R, lossR, R.unit);
      if (t.kind === "port") S.takeShips(t, lossR);
    }
    shoreLoss(state, t, g, lossD - lossR);
    L.aw -= lossA;
    A.troops -= lossA;
    if (A.shipPort) A.ships = Math.max(0, (A.ships || 0) - lossA);
    b.killedA = (b.killedA || 0) + lossA;
    b.killedD = (b.killedD || 0) + lossD;
    hurt(A, lossA, A.unit);
    S.addWounded(t, "fast", lossD * S.WOUNDED.share, gu);
    A.morale += swing(lossA, lossD, 8);
    D.morale += swing(lossD, lossA, 8);
    say(b, `상륙 ${L.day}일째: 공격 함대 -${lossA} (${L.aw}), 수비 함대 -${lossD} (${L.troops})`);
    const failed = L.aw < L.aw0 * S.LANDING.fail || A.morale <= S.LANDING.broken;
    const beaten = L.troops < L.troops0 * S.LANDING.beaten || D.morale <= S.LANDING.broken;
    if (failed && !beaten) {
      say(b, `상륙 실패! ${S.josa(S.forceName(state, A.force), "이", "가")} 뭍에 오르지 못하고 뱃머리를 돌립니다.`);
      if (S.willSetback) S.willSetback(state, A.force, D.force, "landing");
      shipsHome(state, b);
      b.broke = "morale";
      return "retreat";
    }
    if (beaten || (L.day >= S.LANDING.days && aPow >= dPow)) {
      say(b, `상륙 성공! ${S.forceName(state, D.force)}의 함대가 성으로 물러났습니다. ${S.josa(S.forceName(state, A.force), "이", "가")} ${S.josa(t.name, "을", "를")} 에워쌉니다.`);
      b.landing = null;
      shipsHome(state, b);
      return null;
    }
    if (L.day >= S.LANDING.days) {
      say(b, `상륙 실패! 며칠을 싸워도 물길을 열지 못해 ${S.josa(S.forceName(state, A.force), "이", "가")} 물러납니다.`);
      if (S.willSetback) S.willSetback(state, A.force, D.force, "landing");
      shipsHome(state, b);
      b.broke = "morale";
      return "retreat";
    }
    return null;
  }


  // The besiegers' fortune (기세): weather, the lie of the land, the spirit
  // of the camp, all that no one can count beforehand. Drawn once a siege,
  // it sharpens or blunts the besiegers' blows and the defenders' answer
  // every day, so even a much stronger army may stall before the walls.
  // Now and then (turn: % a day) the tide turns and it is drawn anew.
  S.FORTUNE = { spread: 0.5, low: 0.45, high: 2, turn: 4 };
  function fortune(state) {
    const g = (S.rand(state) + S.rand(state) + S.rand(state) - 1.5) * 2; // about normal
    return clamp(Math.exp(g * S.FORTUNE.spread), S.FORTUNE.low, S.FORTUNE.high);
  }
  // Sickness in a crowded camp, more likely the longer and larger the siege.
  // why: 조조's army at 적벽, and 손권's before 합비, were broken as much by
  // sickness as by the enemy.
  S.PLAGUE = { chance: 0.3, long: 20, big: 30000, kill: [0.1, 0.2], morale: 20 };
  // 의술 keeps sickness down (it will count against plague years too).
  S.plagueMul = (state, fid) => 1 - (S.TECH.medicine ? S.techBonus(state, fid, "medicine") * S.TECH.medicine.plague : 0);
  function plagueDay(state, b) {
    const A = b.att;
    if (b.plague) return;
    const pct = S.PLAGUE.chance * (b.day > S.PLAGUE.long ? 2 : 1) * (A.troops > S.PLAGUE.big ? 1.5 : 1) * S.plagueMul(state, A.force);
    if (!S.chance(state, pct)) return;
    b.plague = true;
    const [lo, hi] = S.PLAGUE.kill;
    const loss = Math.round(A.troops * (lo + S.rand(state) * (hi - lo)));
    A.troops -= loss;
    A.morale -= S.PLAGUE.morale;
    b.killedA = (b.killedA || 0) + loss;
    hurt(A, loss, A.unit);
    say(b, `포위군 진영에 역병이 돌았습니다! ${S.forceName(state, A.force)} ${loss}명이 쓰러지고 사기가 떨어집니다.`);
  }

  function siegeDay(state, b) {
    const t = S.place(state, b.place);
    const A = b.att;
    b.day++;
    if (b.ending) return b.ending;
    if (t.owner === A.force) return "joined";
    if (t.owner && (S.allied(state, A.force, t.owner) || (S.truceLeft && S.truceLeft(state, A.force, t.owner)))) return "allied";
    if (t.owner !== b.def.force) {
      b.def = { force: t.owner, troops0: Math.max(1, t.troops), morale: 100 };
      say(b, `${S.josa(t.name, "은", "는")} 이제 ${S.forceName(state, t.owner)}의 땅입니다. 포위를 이어 갑니다.`);
      b.landing = null;
      if (b.relief && b.relief.force !== t.owner) endRelief(state, b, "home");
    }
    const atk = crewOf(state, A.officers, A.force);
    const defs = S.serving(state, b.place).filter((o) => o.force === t.owner);
    if (t.troops <= 0 && !defs.length) { b.fell = "rout"; return "capture"; }
    if (b.landing) {
      const out = landingDay(state, b, t, atk, defs);
      feedBesiegers(state, b);
      return out;
    }
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
    const aPow = S.power(A.troops, S.sideStats(atk, 30), A.train, 1) * S.unitMul(A.unit, gu, "siegeA", 1) * moraleMul(A.morale) * split * (staked ? S.STAKES.blunt : 1) * (A.fortune || 1);
    const dPow = S.power(t.troops, S.sideStats(defs, t.owner ? 40 : 35), t.train, wb) * S.unitMul(gu, A.unit, "siegeD", 1) * moraleMul(b.def.morale) * S.houseDefense(t, state) * S.gearSuppress(gear) / (A.fortune || 1);
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
    hurt(A, lossA, A.unit);
    S.addWounded(t, "fast", lossD * S.WOUNDED.share, gu);
    sortieDay(state, b, t, atk, defs);
    plagueDay(state, b);
    let turned = false;
    if (b.day > 1 && S.chance(state, S.FORTUNE.turn)) { A.fortune = fortune(state); turned = true; }
    if ((b.day === 1 || turned) && A.fortune < 0.8) say(b, `${turned ? "전황이 바뀌었습니다. " : ""}${S.forceName(state, A.force)}의 진영이 어수선합니다. 공격이 좀처럼 먹혀들지 않습니다.`);
    else if ((b.day === 1 || turned) && A.fortune > 1.25) say(b, `${turned ? "전황이 바뀌었습니다. " : ""}${S.forceName(state, A.force)}의 기세가 드높습니다.`);
    else if (turned) say(b, `전황이 바뀌어 양쪽이 팽팽해졌습니다.`);
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
    // How each side breaks decides who surrenders and who flees: the
    // garrison spent (rout) or its heart broken behind a broken wall (breach);
    // the besiegers bled white (rout) or lost heart (morale).
    if (t.troops <= 0 || t.troops < b.def.troops0 * 0.15) { b.fell = "rout"; return "capture"; }
    if (b.def.morale <= 20) { b.fell = "breach"; return "capture"; }
    if (A.troops < A.troops0 * S.SIEGE_BREAK.troops) { b.broke = "rout"; return "retreat"; }
    if (A.morale <= S.SIEGE_BREAK.morale) { b.broke = "morale"; return "retreat"; }
    if (b.day >= S.SIEGE_MAX_DAYS) return "retreat";
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
      hurt(A, lost, A.unit);
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
        b.broke = "morale";
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
    hurt(A, kill, A.unit);
    S.addWounded(t, "fast", lost * S.WOUNDED.share, unit);
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
    const tallShare = S.mixOf(foeFleet).louchuan || 0;
    const tall = tallShare >= 0.5;
    const loss = Math.round(foe.troops * S.FIRESHIP.loss * (1 + (S.FIRESHIP.tall - 1) * tallShare));
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
    say(b, `${t.name} 함락! ${S.josa(S.forceName(state, A.force), "이", "가")} ${fort ? S.FORT_KINDS[t.kind] : "성"}을 차지했습니다.`);
    // In the emperor's city the 한조파 give themselves up (js/hanplot.js).
    const hanGave = !fort && S.hanSurrender ? S.hanSurrender(state, b.place, defForce, A.force) : [];
    if (hanGave.length) {
      report.hanJoined = hanGave.map((o) => o.id);
      say(b, `한조파 ${S.josa(hanGave.map((o) => o.name).join(", "), "이", "가")} 항복해 합류했습니다.`);
    }
    const defs = S.serving(state, b.place).filter((o) => o.force === defForce);
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
    // The garrison: some give themselves up, some flee to a city of their
    // own if one is left, some are lost. Spent to the last (rout), the
    // wounded who can flee go on their own; broken behind a broken wall
    // (breach), more go over and the rest flee together.
    const W = S.WOUNDED;
    const remainingD = Math.max(0, t.troops);
    const dUnit = S.garrisonUnit(t);
    const dW = takeWounded(t, 1);
    const flee = defForce ? refuge(state, defForce, b.place) : null;
    let stay, stayW;
    if (b.fell === "breach") {
      stay = Math.round(remainingD * W.fallT);
      stayW = part(dW, W.fallW);
      const run = addW(rest(dW, W.fallW), remainingD - stay, dUnit);
      if (flee && run) {
        sendWounded(state, defForce, [b.place, flee], run, "mid");
        say(b, `수비군 ${run.n}명이 부상병과 뒤섞여 ${S.ro(S.placeName(state, flee))} 달아났습니다.`);
      }
    } else {
      stay = Math.floor(remainingD * 0.3);
      const left = rest(dW, W.lost);
      if (dW && dW.n) say(b, `미처 옮기지 못한 부상병 ${dW.n - (left ? left.n : 0)}명이 목숨을 잃었습니다.`);
      if (flee) {
        sendWounded(state, defForce, [b.place, flee], left, "slow");
        if (left && left.n) say(b, `부상병 ${left.n}명이 ${S.ro(S.placeName(state, flee))} 피난합니다.`);
        stayW = null;
      } else stayW = left;
    }
    const gave = [stay > 0 && `수비군 ${stay}명`, stayW && stayW.n > 0 && `부상병 ${stayW.n}명`].filter(Boolean);
    if (gave.length) say(b, `${gave.join("과 ")}이 투항했습니다.`);
    // Remembered so the loser wants it back (js/ai.js, S.wantsTarget).
    t.lost = defForce ? { fid: defForce, at: S.monthsElapsed(state) } : null;
    t.owner = A.force;
    t.posts = S.emptyPosts();
    if (!fort) {
      t.unrest = null;
      t.cut = 0;
      if (defForce && S.conquestGentry) S.conquestGentry(state, A.force);
    }
    t.unit = S.blend(A.unit, A.troops, dUnit, stay);
    t.troops = A.troops + stay;
    t.retainers = fort ? 0 : Math.min(stay, Math.floor(remainingD * 0.3));
    t.wounded = null;
    if (A.wounded) S.addWounded(t, "fast", A.wounded.n, A.wounded.unit);
    if (stayW) S.addWounded(t, "fast", stayW.n, stayW.unit);
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
    if (S.afterCapture) S.afterCapture(state, t, b); // press on, or go home (js/war.js)
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
    const food = S.marchFood(troops, days, S.pathRough(state, way.path), S.landDays(state, way.path, speed));
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
      b.relief = { force: m.force, officers: ids, troops: m.troops, troops0: m.troops, unit: m.unit, train: m.train, morale: startMorale(rel), origin: m.origin, path: m.path, corps: m.corps || 1 };
    }
    hold(state, b, ids);
    say(b, `${S.forceName(state, m.force)} 원군 ${S.unitName(m.unit)} ${m.troops}명이 ${S.placeName(state, m.origin)}에서 달려왔습니다!`);
    // A fight on the water: as many as the ships can still carry go aboard.
    const L = b.landing;
    if (L) {
      const room = Math.max(0, shoreGuard(state, S.place(state, b.place)).cap - L.troops);
      const n = Math.min(room, b.relief.troops - (L.rel || 0));
      if (n > 0) {
        L.rel = (L.rel || 0) + n;
        L.troops += n;
        L.troops0 += n;
        say(b, `원군 ${n}명이 배에 올라 수비 함대에 합류합니다.${n < m.troops ? ` (배가 모자라 ${m.troops - n}명은 뭍에서 기다립니다)` : ""}`);
      } else say(b, `배가 모자라 원군은 뭍에서 기다립니다.`);
    }
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
    hurt(A, lossA, A.unit);
    hurt(R, lossR, R.unit);
    A.morale += swing(lossA, lossR, 4);
    R.morale += swing(lossR, lossA, 6);
    b.reliefLine = `원군 -${lossR} (${R.troops}), 포위군 -${lossA}`;
    raid(state, b, R, rel, A, atk, true);
    if (R.troops < R.troops0 * 0.4 || R.morale <= 30) {
      if (S.reliefBeaten) S.reliefBeaten(state, b); // a main army beaten in the field (js/war.js)
      endRelief(state, b, "beaten");
    }
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
      if (R.wounded) S.addWounded(home, "fast", R.wounded.n, R.wounded.unit);
      for (const o of crewOf(state, R.officers, R.force)) o.city = b.place;
      S.officersMoved(state);
      return;
    }
    S.launch(state, { kind: "return", force: R.force, path: R.path.slice().reverse(), speed: S.unitSpeed(R.unit),
      officers: crewOf(state, R.officers, R.force).map((o) => o.id), troops: R.troops, unit: R.unit, train: R.train, wounded: R.wounded, care: "mid", origin: b.place, target: R.origin });
  }

  // Computer forces decide whether to send relief to a besieged place: when
  // relief and garrison together outnumber the besiegers, or when a raid on
  // the besiegers' supply has a fair chance within a couple of weeks.
  // n: only the places and cities of that corps (a player's corps, js/corps.js).
  S.reliefAI = function (state, fid, n) {
    for (const b of state.battles || []) {
      const t = S.place(state, b.place);
      if (b.kind !== "siege" || t.owner !== fid || b.relief) continue;
      if (n && S.placeCorps(state, t) !== n) continue;
      if ((state.marches || []).some((m) => m.kind === "relief" && m.target === b.place)) continue;
      // The news of the siege must reach the seat of its corps first.
      const capId = S.corpsSeat(state, fid, S.placeCorps(state, t));
      const newsDays = capId ? Math.ceil(S.nodeKm(state, capId, b.place) / (S.WAR ? S.WAR.newsKm : 80)) : 0;
      if (S.today(state) - b.start < newsDays) continue;
      let best = null;
      for (const c of n ? S.corpsCities(state, fid, n) : S.citiesOf(state, fid)) {
        if (c.id === b.place || S.besieged(state, c.id)) continue;
        const idle = S.idle(state, c.id);
        // A main army may send all but a guard; a garrison keeps most of its men.
        const main = S.isSeatCity(state, c);
        const spare = Math.min(S.marchable(c) - Math.max(3000, Math.round(c.troops * (main ? 0.25 : 0.6))), c.troops);
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
  // The besiegers go home. Bled white (rout), they leave a part of their
  // wounded to die and send the rest home on their own; broken in heart
  // (morale, or thrown back from the shore), some give themselves up and the
  // rest go home together, wounded and all. Called off in good order, or
  // after the longest siege, all go home together.
  function retreatHome(state, b, outcome) {
    const A = b.att, t = S.place(state, b.place), W = S.WOUNDED;
    const foe = S.forceName(state, A.force);
    let troops = A.troops, w = A.wounded && A.wounded.n > 0 ? A.wounded : null;
    const home = S.place(state, A.origin);
    if (outcome === "allied" && !S.allied(state, A.force, t.owner)) {
      say(b, `${S.josa(S.forceName(state, t.owner), "과", "와")} 강화하여 포위를 풀고 물러납니다.`);
    } else if (outcome === "allied") {
      say(b, `${S.josa(S.placeName(state, b.place), "이", "가")} 동맹인 ${S.forceName(state, t.owner)}의 손에 들어가 포위를 풀고 물러납니다.`);
    } else if (b.broke === "rout") {
      const lost = part(w, W.lost);
      w = rest(w, W.lost);
      say(b, `공격 실패. ${S.josa(foe, "이", "가")} ${troops}명을 이끌고 물러납니다.` +
        (w ? ` 부상병 ${lost.n}명은 버려졌고, ${w.n}명은 따로 ${S.ro(S.placeName(state, A.origin))} 향합니다.` : ""));
      const back = home && home.owner === A.force ? A.path.slice().reverse() : null;
      const to = back ? null : refuge(state, A.force, b.place);
      sendWounded(state, A.force, back || (to && [b.place, to]), w, "slow");
      w = null;
    } else if (b.broke === "morale") {
      const giveT = Math.round(troops * W.yieldT), giveW = part(w, W.yieldW);
      if (t.owner && t.owner !== A.force) {
        S.addTroops(t, A.unit, giveT);
        if (giveW) S.addWounded(t, "fast", giveW.n, giveW.unit);
        troops -= giveT;
        w = rest(w, W.yieldW);
        say(b, `${foe} 병사 ${giveT}명${giveW && giveW.n ? `과 부상병 ${giveW.n}명` : ""}이 ${S.forceName(state, t.owner)}에 투항했습니다.`);
      }
      say(b, `공격 실패. ${S.josa(foe, "이", "가")} ${troops}명${w ? `과 부상병 ${w.n}명` : ""}을 이끌고 물러납니다.`);
    } else {
      say(b, `공격 실패. ${S.josa(foe, "이", "가")} ${troops}명${w ? `과 부상병 ${w.n}명` : ""}을 이끌고 물러납니다.`);
    }
    letGo(state, b, A.officers);
    S.sendHome(state, { officers: A.officers, force: A.force, path: A.path, target: b.place, origin: A.origin, train: A.train, unit: A.unit }, troops, w);
  }

  function finish(state, b, outcome, onEvent) {
    state.battles = state.battles.filter((x) => x !== b);
    const A = b.att, D = b.def;
    shipsHome(state, b);
    const report = { kind: b.kind, landing: !!b.landing, lines: b.log, attackerWon: false, from: b.from, to: S.placeName(state, b.place), captured: [], attacker: A.force, defender: D.force, days: b.day };
    const origin = S.place(state, A.origin || (b.march && b.march.origin));
    if (b.kind === "siege") {
      if (outcome === "capture") capture(state, b, report);
      else if (outcome === "joined") {
        say(b, `${S.josa(S.placeName(state, b.place), "은", "는")} 이미 아군의 손에 들어왔습니다. 포위군이 성에 들어갑니다.`);
        letGo(state, b, A.officers);
        const t = S.place(state, b.place);
        S.addTroops(t, A.unit, A.troops);
        if (A.wounded) S.addWounded(t, "fast", A.wounded.n, A.wounded.unit);
        for (const o of crewOf(state, A.officers, A.force)) o.city = b.place;
        S.officersMoved(state);
        report.attackerWon = true;
      } else {
        if (S.siegeFailed) S.siegeFailed(state, b); // before the relief army goes in (js/war.js)
        retreatHome(state, b, outcome);
      }
      if (b.relief) endRelief(state, b, report.attackerWon ? "home" : "enter");
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
      : b.landing ? `${S.forceName(state, A.force)}이 ${where} 앞 물 위에서 막혀 뭍에 오르지 못했습니다. (${b.day}일)`
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
