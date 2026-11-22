// Conduct (phase 3 of the redesign, docs/redesign.md): what officers do of
// their own accord.
//
//   태수 유형 S.governorType(o): how the head of a city away from the
//   capital runs it, from what he wants and what he thinks of his lord.
//     목민: keeps the peace and the families' goodwill. Little to show for it.
//     출세: squeezes the city to send gifts to the capital (진상), drafts
//       harder, raids the border. Merit comes quickly; the people pay.
//     할거: thinks ill of his lord. Keeps back half the tribute and the
//       soldiers over the cap, courts the families for himself, rises sooner.
//   국경 습격: a frontier governor takes part of his garrison over the border
//   for horses, grain and gold, and for merit. The raided force bears a grudge
//   (standing falls, its men resent the raider, it looks for revenge). The
//   raider's lord reproves him (문책) to mend things, or lets it pass (묵인).
//   A player lord is asked, and may forbid raids altogether (a 할거 governor
//   raids all the same).
//   무장 행동: now and then an officer acts for himself: 교류 (wins over a
//   colleague) or, deeply discontent, 출분 (goes over to a lord he thinks
//   better of).
// why: the user's design: governors work in their own way by ambition, and a
// small raid can start a war (장비 and 여포's horses).
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });
  const C = S.CONDUCT = {
    mokmin: { order: 1, orderMax: 85, consent: 8 },
    rise: { gift: 0.2, order: 1, orderMin: 40, consent: -8, merit: 1, opEvery: 3, op: 1, draftOrder: 35 },
    warlord: { hold: 0.5, consent: 5, rebel: 1.5 },
    raid: {
      chance: { 출세: 5, 할거: 2.5, 목민: 0.3 }, // % a month for a frontier governor
      bold: 1.6, wary: 0.5, grudge: 10, poor: 2, poorGold: 300, war: 2, feud: 1, feudRel: 30,
      minTroops: 1500, share: 0.25, min: 500, max: 2000,
      loot: { gold: 0.15, goldMax: 600, food: 0.1, foodPer: 3, horse: 0.2, pop: 0.003, order: 4 },
      loss: { won: [0.05, 0.12], lost: [0.2, 0.05] }, // [raider, defender] as a share of the party
      rel: { won: -8, lost: -4, reproved: 4 }, op: -10, merit: 5, fame: 1, content: 3,
      provoked: 12, // months the raided force looks for revenge
      reprove: { merit: -10, op: -10, content: -8, rel: 55, might: 0.7 },
      answer: 1, // months the player has to decide
    },
    act: { chance: 12, mingle: 4, flee: { content: 40, loyalty: 70, gap: 15, chance: 30, opLord: -20 } },
  };
  const R = C.raid;
  const now = (state) => S.monthsElapsed(state);
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const playerRuns = (state, fid) => fid === state.playerForce && !S.spectating(state);
  const bleed = (c, n) => {
    n = Math.min(c.troops, Math.max(0, Math.round(n)));
    if (c.troops > 0) c.retainers = Math.round((c.retainers || 0) * (1 - n / c.troops));
    c.troops -= n;
    return n;
  };

  // ---------- governor types ----------
  S.GOVERNOR_TYPES = {
    목민: "치안과 호족 협력을 돌봅니다. 눈에 띄는 공은 적습니다.",
    출세: "성을 쥐어짜 수도로 진상하고, 징병을 서두르고, 국경을 습격합니다. 공적은 빨리 쌓이지만 치안과 호족 협력이 떨어집니다.",
    할거: "군주를 좋게 보지 않습니다. 상납을 절반만 보내고 상한을 넘는 병사도 붙잡아 두며, 호족을 제 편으로 끌어들입니다. 반란 위험이 커집니다.",
  };
  // The governor of c: the head of a city other than the capital, not the ruler.
  S.governorOf = function (state, c) {
    if (!c || !c.owner || S.capitalOf(state, c.owner) === c.id) return null;
    const h = S.cityHead(state, c);
    return h && !S.isRuler(state, h) ? h : null;
  };
  S.governorType = function (state, o) {
    if (!o || o.status !== "serving" || S.isRuler(state, o)) return null;
    const a = S.ambitionOf(state, o);
    const op = S.opinion(state, o, rulerOf(state, o.force));
    const content = o.content == null ? 50 : o.content;
    if (op < -25 || (op < -10 && (a.land + a.house >= 1.5 || content < 35))) return "할거";
    if (a.rise >= 1.2 && a.rise >= a.safety + 0.5) return "출세";
    return "목민";
  };
  const typeOf = (state, c) => { const g = S.governorOf(state, c); return g ? S.governorType(state, g) : null; };
  S.cityGovernorType = typeOf;

  // Tribute a 할거 governor keeps back (js/war.js): a share of what he would send.
  S.withhold = (state, c) => (typeOf(state, c) === "할거" ? C.warlord.hold : 0);
  // How low order may fall before a computer governor stops drafting (js/ai.js).
  S.draftOrderFloor = (state, c) => { const t = typeOf(state, c); return t === "출세" ? C.rise.draftOrder : t === "목민" ? 60 : 50; };
  // The families' goodwill follows the governor's way.
  const consentTarget = S.consentTarget;
  S.consentTarget = function (state, c) {
    const t = typeOf(state, c);
    const d = t === "목민" ? C.mokmin.consent : t === "출세" ? C.rise.consent : t === "할거" ? C.warlord.consent : 0;
    return clamp(consentTarget.apply(this, arguments) + d, 0, 100);
  };
  // A 할거 governor rises sooner (js/rebellion.js).
  S.rebelNature = (state, o) => (S.governorType(state, o) === "할거" ? C.warlord.rebel : 1);

  function runGovernors(state) {
    for (const c of S.cityList(state)) {
      const g = S.governorOf(state, c);
      if (!g) continue;
      const t = S.governorType(state, g);
      if (t === "목민") {
        if (c.order < C.mokmin.orderMax) c.order = Math.min(C.mokmin.orderMax, c.order + C.mokmin.order);
      } else if (t === "출세") {
        // 진상: a gift to the capital wrung from the city's reserve.
        const capId = S.capitalOf(state, c.owner);
        const cap = capId && state.cities[capId];
        const gift = Math.round(Math.min(S.income(c) * C.rise.gift, c.gold - S.keepGold(c) / 2));
        if (cap && gift > 0 && !S.besieged(state, c.id)) {
          c.gold -= gift;
          cap.gold += gift;
          if (c.sent) c.sent.gold += gift;
          if (now(state) % C.rise.opEvery === 0) S.opAdd(rulerOf(state, c.owner), g, C.rise.op);
        }
        if (c.order > C.rise.orderMin) c.order -= C.rise.order;
        S.addMerit(g, C.rise.merit);
      }
    }
  }

  // ---------- border raids ----------
  // Enemy cities next to c that a raid could hit.
  function raidTargets(state, c) {
    const fid = c.owner;
    return S.neighbors(c.id).map((n) => state.cities[n]).filter((t) => t && t.owner && t.owner !== fid &&
      !S.allied(state, fid, t.owner) && !(S.truceLeft && S.truceLeft(state, fid, t.owner)) && !S.besieged(state, t.id));
  }
  // % this month that governor o of c raids t.
  S.borderRaidChance = function (state, o, c, t) {
    const type = S.governorType(state, o);
    const f = state.forces[c.owner];
    if (f.noRaids && type !== "할거") return 0;
    let p = R.chance[type] || 0;
    if (S.hasTrait(o, "과감")) p *= R.bold;
    if (S.hasTrait(o, "신중")) p *= R.wary;
    p += Math.max(0, -S.feelFor(o, t.owner)) / R.grudge;
    if (c.gold < R.poorGold) p += R.poor;
    if (S.atWarWith(state, f.id, t.owner)) p += R.war;
    if (S.rel(state, c.owner, t.owner) < R.feudRel) p += R.feud;
    return Math.round(p * 10) / 10;
  };
  // The raided force looks for revenge on fid (js/war.js): 0 or a lift.
  S.provoked = function (state, fid, foe) {
    const f = state.forces[fid];
    return f && f.provoked && f.provoked[foe] > now(state) ? 0.4 : 0;
  };
  function raid(state, o, c, t) {
    const fid = c.owner, foe = t.owner;
    const n = clamp(Math.round(c.troops * R.share), R.min, R.max);
    const h = S.cityHead(state, t);
    const roll = () => 0.6 + S.rand(state) * 0.8;
    const atk = n * ((o.cmd + o.war) / 100) * roll();
    const def = t.troops * 0.3 * (h ? (h.cmd + h.war) / 100 : 0.6) * roll();
    const won = atk > def;
    const [lossA, lossD] = won ? R.loss.won : R.loss.lost;
    bleed(c, n * lossA);
    bleed(t, n * lossD);
    const got = { gold: 0, food: 0, horse: 0 };
    if (won) {
      const L = R.loot;
      got.gold = Math.round(Math.min(t.gold * L.gold, L.goldMax));
      got.food = Math.round(Math.min(t.food * L.food, n * L.foodPer));
      got.horse = Math.round(Math.min((t.res.horse || 0) * L.horse, S.resCap(c, "horse") - (c.res.horse || 0)));
      got.horse = Math.max(0, got.horse);
      t.gold -= got.gold; c.gold += got.gold;
      t.food -= got.food; c.food += got.food;
      t.res.horse -= got.horse; c.res.horse = (c.res.horse || 0) + got.horse;
      t.pop = Math.round(t.pop * (1 - L.pop));
      t.order = Math.max(0, t.order - L.order);
      S.addMerit(o, R.merit);
      o.fame = clamp((o.fame || 0) + R.fame, 0, 100);
      o.content = clamp((o.content || 50) + R.content, 0, 100);
    }
    const relBefore = S.rel(state, fid, foe);
    S.relAdd(state, fid, foe, won ? R.rel.won : R.rel.lost);
    // The raided remember who did it.
    for (const x of S.serving(state, t.id).concat([rulerOf(state, foe)])) if (x && x.force === foe) S.opAdd(x, o, R.op);
    const F = state.forces[foe];
    F.provoked = F.provoked || {};
    F.provoked[fid] = now(state) + R.provoked;
    return { won, n, got, relBefore };
  }
  const lootText = (g) => [g.horse ? `말 ${g.horse}` : "", g.food ? `군량 ${g.food}` : "", g.gold ? `금 ${g.gold}` : ""].filter(Boolean).join(", ");
  // Would a computer lord reprove the raider? When he wants peace with the
  // raided: on good terms before, or the weaker, or cautious and not at war.
  S.reproveWish = function (state, fid, foe, relBefore) {
    const r = rulerOf(state, fid);
    const f = state.forces[fid];
    if (S.atWarWith(state, f.id, foe)) return false;
    const ratio = S.might(state, fid) / Math.max(1, S.might(state, foe));
    return relBefore >= R.reprove.rel || ratio < R.reprove.might || (S.hasTrait(r, "신중") && !S.hasTrait(r, "과감"));
  };
  function reprove(state, fid, o, foe) {
    const P = R.reprove;
    S.addMerit(o, P.merit);
    S.opAdd(o, rulerOf(state, fid), P.op);
    o.content = clamp((o.content || 50) + P.content, 0, 100);
    if (state.forces[foe] && state.forces[foe].alive) S.relAdd(state, fid, foe, R.rel.reproved);
  }
  S.answerRaid = function (state, id, scold) {
    const list = state.raidReports || [];
    const a = list.find((x) => x.id === id);
    if (!a) return fail("이미 끝난 일입니다.");
    state.raidReports = list.filter((x) => x !== a);
    const o = state.officers[a.oid];
    if (!o || o.status !== "serving" || o.force !== a.fid) return fail(`${o ? o.name : "그"}는 이미 떠났습니다.`);
    if (!scold) return { ok: true, msg: `${o.name}의 습격을 묵인했습니다.` };
    reprove(state, a.fid, o, a.foe);
    return { ok: true, msg: `${S.josa(o.name, "을", "를")} 문책했습니다. ${S.forceName(state, a.foe)}과의 관계가 조금 풀립니다. 그는 불만을 품습니다.` };
  };
  S.setRaids = function (state, fid, allow) {
    const f = state.forces[fid];
    if (!f) return fail("세력이 없습니다.");
    f.noRaids = !allow;
    return { ok: true, msg: allow ? "태수들의 국경 습격을 허용합니다." : "국경 습격을 금했습니다. 할거하는 태수는 따르지 않을 수 있습니다." };
  };

  function runRaids(state) {
    if (S.inTruce(state)) return;
    const t0 = now(state);
    for (const c of S.cityList(state)) {
      const o = S.governorOf(state, c);
      if (!o || o.transit || c.troops < R.minTroops || S.besieged(state, c.id)) continue;
      const targets = raidTargets(state, c);
      if (!targets.length) continue;
      const t = targets.sort((a, b) => a.troops - b.troops)[0];
      if (S.isPlayer && S.isPlayer(state, o)) continue; // the player raids when he says so (js/persona.js)
      if (!S.chance(state, S.borderRaidChance(state, o, c, t))) continue;
      S.raidNow(state, o, c, t);
    }
    // Unanswered reports lapse: the lord let it pass.
    state.raidReports = (state.raidReports || []).filter((x) => x.until > t0);
  }
  S.raidTargets = raidTargets;
  // Governor o of c raids t: the raid, the log, the lord's answer. Returns the line.
  S.raidNow = function (state, o, c, t) {
    const t0 = now(state);
    const fid = c.owner, foe = t.owner;
    const res = raid(state, o, c, t);
    const head = `${S.forceName(state, fid)} ${c.name} 태수 ${S.josa(o.name, "이", "가")} ${S.forceName(state, foe)}의 ${S.josa(t.name, "을", "를")} 습격해`;
    const loot = lootText(res.got);
    const tail = !res.won ? " 쫓겨났습니다." : loot ? ` ${S.josa(loot, "을", "를")} 빼앗았습니다.` : " 적을 흩었습니다.";
    if (playerRuns(state, fid)) {
      state.raidSeq = (state.raidSeq || 0) + 1;
      state.raidReports = state.raidReports || [];
      state.raidReports.push({ id: state.raidSeq, fid, oid: o.id, foe, city: t.id, won: res.won, until: t0 + R.answer });
      S.addLog(state, head + tail + ` ${S.forceName(state, foe)}과의 관계가 나빠졌습니다.`, "warn");
      return head + tail;
    }
    S.addLog(state, head + tail, foe === state.playerForce ? "threat" : "info");
    if (S.reproveWish(state, fid, foe, res.relBefore)) {
      reprove(state, fid, o, foe);
      const r = rulerOf(state, fid);
      const line = `${S.josa(r.name, "이", "가")} 습격한 ${S.josa(o.name, "을", "를")} 문책했습니다.`;
      S.addLog(state, line, foe === state.playerForce ? "info" : "strife");
      return head + tail + " " + line;
    }
    return head + tail;
  };

  // ---------- officers acting for themselves ----------
  // 교류: he wins over the worthiest colleague in his city he is not yet close to.
  function mingle(state, o) {
    const peers = S.serving(state, o.city).filter((x) => x !== o && x.force === o.force && S.opinion(state, o, x) < 40);
    if (!peers.length) return false;
    const t = peers.sort((a, b) => S.worthOf(b) - S.worthOf(a))[0];
    S.opAdd(o, t, C.act.mingle + o.speech / 25);
    S.opAdd(t, o, C.act.mingle - 1 + o.speech / 30);
    return true;
  }
  // 출분: the lord he would rather serve, among those whose land touches his
  // own lord's: {fid, city (a border city of theirs)} or null.
  S.fleeTo = function (state, o) {
    const F = C.act.flee;
    const mine = S.opinion(state, o, rulerOf(state, o.force));
    let best = null;
    const near = new Map();
    for (const own of S.citiesOf(state, o.force)) {
      for (const n of S.neighbors(own.id)) {
        const c = state.cities[n];
        if (c && c.owner && c.owner !== o.force && !near.has(c.owner)) near.set(c.owner, c.id);
      }
    }
    for (const [fid, city] of near) {
      const r = rulerOf(state, fid);
      if (!r || S.feelFor(o, fid) < 0 || S.besieged(state, city)) continue;
      const v = S.opinion(state, o, r) + ({ 천하: 6, 지방: 3, 주: 0, 성: -3 }[S.reachOf(r)] || 0);
      if (v >= mine + F.gap && (!best || v > best.v)) best = { fid, city, v };
    }
    return best;
  };
  function flee(state, o, to) {
    const from = o.force;
    const k = S.postOf(state, o);
    const c = state.cities[o.city];
    if (k && c && c.posts) c.posts[k] = null;
    S.opAdd(rulerOf(state, from), o, C.act.flee.opLord);
    o.force = to.fid;
    o.city = to.city;
    o.loyalty = 60;
    o.done = true;
    S.joinBond(state, o, S.BOND.join);
    S.officersMoved(state);
    const text = `${S.josa(o.name, "이", "가")} ${S.josa(S.forceName(state, from), "을", "를")} 버리고 ${S.forceName(state, to.fid)}의 ${S.ro(state.cities[to.city].name)} 달아났습니다(출분).`;
    S.addLog(state, text, from === state.playerForce ? "warn" : to.fid === state.playerForce ? "sys" : "strife");
  }
  function runActs(state) {
    const F = C.act.flee;
    for (const o of Object.values(state.officers)) {
      if (o.status !== "serving" || o.transit || S.isRuler(state, o) || (S.isPlayer && S.isPlayer(state, o)) || !S.chance(state, C.act.chance)) continue;
      const content = o.content == null ? 50 : o.content;
      if (content < F.content && o.loyalty < F.loyalty) {
        const to = S.fleeTo(state, o);
        if (to && S.chance(state, F.chance)) { flee(state, o, to); continue; }
      }
      const a = S.ambitionOf(state, o);
      if (S.chance(state, (a.rise + a.house) * 30)) mingle(state, o);
    }
  }

  // ---------- each month ----------
  S.runConduct = function (state) {
    runGovernors(state);
    runRaids(state);
    runActs(state);
  };
})(globalThis.SAM = globalThis.SAM || {});
