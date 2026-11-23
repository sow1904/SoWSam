// 원정 의지 (the will to campaign): how much a lord means to march on each foe
// across his borders, built up month by month and spent when he goes.
//
// Every month, against each foe his corps can reach (by land or water), a
// computer lord's will rises or falls with:
//   - the balance of strength (more when he is the stronger),
//   - time: an old frontier draws the eye a little every month,
//   - the foe's weakness: its main army away or broken,
//   - the bad blood between them (relations, a raid to avenge),
//   - his own people's weariness (less),
//   - his nature (과감 more, 신중 less) and his way of ruling (S.RULER_WAY):
//       패도 (조조): will comes quickly;
//       민심 (유비): only once his people are settled (order);
//       안정 (손권): only once his realm is steady (the families' consent).
// High will lowers the odds a lord asks before he sets out and makes it more
// likely that he goes at all; past W.will.prep he is heard to be preparing a
// campaign (a warning to his foe). Going spends will; a main army broken in
// the field or a landing thrown back leaves fear of that foe for years, when
// no will builds against it (after 적벽, 조조 never went south again in force).
// why: the user's design. A lord's great campaigns come of a will that
// gathers over years, not of the odds of one month's battle.
(function (S) {
  const V = (S.WILL = {
    start: 30, // will at the start against every foe (a scenario may set others)
    base: 0.3, // a month, time alone
    might: 0.6, // x (ratio - 0.7), the ratio clamped to 0..3
    busy: 1, // the foe's main army away or broken
    rel: 30, // -(rel - 40) / rel
    provoked: 2, // x the lift of a raid to avenge (js/conduct.js)
    weary: 30, // -weariness / weary
    bold: 1.3, careful: 0.8,
    prep: 70, // past this he prepares a campaign (and is heard to)
    odds: 0.6, // the odds asked fall by (will - 50) / 100 x odds
    spend: 0.5, // will kept when he sets out
    fear: { broken: 36, landing: 12, harsh: 0.67 }, // months without will after a defeat (x harsh for 패도)
    win: 15, // will gained by the victor of a field battle that breaks a main army
  });
  // The ways of ruling the histories give the great lords.
  S.RULER_WAY = { 조조: "패도", 조비: "패도", 유비: "민심", 손권: "안정" };
  S.RULER_WAY_HELP = {
    패도: "원정 의지가 빨리 쌓이고, 패한 뒤 두려움도 빨리 가십니다.",
    민심: "백성이 안정되어야(치안 평균 50 이상, 70이면 온전히) 원정 의지가 쌓입니다.",
    안정: "나라가 안정되어야(호족 협력 평균 40 이상, 60이면 온전히) 원정 의지가 쌓입니다.",
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  S.rulerWay = (state, fid) => {
    const f = state.forces[fid];
    const r = f && state.officers[f.ruler];
    return (r && S.RULER_WAY[r.name]) || null;
  };
  S.willOf = (state, fid, foe) => {
    const f = state.forces[fid];
    return f && f.will && f.will[foe] != null ? f.will[foe] : V.start;
  };
  const fearOf = (state, fid, foe) => {
    const f = state.forces[fid];
    return !!(f && f.fear && f.fear[foe] > S.monthsElapsed(state));
  };
  const setWill = (state, fid, foe, n) => {
    const f = state.forces[fid];
    if (!f) return;
    f.will = f.will || {};
    f.will[foe] = Math.round(clamp(n, 0, 100) * 10) / 10;
  };
  // How much of a month's rise his way of ruling lets through.
  S.wayGate = function (state, fid) {
    const way = S.rulerWay(state, fid);
    const cs = S.citiesOf(state, fid);
    if (!cs.length) return 1;
    const avg = (k) => cs.reduce((s, c) => s + (c[k] || 0), 0) / cs.length;
    if (way === "패도") return 1.5;
    if (way === "민심") return clamp((avg("order") - 50) / 20, 0, 1);
    if (way === "안정") return clamp((avg("consent") - 40) / 20, 0, 1);
    return 1;
  };
  // The foes a force's corps can reach.
  S.willFoes = function (state, fid) {
    const out = new Set();
    for (const k of S.corpsList(state, fid)) {
      if (!k.seat || !state.cities[k.seat] || state.cities[k.seat].owner !== fid) continue;
      for (const w of S.attackTargets(state, k.seat)) {
        const p = S.place(state, w.id);
        if (p && p.owner && p.owner !== fid && !S.allied(state, fid, p.owner)) out.add(p.owner);
      }
    }
    return [...out];
  };
  // A month's change of will against foe, and why (for the help and tests).
  S.willGain = function (state, fid, foe) {
    const f = state.forces[fid];
    const ruler = state.officers[f.ruler];
    const ratio = clamp(S.might(state, fid) / Math.max(1, S.might(state, foe)), 0, 3);
    let up = V.base + Math.max(0, V.might * (ratio - 0.7)) + (S.foeBusy(state, foe) ? V.busy : 0) +
      Math.max(0, -(S.rel(state, fid, foe) - 40) / V.rel) + (S.provoked ? S.provoked(state, fid, foe) * V.provoked : 0);
    const down = Math.max(0, V.might * (0.7 - ratio)) + Math.max(0, (S.rel(state, fid, foe) - 40) / V.rel) + f.weariness / V.weary;
    up *= S.hasTrait(ruler, "과감") ? V.bold : S.hasTrait(ruler, "신중") ? V.careful : 1;
    up *= S.wayGate(state, fid);
    if (fearOf(state, fid, foe)) up = 0;
    return up - down;
  };
  S.runWill = function (state) {
    for (const f of Object.values(state.forces)) {
      if (!f.alive || f.id === state.playerForce) continue;
      const foes = S.willFoes(state, f.id);
      for (const foe of foes) {
        const before = S.willOf(state, f.id, foe);
        const after = clamp(before + S.willGain(state, f.id, foe), 0, 100);
        setWill(state, f.id, foe, after);
        if (before < V.prep && after >= V.prep) {
          const msg = `${S.josa(S.forceName(state, f.id), "이", "가")} ${S.forceName(state, foe)} 원정을 준비한다는 소문이 들립니다.`;
          S.addLog(state, msg, foe === state.playerForce ? "threat" : "info");
        }
      }
      // A foe no longer in reach is slowly forgotten.
      for (const foe of Object.keys(f.will || {})) if (!foes.includes(foe)) setWill(state, f.id, foe, f.will[foe] - 1);
    }
  };
  // How much the will eases the odds a lord asks before setting out.
  S.willOdds = (state, fid, foe) => ((S.willOf(state, fid, foe) - 50) / 100) * V.odds;
  S.willSpent = (state, fid, foe) => setWill(state, fid, foe, S.willOf(state, fid, foe) * V.spend);
  // A defeat: no will against that foe for a time. why: 적벽.
  S.willSetback = function (state, fid, foe, kind) {
    const f = state.forces[fid];
    if (!f || !foe) return;
    const months = Math.round(V.fear[kind] * (S.rulerWay(state, fid) === "패도" ? V.fear.harsh : 1));
    f.fear = f.fear || {};
    f.fear[foe] = Math.max(f.fear[foe] || 0, S.monthsElapsed(state) + months);
    setWill(state, fid, foe, kind === "broken" ? 0 : S.willOf(state, fid, foe) / 2);
  };
  S.willWin = (state, fid, foe) => setWill(state, fid, foe, S.willOf(state, fid, foe) + V.win);
  // A scenario's will: [[force, foe, will], ...].
  S.initWill = function (state, scenario) {
    for (const [fid, foe, n] of scenario.will || []) if (state.forces[fid]) setWill(state, fid, foe, n);
  };
})(globalThis.SAM = globalThis.SAM || {});
