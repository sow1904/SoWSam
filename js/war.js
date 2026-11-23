// War between forces (세력전): the first step of the redesign
// (docs/redesign.md, 7장).
//
// A city keeps only a garrison, as many as its people can house and feed
// (S.garrisonCap). The force's main army (주력군) sits in the capital, which
// has no cap. Every month the cities send what gold and food they do not need
// to the capital (상납); a border city keeps a large store of grain for the
// armies that pass, and soldiers drafted beyond a city's cap march off to the
// capital. A campaign sets out from the capital, through the force's own land,
// and draws its rations from the cities on the way, the border first. It is
// waged against a force, not a city: after taking one city the army may press
// on to the next city of the same foe, or go home, as its morale, its losses
// and the weariness of the realm allow. The target hears of the army only
// when it leaves the attacker's last city on the road (a day later), so the
// defender has days, not weeks, to answer.
// why: the user's design: frontier fighting city against city never let a
// great power use its weight (no unification in 30 years of simulation).
//
// With corps (js/corps.js) all of this is per corps: "the capital" is the
// seat of the city's corps, each corps has its own main army, war and
// campaign, and an invader is met by the corps whose land he enters.
(function (S) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const W = S.WAR = {
    // The garrison a computer city keeps (S.garrisonNeed): an inner city only
    // keeps order (base + people x pop, more where order is low); a border city
    // also matches what it sees across the border: top x the largest foe's
    // garrison, rest x the others, a main army counting seat x; at least min,
    // at most max. Friendly neighbours (rel) count half.
    need: { base: 600, pop: 0.004, unrest: 40, unrestMul: 1.5, top: 0.7, rest: 0.15, seat: 0.15, min: 3000, max: 15000, rel: 70 },
    // Men the seat sends to a border city short of its garrison: when it has
    // less than short x the need, at most share of what the seat can spare,
    // at least min men, at most days away.
    reinforce: { short: 0.8, share: 0.3, min: 1000, days: 30 },
    // 귀농: a computer corps keeping more men than its gold and harvest can
    // pay for (over x what it can keep) sends share of the excess home each
    // month, from the main army; they go back to the fields and the rolls.
    discharge: { over: 1.1, share: 0.3, min: 500 },
    // The army a computer corps wants (S.armyWant): its garrisons' needs and a
    // main army of top x the largest foe corps across its borders and rest x
    // the others (friendly ones, rel, count half), at least min. It keeps no
    // more than that even when its land could feed more; the rest of its
    // gold goes to the land and the stores.
    want: { top: 1.3, rest: 0.5, min: 5000 },
    gold: { keep: 300, perSize: 100 }, // gold a city keeps back
    food: { months: 6, plus: 2000, borderMonths: 24, borderPlus: 15000 }, // food a city keeps back (garrison months + a store)
    // 군량 수송: a computer seat sends grain to a city of its corps with less
    // than short months of food for its garrison, up to fill months, from what
    // the seat holds beyond its own keep (S.keepFood); and gold the same way
    // to a city whose income does not pay its garrison (at least goldMin).
    supply: { short: 4, fill: 8, min: 500, goldMin: 50 },
    camp: 30, // days an army may stay in a city beyond its cap (staging, a city just taken)
    // A conquered city facing the foe keeps an occupation force for a year
    // (a share of the army that took it), so the foe cannot simply walk back in.
    occupy: { months: 12, share: 0.35 },
    capitalPull: 0.25, // a campaign leans toward the enemy capital: taking it shakes the realm
    newsKm: 80, // km a day that news of an army travels
    answer: { days: 25, over: 1.3 }, // an army sent to meet an invader: at most this far, this much stronger
    // A main army marches with at least min men and leaves guard of the seat's
    // (at least guardMin) at home. why: lowered from 5000/3000 when armies
    // became as small as the economy keeps them (the user's design).
    expedition: { min: 3000, guard: 0.25, guardMin: 2000, chance: 50 },
    press: { base: 75, weary: 0.8, perCity: 10, morale: 0.8, min: 10, max: 90, troops: 3000, odds: 1.0 }, // % an army goes on after taking a city
    // 경계 태세 (S.runAlert): a main army across the water that could cross
    // within days (in days) is met by men sent ahead to the bank, from a seat
    // at most reach days away; at most share of what the seat can spare, at
    // least min men; they stay hold days beyond the cap; rel: forces this
    // friendly are not watched; guard: the share of the foe's army he keeps home
    alert: { days: 20, reach: 45, share: 0.5, min: 1500, hold: 60, rel: 70, guard: 0.25 },
  };
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  // Tallies for balance runs (tools): set S.WARLOG = {} to count why armies stay home.
  const note = (k) => { if (S.WARLOG) S.WARLOG[k] = (S.WARLOG[k] || 0) + 1; };

  // ---------- garrisons and the main army ----------
  S.isCapitalCity = (state, c) => !!(c && c.owner && S.capitalOf(state, c.owner) === c.id);
  S.garrisonCap = (state, c) => (S.isSeatCity(state, c) ? Infinity : S.garrisonNeed(state, c));
  // The garrison a city needs: to keep order inside, to hold the walls on the
  // border. The main army answers invasions (S.answerArmy); a garrison only
  // holds out until it comes.
  // why: the user's design, after 魏 under 曹操: about 1,000 in an inner
  // county, 5,000-10,000 on a front, the rest in the central armies.
  S.garrisonNeed = function (state, c) {
    const N = W.need;
    let need = N.base + c.pop * N.pop;
    if (c.order < N.unrest) need *= N.unrestMul;
    const seen = [];
    for (const id of S.links(state, c.id)) {
      const p = S.place(state, id);
      if (!p || !p.owner || p.owner === c.owner || S.allied(state, c.owner, p.owner)) continue;
      let n = Math.max(0, (S.seenTroops ? S.seenTroops(state, c.owner, p) : p.troops) - (p.retainers || 0));
      if (S.isSeatCity(state, p)) n *= N.seat;
      if (S.truceLeft(state, c.owner, p.owner) || (S.rel(state, c.owner, p.owner) >= N.rel && !S.atWarWith(state, c.owner, p.owner))) n *= 0.5;
      seen.push(n);
    }
    if (seen.length) {
      seen.sort((a, b) => b - a);
      const guard = seen[0] * N.top + seen.slice(1).reduce((s, n) => s + n, 0) * N.rest;
      need += Math.min(N.max, Math.max(N.min, guard));
    }
    return Math.round(need);
  };
  // A city next to a place of another force (not an ally).
  S.isBorder = (state, c) => S.links(state, c.id).some((n) => {
    const p = S.place(state, n);
    return p && p.owner && p.owner !== c.owner && !S.allied(state, c.owner, p.owner);
  });
  // What a city holds back before sending the rest to the capital.
  S.keepGold = (c) => W.gold.keep + W.gold.perSize * c.size;
  S.keepFood = (state, c) => {
    const border = S.isBorder(state, c);
    return Math.round(S.foodUse(c.troops) * (border ? W.food.borderMonths : W.food.months) + (border ? W.food.borderPlus : W.food.plus));
  };
  // An army may stay beyond the cap for a while (it was sent there, or it
  // just took the place, or an enemy army is on its way).
  const camping = (state, c) => (c.campUntil || 0) > S.today(state) ||
    (state.marches || []).some((m) => m.kind === "army" && m.target === c.id && m.force !== c.owner);

  // Soldiers beyond the cap: their number (state troops only; the families'
  // retainers stay home).
  S.overCap = (state, c) => Math.max(0, Math.min(S.marchable(c), c.troops - S.garrisonCap(state, c)));

  // Send soldiers from c to the capital (no officer needed: they march under
  // their own captains).
  function sendToCapital(state, c, n) {
    const capId = S.seatOfCity(state, c); // the seat of its corps
    if (!capId || capId === c.id || n < 100) return false;
    const route = S.route(state, c.id, capId, "army");
    if (!route) return false;
    const counts = S.mixCounts(S.garrisonUnit(c), Math.min(n, S.marchable(c)));
    const unit = S.takeTroops(c, counts);
    if (!unit) return false;
    S.launch(state, { kind: "move", force: c.owner, path: route.path, km: route.km, speed: S.unitSpeed(counts),
      officers: [], troops: S.countsTotal(counts), unit, train: c.train, origin: c.id, target: capId });
    return true;
  }

  // The start of a game: every city's soldiers beyond its cap join the main
  // army at once.
  S.consolidate = function (state) {
    for (const c of S.cityList(state)) {
      if (!c.owner || S.isSeatCity(state, c)) continue;
      const n = S.overCap(state, c);
      if (n <= 0) continue;
      const cap = state.cities[S.seatOfCity(state, c)]; // the seat of its corps
      const counts = S.mixCounts(S.garrisonUnit(c), n);
      const unit = S.takeTroops(c, counts);
      if (!unit) continue;
      cap.train = Math.round((cap.train * cap.troops + c.train * n) / Math.max(1, cap.troops + n));
      S.addTroops(cap, unit, S.countsTotal(counts));
    }
  };

  // Each month: the cities send their surplus to the capital (상납), and
  // soldiers beyond a city's cap march to the main army.
  S.runTribute = function (state) {
    for (const c of S.cityList(state)) {
      c.sent = null;
      if (!c.owner || S.isSeatCity(state, c) || S.besieged(state, c.id)) continue;
      const capId = S.seatOfCity(state, c); // the seat of its corps
      const cap = capId && state.cities[capId];
      if (!cap || !S.route(state, c.id, capId, "cargo")) continue; // cut off from the capital
      const hold = S.withhold ? S.withhold(state, c) : 0; // a 할거 governor keeps some back (js/conduct.js)
      const gold = Math.max(0, Math.floor((c.gold - S.keepGold(c)) * (1 - hold)));
      const food = Math.max(0, Math.floor((c.food - S.keepFood(state, c)) * (1 - hold)));
      c.gold -= gold;
      c.food -= food;
      cap.gold += gold;
      cap.food += food;
      c.sent = { gold, food };
      // The player's own cities keep what he puts there (he pays for it); the
      // computer's send what they do not need on to the main army.
      if (!camping(state, c) && S.corpsRunsItself(state, c.owner, S.cityCorps(state, c)))
        sendToCapital(state, c, S.overCap(state, c) - Math.round(S.garrisonCap(state, c) * hold));
    }
    // 군량 수송: the seat feeds the garrisons its land cannot.
    // why: the user's design. The stores gather at the seat; a border city
    // holding thousands on a poor harvest is fed from there, not left to starve.
    const U = W.supply;
    for (const c of S.cityList(state)) {
      if (!c.owner || S.isSeatCity(state, c) || S.besieged(state, c.id) || !c.troops) continue;
      const k = S.cityCorps(state, c);
      if (!S.corpsRunsItself(state, c.owner, k)) continue;
      const use = S.foodUse(c.troops);
      if (c.food >= use * U.short) continue;
      const capId = S.seatOfCity(state, c);
      const cap = capId && state.cities[capId];
      if (!cap || S.besieged(state, capId) || !S.route(state, capId, c.id, "cargo")) continue;
      const n = Math.min(Math.round(use * U.fill - c.food), Math.floor(cap.food - S.keepFood(state, cap)));
      if (n < U.min) continue;
      cap.food -= n;
      c.food += n;
      note("SUPPLY");
    }
    // ... and pays the garrisons the city's own gold cannot.
    for (const c of S.cityList(state)) {
      if (!c.owner || S.isSeatCity(state, c) || S.besieged(state, c.id)) continue;
      const short = -S.balance(c);
      if (short <= 0 || c.gold >= short * U.short) continue;
      if (!S.corpsRunsItself(state, c.owner, S.cityCorps(state, c))) continue;
      const capId = S.seatOfCity(state, c);
      const cap = capId && state.cities[capId];
      if (!cap || S.besieged(state, capId) || !S.route(state, capId, c.id, "cargo")) continue;
      const n = Math.min(Math.round(short * U.fill - c.gold), Math.floor(cap.gold - S.keepGold(cap)));
      if (n < U.goldMin) continue;
      cap.gold -= n;
      c.gold += n;
      note("PAY");
    }
  };

  // ---------- campaigns ----------
  // From the capital an army can march on any enemy place that touches the
  // force's own land, through that land. From another city, only on the
  // nearest enemy place down each road (a raid, or a staged attack).
  const nearTargets = S.attackTargets;
  S.attackTargets = function (state, from) {
    const p = S.place(state, from);
    if (!p || !state.cities[from] || !S.isSeatCity(state, p)) return nearTargets(state, from);
    const me = p.owner;
    const k = S.cityCorps(state, p);
    const best = new Map();
    for (const [cid, days] of Object.entries(S.reachable(state, from, "army")).concat([[from, 0]])) {
      if (!state.cities[cid] || S.cityCorps(state, state.cities[cid]) !== k) continue; // the corps' own front
      const lead = cid === from ? null : S.route(state, from, cid, "army");
      for (const t of nearTargets(state, cid)) {
        const path = lead ? lead.path.concat(t.path.slice(1)) : t.path;
        const km = S.pathKm(state, path);
        if (!best.has(t.id) || km < best.get(t.id).km) best.set(t.id, { id: t.id, path, km, days: S.travelDays(km, "army") });
      }
    }
    return [...best.values()].filter((t) => S.place(state, t.id).owner !== me);
  };
  // The last own place on an army's road: its supply base.
  S.marchBase = function (state, path, fid) {
    for (let i = path.length - 2; i >= 0; i--) if (S.place(state, path[i]).owner === fid) return path[i];
    return path[0];
  };
  // Rations for a march, from the cities on the way (the border first), each
  // keeping three months for its own garrison; the rest from where it set out.
  // dry: only reckon, take nothing.
  S.drawFood = function (state, path, fid, need, dry) {
    let left = need;
    for (let i = path.length - 2; i >= 1 && left > 0; i--) {
      const c = state.cities[path[i]];
      if (!c || c.owner !== fid) continue;
      const spare = Math.max(0, Math.floor(c.food - S.foodUse(c.troops) * 3));
      const take = Math.min(spare, left);
      if (!dry) c.food -= take;
      left -= take;
    }
    return left; // what the origin must still pay
  };
  // When the target's owner hears of an army: a day after it leaves the
  // attacker's last place on the road (at once if it starts at the border).
  S.spotDay = function (state, m) {
    const base = S.marchBase(state, m.path, m.force);
    const i = m.path.indexOf(base);
    const km = S.pathKm(state, m.path.slice(0, i + 1));
    const total = Math.max(1, m.arrive - m.start);
    const t = S.place(state, m.target);
    const spy = S.spyEdge && t ? S.spyEdge(state, t.owner) : 0; // a 대홍려 hears sooner
    return Math.max(m.start + 1, m.start + Math.round((km / Math.max(1, m.km)) * total) + 1 - spy);
  };
  S.seenBy = (state, m, fid) => m.force === fid || m.kind !== "army" || !m.seen || S.today(state) >= m.seen ||
    S.place(state, m.target).owner !== fid;

  // Each day: news of armies reaches those they march on.
  S.runSpotting = function (state) {
    const now = S.today(state);
    for (const m of state.marches || []) {
      if (m.kind !== "army" || m.told || now < (m.seen || 0)) continue;
      m.told = true;
      const t = S.place(state, m.target);
      if (!t.owner) continue;
      if (t.owner === state.playerForce && m.force !== state.playerForce) {
        const k = S.placeCorps(state, t);
        S.addLog(state, `첩보: ${S.forceName(state, m.force)} ${S.unitName(m.unit)} ${m.troops}명이 ${S.placeName(state, S.marchBase(state, m.path, m.force))}을 지나 ${S.ro(t.name)} 진군하고 있습니다. (${S.daysLeft(state, m)}일 뒤 도착)`, "threat");
        if (k > 1) {
          // The player's other corps meet it by themselves (their 도독 decides).
          const before = (state.marches || []).length;
          S.answerArmy(state, m);
          if ((state.marches || []).length === before) S.addLog(state, `${S.corpsName(k)} 도독은 주력군을 내지 않고 ${t.name}의 수비대에 맡깁니다.`, "info");
        }
      } else if (t.owner !== state.playerForce || S.spectating(state)) {
        S.answerArmy(state, m);
      }
    }
  };

  // A computer force hears of an army on its way and decides how much of the
  // main army to send against it (맞대응): enough to beat it with the
  // garrison's help, if the capital can spare that much and its ruler has the
  // nerve. The answering army relieves the city if it is still under siege
  // when it arrives, joins the garrison if the enemy has not come yet, and
  // falls on the city to take it back if it has fallen (S.counterArrives).
  S.answerArmy = function (state, m) {
    const t = S.place(state, m.target);
    const fid = t.owner;
    const k = S.placeCorps(state, t);
    const capId = S.corpsSeat(state, fid, k);
    const cap = capId && state.cities[capId];
    if (!cap || capId === t.id || S.besieged(state, capId)) return;
    if (S.isBroken(state, fid, k)) return note("answer: broken");
    const route = S.route(state, capId, t.id, "army");
    if (!route || route.days > W.answer.days) return;
    const ruler = rulerOf(state, fid);
    const nerve = S.hasTrait(ruler, "과감") ? 0.8 : S.hasTrait(ruler, "신중") ? 1.2 : 1;
    const spare = Math.floor(S.marchable(cap) - Math.max(W.expedition.guardMin, cap.troops * W.expedition.guard));
    const send = Math.min(spare, Math.round(m.troops * W.answer.over));
    if (send < 2000 || send + t.troops * 0.5 < m.troops * nerve) return note("answer: too weak");
    const idle = S.idle(state, capId).sort((a, x) => S.leadScore(state, x) - S.leadScore(state, a));
    if (idle.length < 1) return note("answer: no officer");
    const team = idle.slice(0, Math.min(S.MAX_SORTIE_OFFICERS, Math.max(1, idle.length - 1)));
    const counts = S.pickTroops(cap, send, (k) => (S.unitOf(k).gear ? 0.2 : Math.pow(S.unitEdge(k, m.unit, "field", 1), 2)));
    const total = S.countsTotal(counts);
    const food = S.marchFood(total, route.days, S.pathRough(state, route.path));
    const fromCap = S.drawFood(state, route.path.concat([t.id]), fid, food, true);
    if (cap.food < fromCap) return note("answer: no food");
    const unit = S.takeTroops(cap, counts);
    if (!unit) return;
    cap.food -= S.drawFood(state, route.path.concat([t.id]), fid, food);
    const r = S.launch(state, { kind: "relief", counter: true, force: fid, path: route.path, km: route.km, speed: S.unitSpeed(counts),
      officers: team.map((o) => o.id), troops: total, unit, train: cap.train, origin: capId, target: t.id, corps: k });
    r.base = S.marchBase(state, r.path, fid);
    r.campaign = { foe: m.force, taken: 0, since: S.monthsElapsed(state), counter: true };
    note("ANSWER");
    S.addLog(state, `${S.corpsLabel(state, fid, k)} 주력군 ${total}명이 ${S.forceName(state, m.force)}의 침공에 맞서 ${S.ro(t.name)} 떠났습니다.`,
      m.force === state.playerForce ? "threat" : fid === state.playerForce ? "sys" : "info");
  };
  // An answering army arrives where the siege is over: it joins the garrison
  // if the city held, or lays siege to take it back. Returns true if handled.
  S.counterArrives = function (state, m) {
    const t = S.place(state, m.target);
    if (!m.counter || !t) return false;
    if (t.owner === m.force) {
      t.campUntil = Math.max(t.campUntil || 0, S.today(state) + W.camp);
      return false; // delivered as a move
    }
    if (!t.owner || S.allied(state, m.force, t.owner) || S.truceLeft(state, m.force, t.owner)) return false;
    note("COUNTER SIEGE");
    m.kind = "army";
    S.startSiege(state, m);
    return true;
  };

  // ---------- 경계 태세 (alert on the river) ----------
  // Every month each computer corps looks across the water: where a foe's
  // main army could come over within days (as believed, js/intel.js), it
  // sends men ahead to the bank, enough that the ships there could meet the
  // crossing (S.landingOdds), and keeps them there beyond the cap while the
  // threat lasts. Without it the main army only hears of a crossing a day
  // after it sets out, from a seat far inland, and comes too late.
  // why: 장료 held 합비 and 조인 held 강릉 with standing armies on the river.
  S.alertThreats = function (state) {
    const out = {}; // place id -> {aw, foe}
    for (const g of Object.values(state.forces)) {
      if (!g.alive) continue;
      for (const k of S.corpsList(state, g.id)) {
        const seat = k.seat && state.cities[k.seat];
        if (!seat || seat.owner !== g.id) continue;
        for (const way of S.attackTargets(state, seat.id)) {
          if (way.days > W.alert.days || !S.landingLink(way.path)) continue;
          const t = S.place(state, way.id);
          if (!t || !t.owner || t.owner === g.id || S.allied(state, g.id, t.owner) || S.truceLeft(state, g.id, t.owner)) continue;
          if (S.rel(state, g.id, t.owner) >= W.alert.rel && !S.atWarWith(state, g.id, t.owner)) continue;
          const men = (S.seenTroops ? S.seenTroops(state, t.owner, seat) : seat.troops) * (1 - W.alert.guard);
          const aw = S.waterMen(state, way.path, g.id, Math.round(men));
          if (!out[t.id] || out[t.id].aw < aw) out[t.id] = { aw, foe: g.id };
        }
      }
    }
    return out;
  };
  S.runAlert = function (state) {
    const today = S.today(state);
    const threats = S.alertThreats(state);
    for (const [tid, th] of Object.entries(threats)) {
      const t = S.place(state, tid);
      const fid = t.owner;
      const k = S.placeCorps(state, t);
      if (!S.corpsRunsItself(state, fid, k)) continue;
      const home = t.kind === "port" && state.cities[t.home] && state.cities[t.home].owner === fid ? state.cities[t.home] : null;
      const dest = home || t;
      const g = S.shoreGuard(state, t);
      const coming = (state.marches || []).filter((m) => m.alert && m.force === fid && m.target === dest.id).reduce((s, m) => s + m.troops, 0);
      const want = Math.min(g.cap, th.aw) / S.LANDING.share;
      const short = Math.round(want - g.pool - coming);
      dest.campUntil = Math.max(dest.campUntil || 0, today + W.alert.hold); // the men there stay
      if (short < W.alert.min) continue;
      const seatId = S.corpsSeat(state, fid, k);
      const seat = seatId && state.cities[seatId];
      if (!seat || seatId === dest.id || S.besieged(state, seatId) || threats[seatId]) continue;
      const route = S.route(state, seatId, dest.id, "army");
      if (!route || route.days > W.alert.reach) continue;
      const spare = Math.floor(S.marchable(seat) - Math.max(W.expedition.guardMin, seat.troops * W.expedition.guard));
      const send = Math.min(short, Math.floor(spare * W.alert.share));
      if (send < W.alert.min) continue;
      const counts = S.mixCounts(S.garrisonUnit(seat), send);
      const unit = S.takeTroops(seat, counts);
      if (!unit) continue;
      const m = S.launch(state, { kind: "move", force: fid, path: route.path, km: route.km, speed: S.unitSpeed(counts),
        officers: [], troops: S.countsTotal(counts), unit, train: seat.train, origin: seatId, target: dest.id, corps: k });
      m.alert = true;
      dest.campUntil = Math.max(dest.campUntil || 0, today + route.days + W.alert.hold);
      note("ALERT");
      S.addLog(state, `경계 태세: ${S.corpsLabel(state, fid, k)} 병사 ${m.troops}명이 ${S.forceName(state, th.foe)}의 도강에 대비해 ${S.ro(dest.name)} 향합니다.`,
        fid === state.playerForce ? "sys" : th.foe === state.playerForce ? "threat" : "info");
    }
  };

  // Each month a computer corps fills border garrisons that are short from
  // its seat, and sends home the men it cannot pay for (귀농).
  S.runGarrisons = function (state) {
    const today = S.today(state);
    for (const f of Object.values(state.forces)) {
      if (!f.alive) continue;
      for (const k of S.corpsList(state, f.id)) {
        if (!S.corpsRunsItself(state, f.id, k.n)) continue;
        const seat = k.seat && state.cities[k.seat];
        if (!seat || seat.owner !== f.id || S.besieged(state, seat.id)) continue;
        const realm = S.corpsCities(state, f.id, k.n);
        // Border garrisons short of men.
        const R = W.reinforce;
        for (const c of realm) {
          if (c === seat || S.besieged(state, c.id)) continue;
          const need = S.garrisonNeed(state, c);
          const coming = (state.marches || []).filter((m) => m.force === f.id && m.target === c.id && m.kind === "move").reduce((s, m) => s + m.troops, 0);
          if (c.troops + coming >= need * R.short) continue;
          const spare = Math.floor(S.marchable(seat) - Math.max(W.expedition.guardMin, seat.troops * W.expedition.guard));
          const send = Math.min(need - c.troops - coming, Math.floor(spare * R.share));
          if (send < R.min) continue;
          const route = S.route(state, seat.id, c.id, "army");
          if (!route || route.days > R.days) continue;
          const counts = S.mixCounts(S.garrisonUnit(seat), send);
          const unit = S.takeTroops(seat, counts);
          if (!unit) continue;
          S.launch(state, { kind: "move", force: f.id, path: route.path, km: route.km, speed: S.unitSpeed(counts),
            officers: [], troops: S.countsTotal(counts), unit, train: seat.train, origin: seat.id, target: c.id, corps: k.n });
          c.campUntil = Math.max(c.campUntil || 0, today + route.days + 5); // not sent back before it arrives
          note("REINFORCE");
        }
        // 귀농: more men than the corps can pay for.
        const D = W.discharge;
        const keep = Math.min(S.armyKeep(state, realm), S.armyWant(state, f.id, k.n, realm));
        const men = S.corpsMen(state, f.id, k.n, realm);
        if (men <= keep * D.over) continue;
        const n = Math.floor(Math.min((men - keep) * D.share, S.marchable(seat) - W.expedition.guardMin));
        if (n < D.min) continue;
        S.loseTroops(seat, n);
        seat.pop += n;
        seat.manpower = Math.min(S.manpowerMax(seat), seat.manpower + n);
        note("DISCHARGE");
        if (f.id === state.playerForce) S.addLog(state, `${S.corpsName(k.n)}이 쓸 데 없거나 먹일 수 없는 병사 ${n}명을 고향으로 돌려보냈습니다.`, "warn");
      }
    }
  };
  // How many soldiers these cities can keep for years: the fewer of what
  // their harvest (and a share of the stores) feeds and what their gold
  // (and a share of the seat's treasury) pays.
  // Every soldier of a corps: in its cities, on the march and in battle.
  S.corpsMen = function (state, fid, n, realm) {
    realm = realm || S.corpsCities(state, fid, n);
    const mine = (x) => x && x.force === fid && (x.corps || 1) === (n || 1) ? x.troops || 0 : 0;
    return realm.reduce((s, c) => s + c.troops, 0) +
      (state.marches || []).reduce((s, m) => s + mine(m), 0) +
      (state.battles || []).reduce((s, b) => s + mine(b.att) + mine(b.relief), 0);
  };
  // How many soldiers a corps wants: what its garrisons need and a main army
  // to match the foe corps across its borders (as believed, js/intel.js).
  // Worked out once a day for each corps.
  // why: the user's design. A realm keeps the army its enemies call for, not
  // all its land can feed; a weak neighbour spends all it has, a strong one
  // stays well short of it.
  S.armyWant = function (state, fid, n, realm) {
    const key = S.today(state) + ":" + fid + ":" + (n || 1);
    state._want = state._want && state._want.day === S.today(state) ? state._want : { day: S.today(state) };
    if (state._want[key] != null) return state._want[key];
    realm = realm || S.corpsCities(state, fid, n);
    const V = W.want;
    let needs = 0;
    const foes = {}; // "force:corps" -> weight
    for (const c of realm) {
      if (!S.isSeatCity(state, c)) needs += S.garrisonNeed(state, c);
      for (const id of S.links(state, c.id)) {
        const p = S.place(state, id);
        if (!p || !p.owner || p.owner === fid || S.allied(state, fid, p.owner)) continue;
        const friendly = S.truceLeft(state, fid, p.owner) || (S.rel(state, fid, p.owner) >= W.need.rel && !S.atWarWith(state, fid, p.owner));
        const fk = p.owner + ":" + S.placeCorps(state, p);
        foes[fk] = Math.max(foes[fk] || 0, friendly ? 0.5 : 1);
      }
    }
    const seen = Object.entries(foes).map(([fk, w]) => {
      const [g, k] = fk.split(":");
      return w * S.corpsCities(state, g, +k).reduce((s, c) => s + Math.max(0, (S.seenTroops ? S.seenTroops(state, fid, c) : c.troops) - (c.retainers || 0)), 0);
    }).sort((a, b) => b - a);
    const main = Math.max(V.min, (seen[0] || 0) * V.top + seen.slice(1).reduce((s, x) => s + x, 0) * V.rest);
    return (state._want[key] = Math.round(needs + main));
  };
  S.armyKeep = function (state, cities) {
    const grain = cities.reduce((s, c) => s + S.harvestOf(state, c) + c.food / S.ECON.stores, 0);
    const gold = cities.reduce((s, c) => s + S.income(c) - S.salaries(c) + (S.isSeatCity(state, c) ? c.gold / (S.ECON.stores * 12) : 0), 0);
    return Math.max(0, Math.min(grain * 25 / 12, (gold - 15) * S.ECON.upkeep));
  };

  // Is the corps (1군단 if none named) already at war with its main army?
  // (One campaign at a time.)
  S.onCampaign = (state, fid, n) => (state.marches || []).some((m) => m.force === fid && m.kind === "army" && m.campaign && (m.corps || 1) === (n || 1)) ||
    (state.battles || []).some((b) => b.att && b.att.force === fid && b.att.campaign && (b.att.corps || 1) === (n || 1));

  // ---------- wars and their aims (전쟁 목표) ----------
  // A computer force at war has one foe and one aim (f.war):
  //   국지전 (border): take a border city or two and go home; the war ends
  //     when the campaign does.
  //   결전 (decisive): march on the heart of a peer and draw out its main
  //     army; once that army is beaten in the field (주력 격파), devour the
  //     rest of the realm city by city, over years (관도 then 하북).
  //   섬멸전 (annihilate): go straight for the capital of a smaller foe or a
  //     hated one and do not stop until it falls (조조 and 여포).
  // A main army beaten in the field is broken (f.brokenUntil): it starts no
  // war and takes nothing back for a time.
  const AIMS = S.WAR_AIMS = { border: "국지전", decisive: "결전", annihilate: "섬멸전" };
  Object.assign(W, {
    aim: {
      annihilate: { might: 2, small: 4, smallMight: 1.3, feud: 20, feudMight: 1.5 }, // when to choose it
      decisive: { might: 0.8, cities: 4 },
      odds: { border: 1.3, decisive: 1.05, annihilate: 0.95 }, // estimate needed to set out
      guard: { border: 0.25, decisive: 0.15, annihilate: 0.15 }, // share of the main army kept home
      press: { border: 0, decisive: 15, annihilate: 35 }, // added to the chance to press on
      wearyLimit: { border: 60, decisive: 75, annihilate: 85 },
      years: { border: 1, decisive: 6, annihilate: 4 }, // a war given up after this long
    },
    broken: 18, // months a main army beaten in the field stays broken
    bigArmy: 8000, // an army this large, beaten in the field, breaks its force
    pursuit: 0.25, // share of the beaten main army lost again in the rout
  });
  // Is the main army of the corps (1군단 if none named) broken?
  S.isBroken = (state, fid, n) => { const r = S.corpsRec(state, fid, n); return !!(r && (r.brokenUntil || 0) > S.monthsElapsed(state)); };
  // A force's fighting strength: its soldiers in cities, on the road and in battle.
  S.might = function (state, fid) {
    let n = S.citiesOf(state, fid).reduce((s, c) => s + S.marchable(c), 0);
    for (const m of state.marches || []) if (m.force === fid) n += m.troops || 0;
    for (const b of state.battles || []) {
      if (b.att && b.att.force === fid) n += b.att.troops;
      if (b.relief && b.relief.force === fid) n += b.relief.troops;
    }
    return n;
  };
  S.warOf = (state, fid, n) => { const r = S.corpsRec(state, fid, n); return (r && r.war) || null; };

  // The aim a ruler would choose against foe.
  S.chooseAim = function (state, fid, foe) {
    const A = W.aim;
    const ratio = S.might(state, fid) / Math.max(1, S.might(state, foe));
    const ruler = rulerOf(state, fid);
    const bold = S.hasTrait(ruler, "과감") ? 0.85 : S.hasTrait(ruler, "신중") ? 1.2 : 1;
    const reach = S.reachOf(ruler);
    const n = S.citiesOf(state, foe).length;
    const feud = S.rel(state, fid, foe) < A.annihilate.feud;
    if (ratio >= A.annihilate.might * bold || (n <= A.annihilate.small && ratio >= A.annihilate.smallMight * bold) ||
        (feud && ratio >= A.annihilate.feudMight * bold)) return "annihilate";
    if (ratio >= A.decisive.might * bold && n >= A.decisive.cities && (reach === "천하" || reach === "지방")) return "decisive";
    return "border";
  };
  function endWar(state, fid, why, n) {
    const f = S.corpsRec(state, fid, n);
    const war = f && f.war;
    if (!war) return;
    f.war = null;
    note("war ends: " + why);
    const foe = S.forceName(state, war.foe);
    const me = S.corpsLabel(state, fid, n);
    const text = why === "won" ? `${S.josa(me, "이", "가")} ${S.josa(foe, "과", "와")}의 ${AIMS[war.aim]}을 끝냈습니다.`
      : why === "broken" ? `${me} 주력군이 꺾여 ${S.josa(foe, "과", "와")}의 ${AIMS[war.aim]}을 거두었습니다.`
      : why === "weary" ? `${S.josa(me, "이", "가")} 지쳐 ${S.josa(foe, "과", "와")}의 ${AIMS[war.aim]}을 거두었습니다.`
      : null;
    if (text && war.aim !== "border") S.addLog(state, text, war.foe === state.playerForce || fid === state.playerForce ? "warn" : "info");
  }
  // Is the war still worth it? Ends it if not.
  function keepWar(state, fid, n) {
    const f = state.forces[fid];
    const war = S.warOf(state, fid, n);
    if (!war) return null;
    if (!state.forces[war.foe] || !state.forces[war.foe].alive) { endWar(state, fid, "won", n); return null; }
    if (S.isBroken(state, fid, n)) { endWar(state, fid, "broken", n); return null; }
    if (f.weariness > W.aim.wearyLimit[war.aim]) { endWar(state, fid, "weary", n); return null; }
    if (S.monthsElapsed(state) - war.since > W.aim.years[war.aim] * 12) { endWar(state, fid, "long", n); return null; }
    if (S.allied(state, fid, war.foe)) { endWar(state, fid, "peace", n); return null; }
    return war;
  }
  // Where the campaign should go next among ways (from a city): for a border
  // war the best odds; otherwise the place nearest the foe's capital that
  // the army can hope to take.
  function aimTarget(state, fid, war, ways, judge) {
    let best = null;
    const foeCap = war && war.aim !== "border" ? S.capitalOf(state, war.foe) : null;
    for (const way of ways) {
      const t = S.place(state, way.id);
      if (war && t.owner !== war.foe) continue;
      const j = judge(t, way);
      if (!j) continue;
      const near = foeCap ? S.nodeKm(state, t.id, foeCap) : 0;
      j.score = foeCap ? -near / 300 + Math.min(j.est.ratio, 2) - (t.id === foeCap ? 0 : 0.2) : j.est.ratio;
      if (!best || j.score > best.score) best = Object.assign(j, { t, way });
    }
    return best;
  }

  // A computer force sends its main army to war: against the foe of its
  // current war, or, at peace, against the most promising foe in reach
  // (js/data/ambition.js), with an aim fitting the balance of strength.
  // n: the corps (1군단 if none); a corps under 국지전 위임 wages border
  // wars only, one under 방어 none (js/corps.js).
  S.warAI = function (state, fid, n) {
    n = n || 1;
    const f = state.forces[fid];
    const rec = S.corpsRec(state, fid, n);
    const policy = n > 1 ? rec.policy : "war";
    if (policy === "defend") return note("corps defends");
    const capId = S.corpsSeat(state, fid, n);
    const cap = capId && state.cities[capId];
    note("call");
    let war = keepWar(state, fid, n);
    if (war && policy === "border" && war.aim !== "border" && !war.ordered) { rec.war = null; war = null; }
    if (!cap || S.besieged(state, capId)) return note("capital besieged");
    if (S.onCampaign(state, fid, n)) return note("already on campaign");
    if (S.isBroken(state, fid, n)) return note("broken");
    if (!war && f.weariness > 60) return note("weary");
    const E = W.expedition;
    const idle = S.idle(state, capId).sort((a, b) => S.leadScore(state, b) - S.leadScore(state, a));
    if (!idle.length) return note("no officer at capital");
    const team = idle.slice(0, Math.min(S.MAX_SORTIE_OFFICERS, Math.max(1, idle.length - 1)));
    const ids = team.map((o) => o.id);
    const truce = S.inTruce(state);
    const dom = fid === state.playerForce ? null : S.domainOf(state, fid); // the player's 도독 take what is in reach
    const call = war || n > 1 ? null : S.callOf(state, fid);
    const ways = S.attackTargets(state, capId).filter((w) => {
      const t = S.place(state, w.id);
      if ((truce && t.owner) || (t.owner && (S.allied(state, fid, t.owner) || S.truceLeft(state, fid, t.owner)))) return false;
      // An ally's call opens its foe to us even beyond our reach.
      return war ? t.owner === war.foe : S.wantsTarget(state, fid, t, dom) || (call && t.owner === call.foe);
    });
    // At peace: choose the foe and the aim first.
    let aim = war ? war.aim : null;
    if (!war) {
      const foes = [...new Set(ways.map((w) => S.place(state, w.id).owner).filter(Boolean))];
      if (!ways.length) return note("no target in reach");
      let pick = null;
      for (const foe of foes) {
        // An ally's call: a strike on the same foe elsewhere (조공).
        const called = call && call.foe === foe;
        const a = called || policy === "border" ? "border" : S.chooseAim(state, fid, foe);
        const ratio = S.might(state, fid) / Math.max(1, S.might(state, foe));
        const v = ratio + (a === "annihilate" ? 0.5 : a === "decisive" ? 0.2 : 0) - S.rel(state, fid, foe) / 100 +
          (S.willOf ? S.willOf(state, fid, foe) / 50 : 0) +
          (called ? 1 : 0) + (S.foeBusy(state, foe) ? 0.5 : 0) + (S.provoked ? S.provoked(state, fid, foe) : 0) - (S.atWarWith(state, fid, foe) ? 0 : 0.1);
        if (!pick || v > pick.v) pick = { foe, a, v, called };
      }
      aim = pick ? pick.a : "border";
      war = pick ? { foe: pick.foe, aim, since: S.monthsElapsed(state), joint: pick.called ? call.by : null } : null;
    }
    const keep = Math.max(E.guardMin, Math.round(cap.troops * W.aim.guard[aim]));
    const troops = Math.floor(S.marchable(cap) - keep);
    if (troops < E.min) return note("main army too small");
    const best = aimTarget(state, fid, war, ways, (t, way) => {
      const unit = S.pickAttackUnit(state, cap, t, troops);
      const land = S.landingLink(way.path) ? S.landingForecast(state, t.id, fid, team, troops, cap.train, S.waterMen(state, way.path, fid, troops)) : null;
      if (land && !land.pass) return null;
      const est = S.estimate(state, capId, t.id, ids, land ? land.left : troops, unit);
      const threat = t.owner ? S.sortieThreat(state, t.id) : null;
      return { unit, est, pull: S.courtPull(state, fid, t), risk: threat ? threat.pct / 50 : 0 };
    });
    if (!best) return note("no target in reach");
    const w = f.weariness;
    const ruler = rulerOf(state, fid);
    const nerve = (S.hasTrait(ruler, "과감") ? -0.15 : S.hasTrait(ruler, "신중") ? 0.2 : 0) + (S.hasTrait(ruler, "야심") ? -0.1 : 0);
    const amity = best.t.owner && aim === "border" ? Math.max(-0.15, (S.rel(state, fid, best.t.owner) - 50) / 80) : 0;
    // Lighter odds when an ally asked, or when the foe's main army is away.
    const opening = (war && war.joint ? W.ally.odds : 0) + (best.t.owner && S.foeBusy(state, best.t.owner, S.placeCorps(state, best.t)) ? W.ally.busy : 0);
    const advice = S.adviserEdge ? S.adviserEdge(state, fid) : 0; // a 군사 sees which wars can be won
    // 원정 의지 (js/will.js): a lord who has long meant to go asks less of the odds.
    const will = best.t.owner && S.willOdds ? S.willOdds(state, fid, best.t.owner) : 0;
    if (best.est.ratio < W.aim.odds[aim] + w / 40 - best.pull + nerve + amity + best.risk - opening - advice - will) return note("odds too low: " + aim);
    if (!S.chance(state, E.chance * (best.t.owner && S.willOf ? 0.5 + S.willOf(state, fid, best.t.owner) / 100 : 1))) return note("dice");
    // The council debates it first (js/council.js); a 도독 decides alone.
    const council = S.conveneWar && n === 1 ? S.conveneWar(state, fid, { foe: best.t.owner, target: best.t.id, aim, ratio: best.est.ratio, team: ids }) : null;
    if (council && !council.adopted) return note("council against");
    const r = S.attack(state, capId, best.t.id, ids, troops, best.unit);
    note(r.ok ? "LAUNCH " + aim : "launch failed");
    if (!r.ok) return;
    if (council && S.councilLaunched) S.councilLaunched(state, council, r.march);
    r.march.corps = n;
    r.march.campaign = { foe: best.t.owner || null, taken: 0, since: S.monthsElapsed(state), aim };
    if (best.t.owner && S.willSpent) S.willSpent(state, fid, best.t.owner);
    const me = S.corpsLabel(state, fid, n);
    const tone = (foe) => (foe === state.playerForce ? "threat" : fid === state.playerForce ? "sys" : "info");
    if (war && !rec.war && best.t.owner) {
      rec.war = war;
      if (war.joint) {
        note("JOINT STRIKE");
        S.addLog(state, `${S.josa(me, "이", "가")} 동맹 ${S.forceName(state, war.joint)}의 청에 따라 ${S.forceName(state, war.foe)}의 ${S.ro(best.t.name)} 군을 냅니다.`, tone(war.foe));
      } else if (aim !== "border") {
        const foe = S.forceName(state, war.foe);
        S.addLog(state, `${S.josa(me, "이", "가")} ${S.josa(foe, "을", "를")} 상대로 ${AIMS[aim]}을 벌입니다. 주력군 ${troops}명이 ${S.ro(best.t.name)} 향합니다.`, tone(war.foe));
      } else if (n > 1 && fid === state.playerForce) {
        S.addLog(state, `${me} 주력군 ${troops}명이 ${S.forceName(state, best.t.owner)}의 ${S.ro(best.t.name)} 출진합니다.`, "sys");
      }
    } else if (n > 1 && fid === state.playerForce) {
      S.addLog(state, `${me} 주력군 ${troops}명이 ${S.ro(best.t.name)} 출진합니다.`, "sys");
    }
  };

  // ---------- the decisive battle (주력 결전) ----------
  // A relief army was beaten in the field by the besiegers: if it was a
  // main army, its force is broken and the pursuit costs it dearly; the
  // victor's war turns to devouring the rest.
  S.reliefBeaten = function (state, b) {
    const R = b.relief;
    if (!R || R.troops0 < W.bigArmy) return;
    const lost = Math.round(R.troops * W.pursuit);
    R.troops -= lost;
    if (S.creditDecisive) S.creditDecisive(state, b.att, R);
    breakForce(state, R.force, R.corps, b.att.force, b.att.corps, lost, R.troops0);
  };
  // A siege failed. If a relief army drove off a main army in the field, the
  // attacker is the one broken.
  S.siegeFailed = function (state, b) {
    const A = b.att;
    if (A.campaign && b.relief && A.troops0 >= W.bigArmy) {
      if (S.creditDecisive) S.creditDecisive(state, b.relief, A);
      breakForce(state, A.force, A.corps, b.relief.force, b.relief.corps, 0, A.troops0);
    }
    const f = S.corpsRec(state, A.force, A.corps);
    if (f && f.war && f.war.aim === "border") endWar(state, A.force, "failed", A.corps);
  };
  // The main army of a corps is broken (lk, vk: the corps of each side).
  function breakForce(state, loser, lk, victor, vk, lost, size) {
    const f = S.corpsRec(state, loser, lk);
    if (!f) return;
    f.brokenUntil = S.monthsElapsed(state) + W.broken;
    S.addWeariness(state, loser, 10);
    note("MAIN ARMY BROKEN");
    if (S.willSetback) { S.willSetback(state, loser, victor, "broken"); S.willWin(state, victor, loser); }
    const v = S.corpsRec(state, victor, vk);
    if (v && v.war && v.war.foe === loser) v.war.devour = true;
    S.addLog(state, `결전: ${S.corpsLabel(state, loser, lk)} 주력군 ${size}명이 ${S.corpsLabel(state, victor, vk)}에게 크게 패했습니다.` +
      (lost ? ` 쫓기며 ${lost}명을 더 잃었습니다.` : "") + " 한동안 다시 일어서지 못합니다.",
    loser === state.playerForce || victor === state.playerForce ? "warn" : "fall");
    if (f.war) endWar(state, loser, "broken", lk);
  }

  // The army took a city. A computer force's main army may press on against
  // the same foe, or leave a garrison and go home. A player's army stays,
  // for the player to lead on (beyond the cap only for a while).
  S.afterCapture = function (state, t, b) {
    if (!state.cities[t.id]) return;
    const A = b.att;
    t.campUntil = S.today(state) + W.camp;
    const camp = A.campaign;
    if (!camp || (A.force === state.playerForce && !S.spectating(state))) return;
    camp.taken++;
    const fid = A.force;
    const f = state.forces[fid];
    const k = A.corps || 1;
    const war = keepWar(state, fid, k);
    const aim = (war && war.aim) || camp.aim || "border";
    const P = W.press;
    const men = S.serving(state, t.id).filter((o) => o.force === fid && !o.transit);
    const governor = men.length > 1 ? men.reduce((a, x) => (x.pol > a.pol ? x : a)) : null;
    const team = men.filter((o) => o !== governor);
    // Facing the foe, the city keeps an occupation force for a while (less
    // when the foe's main army is broken).
    const front = S.isBorder(state, t);
    const share = war && S.isBroken(state, war.foe) ? W.occupy.share / 2 : W.occupy.share;
    const hold = front ? Math.max(S.garrisonCap(state, t), Math.round(S.marchable(t) * share)) : S.garrisonCap(state, t);
    if (front) t.campUntil = S.today(state) + W.occupy.months * S.DAYS_PER_MONTH;
    const spare = Math.floor(S.marchable(t) - Math.min(t.troops, hold));
    // A great war presses on harder, and harder still once the foe is broken.
    const weary = aim === "border" ? f.weariness * P.weary : f.weariness * P.weary * 0.5;
    let p = P.base + W.aim.press[aim] + (war && war.devour ? 15 : 0) - weary -
      camp.taken * (aim === "border" ? P.perCity : P.perCity / 3) + (A.morale - 60) * P.morale;
    // Home under attack while the army is away: it turns back (조조 from 한중).
    const homeHit = S.corpsCities(state, fid, k).some((c) => c.id !== t.id && S.besieged(state, c.id));
    if (homeHit) p -= 40;
    p = clamp(p, homeHit ? 0 : P.min, aim === "border" ? P.max : 97);
    if (homeHit) note("home under attack");
    if (S.WARLOG) note(!team.length ? "home: no officer left" : spare < P.troops ? "home: too few left" : "press roll");
    if (team.length && spare >= P.troops && S.chance(state, p)) {
      const dom = fid === state.playerForce ? null : S.domainOf(state, fid);
      const ways = S.attackTargets(state, t.id).filter((w) => {
        const x = S.place(state, w.id);
        return x.owner && !S.allied(state, fid, x.owner) && !S.truceLeft(state, fid, x.owner) &&
          (war ? x.owner === war.foe : x.owner === camp.foe || S.wantsTarget(state, fid, x, dom));
      });
      const ids = team.map((o) => o.id);
      for (const o of team) o.done = false;
      const best = aimTarget(state, fid, war, ways, (x) => {
        const unit = S.pickAttackUnit(state, t, x, spare);
        return { unit, est: S.estimate(state, t.id, x.id, ids, spare, unit) };
      });
      const need = (aim === "border" ? P.odds : W.aim.odds[aim] - 0.1) + f.weariness / 60;
      if (S.WARLOG) note(!best ? "home: no next target" : best.est.ratio < need ? "home: next too hard" : "next ok");
      if (best && best.est.ratio >= need) {
        const r = S.attack(state, t.id, best.t.id, ids, spare, best.unit);
        if (r.ok) {
          note("PRESS ON " + aim);
          r.march.corps = k;
          r.march.campaign = Object.assign(camp, { foe: best.t.owner, aim });
          S.addLog(state, `${S.corpsLabel(state, fid, k)} 주력군이 ${S.josa(t.name, "을", "를")} 넘어 ${S.ro(best.t.name)} 진군을 이어 갑니다.`, best.t.owner === state.playerForce ? "threat" : "info");
          return;
        }
      }
    }
    note("GO HOME");
    if (war && war.aim === "border") endWar(state, fid, "done", k);
    // Home: the garrison stays, the rest go back to the seat of the corps.
    const capId = S.corpsSeat(state, fid, k);
    if (!capId || capId === t.id || spare < 100) return;
    const route = S.route(state, t.id, capId, "army");
    if (!route) return;
    const counts = S.mixCounts(S.garrisonUnit(t), spare);
    const unit = S.takeTroops(t, counts);
    if (!unit) return;
    S.launch(state, { kind: "move", force: fid, path: route.path, km: route.km, speed: S.unitSpeed(counts),
      officers: team.map((o) => o.id), troops: S.countsTotal(counts), unit, train: t.train, origin: t.id, target: capId });
  };

  // ---------- peace (강화) ----------
  // Two forces who have fought this past year keep a war record
  // (state.warLog: when it began, when they last struck, how many cities
  // each took). Each month the side that is losing may want peace (its main
  // army broken, two or more cities lost, war-weary, or far weaker), and the
  // side that is winning may be content (its aim met, or tired): then the
  // loser cedes what the winner asks (cities beside the winner's land, never
  // the capital) and the two keep a truce (state.truces) for some years. A
  // player on either side is asked (state.peaceOffers) and has a month to
  // answer.
  Object.assign(W, {
    peace: {
      chance: 50, // % a month that two forces who both want it make peace
      lose: { taken: 2, weary: 50, might: 0.5 }, // when the loser wants it
      win: { border: { taken: 1, weary: 35 }, decisive: { taken: 3, weary: 45 }, annihilate: { taken: 99, weary: 70 }, none: { taken: 1, weary: 30 } },
      cede: { border: 0, decisive: 1, annihilate: 2, none: 0 }, // cities the winner asks for besides what it took
      years: 3, long: 36, // truce years; months after which any war may end
      settle: 3, // months a war must last before peace (unless a main army is broken)
      answer: 1, // months the player has to answer
      rel: 10, // standing gained
    },
    // When an ally's main army goes to war, its allies are asked to strike
    // the same foe elsewhere (조공): they may set out with lighter odds, as
    // may anyone whose foe's main army is away or broken.
    ally: { months: 4, odds: 0.25, busy: 0.2 },
  });
  const pairKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  S.truceLeft = function (state, a, b) {
    const t = state.truces && state.truces[pairKey(a, b)];
    return t ? Math.max(0, t.until - S.monthsElapsed(state)) : 0;
  };
  // Recorded on every attack and every capture.
  function warRecord(state, a, b) {
    state.warLog = state.warLog || {};
    const k = pairKey(a, b);
    const now = S.monthsElapsed(state);
    let w = state.warLog[k];
    if (!w || now - w.last > 12) w = state.warLog[k] = { since: now, last: now, taken: {} };
    w.last = now;
    return w;
  }
  S.warRecordOf = (state, a, b) => (state.warLog && state.warLog[pairKey(a, b)]) || null;

  // Attacks under a truce are refused; every attack is recorded, and a great
  // army setting out calls its allies (조공).
  const attack = S.attack;
  S.attack = function (state, cid, targetCid, oids, troops, unit) {
    const c = S.place(state, cid), t = S.place(state, targetCid);
    if (c && t && t.owner && c.owner && S.truceLeft(state, c.owner, t.owner)) {
      return { ok: false, msg: `${S.josa(S.forceName(state, t.owner), "과", "와")}는 휴전 중입니다. (${S.truceLeft(state, c.owner, t.owner)}개월 남음)` };
    }
    const r = attack.apply(this, arguments);
    if (r.ok) r.march.corps = S.placeCorps(state, c);
    if (r.ok && t.owner) {
      warRecord(state, c.owner, t.owner);
      if (S.isCapitalCity(state, c) && r.march.troops >= W.bigArmy) S.callAllies(state, c.owner, t.owner);
    }
    return r;
  };
  const afterCapture = S.afterCapture;
  S.afterCapture = function (state, t, b) {
    const loser = t.lost && t.lost.fid;
    // The city joins the corps that took it.
    if (state.cities[t.id]) {
      const k = b.att.corps || 1;
      if (k > 1 && S.corpsExists(state, b.att.force, k)) { t.corps = k; t.corpsFid = b.att.force; } else { delete t.corps; delete t.corpsFid; }
    }
    if (S.creditCapture) S.creditCapture(state, b.att);
    if (loser && state.forces[loser]) {
      const w = warRecord(state, b.att.force, loser);
      w.taken[b.att.force] = (w.taken[b.att.force] || 0) + 1;
      const war = S.warOf(state, b.att.force, b.att.corps);
      if (war && war.foe === loser) war.taken = (war.taken || 0) + 1;
    }
    return afterCapture.apply(this, arguments);
  };

  // ---------- allies strike together (주공·조공) ----------
  S.callAllies = function (state, fid, foe) {
    const now = S.monthsElapsed(state);
    for (const ally of S.allies(state, fid)) {
      if (ally === foe || !state.forces[ally] || !state.forces[ally].alive || S.allied(state, ally, foe) || S.truceLeft(state, ally, foe)) continue;
      const af = state.forces[ally];
      af.call = { foe, by: fid, until: now + W.ally.months };
      if (ally === state.playerForce || fid === state.playerForce) {
        S.addLog(state, `${S.josa(S.forceName(state, fid), "이", "가")} ${S.josa(S.forceName(state, foe), "을", "를")} 치러 나서며 동맹 ${S.forceName(state, ally)}에게 함께 치자고 청했습니다.`, "sys");
      }
    }
  };
  // Is foe's main army (of corps n, 1군단 if none) away at war, or broken?
  // (An opening for its enemies.)
  S.foeBusy = (state, foe, n) => S.onCampaign(state, foe, n) || S.isBroken(state, foe, n);
  // A call from an ally still standing.
  S.callOf = function (state, fid) {
    const c = state.forces[fid] && state.forces[fid].call;
    if (!c || S.monthsElapsed(state) > c.until || !state.forces[c.foe] || !state.forces[c.foe].alive || !S.allied(state, fid, c.by)) return null;
    return c;
  };

  // ---------- making peace ----------
  // Cities the loser would give: its own, beside the winner's land, not the
  // capital, the smallest first.
  function cedable(state, loser, winner, n) {
    if (n <= 0) return [];
    const capital = S.capitalOf(state, loser);
    const mine = S.citiesOf(state, loser);
    if (mine.length <= n) n = mine.length - 1;
    return mine.filter((c) => c.id !== capital && S.links(state, c.id).some((x) => S.place(state, x).owner === winner))
      .sort((a, b) => a.pop - b.pop).slice(0, Math.max(0, n));
  }
  // Does each side want it? {loser, winner, cede: [cities]} or null.
  S.peaceTerms = function (state, a, b) {
    const w = S.warRecordOf(state, a, b);
    if (!w || S.monthsElapsed(state) - w.last > 12) return null;
    const P = W.peace;
    const ta = w.taken[a] || 0, tb = w.taken[b] || 0;
    const ma = S.might(state, a), mb = S.might(state, b);
    const [winner, loser] = ta > tb || (ta === tb && ma >= mb) ? [a, b] : [b, a];
    const lf = state.forces[loser], wf = state.forces[winner];
    const took = w.taken[winner] || 0;
    const long = S.monthsElapsed(state) - w.since >= P.long;
    const loserWants = S.anyBroken(state, loser) || took >= P.lose.taken || lf.weariness >= P.lose.weary ||
      S.might(state, loser) / Math.max(1, S.might(state, winner)) < P.lose.might || long;
    const war = S.warAgainst(state, winner, loser);
    const aim = war ? war.aim : "none";
    const W2 = P.win[aim];
    const winnerWants = took >= W2.taken || wf.weariness >= W2.weary || long;
    const settled = S.monthsElapsed(state) - w.since >= P.settle || S.anyBroken(state, loser);
    return { winner, loser, cede: cedable(state, loser, winner, P.cede[aim]), aim, loserWants: loserWants && settled, winnerWants: winnerWants && settled };
  };
  // The loser cedes, and a truce begins.
  S.makePeace = function (state, winner, loser, cede) {
    const now = S.monthsElapsed(state);
    const P = W.peace;
    for (const c of cede) {
      if (c.owner !== loser) continue;
      // The loser's soldiers and officers withdraw; the families stay.
      // To its corps' seat, or the capital when that seat is itself given up.
      const keeps = (id) => !!id && !!state.cities[id] && state.cities[id].owner === loser && !cede.includes(state.cities[id]);
      const seat = S.seatOfCity(state, c), cap = S.capitalOf(state, loser);
      const capId = keeps(seat) ? seat : keeps(cap) ? cap : null;
      const n = Math.max(0, S.marchable(c));
      const route = capId && S.route(state, c.id, capId, "army");
      if (n >= 100 && route) {
        const counts = S.mixCounts(S.garrisonUnit(c), n);
        const unit = S.takeTroops(c, counts);
        if (unit) S.launch(state, { kind: "move", force: loser, path: route.path, km: route.km, speed: S.unitSpeed(counts),
          officers: [], troops: S.countsTotal(counts), unit, train: c.train, origin: c.id, target: capId });
      }
      for (const o of S.serving(state, c.id).filter((x) => x.force === loser)) o.city = capId || o.city;
      c.owner = winner;
      c.lost = null; // given by treaty: not to be taken back
      c.delegate = null;
      c.unrest = null;
      c.posts = S.emptyPosts();
    }
    S.officersMoved(state);
    state.truces = state.truces || {};
    state.truces[pairKey(winner, loser)] = { since: now, until: now + P.years * 12 };
    if (state.warLog) delete state.warLog[pairKey(winner, loser)];
    for (const [x, y] of [[winner, loser], [loser, winner]]) S.endWarsWith(state, x, y);
    S.relAdd(state, winner, loser, P.rel);
    S.capitalOf(state, loser);
    const mine = winner === state.playerForce || loser === state.playerForce;
    S.addLog(state, `${S.josa(S.forceName(state, winner), "과", "와")} ${S.forceName(state, loser)}이 강화했습니다.` +
      (cede.length ? ` ${S.josa(S.forceName(state, loser), "이", "가")} ${S.josa(cede.map((c) => c.name).join("·"), "을", "를")} 넘겼습니다.` : "") +
      ` ${P.years}년 동안 서로 치지 않습니다.`, mine ? "warn" : "info");
    note("PEACE");
  };
  // The player answers an offer of peace.
  S.answerPeace = function (state, id, yes) {
    const offers = state.peaceOffers || [];
    const o = offers.find((x) => x.id === id);
    if (!o) return { ok: false, msg: "그 강화 제의는 이미 끝났습니다." };
    state.peaceOffers = offers.filter((x) => x !== o);
    const other = o.winner === state.playerForce ? o.loser : o.winner;
    if (!yes) {
      S.relAdd(state, o.winner, o.loser, -3);
      return { ok: true, msg: `${S.forceName(state, other)}의 강화 제의를 물리쳤습니다.` };
    }
    const cede = o.cede.map((id2) => state.cities[id2]).filter((c) => c && c.owner === o.loser);
    S.makePeace(state, o.winner, o.loser, cede);
    return { ok: true, msg: `${S.forceName(state, other)}과 강화했습니다.` };
  };
  // The player asks a computer force for peace: it agrees if its side of
  // the terms suits it (the player has already chosen to ask).
  S.peaceAsk = function (state, me, other) {
    if (S.truceLeft(state, me, other)) return { ok: false, msg: `이미 휴전 중입니다. (${S.truceLeft(state, me, other)}개월 남음)` };
    const terms = S.peaceTerms(state, me, other);
    if (!terms) return { ok: false, msg: "지난 1년 동안 싸운 적이 없어 강화할 일이 없습니다." };
    return terms;
  };
  S.proposePeace = function (state, me, other) {
    const terms = S.peaceAsk(state, me, other);
    if (terms.ok === false) return terms;
    const willing = other === terms.winner ? terms.winnerWants : terms.loserWants;
    if (!willing) {
      S.relAdd(state, me, other, -2);
      return { ok: false, msg: `${S.forceName(state, other)}이 강화를 물리쳤습니다. 아직 싸울 뜻이 있습니다.` };
    }
    S.makePeace(state, terms.winner, terms.loser, terms.cede);
    return { ok: true, msg: `${S.forceName(state, other)}과 강화했습니다.` };
  };

  // Each month: offers lapse, and those who both want peace make it.
  S.runPeace = function (state) {
    const now = S.monthsElapsed(state);
    state.peaceOffers = (state.peaceOffers || []).filter((o) => o.until > now);
    if (state.truces) for (const [k, t] of Object.entries(state.truces)) if (t.until <= now) delete state.truces[k];
    for (const k of Object.keys(state.warLog || {})) {
      const [a, b] = k.split("|");
      if (!state.forces[a] || !state.forces[a].alive || !state.forces[b] || !state.forces[b].alive) { delete state.warLog[k]; continue; }
      if (now - state.warLog[k].last > 12) { delete state.warLog[k]; continue; }
      const terms = S.peaceTerms(state, a, b);
      if (!terms || !terms.loserWants || !terms.winnerWants || !S.chance(state, W.peace.chance)) continue;
      if (S.rulerAway(state, a) || S.rulerAway(state, b)) continue; // no one to sign
      if (S.councilBlocksPeace && S.councilBlocksPeace(state, terms)) continue; // the winner's court would fight on (js/council.js)
      const player = state.playerForce && !S.spectating(state) ? state.playerForce : null;
      if (terms.winner === player || terms.loser === player) {
        if (state.peaceOffers.some((o) => pairKey(o.winner, o.loser) === k)) continue;
        state.peaceSeq = (state.peaceSeq || 0) + 1;
        state.peaceOffers.push({ id: state.peaceSeq, winner: terms.winner, loser: terms.loser, cede: terms.cede.map((c) => c.id), until: now + W.peace.answer });
        const other = terms.winner === player ? terms.loser : terms.winner;
        S.addLog(state, `${S.forceName(state, other)}이 강화를 청해 왔습니다.`, "warn");
        continue;
      }
      S.makePeace(state, terms.winner, terms.loser, terms.cede);
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
