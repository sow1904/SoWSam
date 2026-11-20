// The council (조정 회의), phase 4 of the redesign (docs/redesign.md).
//
// Who sits: the holders of seats at court and the officers in the capital;
// governors send memorials (진언서) and weigh half. Each has a voice (seat,
// fame, tongue, faction) and a stance on the question, from what he wants
// (영토 for war, 안위 against it, 출세 for the chance of merit), his temper,
// his reading of the odds (군략) and what he thinks of the foe.
//
//   출정: before a computer lord sends the main army, the council debates.
//     A court set against it stops the march (the lord's temper counts).
//     When the player sends the main army himself, the court still speaks.
//   강화: a computer lord winning a war does not make peace against a court
//     that wants to fight on; the player sees the court's leaning.
//   진언: the player's councillors bring proposals now and then (an
//     expedition, peace). Adopting one carries it out and favours the one
//     who spoke; refusing him costs his goodwill.
//   책임: what the council decided is remembered. When the army takes a city
//     those who spoke for it gain merit and fame; when it is beaten they lose
//     them, those who spoke against are proved right, and one of them may
//     slander the man who led the call (js/strife.js).
// why: the user's design: decisions come out of the council, and the
// council's results become the causes of strife, slander and purges.
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });
  const K = S.COUNCIL = {
    voice: { base: 10, rank: { 1: 30, 2: 20, 3: 10 }, governor: 5, fame: 0.3, speech: 0.2, faction: 20, memorial: 0.5 },
    seats: 12, // most councillors heard
    adopt: -0.2, // a computer lord sets out unless support falls below this (his temper moves it)
    temper: { 과감: 0.15, 신중: -0.15, 야심: 0.1 },
    veto: 3, // months a stopped expedition against the same foe waits
    peaceBlock: -0.35, // a winning computer lord fights on while support for peace is below this
    leaders: 3, // speakers named on each side
    won: { merit: 5, fame: 1 }, right: { merit: 4, fame: 1 },
    lost: { merit: -8, fame: -2, op: -8 }, wrong: { content: -3 },
    slander: 30, // % the man proved right slanders the one who led the call
    unheard: { voice: 30, stance: -0.4, op: -3 }, // strong voices overruled by the player
    propose: { chance: 25, stance: 0.3, odds: 1.1, answer: 1, adopt: { merit: 3, op: 5 }, refuse: { op: -4 }, lapse: { op: -2 } },
    keep: 8, // council records kept per force
    open: 8, // months an expedition's record waits for its outcome
  };
  const now = (state) => S.monthsElapsed(state);
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const playerRuns = (state, fid) => fid === state.playerForce && !S.spectating(state);
  const names = (state, ids) => ids.map((id) => state.officers[id] && state.officers[id].name).filter(Boolean).join("·");

  // ---------- who sits and how loud ----------
  S.voiceOf = function (state, o, memorial) {
    const V = K.voice;
    const off = S.officeOf(state, o);
    let v = V.base + (off ? V.rank[off.rank] : S.governs(state, o) ? V.governor : 0) + (o.fame || 0) * V.fame + o.speech * V.speech;
    const g = S.factions(state, o.force).find((x) => x.members.includes(o));
    if (g) v += g.share * V.faction * (g.leader === o ? 2 : 1);
    return Math.round(v * (memorial ? V.memorial : 1));
  };
  // [{o, voice, memorial}], loudest first.
  S.councilors = function (state, fid) {
    const capId = S.capitalOf(state, fid);
    const out = [];
    for (const o of S.officersOf(state, fid)) {
      if (S.isRuler(state, o) || o.transit) continue;
      const atCourt = o.city === capId || !!S.officeOf(state, o);
      const memorial = !atCourt && !!S.governs(state, o);
      if (!atCourt && !memorial) continue;
      out.push({ o, voice: S.voiceOf(state, o, memorial), memorial });
    }
    return out.sort((a, b) => b.voice - a.voice).slice(0, K.seats);
  };

  // ---------- stances (-1 against .. 1 for) ----------
  function warStance(state, o, q) {
    const a = S.ambitionOf(state, o);
    const f = state.forces[o.force];
    let s = 0.35 * a.land + 0.25 * a.rise * ((q.team || []).includes(o.id) ? 1.5 : 1) - 0.35 * a.safety * (1 + (f.weariness || 0) / 50);
    s += clamp((q.ratio - 1.3) * o.strat / 100, -0.6, 0.6); // the able read the odds
    if (S.hasTrait(o, "과감")) s += 0.2;
    if (S.hasTrait(o, "신중")) s -= 0.2;
    if (q.foe) {
      s += clamp(-S.opinion(state, o, rulerOf(state, q.foe)) / 100, -0.3, 0.3);
      if (state.han && !state.han.ended && state.han.holder === q.foe) s -= 0.3 * a.han; // not against the emperor's court
    }
    return clamp(s - 0.6, -1, 1);
  }
  function peaceStance(state, o, q) {
    const a = S.ambitionOf(state, o);
    const f = state.forces[o.force];
    let s = 0.4 * a.safety * (1 + (f.weariness || 0) / 50) - 0.3 * a.land - 0.2 * a.rise + (q.losing ? 0.4 : -0.1);
    if (S.hasTrait(o, "과감")) s -= 0.15;
    if (S.hasTrait(o, "신중")) s += 0.15;
    if (q.foe) s += clamp(S.opinion(state, o, rulerOf(state, q.foe)) / 100, -0.3, 0.3);
    return clamp(s - 0.1, -1, 1);
  }
  const STANCE = { war: warStance, peace: peaceStance };
  // The player's character speaks as the player says (js/persona.js): "war" or "peace".
  function playerStance(state, o, kind) {
    if (!S.isPlayer || !S.isPlayer(state, o) || !state.persona) return null;
    const s = state.persona.stance;
    if (s !== "war" && s !== "peace") return null;
    return (s === "war") === (kind === "war") ? 0.8 : -0.8;
  }
  // The council's view of q {kind, foe, ...}: {support (-1..1), seats: [{o, voice, stance}], pro, con}.
  S.debate = function (state, fid, q) {
    const seats = S.councilors(state, fid).map((c) => {
      const ps = playerStance(state, c.o, q.kind);
      return Object.assign(c, { stance: ps != null ? ps : STANCE[q.kind](state, c.o, q) });
    });
    const total = seats.reduce((s, c) => s + c.voice, 0);
    const support = total ? seats.reduce((s, c) => s + c.voice * c.stance, 0) / total : 0;
    const side = (sign) => seats.filter((c) => c.stance * sign > 0.15).sort((a, b) => b.voice * Math.abs(b.stance) - a.voice * Math.abs(a.stance));
    return { support: Math.round(support * 100) / 100, seats, pro: side(1), con: side(-1) };
  };
  S.supportLabel = (v) => (v >= 0.3 ? "대다수 찬성" : v >= 0.1 ? "찬성 우세" : v > -0.1 ? "팽팽함" : v > -0.3 ? "반대 우세" : "대다수 반대");

  // ---------- records ----------
  function record(state, fid, q, d, adopted, by) {
    const f = state.forces[fid];
    state.councilSeq = (state.councilSeq || 0) + 1;
    const rec = { id: state.councilSeq, kind: q.kind, foe: q.foe || null, target: q.target || null, at: now(state), stamp: [state.year, state.month],
      support: d.support, pro: d.pro.slice(0, K.leaders).map((c) => c.o.id), con: d.con.slice(0, K.leaders).map((c) => c.o.id),
      adopted, by: by || null, lead: null, result: null };
    f.councils = f.councils || [];
    f.councils.unshift(rec);
    if (f.councils.length > K.keep) f.councils.length = K.keep;
    return rec;
  }
  S.councilsOf = (state, fid) => (state.forces[fid] && state.forces[fid].councils) || [];
  function lineOf(state, d) {
    return `찬성 ${d.pro.length ? names(state, d.pro.slice(0, K.leaders).map((c) => c.o.id)) : "없음"}, 반대 ${d.con.length ? names(state, d.con.slice(0, K.leaders).map((c) => c.o.id)) : "없음"}`;
  }

  // ---------- 출정 ----------
  // A computer lord about to send the main army: the council's verdict.
  // q: {foe, target, aim, ratio, team}. Returns the record, or null with no council.
  S.conveneWar = function (state, fid, q) {
    if (!q.foe) return null;
    const f = state.forces[fid];
    if (f.vetoed && f.vetoed[q.foe] > now(state)) return { adopted: false, quiet: true };
    const d = S.debate(state, fid, Object.assign({ kind: "war" }, q));
    if (!d.seats.length) return null;
    const r = rulerOf(state, fid);
    const temper = S.traitsOf(r).reduce((s, t) => s + (K.temper[t] || 0), 0);
    const adopted = d.support + temper >= K.adopt;
    const rec = record(state, fid, { kind: "war", foe: q.foe, target: q.target }, d, adopted, "ai");
    if (!adopted) {
      f.vetoed = f.vetoed || {};
      f.vetoed[q.foe] = now(state) + K.veto;
      S.addLog(state, `${S.forceName(state, fid)} 조정이 ${S.forceName(state, q.foe)}의 ${S.place(state, q.target).name} 출정을 두고 다투었으나 반대가 많아 접었습니다(${lineOf(state, d)}).`,
        q.foe === state.playerForce ? "info" : "strife");
    }
    return rec;
  };
  // The army set out: remember who leads it, so the outcome finds the record.
  S.councilLaunched = function (state, rec, march) {
    if (!rec || !rec.id || !march) return;
    rec.lead = (march.officers || [])[0] || null;
  };

  // The player sends the main army: the court has its say all the same.
  const attack = S.attack;
  S.attack = function (state, cid, targetCid, oids, troops, unit) {
    const r = attack.apply(this, arguments);
    const c = S.place(state, cid), t = S.place(state, targetCid);
    if (!r.ok || !c || !t || !t.owner || !playerRuns(state, c.owner) || !S.isCapitalCity(state, c) || r.march.troops < S.WAR.bigArmy) return r;
    if (state.councilLaunching) return r; // a proposal being carried out records itself
    const fid = c.owner;
    const est = S.estimate(state, cid, t.id, oids, troops, unit);
    const d = S.debate(state, fid, { kind: "war", foe: t.owner, ratio: est ? est.ratio : 1, team: oids });
    if (!d.seats.length) return r;
    const rec = record(state, fid, { kind: "war", foe: t.owner, target: t.id }, d, true, "player");
    rec.lead = oids[0] || null;
    overruled(state, fid, d, 1);
    S.addLog(state, `조정 여론(${t.name} 출정): ${S.supportLabel(d.support)} — ${lineOf(state, d)}.`, "info");
    return r;
  };
  // Strong voices the player went against grumble.
  function overruled(state, fid, d, sign) {
    const U = K.unheard;
    const r = rulerOf(state, fid);
    for (const c of d.seats) if (c.voice >= U.voice && c.stance * sign <= U.stance) S.opAdd(c.o, r, U.op);
  }

  // ---------- outcomes ----------
  function openRecord(state, fid, lead) {
    return S.councilsOf(state, fid).find((x) => x.kind === "war" && x.adopted && !x.result && x.lead && x.lead === lead && now(state) - x.at <= K.open);
  }
  const people = (state, ids, fid) => ids.map((id) => state.officers[id]).filter((o) => o && o.status === "serving" && o.force === fid);
  function settle(state, fid, rec, won) {
    rec.result = won ? "won" : "lost";
    const pro = people(state, rec.pro, fid), con = people(state, rec.con, fid);
    const fame = (o, d) => { o.fame = clamp((o.fame || 0) + d, 0, 100); };
    if (won) {
      for (const o of pro) { S.addMerit(o, K.won.merit); fame(o, K.won.fame); }
      for (const o of con) o.content = clamp((o.content || 50) + K.wrong.content, 0, 100);
      return;
    }
    const r = rulerOf(state, fid);
    for (const o of pro) { S.addMerit(o, K.lost.merit); fame(o, K.lost.fame); }
    if (pro[0] && rec.by === "ai") S.opAdd(r, pro[0], K.lost.op);
    for (const o of con) { S.addMerit(o, K.right.merit); fame(o, K.right.fame); }
    if (pro.length && con.length) {
      S.addLog(state, `${S.forceName(state, fid)}: 출정을 막으려던 ${S.josa(names(state, rec.con), "이", "가")} 옳았습니다. 출정을 밀었던 ${S.josa(names(state, rec.pro), "이", "가")} 체면을 잃었습니다.`,
        playerRuns(state, fid) ? "warn" : "strife");
      if (S.raiseSlander && S.chance(state, K.slander)) S.raiseSlander(state, fid, con[0], pro[0]);
    }
  }
  // An army took a city / won or lost in the field (js/standing.js calls).
  S.councilOutcome = function (state, army, won) {
    if (!army || !army.force) return;
    const rec = openRecord(state, army.force, (army.officers || [])[0]);
    if (rec) settle(state, army.force, rec, won);
  };
  const creditCapture = S.creditCapture;
  S.creditCapture = function (state, A) {
    creditCapture.apply(this, arguments);
    S.councilOutcome(state, A, true);
  };
  const creditDecisive = S.creditDecisive;
  S.creditDecisive = function (state, win, lose) {
    creditDecisive.apply(this, arguments);
    S.councilOutcome(state, win, true);
    S.councilOutcome(state, lose, false);
  };
  const siegeFailed = S.siegeFailed;
  S.siegeFailed = function (state, b) {
    const r = siegeFailed.apply(this, arguments);
    S.councilOutcome(state, b.att, false);
    return r;
  };

  // ---------- 강화 ----------
  // Would the winner's court refuse peace now? (js/war.js runPeace)
  S.councilBlocksPeace = function (state, terms) {
    const fid = terms.winner;
    if (playerRuns(state, fid)) return false;
    const d = S.debate(state, fid, { kind: "peace", foe: terms.loser, losing: false });
    if (!d.seats.length) return false;
    const r = rulerOf(state, fid);
    const temper = S.hasTrait(r, "신중") ? 0.15 : S.hasTrait(r, "과감") ? -0.1 : 0;
    if (d.support + temper >= K.peaceBlock) {
      record(state, fid, { kind: "peace", foe: terms.loser }, d, true, "ai").result = "made";
      return false;
    }
    return true;
  };
  // The court's leaning on peace with foe, for the player's eyes.
  S.peaceLeaning = function (state, fid, foe, losing) {
    const d = S.debate(state, fid, { kind: "peace", foe, losing });
    return d.seats.length ? d : null;
  };

  // ---------- proposals to the player (진언) ----------
  // The main army's expeditions now, best first: [{t, ratio, team, troops, unit, way}].
  function expeditions(state, fid) {
    const capId = S.capitalOf(state, fid);
    const cap = capId && state.cities[capId];
    if (!cap || S.besieged(state, capId) || S.isBroken(state, fid)) return [];
    if ((state.marches || []).some((m) => m.force === fid && m.kind === "army" && m.origin === capId)) return [];
    const idle = S.idle(state, capId).sort((a, b) => S.leadScore(state, b) - S.leadScore(state, a));
    if (!idle.length) return [];
    const team = idle.slice(0, Math.min(S.MAX_SORTIE_OFFICERS, Math.max(1, idle.length - 1)));
    const troops = Math.floor(S.marchable(cap) - Math.max(S.WAR.expedition.guardMin, cap.troops * S.WAR.aim.guard.border));
    if (troops < S.WAR.expedition.min) return [];
    const out = [];
    for (const way of S.attackTargets(state, capId)) {
      const t = S.place(state, way.id);
      if (!t || !t.owner || t.owner === fid || S.allied(state, fid, t.owner) || S.truceLeft(state, fid, t.owner) || S.landingLink(way.path)) continue;
      if (S.inTruce(state)) continue;
      const unit = S.pickAttackUnit(state, cap, t, troops);
      const est = S.estimate(state, capId, t.id, team.map((o) => o.id), troops, unit);
      if (est) out.push({ t, ratio: est.ratio, team, troops, unit, way });
    }
    return out.sort((a, b) => b.ratio - a.ratio);
  }
  const bestExpedition = (state, fid) => expeditions(state, fid)[0] || null;
  S.expeditionList = (state, fid) => expeditions(state, fid).map((e) => ({ t: e.t, ratio: Math.round(e.ratio * 100) / 100, team: e.team.map((o) => o.id) }));
  // What the court thinks of the best expedition now (the council window).
  S.warOutlook = function (state, fid) {
    const e = bestExpedition(state, fid);
    if (!e) return null;
    return { t: e.t, ratio: Math.round(e.ratio * 100) / 100, d: S.debate(state, fid, { kind: "war", foe: e.t.owner, ratio: e.ratio, team: e.team.map((o) => o.id) }) };
  };
  // Carry out an expedition the council proposed.
  S.launchExpedition = function (state, fid, targetId) {
    const e = bestExpedition(state, fid);
    if (!e) return fail("지금은 주력군을 낼 수 없습니다(수도의 병력·무장 부족, 이미 출진 중, 포위 등).");
    const capId = S.capitalOf(state, fid);
    const cap = state.cities[capId];
    const t = S.place(state, targetId);
    if (!t || !S.attackTargets(state, capId).some((w) => w.id === targetId)) return fail("수도에서 그곳으로 갈 길이 없습니다.");
    const unit = S.pickAttackUnit(state, cap, t, e.troops);
    state.councilLaunching = true;
    let r;
    try { r = S.attack(state, capId, t.id, e.team.map((o) => o.id), e.troops, unit); } finally { state.councilLaunching = false; }
    return r;
  };
  function propose(state, fid) {
    const P = K.propose;
    const f = state.forces[fid];
    let pick = null;
    const e = bestExpedition(state, fid);
    if (e && e.ratio >= P.odds) {
      const d = S.debate(state, fid, { kind: "war", foe: e.t.owner, ratio: e.ratio, team: e.team.map((o) => o.id) });
      const by = d.pro.find((c) => !c.memorial || S.chance(state, 50));
      if (by && by.stance >= P.stance) pick = { kind: "war", by: by.o, foe: e.t.owner, target: e.t.id, support: d.support, ratio: Math.round(e.ratio * 100) / 100 };
    }
    if (!pick || S.chance(state, 40)) {
      for (const k of Object.keys(state.warLog || {})) {
        const [a, b] = k.split("|");
        if (a !== fid && b !== fid) continue;
        const foe = a === fid ? b : a;
        if (!state.forces[foe] || !state.forces[foe].alive || S.truceLeft(state, fid, foe)) continue;
        const terms = S.peaceTerms(state, fid, foe);
        if (!terms) continue;
        const d = S.debate(state, fid, { kind: "peace", foe, losing: terms.loser === fid });
        const by = d.pro[0];
        const willing = foe === terms.winner ? terms.winnerWants : terms.loserWants; // only when they would take it
        if (willing && by && by.stance >= P.stance && (f.weariness > 30 || terms.loser === fid)) { pick = { kind: "peace", by: by.o, foe, support: d.support }; break; }
      }
    }
    if (!pick) return;
    state.proposalSeq = (state.proposalSeq || 0) + 1;
    state.proposals = state.proposals || [];
    state.proposals.push({ id: state.proposalSeq, fid, oid: pick.by.id, kind: pick.kind, foe: pick.foe, target: pick.target || null,
      support: pick.support, ratio: pick.ratio || null, until: now(state) + P.answer });
    S.addLog(state, `${S.josa(pick.by.name, "이", "가")} ${pick.kind === "war" ? `${S.forceName(state, pick.foe)}의 ${S.place(state, pick.target).name} 출정을` : `${S.forceName(state, pick.foe)}과의 강화를`} 진언합니다.`, "warn");
  }
  S.answerProposal = function (state, id, yes) {
    const P = K.propose;
    const list = state.proposals || [];
    const a = list.find((x) => x.id === id);
    if (!a) return fail("그 진언은 이미 끝났습니다.");
    const o = state.officers[a.oid];
    const r = rulerOf(state, a.fid);
    if (!yes) {
      state.proposals = list.filter((x) => x !== a);
      if (o) S.opAdd(o, r, P.refuse.op);
      return { ok: true, msg: `${o ? o.name : "그"}의 진언을 물리쳤습니다.` + (o ? ` ${S.josa(o.name, "은", "는")} 서운해합니다.` : "") };
    }
    let res;
    if (a.kind === "war") {
      res = S.launchExpedition(state, a.fid, a.target);
      if (res.ok) {
        const t = S.place(state, a.target);
        const d = S.debate(state, a.fid, { kind: "war", foe: a.foe, ratio: a.ratio || 1, team: res.march.officers });
        const rec = record(state, a.fid, { kind: "war", foe: a.foe, target: a.target }, d, true, "player");
        if (o && !rec.pro.includes(o.id)) rec.pro.unshift(o.id);
        rec.lead = res.march.officers[0] || null;
        overruled(state, a.fid, d, 1);
        res.msg = `${o ? o.name + "의 진언대로 " : ""}주력군 ${res.march.troops}명이 ${S.ro(t.name)} 출진합니다.`;
      }
    } else {
      res = S.proposePeace(state, a.fid, a.foe);
    }
    if (!res.ok && a.kind === "war") return res; // the proposal stays for another try or a refusal
    state.proposals = list.filter((x) => x !== a);
    if (!res.ok) return res;
    if (o) { S.addMerit(o, P.adopt.merit); S.opAdd(o, r, P.adopt.op); }
    return res;
  };

  // ---------- the player's own proposal (js/persona.js) ----------
  // The player's character, serving a computer lord, proposes an expedition
  // (target: a city) or peace (foe: a force). The lord hears the court with
  // the proposer pressing it, weighs what he thinks of him, and decides.
  S.memorialOdds = function (state, q) {
    const o = S.playerChar(state);
    const fid = o.force;
    const r = rulerOf(state, fid);
    const d = S.debate(state, fid, q);
    const PP = S.PERSONA.propose;
    const temper = S.traitsOf(r).reduce((s, t) => s + (K.temper[t] || 0), 0);
    const v = d.support + PP.push + S.opinion(state, r, o) / PP.opinion + (o.speech - 50) / PP.speech + temper;
    return { d, v: Math.round(v * 100) / 100, adopted: v >= PP.bar };
  };
  S.canMemorial = function (state) {
    const o = S.playerChar(state);
    if (!o || o.status !== "serving" || S.isRuler(state, o)) return "주군을 섬길 때만 진언할 수 있습니다.";
    if (!S.councilors(state, o.force).some((c) => c.o === o) && !S.governs(state, o)) return "조정(수도나 관직)에 있거나 태수여야 진언할 수 있습니다.";
    const PP = S.PERSONA.propose;
    if (o.propAt != null && now(state) - o.propAt < PP.wait) return `진언은 ${PP.wait - (now(state) - o.propAt)}달 뒤에 다시 할 수 있습니다.`;
    return "";
  };
  S.peaceFoes = function (state, fid) {
    const out = [];
    for (const k of Object.keys(state.warLog || {})) {
      const [a, b] = k.split("|");
      if (a !== fid && b !== fid) continue;
      const foe = a === fid ? b : a;
      if (!state.forces[foe] || !state.forces[foe].alive || S.truceLeft(state, fid, foe) || out.includes(foe)) continue;
      const terms = S.peaceTerms(state, fid, foe);
      if (terms) out.push(foe);
    }
    return out;
  };
  S.memorial = function (state, kind, id) {
    const o = S.playerChar(state);
    const err = S.personaBlocked(state) || S.canMemorial(state);
    if (err) return fail(err);
    const fid = o.force;
    const r = rulerOf(state, fid);
    const PP = S.PERSONA.propose;
    let q;
    if (kind === "war") {
      const e = expeditions(state, fid).find((x) => x.t.id === id);
      if (!e) return fail("지금 수도의 주력군이 갈 수 있는 곳이 아닙니다.");
      q = { kind: "war", foe: e.t.owner, target: e.t.id, ratio: e.ratio, team: e.team.map((x) => x.id) };
    } else {
      if (!S.peaceFoes(state, fid).includes(id)) return fail("강화를 논할 상대가 아닙니다.");
      const terms = S.peaceTerms(state, fid, id);
      q = { kind: "peace", foe: id, losing: terms.loser === fid };
    }
    const odds = S.memorialOdds(state, q);
    o.propAt = now(state);
    o.pact = state.year * 100 + state.month;
    const what = kind === "war" ? `${S.forceName(state, q.foe)}의 ${S.place(state, q.target).name} 출정` : `${S.forceName(state, q.foe)}과의 강화`;
    if (!odds.adopted) {
      record(state, fid, q, odds.d, false, "memorial");
      o.content = clamp((o.content == null ? 50 : o.content) + PP.refuse.content, 0, 100);
      return { ok: true, msg: `${S.josa(what, "을", "를")} 진언했으나 ${S.josa(r.name, "이", "가")} 받아들이지 않았습니다(조정 여론 ${S.supportLabel(odds.d.support)}).` };
    }
    let res;
    if (kind === "war") {
      res = S.launchExpedition(state, fid, q.target);
      if (!res.ok) return res;
      const rec = record(state, fid, q, odds.d, true, "memorial");
      rec.pro = [o.id].concat(rec.pro.filter((x) => x !== o.id)).slice(0, K.leaders);
      rec.lead = res.march.officers[0] || null;
      S.addLog(state, `${S.forceName(state, fid)}: ${o.name}의 진언대로 주력군 ${res.march.troops}명이 ${S.ro(S.place(state, q.target).name)} 출진합니다.`, "strife");
    } else {
      res = S.proposePeace(state, fid, q.foe);
      if (!res.ok) return res;
      const rec = record(state, fid, q, odds.d, true, "memorial");
      rec.result = "made";
    }
    S.addMerit(o, PP.adopt.merit);
    S.opAdd(r, o, PP.adopt.op);
    return { ok: true, msg: `${S.josa(r.name, "이", "가")} ${what} 진언을 받아들였습니다. ` + (res.msg || "") };
  };

  // ---------- each month ----------
  S.runCouncil = function (state) {
    const t = now(state);
    for (const a of (state.proposals || []).filter((x) => x.until <= t)) {
      const o = state.officers[a.oid];
      if (o && o.status === "serving" && o.force === a.fid) S.opAdd(o, rulerOf(state, a.fid), K.propose.lapse.op);
    }
    state.proposals = (state.proposals || []).filter((x) => x.until > t && state.officers[x.oid] && state.officers[x.oid].force === x.fid);
    for (const f of Object.values(state.forces)) {
      if (!f.alive || !f.councils) continue;
      for (const rec of f.councils) if (rec.kind === "war" && rec.adopted && !rec.result && t - rec.at > K.open) rec.result = "none";
    }
    const fid = state.playerForce;
    if (fid && playerRuns(state, fid) && state.forces[fid] && state.forces[fid].alive && !(state.proposals || []).some((x) => x.fid === fid) &&
        S.chance(state, K.propose.chance)) propose(state, fid);
  };
})(globalThis.SAM = globalThis.SAM || {});
