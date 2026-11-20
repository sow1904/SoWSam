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
(function (S) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const W = S.WAR = {
    cap: { base: 600, pop: 0.015 }, // garrison cap: base + people x pop
    gold: { keep: 300, perSize: 100 }, // gold a city keeps back
    food: { months: 6, plus: 2000, borderMonths: 24, borderPlus: 15000 }, // food a city keeps back (garrison months + a store)
    camp: 30, // days an army may stay in a city beyond its cap (staging, a city just taken)
    // A conquered city facing the foe keeps an occupation force for a year
    // (a share of the army that took it), so the foe cannot simply walk back in.
    occupy: { months: 12, share: 0.35 },
    capitalPull: 0.25, // a campaign leans toward the enemy capital: taking it shakes the realm
    newsKm: 80, // km a day that news of an army travels
    answer: { days: 25, over: 1.3 }, // an army sent to meet an invader: at most this far, this much stronger
    expedition: { min: 5000, guard: 0.25, guardMin: 3000, chance: 50 },
    press: { base: 75, weary: 0.8, perCity: 10, morale: 0.8, min: 10, max: 90, troops: 3000, odds: 1.0 }, // % an army goes on after taking a city
  };
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  // Tallies for balance runs (tools): set S.WARLOG = {} to count why armies stay home.
  const note = (k) => { if (S.WARLOG) S.WARLOG[k] = (S.WARLOG[k] || 0) + 1; };

  // ---------- garrisons and the main army ----------
  S.isCapitalCity = (state, c) => !!(c && c.owner && S.capitalOf(state, c.owner) === c.id);
  S.garrisonCap = (state, c) => (S.isCapitalCity(state, c) ? Infinity : Math.round(W.cap.base + c.pop * W.cap.pop));
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
    const capId = S.capitalOf(state, c.owner);
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
      if (!c.owner || S.isCapitalCity(state, c)) continue;
      const n = S.overCap(state, c);
      if (n <= 0) continue;
      const cap = state.cities[S.capitalOf(state, c.owner)];
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
      if (!c.owner || S.isCapitalCity(state, c) || S.besieged(state, c.id)) continue;
      const capId = S.capitalOf(state, c.owner);
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
      if (!camping(state, c)) sendToCapital(state, c, S.overCap(state, c) - Math.round(S.garrisonCap(state, c) * hold));
    }
  };

  // ---------- campaigns ----------
  // From the capital an army can march on any enemy place that touches the
  // force's own land, through that land. From another city, only on the
  // nearest enemy place down each road (a raid, or a staged attack).
  const nearTargets = S.attackTargets;
  S.attackTargets = function (state, from) {
    const p = S.place(state, from);
    if (!p || !state.cities[from] || !S.isCapitalCity(state, p)) return nearTargets(state, from);
    const me = p.owner;
    const best = new Map();
    for (const [cid, days] of Object.entries(S.reachable(state, from, "army")).concat([[from, 0]])) {
      if (!state.cities[cid]) continue;
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
        S.addLog(state, `첩보: ${S.forceName(state, m.force)} ${S.unitName(m.unit)} ${m.troops}명이 ${S.placeName(state, S.marchBase(state, m.path, m.force))}을 지나 ${S.ro(t.name)} 진군하고 있습니다. (${S.daysLeft(state, m)}일 뒤 도착)`, "threat");
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
    const capId = S.capitalOf(state, fid);
    const cap = capId && state.cities[capId];
    if (!cap || capId === t.id || S.besieged(state, capId)) return;
    if (S.isBroken(state, fid)) return note("answer: broken");
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
      officers: team.map((o) => o.id), troops: total, unit, train: cap.train, origin: capId, target: t.id });
    r.base = S.marchBase(state, r.path, fid);
    r.campaign = { foe: m.force, taken: 0, since: S.monthsElapsed(state), counter: true };
    note("ANSWER");
    S.addLog(state, `${S.forceName(state, fid)} 주력군 ${total}명이 ${S.forceName(state, m.force)}의 침공에 맞서 ${S.ro(t.name)} 떠났습니다.`,
      m.force === state.playerForce ? "threat" : "info");
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

  // Is the force already at war with its main army? (One campaign at a time.)
  S.onCampaign = (state, fid) => (state.marches || []).some((m) => m.force === fid && m.kind === "army" && m.campaign) ||
    (state.battles || []).some((b) => b.att && b.att.force === fid && b.att.campaign);

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
  S.isBroken = (state, fid) => !!(state.forces[fid] && (state.forces[fid].brokenUntil || 0) > S.monthsElapsed(state));
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
  S.warOf = (state, fid) => (state.forces[fid] && state.forces[fid].war) || null;

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
  function endWar(state, fid, why) {
    const f = state.forces[fid];
    const war = f && f.war;
    if (!war) return;
    f.war = null;
    note("war ends: " + why);
    const foe = S.forceName(state, war.foe);
    const text = why === "won" ? `${S.josa(S.forceName(state, fid), "이", "가")} ${S.josa(foe, "과", "와")}의 ${AIMS[war.aim]}을 끝냈습니다.`
      : why === "broken" ? `${S.forceName(state, fid)} 주력군이 꺾여 ${S.josa(foe, "과", "와")}의 ${AIMS[war.aim]}을 거두었습니다.`
      : why === "weary" ? `${S.forceName(state, fid)}이 지쳐 ${S.josa(foe, "과", "와")}의 ${AIMS[war.aim]}을 거두었습니다.`
      : null;
    if (text && war.aim !== "border") S.addLog(state, text, war.foe === state.playerForce || fid === state.playerForce ? "warn" : "info");
  }
  // Is the war still worth it? Ends it if not.
  function keepWar(state, fid) {
    const f = state.forces[fid];
    const war = f.war;
    if (!war) return null;
    if (!state.forces[war.foe] || !state.forces[war.foe].alive) { endWar(state, fid, "won"); return null; }
    if (S.isBroken(state, fid)) { endWar(state, fid, "broken"); return null; }
    if (f.weariness > W.aim.wearyLimit[war.aim]) { endWar(state, fid, "weary"); return null; }
    if (S.monthsElapsed(state) - war.since > W.aim.years[war.aim] * 12) { endWar(state, fid, "long"); return null; }
    if (S.allied(state, fid, war.foe)) { endWar(state, fid, "peace"); return null; }
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
  S.warAI = function (state, fid) {
    const f = state.forces[fid];
    const capId = S.capitalOf(state, fid);
    const cap = capId && state.cities[capId];
    note("call");
    let war = keepWar(state, fid);
    if (!cap || S.besieged(state, capId)) return note("capital besieged");
    if (S.onCampaign(state, fid)) return note("already on campaign");
    if (S.isBroken(state, fid)) return note("broken");
    if (!war && f.weariness > 60) return note("weary");
    const E = W.expedition;
    const idle = S.idle(state, capId).sort((a, b) => S.leadScore(state, b) - S.leadScore(state, a));
    if (!idle.length) return note("no officer at capital");
    const team = idle.slice(0, Math.min(S.MAX_SORTIE_OFFICERS, Math.max(1, idle.length - 1)));
    const ids = team.map((o) => o.id);
    const truce = S.inTruce(state);
    const dom = S.domainOf(state, fid);
    const call = war ? null : S.callOf(state, fid);
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
        const a = called ? "border" : S.chooseAim(state, fid, foe);
        const ratio = S.might(state, fid) / Math.max(1, S.might(state, foe));
        const v = ratio + (a === "annihilate" ? 0.5 : a === "decisive" ? 0.2 : 0) - S.rel(state, fid, foe) / 100 +
          (called ? 1 : 0) + (S.foeBusy(state, foe) ? 0.5 : 0) + (S.provoked ? S.provoked(state, fid, foe) : 0);
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
      const land = S.landingLink(way.path) ? S.landingForecast(state, t.id, fid, team, troops, cap.train) : null;
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
    const opening = (war && war.joint ? W.ally.odds : 0) + (best.t.owner && S.foeBusy(state, best.t.owner) ? W.ally.busy : 0);
    const advice = S.adviserEdge ? S.adviserEdge(state, fid) : 0; // a 군사 sees which wars can be won
    if (best.est.ratio < W.aim.odds[aim] + w / 40 - best.pull + nerve + amity + best.risk - opening - advice) return note("odds too low: " + aim);
    if (!S.chance(state, E.chance)) return note("dice");
    const r = S.attack(state, capId, best.t.id, ids, troops, best.unit);
    note(r.ok ? "LAUNCH " + aim : "launch failed");
    if (!r.ok) return;
    r.march.campaign = { foe: best.t.owner || null, taken: 0, since: S.monthsElapsed(state), aim };
    if (war && !f.war && best.t.owner) {
      f.war = war;
      if (war.joint) {
        note("JOINT STRIKE");
        S.addLog(state, `${S.josa(S.forceName(state, fid), "이", "가")} 동맹 ${S.forceName(state, war.joint)}의 청에 따라 ${S.forceName(state, war.foe)}의 ${S.ro(best.t.name)} 군을 냅니다.`,
          war.foe === state.playerForce ? "threat" : "info");
      } else if (aim !== "border") {
        const foe = S.forceName(state, war.foe);
        S.addLog(state, `${S.josa(S.forceName(state, fid), "이", "가")} ${S.josa(foe, "을", "를")} 상대로 ${AIMS[aim]}을 벌입니다. 주력군 ${troops}명이 ${S.ro(best.t.name)} 향합니다.`,
          war.foe === state.playerForce ? "threat" : "info");
      }
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
    breakForce(state, R.force, b.att.force, lost, R.troops0);
  };
  // A siege failed. If a relief army drove off a main army in the field, the
  // attacker is the one broken.
  S.siegeFailed = function (state, b) {
    const A = b.att;
    if (A.campaign && b.relief && A.troops0 >= W.bigArmy) {
      if (S.creditDecisive) S.creditDecisive(state, b.relief, A);
      breakForce(state, A.force, b.relief.force, 0, A.troops0);
    }
    const f = state.forces[A.force];
    if (f && f.war && f.war.aim === "border") endWar(state, A.force, "failed");
  };
  function breakForce(state, loser, victor, lost, size) {
    const f = state.forces[loser];
    if (!f) return;
    f.brokenUntil = S.monthsElapsed(state) + W.broken;
    S.addWeariness(state, loser, 10);
    note("MAIN ARMY BROKEN");
    const v = state.forces[victor];
    if (v && v.war && v.war.foe === loser) v.war.devour = true;
    S.addLog(state, `결전: ${S.forceName(state, loser)} 주력군 ${size}명이 ${S.forceName(state, victor)}에게 크게 패했습니다.` +
      (lost ? ` 쫓기며 ${lost}명을 더 잃었습니다.` : "") + " 한동안 다시 일어서지 못합니다.",
    loser === state.playerForce || victor === state.playerForce ? "warn" : "fall");
    if (f.war) endWar(state, loser, "broken");
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
    const war = keepWar(state, fid);
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
    const homeHit = S.citiesOf(state, fid).some((c) => c.id !== t.id && S.besieged(state, c.id));
    if (homeHit) p -= 40;
    p = clamp(p, homeHit ? 0 : P.min, aim === "border" ? P.max : 97);
    if (homeHit) note("home under attack");
    if (S.WARLOG) note(!team.length ? "home: no officer left" : spare < P.troops ? "home: too few left" : "press roll");
    if (team.length && spare >= P.troops && S.chance(state, p)) {
      const dom = S.domainOf(state, fid);
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
          r.march.campaign = Object.assign(camp, { foe: best.t.owner, aim });
          S.addLog(state, `${S.forceName(state, fid)} 주력군이 ${S.josa(t.name, "을", "를")} 넘어 ${S.ro(best.t.name)} 진군을 이어 갑니다.`, best.t.owner === state.playerForce ? "threat" : "info");
          return;
        }
      }
    }
    note("GO HOME");
    if (war && war.aim === "border") endWar(state, fid, "done");
    // Home: the garrison stays, the rest go back to the capital.
    const capId = S.capitalOf(state, fid);
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
    if (r.ok && t.owner) {
      warRecord(state, c.owner, t.owner);
      if (S.isCapitalCity(state, c) && r.march.troops >= W.bigArmy) S.callAllies(state, c.owner, t.owner);
    }
    return r;
  };
  const afterCapture = S.afterCapture;
  S.afterCapture = function (state, t, b) {
    const loser = t.lost && t.lost.fid;
    if (S.creditCapture) S.creditCapture(state, b.att);
    if (loser && state.forces[loser]) {
      const w = warRecord(state, b.att.force, loser);
      w.taken[b.att.force] = (w.taken[b.att.force] || 0) + 1;
      const war = state.forces[b.att.force].war;
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
  // Is foe's main army away at war, or broken? (An opening for its enemies.)
  S.foeBusy = (state, foe) => S.onCampaign(state, foe) || S.isBroken(state, foe);
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
    const loserWants = S.isBroken(state, loser) || took >= P.lose.taken || lf.weariness >= P.lose.weary ||
      S.might(state, loser) / Math.max(1, S.might(state, winner)) < P.lose.might || long;
    const war = wf.war && wf.war.foe === loser ? wf.war : null;
    const aim = war ? war.aim : "none";
    const W2 = P.win[aim];
    const winnerWants = took >= W2.taken || wf.weariness >= W2.weary || long;
    const settled = S.monthsElapsed(state) - w.since >= P.settle || S.isBroken(state, loser);
    return { winner, loser, cede: cedable(state, loser, winner, P.cede[aim]), aim, loserWants: loserWants && settled, winnerWants: winnerWants && settled };
  };
  // The loser cedes, and a truce begins.
  S.makePeace = function (state, winner, loser, cede) {
    const now = S.monthsElapsed(state);
    const P = W.peace;
    for (const c of cede) {
      if (c.owner !== loser) continue;
      // The loser's soldiers and officers withdraw; the families stay.
      const capId = S.capitalOf(state, loser);
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
    for (const [x, y] of [[winner, loser], [loser, winner]]) {
      const f = state.forces[x];
      if (f && f.war && f.war.foe === y) f.war = null;
    }
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
