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
      const gold = Math.max(0, Math.floor(c.gold - S.keepGold(c)));
      const food = Math.max(0, Math.floor(c.food - S.keepFood(state, c)));
      c.gold -= gold;
      c.food -= food;
      cap.gold += gold;
      cap.food += food;
      c.sent = { gold, food };
      if (!camping(state, c)) sendToCapital(state, c, S.overCap(state, c));
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
    return m.start + Math.round((km / Math.max(1, m.km)) * total) + 1;
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
    const route = S.route(state, capId, t.id, "army");
    if (!route || route.days > W.answer.days) return;
    const ruler = rulerOf(state, fid);
    const nerve = S.hasTrait(ruler, "과감") ? 0.8 : S.hasTrait(ruler, "신중") ? 1.2 : 1;
    const spare = Math.floor(S.marchable(cap) - Math.max(W.expedition.guardMin, cap.troops * W.expedition.guard));
    const send = Math.min(spare, Math.round(m.troops * W.answer.over));
    if (send < 2000 || send + t.troops * 0.5 < m.troops * nerve) return note("answer: too weak");
    const idle = S.idle(state, capId).sort((a, x) => x.cmd + x.war - a.cmd - a.war);
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
    if (!t.owner || S.allied(state, m.force, t.owner)) return false;
    note("COUNTER SIEGE");
    m.kind = "army";
    S.startSiege(state, m);
    return true;
  };

  // Is the force already at war with its main army? (One campaign at a time.)
  S.onCampaign = (state, fid) => (state.marches || []).some((m) => m.force === fid && m.kind === "army" && m.campaign) ||
    (state.battles || []).some((b) => b.att && b.att.force === fid && b.att.campaign);

  // A computer force sends its main army against the most promising enemy
  // place in reach (js/data/ambition.js), if the odds look good enough for
  // its ruler.
  S.warAI = function (state, fid) {
    const f = state.forces[fid];
    const capId = S.capitalOf(state, fid);
    const cap = capId && state.cities[capId];
    note("call");
    if (!cap || S.besieged(state, capId)) return note("capital besieged");
    if (S.onCampaign(state, fid)) return note("already on campaign");
    if (f.weariness > 60) return note("weary");
    const E = W.expedition;
    const keep = Math.max(E.guardMin, Math.round(cap.troops * E.guard));
    const troops = Math.floor(S.marchable(cap) - keep);
    if (troops < E.min) return note("main army too small");
    const idle = S.idle(state, capId).sort((a, b) => b.cmd + b.war - (a.cmd + a.war));
    if (!idle.length) return note("no officer at capital");
    const team = idle.slice(0, Math.min(S.MAX_SORTIE_OFFICERS, Math.max(1, idle.length - 1)));
    const ids = team.map((o) => o.id);
    const truce = S.inTruce(state);
    const dom = S.domainOf(state, fid);
    let best = null;
    for (const way of S.attackTargets(state, capId)) {
      const t = S.place(state, way.id);
      if ((truce && t.owner) || (t.owner && S.allied(state, fid, t.owner)) || !S.wantsTarget(state, fid, t, dom)) continue;
      const unit = S.pickAttackUnit(state, cap, t, troops);
      const land = S.landingLink(way.path) ? S.landingForecast(state, t.id, fid, team, troops, cap.train) : null;
      if (land && !land.pass) continue;
      const est = S.estimate(state, capId, t.id, ids, land ? land.left : troops, unit);
      const pull = S.courtPull(state, fid, t);
      const threat = t.owner ? S.sortieThreat(state, t.id) : null;
      const risk = threat ? threat.pct / 50 : 0;
      const capBonus = t.owner && S.capitalOf(state, t.owner) === t.id ? W.capitalPull : 0;
      const score = est.ratio + (t.owner ? 0 : 0.2) + pull + capBonus - risk - way.days / 60;
      if (!best || score > best.score) best = { t, unit, est, pull, risk, score };
    }
    if (!best) return note("no target in reach");
    const w = f.weariness;
    const ruler = rulerOf(state, fid);
    const nerve = (S.hasTrait(ruler, "과감") ? -0.15 : S.hasTrait(ruler, "신중") ? 0.2 : 0) + (S.hasTrait(ruler, "야심") ? -0.1 : 0);
    const amity = best.t.owner ? Math.max(-0.15, (S.rel(state, fid, best.t.owner) - 50) / 80) : 0;
    if (best.est.ratio < 1.3 + w / 40 - best.pull + nerve + amity + best.risk) return note("odds too low");
    if (!S.chance(state, E.chance)) return note("dice");
    const r = S.attack(state, capId, best.t.id, ids, troops, best.unit);
    note(r.ok ? "LAUNCH" : "launch failed: " + r.msg.slice(0, 20));
    if (r.ok) r.march.campaign = { foe: best.t.owner || null, taken: 0, since: S.monthsElapsed(state) };
  };

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
    const P = W.press;
    const men = S.serving(state, t.id).filter((o) => o.force === fid && !o.transit);
    const governor = men.length > 1 ? men.reduce((a, x) => (x.pol > a.pol ? x : a)) : null;
    const team = men.filter((o) => o !== governor);
    // Facing the foe, the city keeps an occupation force for a while.
    const front = S.isBorder(state, t);
    const hold = front ? Math.max(S.garrisonCap(state, t), Math.round(S.marchable(t) * W.occupy.share)) : S.garrisonCap(state, t);
    if (front) t.campUntil = S.today(state) + W.occupy.months * S.DAYS_PER_MONTH;
    const spare = Math.floor(S.marchable(t) - Math.min(t.troops, hold));
    let p = P.base - f.weariness * P.weary - camp.taken * P.perCity + (A.morale - 60) * P.morale;
    p = clamp(p, P.min, P.max);
    if (S.WARLOG) {
      note(!team.length ? "home: no officer left" : spare < P.troops ? "home: too few left" : "press roll");
      (S.WARLOG.p = S.WARLOG.p || []).push(Math.round(p));
      (S.WARLOG.spare = S.WARLOG.spare || []).push(spare);
    }
    if (team.length && spare >= P.troops && S.chance(state, p)) {
      const dom = S.domainOf(state, fid);
      const ways = S.attackTargets(state, t.id).map((w) => S.place(state, w.id))
        .filter((x) => x.owner && !S.allied(state, fid, x.owner) && S.wantsTarget(state, fid, x, dom));
      const same = ways.filter((x) => x.owner === camp.foe);
      const ids = team.map((o) => o.id);
      for (const o of team) o.done = false;
      let best = null;
      for (const x of same.length ? same : ways) {
        const unit = S.pickAttackUnit(state, t, x, spare);
        const est = S.estimate(state, t.id, x.id, ids, spare, unit);
        if (!best || est.ratio > best.est.ratio) best = { x, unit, est };
      }
      if (S.WARLOG) note(!best ? "home: no next target" : best.est.ratio < P.odds + f.weariness / 60 ? "home: next too hard" : "next ok");
      if (best && best.est.ratio >= P.odds + f.weariness / 60) {
        const r = S.attack(state, t.id, best.x.id, ids, spare, best.unit);
        if (r.ok) {
          note("PRESS ON");
          r.march.campaign = Object.assign(camp, { foe: best.x.owner });
          S.addLog(state, `${S.forceName(state, fid)} 주력군이 ${S.josa(t.name, "을", "를")} 넘어 ${S.ro(best.x.name)} 진군을 이어 갑니다.`, best.x.owner === state.playerForce ? "threat" : "info");
          return;
        }
      }
    }
    note("GO HOME");
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
})(globalThis.SAM = globalThis.SAM || {});
