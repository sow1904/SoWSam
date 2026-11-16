// Bonds (유대), vows and grudges between people.
//
// Three things that the old single "affinity" number mixed up are kept apart:
//   의리 (the trait): whether a man wavers while he serves.
//   유대 (o.bond, 0-100): how close he stands to the lord he serves now. It
//     starts from kinship and old ties, and grows with years of service,
//     victories and rewards.
//   The road by which he changes lords: while his lord's force stands, a
//     steadfast man can hardly be won over; once it has fallen he is free to
//     find a new lord, and that is no betrayal.
// The exception is a steadfast man with a deep bond (순절): when his lord's
// force falls he will never serve the force that destroyed it (o.vows), and
// withdraws from the world (status "retired") for two years before he can be
// sought out again by anyone else. If the lord himself outlived his force,
// such a man waits for him instead (o.liege): he follows wherever his lord
// takes service and serves no one else while that lord lives.
// o.feel[force] is what he holds for or against a force: a grudge for a
// friend put to death, thanks for one set free.
(function (S) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const B = S.BOND = {
    start: 30, steadfast: 50, fickle: 15, kin: 80, // bond when the game begins
    join: 20, captive: 10, // bond of one newly recruited: from the wilds, from captivity
    year: 2, reward: 1, win: 1, // growth
    vow: 70, // a steadfast man with this bond keeps faith after his lord falls
    heir: 0.6, heirKin: 0.85, // share of the bond that passes to a successor
    retire: 24, // months out of the world
    close: 60, // a tie this strong shares grudges and thanks
    grudge: -40, grudgeLoyalty: 25, thanks: 15, thanksClose: 5,
    mourning: -25, // a mourner asked by a third force
    follow: 40, // one whose fallen lord still lives, asked by his lord's new force
  };

  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  S.tieOf = (a, b) => (a && b ? S.tie(a.name, b.name) : 0);

  // Bond with the ruler of his force for one who has served no time yet.
  S.baseBond = function (state, o, base) {
    const r = rulerOf(state, o.force);
    if (!r || r.id === o.id) return 100;
    return clamp(Math.max(base, S.tieOf(o, r)), 0, 100);
  };
  const startBase = (o, kin) => (kin ? B.kin : S.hasTrait(o, "의리") ? B.steadfast : S.hasTrait(o, "변심") ? B.fickle : B.start);
  S.startBond = function (state, o) {
    const r = rulerOf(state, o.force);
    const t = r ? S.tieOf(o, r) : 0;
    // An explicit feud outweighs the clan; otherwise kin stand close.
    return clamp(S.baseBond(state, o, t < 0 ? B.fickle : startBase(o, false)), 0, 100);
  };
  S.initBonds = function (state) {
    for (const o of Object.values(state.officers)) {
      if (o.bond === undefined) o.bond = o.force && o.status !== "young" ? S.startBond(state, o) : 0;
    }
  };
  // Someone has just joined fid.
  S.joinBond = function (state, o, base) {
    o.bond = S.baseBond(state, o, base);
    o.mourn = false;
    o.liege = null;
    o.begged = false;
    if (o.vows) o.vows = o.vows.filter((f) => f !== o.force); // he followed his lord there
  };
  S.bondAdd = function (state, o, d) {
    if (!o || o.status !== "serving" || S.isRuler(state, o)) return;
    o.bond = clamp((o.bond || 0) + d, 0, 100);
  };
  // A new lord takes over: part of what was owed to the old one passes on.
  S.heirBonds = function (state, fid, old, heir) {
    const kin = S.tieOf(old, heir) >= B.kin;
    for (const o of Object.values(state.officers)) {
      if (o.force !== fid || o.status === "dead" || o.status === "young") continue;
      if (o.id === heir.id) { o.bond = 100; continue; }
      o.bond = clamp(Math.max(Math.round((o.bond || 0) * (kin ? B.heirKin : B.heir)), S.tieOf(o, heir)), 0, 100);
    }
  };

  // Steadfast and close enough to keep faith with a fallen lord.
  S.faithful = (o) => S.hasTrait(o, "의리") && (o.bond || 0) >= B.vow;
  S.vowed = (o, fid) => !!(o.vows && fid && o.vows.includes(fid));
  S.feelFor = (o, fid) => (o.feel && fid && o.feel[fid]) || 0;
  S.feelAdd = function (o, fid, d) {
    if (!fid) return;
    o.feel = o.feel || {};
    o.feel[fid] = clamp((o.feel[fid] || 0) + d, -80, 40);
  };

  // Withdraw from the world for two years.
  S.retire = function (state, o) {
    o.status = "retired";
    o.force = null;
    o.captor = null;
    o.hidden = true;
    o.lord = false;
    o.transit = null;
    o.city = S.homeCity(state, o.city);
    o.back = S.monthsElapsed(state) + B.retire;
    S.officersMoved(state);
  };

  // fid has been destroyed (by foe, if anyone). Those who served it go their
  // ways: the faithful mourn, and will not serve the destroyer.
  S.forceFell = function (state, fid, foe) {
    const gone = [];
    const lord = state.officers[state.forces[fid].ruler];
    const lives = lord && lord.status !== "dead";
    for (const o of Object.values(state.officers)) {
      if (o.force !== fid || (o.status !== "serving" && o.status !== "captive")) continue;
      if (o.id !== lord.id && S.faithful(o)) {
        // His lord lives: he waits for him. Otherwise he mourns.
        if (lives) o.liege = lord.id; else o.mourn = true;
        if (foe && !S.vowed(o, foe)) (o.vows = o.vows || []).push(foe);
      }
      if (o.status !== "serving") continue;
      if (o.mourn) { S.retire(state, o); gone.push(o.name); }
      else { o.status = "free"; o.force = null; o.hidden = false; o.transit = null; o.city = S.homeCity(state, o.city); }
    }
    S.officersMoved(state);
    return gone;
  };

  // Why fid cannot win t over at all, or null.
  // The lord he still waits for, if that lord lives.
  S.liegeOf = function (state, t) {
    const l = t.liege && state.officers[t.liege];
    return l && l.status !== "dead" ? l : null;
  };
  const follows = (state, fid, t) => {
    const l = S.liegeOf(state, t);
    return !!l && l.status === "serving" && l.force === fid;
  };
  S.recruitBar = function (state, fid, t) {
    if (follows(state, fid, t)) return null;
    const l = S.liegeOf(state, t);
    if (l) return `${S.josa(t.name, "은", "는")} 옛 주군 ${S.josa(l.name, "을", "를")} 기다리고 있습니다. ${S.josa(l.name, "이", "가")} 섬기는 곳이라야 따릅니다.`;
    if (S.vowed(t, fid)) return `${S.josa(t.name, "은", "는")} 옛 주군을 멸한 세력을 섬기지 않습니다.`;
    return null;
  };
  // What ties and grudges add to the odds of fid winning t over.
  S.recruitFeel = function (state, fid, t) {
    const r = rulerOf(state, fid);
    const wait = follows(state, fid, t) ? B.follow : 0;
    return Math.round(S.feelFor(t, fid) + (r ? S.tieOf(t, r) / 4 : 0) + wait);
  };

  // A captive of force t.force was put to death by fid: those close to him
  // hold it against fid, and those of them who serve fid lose heart.
  S.grieve = function (state, t, fid) {
    const shaken = [];
    for (const o of Object.values(state.officers)) {
      if (o.id === t.id || o.status === "dead" || o.status === "young" || S.tieOf(o, t) < B.close) continue;
      S.feelAdd(o, fid, B.grudge);
      if (o.status === "serving" && o.force === fid && !S.isRuler(state, o)) {
        o.loyalty = Math.max(0, o.loyalty - B.grudgeLoyalty);
        shaken.push(o.name);
      }
    }
    return shaken;
  };
  // A captive was set free by fid.
  S.thank = function (state, t, fid) {
    S.feelAdd(t, fid, B.thanks);
    for (const o of Object.values(state.officers)) {
      if (o.id !== t.id && o.status !== "dead" && o.status !== "young" && S.tieOf(o, t) >= B.close) S.feelAdd(o, fid, B.thanksClose);
    }
  };

  // ---------- pleading for life (목숨 구걸) ----------
  // Ordered to the block, a captive may plead for his life, once. Whether he
  // does is a matter of fidelity, not a trait of its own: the fickle plead,
  // the steadfast seldom do, and one who keeps faith with his lord never.
  // The ambitious cling to life, the bold scorn to ask. A ruler pleads only
  // when his force is gone.
  S.begChance = function (state, t) {
    if (t.status !== "captive" || t.begged) return 0;
    const stands = !!(t.force && state.forces[t.force] && state.forces[t.force].alive);
    if (S.faithful(t) || t.mourn || S.liegeOf(state, t) || (t.lord && stands)) return 0;
    const by = { 변심: 35, 의리: -20, 야심: 10, 과감: -10, 신중: 5 };
    const trait = S.traitsOf(t).reduce((s, k) => s + (by[k] || 0), 0);
    const p = 20 + trait - (stands ? (t.bond || 0) * 0.2 : 0);
    return clamp(Math.round(p), 0, S.hasTrait(t, "의리") ? 10 : 80);
  };
  // Grant the plea: he serves his captor, for now.
  S.spare = function (state, cid, targetId) {
    const t = state.officers[targetId];
    const c = S.place(state, cid);
    if (!c || !t || t.status !== "captive" || t.captor !== c.owner || t.city !== cid || !t.begged) return { ok: false, msg: "살려 줄 수 있는 대상이 아닙니다." };
    const fid = c.owner;
    t.force = fid;
    t.status = "serving";
    t.captor = null;
    t.lord = false;
    t.tries = 0;
    t.hidden = false;
    t.loyalty = 40;
    t.done = true;
    S.joinBond(state, t, 5);
    S.feelAdd(t, fid, 10);
    S.officersMoved(state);
    const msg = `목숨을 구걸한 ${S.josa(t.name, "을", "를")} 살려 주어 ${S.forceName(state, fid)}에 받아들였습니다.`;
    if (fid !== state.playerForce) S.addLog(state, msg, "info");
    return { ok: true, joined: true, msg };
  };

  // How much the ruler of fid wants this captive dead, in percent. Bad blood
  // between the forces, his own feuds and grudges, and his temper all count;
  // a friend is never killed.
  S.beheadWish = function (state, fid, t) {
    const r = rulerOf(state, fid);
    if (!r) return 0;
    const tie = S.tieOf(r, t);
    if (tie >= B.close) return 0;
    const rel = t.force ? S.rel(state, fid, t.force) : 50;
    const by = { 야심: 6, 과감: 3, 무욕: -15, 의리: -5 };
    const temper = S.traitsOf(r).reduce((s, k) => s + (by[k] || 0), 0);
    const able = !t.lord && Math.max(t.cmd, t.war, t.wit, t.pol) >= 85 ? 5 : 0;
    const never = !t.lord && S.recruitBar(state, fid, t) ? 20 : 0;
    const p = (t.lord ? 8 : 2) + Math.max(0, 50 - rel) * (t.lord ? 0.6 : 0.3) - Math.max(0, rel - 50) * 0.3 +
      Math.max(0, -tie) / 2 + Math.max(0, -S.feelFor(r, t.force)) / 2 + temper + able + never;
    return clamp(Math.round(p), 0, 80);
  };

  // Each month: those who withdrew come back; each January bonds deepen.
  S.runBonds = function (state) {
    const now = S.monthsElapsed(state);
    for (const o of Object.values(state.officers)) {
      // The lord he waited for is dead: now he mourns.
      if (o.liege && o.status !== "dead" && !S.liegeOf(state, o)) {
        o.liege = null;
        if (o.status === "free") {
          S.retire(state, o);
          S.addLog(state, `${S.josa(o.name, "이", "가")} 옛 주군의 죽음을 듣고 세상을 등졌습니다.`, "info");
        } else if (o.status === "captive") o.mourn = true;
      }
      if (o.status === "retired" && now >= (o.back || 0)) {
        o.status = "free";
        o.hidden = false;
        o.mourn = false;
        o.back = null;
        S.officersMoved(state);
        S.addLog(state, `은거하던 ${S.josa(o.name, "이", "가")} ${S.placeName(state, o.city)}에서 다시 세상에 나왔습니다.`, "info");
      } else if (state.month === 1 && o.status === "serving") S.bondAdd(state, o, B.year);
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
