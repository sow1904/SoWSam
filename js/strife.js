// Court strife (알력다툼) and slander (참소).
//
// 알력다툼: every season the two strongest factions of a force may fall out.
// The closer they stand in strength, the worse the old feuds between their
// men (negative ties), the more ambitious their leaders, the likelier. A
// 중앙집권형 court, where everything turns on the lord's favour, quarrels
// most; in a 호족연합형 state the families keep to their own lands. The side
// with more weight, a better tongue and the lord's ear wins: it has the lord's
// favour for a year (f.favor), and the losers resent it (bond and loyalty
// fall), which feeds defection, rebellion and forced 하야.
// 참소: after a quarrel, or now and then on their own, the favoured side
// accuses the ablest man of the other. The lord believes it or not. If he
// does, the accused loses loyalty and bond and, if he heads a city, is called
// back to the capital; if not, the accuser is disgraced. The player decides
// for his own force; a computer lord by the accuser's tongue against the
// accused's standing, and by his own nature.
// why: the user's plan: 파벌 -> 후계 내분 -> 반란·하야 -> 알력다툼·참소, with
// palace strife strongest under central rule.
(function (S) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const T = S.STRIFE = {
    share: 0.08, // both factions need at least this share (a great court splits into many)
    rate: 0.12, // % a season per point of tension
    regime: { 중앙집권형: 1.5, 부곡형: 1, 호족연합형: 0.7 },
    favorMonths: 12,
    win: { bond: 3 }, lose: { bond: 6, loyalty: 4, leader: 5 },
    slander: { after: 50, alone: 2 }, // % after a quarrel; % a season otherwise (with a favoured faction)
    believe: { base: 40, cautious: -15, bold: 10, central: 10, lo: 10, hi: 85 },
    hit: { loyalty: 20, bond: 15 }, // the accused, when believed
    back: { loyalty: 8, bond: 10, target: 5 }, // the accuser when not believed; the accused's bond gained
    wait: 1, // months the player has to decide
  };
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const loss = (state, o, k, d) => { if (o && o.status === "serving") o[k] = clamp((o[k] || 0) - d, 0, 100); };

  // The two factions likeliest to quarrel and the tension between them:
  // {a, b, tension, p (% a season)} or null.
  S.strifeOutlook = function (state, fid) {
    const facs = S.factions(state, fid).filter((g) => g.share >= T.share);
    if (facs.length < 2) return null;
    const [a, b] = facs;
    let feud = 0;
    for (const x of a.members) for (const y of b.members) feud = Math.max(feud, -S.tieOf(x, y));
    const close = 1 - Math.abs(a.share - b.share) / (a.share + b.share);
    let tension = 15 + close * 25 + feud / 2;
    for (const g of [a, b]) if (S.hasTrait(g.leader, "야심")) tension += 10;
    const p = tension * T.rate * (T.regime[S.regime(state, fid).label] || 1);
    return { a, b, tension: Math.round(tension), p: Math.round(p * 10) / 10 };
  };
  // The favoured faction's key, while the favour lasts.
  S.favored = function (state, fid) {
    const f = state.forces[fid];
    return f && f.favor && S.monthsElapsed(state) < f.favor.until ? f.favor : null;
  };

  // Weight in a quarrel.
  function weight(state, fid, g) {
    const ruler = rulerOf(state, fid);
    const fav = S.favored(state, fid);
    return g.share * 100 + (g.leader.pol + g.leader.speech) / 4 + S.tieOf(g.leader, ruler) / 2 +
      (fav && fav.key === g.key ? 10 : 0) + S.rand(state) * 30;
  }
  function quarrel(state, fid, out) {
    const f = state.forces[fid];
    const [win, lose] = weight(state, fid, out.a) >= weight(state, fid, out.b) ? [out.a, out.b] : [out.b, out.a];
    for (const o of win.members) S.bondAdd(state, o, T.win.bond);
    for (const o of lose.members) { S.bondAdd(state, o, -T.lose.bond); loss(state, o, "loyalty", T.lose.loyalty); }
    loss(state, lose.leader, "loyalty", T.lose.leader);
    f.favor = { key: win.key, name: win.name, until: S.monthsElapsed(state) + T.favorMonths };
    const msg = `${S.forceName(state, fid)}에서 ${S.josa(win.name, "과", "와")} ${S.josa(lose.name, "이", "가")} 알력을 다투어 ${S.josa(lose.name, "이", "가")} 밀려났습니다.`;
    S.addLog(state, msg, fid === state.playerForce ? "warn" : "strife");
    return { win, lose };
  }

  // The accuser (the best tongue of the favoured side, ambitious men first)
  // and the accused (the ablest of the other side, city heads first).
  function pickSlander(state, fid, win, lose) {
    const ruler = rulerOf(state, fid);
    const tongue = (o) => o.speech + (S.hasTrait(o, "야심") || S.hasTrait(o, "변심") ? 20 : 0) - (S.hasTrait(o, "의리") ? 30 : 0);
    const by = win.members.filter((o) => o !== ruler).reduce((a, b) => (tongue(b) > tongue(a) ? b : a), win.members[0]);
    const heads = new Set(lose.cities.map((c) => S.cityHead(state, c)));
    const worth = (o) => o.cmd + o.pol + (heads.has(o) ? 40 : 0);
    const target = lose.members.reduce((a, b) => (worth(b) > worth(a) ? b : a), lose.members[0]);
    return by && target && by !== target ? { by, target } : null;
  }
  // % that the lord believes it (a computer lord; shown to the player too).
  S.believeChance = function (state, fid, by, target) {
    const B = T.believe;
    const ruler = rulerOf(state, fid);
    let p = B.base + (by.speech - target.pol) / 2 + S.tieOf(ruler, by) / 4 - S.tieOf(ruler, target) / 4 - (target.bond || 0) / 4;
    if (S.hasTrait(ruler, "신중")) p += B.cautious;
    if (S.hasTrait(ruler, "과감")) p += B.bold;
    if (S.regime(state, fid).label === "중앙집권형") p += B.central;
    return Math.round(clamp(p, B.lo, B.hi));
  };
  function slander(state, fid, by, target) {
    const msg = `${S.josa(by.name, "이", "가")} ${S.josa(target.name, "을", "를")} 참소했습니다.`;
    if (fid === state.playerForce && !S.spectating(state)) {
      if (state.forces[fid].slander) return; // one accusation at a time, the first still unanswered
      state.forces[fid].slander = { by: by.id, target: target.id, until: S.monthsElapsed(state) + T.wait };
      S.addLog(state, msg + " 믿을지 정해야 합니다.", "warn");
      return;
    }
    S.answerSlander(state, fid, S.chance(state, S.believeChance(state, fid, by, target)), { by, target });
  }

  // A slander raised elsewhere (js/council.js: the man proved right in council).
  S.raiseSlander = function (state, fid, by, target) {
    if (!by || !target || by === target || by.status !== "serving" || target.status !== "serving" || by.force !== fid || target.force !== fid) return;
    if (state.forces[fid].slander) return;
    slander(state, fid, by, target);
  };
  // believe: true to act on it. pending: {by, target} for a computer lord.
  S.answerSlander = function (state, fid, believe, pending) {
    const f = state.forces[fid];
    const s = pending || (f.slander && { by: state.officers[f.slander.by], target: state.officers[f.slander.target] });
    if (!pending) f.slander = null;
    if (!s || !s.by || !s.target) return { ok: false, msg: "처리할 참소가 없습니다." };
    const { by, target } = s;
    if (target.status !== "serving" || target.force !== fid) return { ok: false, msg: `${S.josa(target.name, "은", "는")} 이미 세력에 없습니다.` };
    let msg;
    if (believe) {
      loss(state, target, "loyalty", T.hit.loyalty);
      S.bondAdd(state, target, -T.hit.bond);
      const c = state.cities[target.city];
      const capital = S.capitalOf(state, fid);
      const recalled = c && c.owner === fid && c.id !== capital && S.cityHead(state, c) === target;
      if (recalled) { target.city = capital; S.officersMoved(state); }
      msg = `${S.josa(target.name, "이", "가")} 참소를 당해 신임을 잃었습니다${recalled ? `. ${c.name}에서 ${S.ro(S.placeName(state, capital))} 불려 갔습니다` : ""}.`;
    } else {
      loss(state, by, "loyalty", T.back.loyalty);
      S.bondAdd(state, by, -T.back.bond);
      S.bondAdd(state, target, T.back.target);
      msg = `${by.name}의 참소를 물리쳤습니다. ${S.josa(by.name, "은", "는")} 체면을 잃었습니다.`;
    }
    if (pending) S.addLog(state, `${S.forceName(state, fid)}에서 ${S.josa(by.name, "이", "가")} ${S.josa(target.name, "을", "를")} 참소했습니다. ${msg}`, "strife");
    return { ok: true, msg };
  };

  // Each season (months 3, 6, 9, 12): quarrels and slander.
  S.runStrife = function (state) {
    const now = S.monthsElapsed(state);
    for (const f of Object.values(state.forces)) {
      // A slander left unanswered is dropped.
      if (f.slander && now >= f.slander.until) { f.slander = null; S.addLog(state, "답하지 않은 참소는 흐지부지되었습니다.", "info"); }
      if (state.month % 3 || !f.alive || !rulerOf(state, f.id)) continue;
      const out = S.strifeOutlook(state, f.id);
      if (!out) continue;
      if (S.chance(state, out.p)) {
        const r = quarrel(state, f.id, out);
        if (S.chance(state, T.slander.after)) {
          const s = pickSlander(state, f.id, r.win, r.lose);
          if (s) slander(state, f.id, s.by, s.target);
        }
      } else if (S.favored(state, f.id) && S.chance(state, T.slander.alone)) {
        const fav = S.favored(state, f.id);
        const win = [out.a, out.b].find((g) => g.key === fav.key);
        const lose = [out.a, out.b].find((g) => g !== win);
        const s = win && lose ? pickSlander(state, f.id, win, lose) : null;
        if (s) slander(state, f.id, s.by, s.target);
      }
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
