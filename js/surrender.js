// Surrender (항복): a whole force goes over to another, by envoy.
//
//   항복 권고: a force far stronger than another sends an envoy urging it
//     to give itself up (as Cao Cao wrote to Sun Quan).
//   귀순: a force sends an envoy offering itself to another.
//
// Whichever side would give itself up, its court debates it (council kind
// "surrender", js/council.js): the cautious and the old want safety, the
// ambitious a bigger stage, the conquest-minded, the faithful and the lord's
// own house stand against it. A computer lord decides by the court and his
// own temper: the unambitious, the cautious and the weak in war yield, the
// ambitious and the bold do not. The force offered a submission debates
// taking it in (kind "accept"); most are glad of it.
//
// When a force gives itself up, the loudest voice against it who governs a
// city may break away with the cities of his faction, as when an heir is
// contested (S.splitChance, S.secede: js/succession.js). The rest, cities,
// strongholds, officers, armies on the road, go over to the other force.
// Its lord becomes one of its officers; those sworn against the new lord go
// into the wilds.
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });
  const SU = S.SURRENDER = {
    urge: { ratio: 3, cities: 2, wait: 12, rel: -5 }, // strength ratio and city ratio to urge; months between; a refusal sours them
    submit: { ratio: 1.5, aiRatio: 2.5, wait: 6 }, // to whom one may submit; a computer lord only to one this much stronger
    bar: 0.25, // a computer lord yields when his will reaches this
    temper: { 무욕: 0.25, 신중: 0.1, 야심: -0.45, 과감: -0.2 },
    weak: { at: 60, per: 0.01, max: 0.25 }, // a lord whose (용병+무력)/2 is below 60 yields more readily
    pride: 0.2, // a lord gives up his house unwillingly, the more so the wider his aims (영토)
    calm: -0.3, // with no war on him and no city lost this past year, he hardly thinks of it
    young: 12, // months a newly risen force is left alone
    floor: -0.15, // nor against a court plainly set against it
    speech: 400, // an envoy's tongue: (speech-50)/speech
    accept: -0.3, // a court refuses a submission below this
    pct: { mid: 50, per: 150, max: 90 }, // will over the bar -> percent
    loyalty: 60,
    split: 0.8, // breakaway odds after a surrender, relative to a contested succession
  };
  const alive = (state, f) => !!(f && state.forces[f] && state.forces[f].alive);
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const ratioOf = (state, a, b) => S.forcePower(state, a) / Math.max(1, S.forcePower(state, b));
  const cityCount = (state, f) => S.citiesOf(state, f).length;
  const playerRuns = (state, fid) => fid === state.playerForce && !S.spectating(state);

  // ---------- who may ----------
  // Why `from` cannot urge `to` to surrender, or "".
  S.urgeBar = function (state, from, to) {
    if (!alive(state, from) || !alive(state, to) || from === to) return "항복을 권할 수 없는 세력입니다.";
    if (S.rulerAway(state, to)) return "그 군주가 자리에 없습니다.";
    if (!S.touches(state, from, to)) return "땅이 맞닿은 세력에만 권합니다";
    const r = ratioOf(state, from, to);
    if (r < SU.urge.ratio || cityCount(state, from) < cityCount(state, to) * SU.urge.cities)
      return `세력 차가 모자랍니다 (병력 ${SU.urge.ratio}배, 도시 ${SU.urge.cities}배 이상; 지금 병력 ${Math.round(r * 10) / 10}배)`;
    const at = state.urged && state.urged[from + ">" + to];
    if (at != null && S.monthsElapsed(state) - at < SU.urge.wait) return `권고한 지 얼마 안 됨 (${SU.urge.wait - (S.monthsElapsed(state) - at)}개월 뒤)`;
    return "";
  };
  // Why `from` cannot submit to `to`, or "".
  S.submitBar = function (state, from, to) {
    if (!alive(state, from) || !alive(state, to) || from === to) return "귀순할 수 없는 세력입니다.";
    if (S.rulerAway(state, to)) return "그 군주가 자리에 없습니다.";
    if (ratioOf(state, to, from) < SU.submit.ratio) return `우리보다 크게 강한 세력에만 귀순합니다 (병력 ${SU.submit.ratio}배 이상)`;
    const at = state.submitted && state.submitted[from + ">" + to];
    if (at != null && S.monthsElapsed(state) - at < SU.submit.wait) return `거절당한 지 얼마 안 됨 (${SU.submit.wait - (S.monthsElapsed(state) - at)}개월 뒤)`;
    return "";
  };

  // ---------- the yielding side ----------
  // fid's court on giving itself up to `to`: {d, will, pct}. speech: the
  // urging envoy's tongue, if any. pct: the chance a computer lord yields.
  S.yieldOutlook = function (state, fid, to, speech) {
    const ratio = ratioOf(state, to, fid);
    const d = S.debate(state, fid, { kind: "surrender", foe: to, ratio });
    const r = rulerOf(state, fid);
    const f = state.forces[fid];
    let will = d.support + S.traitsOf(r).reduce((s, t) => s + (SU.temper[t] || 0), 0);
    will += Math.min(SU.weak.max, Math.max(0, SU.weak.at - (r.cmd + r.war) / 2) * SU.weak.per);
    will -= SU.pride * S.ambitionOf(state, r).land;
    will += clamp((ratio - SU.urge.ratio) * 0.03, -0.15, 0.2) + (S.rel(state, fid, to) - 50) / 200;
    // Pressed: at war, or losing ground this past year.
    const log = f.sizeLog || [];
    const shrank = log.length && Math.max(...log) > S.citiesOf(state, fid).length;
    const atWar = S.warRecordOf && Object.keys(state.forces).some((x) => x !== fid && S.warRecordOf(state, fid, x));
    if (!shrank && !atWar) will += SU.calm;
    if (f.since != null && S.monthsElapsed(state) - f.since < SU.young) will -= 0.5;
    if (d.seats.length >= 2 && !d.pro.length) will -= 0.2; // no one at court speaks for it
    if (speech != null) will += (speech - 50) / SU.speech;
    will = Math.round(will * 100) / 100;
    const P = SU.pct;
    const pct = will < SU.bar - P.mid / P.per || (d.seats.length && d.support < SU.floor) ? 0 : clamp(Math.round(P.mid + (will - SU.bar) * P.per), 0, P.max);
    return { d, will, pct, ratio: Math.round(ratio * 10) / 10 };
  };
  // The receiving court on taking in `from`: {d, pct}.
  S.acceptOutlook = function (state, fid, from) {
    const d = S.debate(state, fid, { kind: "accept", foe: from });
    const r = rulerOf(state, fid);
    const temper = (S.hasTrait(r, "야심") ? 0.15 : 0) + (S.hasTrait(r, "무욕") ? -0.05 : 0);
    const v = (d.seats.length ? d.support : 0.3) + temper;
    return { d, pct: v < SU.accept ? 0 : clamp(Math.round(70 + (v - SU.accept) * 60), 0, 95) };
  };

  // ---------- giving up ----------
  // loser goes over to winner. how: "urge" | "submit". d: the loser's debate
  // (for who stood against it). Returns log lines.
  S.surrender = function (state, loser, winner, how, d) {
    const L = state.forces[loser], Wf = state.forces[winner];
    const lord = rulerOf(state, loser);
    const lines = [];
    d = d || S.debate(state, loser, { kind: "surrender", foe: winner, ratio: ratioOf(state, winner, loser) });
    const record = S.councilRecord(state, loser, { kind: "surrender", foe: winner }, d, true, how);
    record.result = "made";
    lines.push(`${S.josa(S.forceName(state, loser), "이", "가")} ${S.forceName(state, winner)}에 ${how === "urge" ? "항복 권고를 받아들여 " : ""}${how === "urge" ? "항복했습니다" : "귀순했습니다"}. 조정에서는 ${S.councilLine(state, d)}.`);
    // Those who will not have it: the loudest against, with a city, may go his own way.
    const broke = breakAway(state, loser, winner, d);
    if (broke) lines.push(broke);
    // The rest go over.
    const cities = S.citiesOf(state, loser);
    for (const c of cities) { c.owner = winner; c.delegate = null; c.unrest = null; }
    for (const f of Object.values(state.forts || {})) if (f.owner === loser) f.owner = winner;
    const gone = [];
    let joined = 0;
    for (const o of Object.values(state.officers)) {
      if (o.captor === loser) o.captor = winner;
      if (o.force !== loser || (o.status !== "serving" && o.status !== "captive")) continue;
      const player = S.isPlayer && S.isPlayer(state, o);
      if (!player && o !== lord && (S.recruitBar(state, winner, o) || S.vowed(o, winner))) {
        if (o.status === "serving") { o.status = "free"; o.force = null; o.transit = null; o.city = S.homeCity(state, o.city); gone.push(o.name); }
        continue;
      }
      o.force = winner;
      o.lastForce = winner;
      o.prev = { fid: loser, name: lord.name }; // those who came over together (js/factions.js)
      if (o.status === "serving") {
        o.loyalty = o === lord ? SU.loyalty : clamp(Math.max(o.loyalty, SU.loyalty), 0, 90);
        o.merit = 0;
        S.joinBond(state, o, S.BOND.join);
        joined++;
      }
    }
    lord.liege = null;
    // Captives now held by their own side go free to it.
    for (const o of Object.values(state.officers)) if (o.status === "captive" && o.captor === o.force) S.freeCaptive(state, o);
    for (const m of state.marches || []) if (m.force === loser) m.force = winner;
    for (const b of state.battles || []) for (const side of [b.att, b.def, b.relief]) if (side && side.force === loser) side.force = winner;
    // Treaties and wars of the force that is no more.
    const has = (k) => k.split("|").includes(loser);
    for (const bag of [state.pacts, state.warLog, state.truces]) if (bag) for (const k of Object.keys(bag)) if (has(k)) delete bag[k];
    state.peaceOffers = (state.peaceOffers || []).filter((x) => x.winner !== loser && x.loser !== loser);
    state.proposals = (state.proposals || []).filter((x) => x.fid !== loser);
    state.officeAsks = (state.officeAsks || []).filter((x) => x.fid !== loser);
    for (const f of Object.values(state.forces)) S.endWarsWith(state, f.id, loser);
    L.alive = false;
    L.war = null;
    S.noteFall(state, { fid: loser, foe: winner, ruler: lord.id, gone, how: "submit" });
    if (state.aiDays) delete state.aiDays[loser];
    S.officersMoved(state);
    S.capitalOf(state, winner);
    if (S.syncCourt) S.syncCourt(state);
    if (S.syncPlayer) S.syncPlayer(state); // the player's character goes with them
    lines.push(`${cities.length}개 도시와 무장 ${joined}명이 ${Wf.name}군에 들어갔고, ${S.josa(lord.name, "은", "는")} ${Wf.name}의 신하가 되었습니다.` +
      (gone.length ? ` ${S.josa(gone.join(", "), "은", "는")} 새 주군을 섬기지 않겠다며 떠났습니다.` : ""));
    const mine = [loser, winner].includes(state.playerForce) || (S.playerChar && S.playerChar(state) && [loser, winner].includes(S.playerChar(state).force));
    for (const l of lines) S.addLog(state, l, mine ? "warn" : "fall");
    return lines;
  };
  // The loudest voice against the surrender who governs a city breaks away
  // with his faction's cities, at the odds of a contested succession.
  function breakAway(state, loser, winner, d) {
    const capital = S.capitalOf(state, loser);
    const lord = rulerOf(state, loser);
    const facs = S.factions(state, loser);
    const pro = new Set(d.pro.map((c) => c.o));
    for (const c of d.con) {
      const o = c.o;
      if (o === lord || o.status !== "serving" || o.force !== loser || (S.isPlayer && S.isPlayer(state, o))) continue;
      const g = facs.find((x) => x.members.includes(o));
      const own = S.governs(state, o);
      const cities = new Set((g ? g.cities : []).concat(own ? [own] : []).filter((x) => x.owner === loser && x.id !== capital));
      if (!cities.size) continue;
      const share = g ? g.share : 0.1;
      if (!S.chance(state, Math.round(S.splitChance(state, loser, o, share) * SU.split))) return null;
      const members = new Set(g ? g.members : [o]);
      const list = S.secede(state, loser, o, [...cities], (x) => !pro.has(x) || members.has(x), () => false);
      const nid = list[0].owner;
      S.relAdd(state, nid, winner, 5 - S.rel(state, nid, winner));
      return `${S.josa(o.name, "이", "가")} 항복에 불복하여 ${S.josa(list.map((x) => x.name).join("·"), "을", "를")} 이끌고 독립했습니다.`;
    }
    return null;
  }

  // ---------- the envoy's errand (js/diplomacy.js) ----------
  // Chance the other side says yes, for the envoy's day of arrival.
  S.surrenderEnvoyChance = function (state, e, speech) {
    return e.kind === "urge" ? S.yieldOutlook(state, e.to, e.from, speech).pct : S.acceptOutlook(state, e.to, e.from).pct;
  };
  // Settle an urging or a submission. yes: the receiving side's answer.
  // Returns log lines.
  S.settleSurrender = function (state, e, yes) {
    const now = S.monthsElapsed(state);
    const F = S.forceName(state, e.from), T = S.forceName(state, e.to);
    if (e.kind === "urge") {
      state.urged = state.urged || {};
      state.urged[e.from + ">" + e.to] = now;
      const out = S.yieldOutlook(state, e.to, e.from, (state.officers[e.officer] || {}).speech);
      if (yes) return S.surrender(state, e.to, e.from, "urge", out.d);
      S.councilRecord(state, e.to, { kind: "surrender", foe: e.from }, out.d, false, playerRuns(state, e.to) ? "player" : "ai");
      S.relAdd(state, e.from, e.to, SU.urge.rel);
      return [`${S.josa(T, "이", "가")} ${F}의 항복 권고를 물리쳤습니다. 조정에서는 ${S.councilLine(state, out.d)}.`];
    }
    const out = S.acceptOutlook(state, e.to, e.from);
    if (yes) {
      S.councilRecord(state, e.to, { kind: "accept", foe: e.from }, out.d, true, playerRuns(state, e.to) ? "player" : "ai").result = "made";
      return S.surrender(state, e.from, e.to, "submit", null);
    }
    state.submitted = state.submitted || {};
    state.submitted[e.from + ">" + e.to] = now;
    S.councilRecord(state, e.to, { kind: "accept", foe: e.from }, out.d, false, playerRuns(state, e.to) ? "player" : "ai");
    return [`${S.josa(T, "이", "가")} ${F}의 귀순을 받아들이지 않았습니다.`];
  };

  // ---------- the computer's part (called from S.diploAI) ----------
  // Returns true when it sent an envoy.
  S.surrenderAI = function (state, fid, envoy) {
    const me = rulerOf(state, fid);
    const others = Object.keys(state.forces).filter((x) => x !== fid && alive(state, x) && !S.envoysOf(state, fid).some((e) => e.to === x));
    // A weak force pressed by a far stronger neighbour thinks of giving itself up.
    const pressing = others.filter((x) => S.touches(state, fid, x) && ratioOf(state, x, fid) >= SU.submit.aiRatio && !S.submitBar(state, fid, x));
    if (pressing.length && !S.allies(state, fid).length) {
      // To the one it stands best with.
      const to = pressing.reduce((a, b) => (S.rel(state, fid, b) + S.opinion(state, me, rulerOf(state, b)) > S.rel(state, fid, a) + S.opinion(state, me, rulerOf(state, a)) ? b : a));
      const out = S.yieldOutlook(state, fid, to);
      if (out.pct > 0 && S.chance(state, out.pct)) {
        if (S.sendEnvoy(state, fid, to, envoy.id, "submit").ok) {
          S.councilRecord(state, fid, { kind: "surrender", foe: to }, out.d, true, "ai");
          S.addLog(state, `${S.forceName(state, fid)} 조정이 ${S.forceName(state, to)}에 귀순하기로 하고 사자를 보냈습니다. (${S.councilLine(state, out.d)})`,
            to === state.playerForce ? "warn" : "strife");
          return true;
        }
      }
      return false;
    }
    // A strong force urges the weak to yield, when it might work.
    if (!S.hasTrait(me, "무욕") || S.chance(state, 30)) {
      let best = null;
      for (const x of others) {
        if (S.urgeBar(state, fid, x) || S.allied(state, fid, x)) continue;
        const pct = S.yieldOutlook(state, x, fid, envoy.speech).pct;
        if (pct >= 20 && (!best || pct > best.pct)) best = { x, pct };
      }
      if (best && S.chance(state, 50) && S.sendEnvoy(state, fid, best.x, envoy.id, "urge").ok) return true;
    }
    return false;
  };
})(globalThis.SAM = globalThis.SAM || {});
