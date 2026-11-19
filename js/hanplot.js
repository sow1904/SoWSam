// The Han faction (한조파) and its plots.
//
// In the force that keeps 헌제, those who hold the Han dear (한조중시) form
// the 한조파 (js/factions.js). If another force takes the emperor's city,
// those of them inside give themselves up to it at once; those elsewhere go
// over to the new keeper a year later, unless bound to their lord too deeply
// (and if he changes hands again first, the year starts over).
// While the emperor's favour toward his keeper is low, they may try to kill
// the keeper (동승's plot): it very seldom succeeds, and then the 한조파
// leader takes the seat, with all the strife of a succession
// (js/succession.js). When it fails the hand behind it may come to light,
// and one of them dies for it, or stay hidden and nothing follows.
// why: the user's design for a Han faction that weighs on whoever holds the
// emperor, whatever the regime.
(function (S) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const P = S.HAN_PLOT = {
    favor: 40, // plots only below this favour
    rate: 0.15, // % a season per point of favour below it
    full: 3, // members for the full rate (fewer, a share of it)
    max: 6,
    success: 3, // % a plot succeeds, plus the plotter's 모략 / 50
    found: 50, // % a failed plot is traced back
    stay: 70, // bond with the lord that keeps a member from following the emperor
  };
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const hanFaction = (state, fid) => S.factions(state, fid).find((g) => g.kind === "han") || null;
  S.hanFaction = hanFaction;

  // % a season that the 한조파 of the keeper tries for his life: {g, p}.
  S.plotOutlook = function (state, fid) {
    const han = state.han;
    if (!han || han.ended || han.holder !== fid || han.favor >= P.favor) return { g: null, p: 0 };
    const g = hanFaction(state, fid);
    if (!g) return { g: null, p: 0 };
    const p = (P.favor - han.favor) * P.rate * Math.min(1, g.members.length / P.full);
    return { g, p: Math.min(P.max, Math.round(p * 10) / 10) };
  };
  S.plotSuccess = (o) => P.success + Math.round((o.plot || 0) / 50);

  function plot(state, fid, g) {
    const ruler = rulerOf(state, fid);
    const by = g.members.reduce((a, b) => (b.plot + b.speech > a.plot + a.speech ? b : a));
    const name = S.forceName(state, fid);
    const kind = fid === state.playerForce ? "warn" : "fall";
    if (S.chance(state, S.plotSuccess(by))) {
      ruler.status = "dead";
      ruler.hidden = true;
      S.addLog(state, `${name}에서 ${S.josa(by.name, "이", "가")} 이끈 한조파가 ${S.josa(ruler.name, "을", "를")} 시해했습니다.`, kind);
      const heirs = S.officersOf(state, fid);
      if (!heirs.length) return;
      for (const m of S.succeed(state, fid, ruler, heirs, { by: g, verb: "시해하고", take: true })) S.addLog(state, m, kind);
      // A loyalist now keeps the emperor.
      state.han.favor = Math.max(state.han.favor, S.COURT.baseFavor.H);
      S.capitalOf(state, fid);
      return;
    }
    if (S.chance(state, P.found)) {
      // The hand behind it is found: the plotter dies for it.
      by.status = "dead";
      by.hidden = true;
      by.transit = null;
      S.officersMoved(state);
      S.addLog(state, `${S.josa(ruler.name, "을", "를")} 노린 암살이 실패했습니다. 배후로 드러난 ${S.josa(by.name, "이", "가")} 처형되었습니다.`, kind);
    } else if (fid === state.playerForce) {
      S.addLog(state, `${S.josa(ruler.name, "을", "를")} 노린 암살이 실패했습니다. 배후는 드러나지 않았습니다.`, "warn");
    }
  }

  // Those of fid who hold the Han dear and would follow the emperor: not the
  // ruler's kin nor his old companions (the factions' 종친 and 원종), and not
  // bound to him too deeply.
  S.hanLoyalists = function (state, fid) {
    const ruler = rulerOf(state, fid);
    if (!ruler) return [];
    const kin = (o) => S.CLAN[o.name] && S.CLAN[ruler.name] && S.CLAN[o.name].clan === S.CLAN[ruler.name].clan;
    return S.officersOf(state, fid).filter((o) => o.han === "H" && o !== ruler && !o.transit && !kin(o) &&
      S.tieOf(o, ruler) < S.FACTION.old && (o.bond || 0) < P.stay);
  };
  function goOver(state, o, to, city) {
    const k = S.postOf(state, o);
    if (k && state.cities[o.city] && state.cities[o.city].posts) state.cities[o.city].posts[k] = null;
    o.force = to;
    o.city = city;
    o.loyalty = 75;
    S.joinBond(state, o, S.BOND.join);
    o.done = true;
  }

  // The emperor's city falls: the 한조파 inside give themselves up to the
  // taker at once (js/battle.js, before the garrison is taken). Returns those
  // who did.
  S.hanSurrender = function (state, cid, defForce, to) {
    const han = state.han;
    if (!han || han.ended || cid !== state.emperor || !defForce || han.holder !== defForce) return [];
    const g = hanFaction(state, defForce);
    if (!g) return [];
    const there = g.members.filter((o) => o.status === "serving" && o.city === cid && !o.transit);
    for (const o of there) goOver(state, o, to, cid);
    if (there.length) S.officersMoved(state);
    return there;
  };

  // The emperor changes hands: those of his loyalists left in the old
  // keepers' other cities follow him a year later (S.HAN_PLOT.follow). If he
  // changes hands again before then, the year starts over.
  P.follow = 12;
  const syncCourt = S.syncCourt;
  S.syncCourt = function (state) {
    const han = state.han;
    const old = han && !han.ended ? han.holder : null;
    syncCourt(state);
    const now = state.han && !state.han.ended ? state.han.holder : null;
    if (now === old) return;
    const from = new Set(han.shift ? han.shift.from : []);
    if (old) from.add(old);
    if (now) from.delete(now);
    han.shift = from.size ? { from: [...from], since: S.monthsElapsed(state) } : null;
  };
  // Months until the loyalists of fid go over to the keeper (null: none due).
  S.hanFollowIn = function (state, fid) {
    const sh = state.han && state.han.shift;
    if (!sh || !sh.from.includes(fid)) return null;
    return Math.max(0, P.follow - (S.monthsElapsed(state) - sh.since));
  };
  function follow(state) {
    const han = state.han;
    const sh = han && han.shift;
    if (!sh || han.ended || S.monthsElapsed(state) - sh.since < P.follow) return;
    const now = han.holder;
    if (!now || !state.forces[now] || !state.forces[now].alive) return; // wait for a keeper
    han.shift = null;
    const city = state.emperor && state.cities[state.emperor].owner === now ? state.emperor : S.capitalOf(state, now);
    for (const old of sh.from) {
      if (!state.forces[old] || !state.forces[old].alive || old === now) continue;
      const gone = S.hanLoyalists(state, old);
      if (!gone.length) continue;
      for (const o of gone) goOver(state, o, now, city);
      S.officersMoved(state);
      const mine = old === state.playerForce || now === state.playerForce;
      S.addLog(state, `한조파 ${S.josa(gone.map((o) => o.name).join(", "), "이", "가")} ${S.josa(S.forceName(state, old), "을", "를")} 버리고 헌제를 따라 ${S.forceName(state, now)}에 들어갔습니다.`,
        mine ? "warn" : "info");
    }
  }

  // Each season (months 2, 5, 8, 11, apart from the court quarrels).
  S.runHanPlot = function (state) {
    follow(state);
    if (state.month % 3 !== 2) return;
    const han = state.han;
    if (!han || han.ended || !han.holder) return;
    const fid = han.holder;
    if (!state.forces[fid] || !state.forces[fid].alive || !rulerOf(state, fid) || rulerOf(state, fid).status !== "serving") return;
    const out = S.plotOutlook(state, fid);
    if (out.g && S.chance(state, out.p)) plot(state, fid, out.g);
  };
})(globalThis.SAM = globalThis.SAM || {});
