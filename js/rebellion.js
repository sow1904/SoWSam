// Rebellion (반란) and stepping down (하야).
//
// 반란: only in a great realm, one that has held 25 cities or more for three
// years (a small lord keeps his captains close). There the head of a city
// away from the capital who is ill content (low
// loyalty, little bond with the lord) may raise his own banner. Those of his
// faction heading other cities who are no happier go with him. How likely
// depends on his nature, on how strong his garrison stands against the
// capital's, on the force's regime (the families of a 호족연합형 state follow
// their own men) and on war weariness.
// 하야: a ruler may leave his seat. A computer lord grown old hands it to his
// heir; the player may do so from the faction window. A faction holding half
// the court whose leader has no bond with the lord may force him out and put
// up its own man. Either way the succession (js/succession.js) follows, with
// all its strife.
// why: the user wanted rebellion and 하야 as ways to break up a stalemate,
// rebellion only once a force has grown large, and 하야 rare.
(function (S) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const R = S.REBEL = {
    loyalty: 60, bond: 40, // discontent: loyalty below the first, plus half of bond below the second
    rate: 0.015, // % a month per point of discontent
    nature: { 야심: 2, 변심: 1.5, 의리: 0.15, 무욕: 0.3 },
    regime: { 중앙집권형: 0.6, 부곡형: 1, 호족연합형: 1.4 },
    kin: 0.5, max: 12,
    big: { cities: 25, months: 36 }, // risings only in a force holding this many cities this long
    join: { bond: 50, loyalty: 70 }, // faction fellows heading cities join below both of these
    follow: 60, // those serving in the cities go along below this bond with the lord
    // A faction forcing the ruler out: % a month = (share - from) x rate x (bond short of the bar) / 20.
    // Not within settle months of a new lord, nor by a leader loyal to loyalty or more.
    forced: { share: 0.5, from: 0.4, bond: 25, loyalty: 70, rate: 2, max: 2, settle: 36 },
    old: 65, oldRate: 2, // a computer lord past this age steps down: % a year per year past it
  };
  const NATURE = { 야심: 2, 의리: 0.2, 무욕: 0.3 };
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const sameClan = (a, b) => !!(a && b && S.CLAN[a.name] && S.CLAN[b.name] && S.CLAN[a.name].clan === S.CLAN[b.name].clan);
  const weary = (state, fid) => 1 + (state.forces[fid].weariness || 0) / 100;

  // ---------- rebellion ----------
  // Months until the force is great enough to see risings (0: it is now),
  // or null while it holds too few cities.
  S.rebelWait = function (state, fid) {
    const f = state.forces[fid];
    if (!f || f.bigSince == null) return null;
    return Math.max(0, R.big.months - (S.monthsElapsed(state) - f.bigSince));
  };
  function trackSize(state, f) {
    if (S.citiesOf(state, f.id).length >= R.big.cities) { if (f.bigSince == null) f.bigSince = S.monthsElapsed(state); }
    else f.bigSince = null;
  }
  // % a month that o, at the head of c, rises.
  S.rebelChance = function (state, o, c) {
    const fid = o && o.force;
    if (!fid || o.status !== "serving" || S.isRuler(state, o) || c.owner !== fid) return 0;
    if (S.rebelWait(state, fid) !== 0) return 0;
    if (S.capitalOf(state, fid) === c.id || S.cityHead(state, c) !== o) return 0;
    // Discontent: low loyalty, little bond, and a poor lot (js/standing.js).
    const d = Math.max(0, R.loyalty - o.loyalty) + Math.max(0, R.bond - (o.bond || 0)) / 2 + Math.max(0, 40 - (o.content == null ? 50 : o.content)) / 2;
    if (!d) return 0;
    let p = d * R.rate;
    for (const t of S.traitsOf(o)) p *= R.nature[t] || 1;
    p *= R.regime[S.regime(state, fid).label] || 1;
    const cap = state.cities[S.capitalOf(state, fid)];
    p *= clamp(c.troops / Math.max(1000, cap ? cap.troops : 0), 0.3, 2);
    p *= weary(state, fid);
    if (sameClan(o, rulerOf(state, fid))) p *= R.kin;
    return Math.min(R.max, Math.round(p * 10) / 10);
  };
  // The cities o would take: his own, and those of his faction's discontented.
  S.rebelCities = function (state, o, c) {
    const fid = o.force;
    const list = [c];
    const g = S.factionOf(state, o);
    if (g) {
      const capital = S.capitalOf(state, fid);
      for (const x of g.cities) {
        const h = S.cityHead(state, x);
        if (x !== c && x.id !== capital && h && (h.bond || 0) < R.join.bond && h.loyalty < R.join.loyalty) list.push(x);
      }
    }
    return list;
  };
  function rebel(state, o, c) {
    const fid = o.force;
    const name = S.forceName(state, fid);
    const g = S.factionOf(state, o);
    const side = new Set(g ? g.members : []);
    const list = S.secede(state, fid, o, S.rebelCities(state, o, c),
      (x) => side.has(x) || (x.bond || 0) < R.follow, (x) => side.has(x));
    const msg = `${S.josa(o.name, "이", "가")} ${name}에 반기를 들어 ${S.josa(list.map((x) => x.name).join("·"), "을", "를")} 차지했습니다.`;
    S.addLog(state, msg, fid === state.playerForce ? "warn" : "fall");
    return msg;
  }

  // ---------- stepping down ----------
  // The faction that might force the ruler out, and the % a month: {g, p}.
  S.forcedOutlook = function (state, fid) {
    const g = S.factions(state, fid)[0];
    const F = R.forced;
    const f = state.forces[fid];
    if (f.since != null && S.monthsElapsed(state) - f.since < F.settle) return { g: null, p: 0 };
    if (!g || g.share < F.share || (g.leader.bond || 0) >= F.bond || g.leader.loyalty >= F.loyalty) return { g: null, p: 0 };
    let p = (g.share - F.from) * F.rate * (F.bond - (g.leader.bond || 0)) / 20;
    for (const t of S.traitsOf(g.leader)) p *= NATURE[t] || 1;
    p *= weary(state, fid);
    return { g, p: Math.min(F.max, Math.round(p * 10) / 10) };
  };
  // The ruler leaves his seat (by: the faction forcing him out). Returns
  // {ok, msg} with the log lines joined.
  S.stepDown = function (state, fid, by) {
    const ruler = rulerOf(state, fid);
    if (!ruler) return { ok: false, msg: "군주가 없습니다." };
    const heirs = S.officersOf(state, fid).filter((o) => o !== ruler);
    if (!heirs.length) return { ok: false, msg: "뒤를 이을 사람이 없습니다." };
    S.retire(state, ruler);
    ruler.back = 1e9; // he does not come back into the world
    const msgs = S.succeed(state, fid, ruler, heirs, { by });
    const kind = fid === state.playerForce ? "warn" : "fall";
    for (const m of msgs) S.addLog(state, m, kind);
    S.capitalOf(state, fid);
    return { ok: true, msg: msgs.join(" ") };
  };
  // The player's ruler steps down to the heir.
  S.canStepDown = (state, fid) => S.officersOf(state, fid).some((o) => !S.isRuler(state, o));

  // Each month: risings, rulers forced out, and (in the first month) old
  // computer lords stepping down.
  S.runRebellion = function (state) {
    for (const f of Object.values(state.forces)) {
      if (!f.alive || !rulerOf(state, f.id)) continue;
      trackSize(state, f);
      const ruler = rulerOf(state, f.id);
      if (ruler.status !== "serving") continue;
      const out = S.forcedOutlook(state, f.id);
      if (out.g && S.chance(state, out.p)) { S.stepDown(state, f.id, out.g); continue; }
      if (state.month === 1 && f.id !== state.playerForce && S.heirCandidates(state, f.id).length) {
        let p = (S.age(state, ruler) - R.old) * R.oldRate;
        for (const t of S.traitsOf(ruler)) p *= { 무욕: 2, 야심: 0.3 }[t] || 1;
        if (p > 0 && S.chance(state, p)) { S.stepDown(state, f.id); continue; }
      }
      for (const c of S.citiesOf(state, f.id)) {
        const h = S.cityHead(state, c);
        const p = h ? S.rebelChance(state, h, c) : 0;
        if (p && S.chance(state, p)) rebel(state, h, c);
      }
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
