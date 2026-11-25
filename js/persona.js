// The player's character (장수제), phase 5 of the redesign (docs/redesign.md).
//
// The player is one person (state.player), not a force. What he can do
// follows from where he stands:
//
//   군주   rules the force as before: every command, every window.
//   조정   (a seat at court, or in the capital) speaks in council: his
//          stance counts in every debate, and he may bring a proposal of his
//          own (진언) for the lord to judge.
//   태수   runs his own city with the city's commands, chooses how he
//          governs (목민·출세·할거), may raid over the border and may rise.
//   장수   follows the main army when the lord sends it.
//   재야   travels, offers his service to the lord of the city he is in, or
//          raises his banner in a city no one holds.
//   포로   surrenders to his captor or tries to escape.
//
// Whoever serves can also, once a month: befriend a colleague (교류), ask
// for a higher seat, ask to be sent to govern a city, slander a rival, flee
// to another lord (출분) or leave service. When the player is not the
// ruler, his force runs itself (S.spectating) and its lord is the computer.
// When the character dies the player picks who carries on: kin, family, or
// those close to him. With no one left the game is over.
// why: the user's design: the player is one officer among many; the role
// decides what he can do.
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });
  const P = S.PERSONA = {
    mingle: { base: 6, speech: 20 },
    propose: { wait: 3, push: 0.15, opinion: 300, speech: 500, bar: -0.1, adopt: { merit: 3, op: 3 }, refuse: { content: -3 } },
    slander: { wait: 6 },
    post: { wait: 3, need: 10, displaced: -10 },
    flee: { base: 10, fame: 0.4, opinion: 0.5, again: 15, fail: -10, lord: -20 },
    leave: { op: -15 },
    serve: { base: 30, fame: 0.4, ability: 0.5, feel: 0.5, opinion: 0.3, wait: 6 },
    style: { 할거: -2 }, // a month: what the lord comes to think of a governor keeping his own way
    rise: { fame: 20, followers: 20 },
    escape: { base: 15, war: 5, wit: 10 },
    heir: { tie: 30, opinion: 40 },
    raid: { wait: 2 },
  };
  const now = (state) => S.monthsElapsed(state);
  const stamp = (state) => state.year * 100 + state.month;
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const kin = (a, b) => !!(S.CLAN[a.name] && S.CLAN[b.name] && S.CLAN[a.name].clan === S.CLAN[b.name].clan);
  const best = (o) => Math.max(...S.ABILITY_KEYS.map((k) => o[k] || 0));

  // ---------- who the player is ----------
  S.playerChar = (state) => (state && state.player ? state.officers[state.player] || null : null);
  // True when the player gives the force's orders (or plays no one: the old way).
  S.playerRules = function (state) {
    if (!state.playerForce) return false;
    const o = S.playerChar(state);
    return !o || (o.status === "serving" && o.force === state.playerForce && S.isRuler(state, o) && !S.rulerAway(state, o.force));
  };
  S.ROLES = { ruler: "군주", returning: "귀환 중", court: "조정", governor: "태수", general: "장수", free: "재야", captive: "포로", gone: "없음" };
  S.playerRole = function (state) {
    const o = S.playerChar(state);
    if (!o) return null;
    if (o.status === "serving") {
      if (S.isRuler(state, o)) return S.rulerAway(state, o.force) ? "returning" : "ruler";
      if (S.governs(state, o)) return "governor";
      if (S.officeOf(state, o) || o.city === S.capitalOf(state, o.force)) return "court";
      return "general";
    }
    if (o.status === "free") return "free";
    if (o.status === "captive") return "captive";
    return "gone";
  };
  // The city the player governs (not as ruler): the computer leaves it to him.
  S.playerCity = function (state) {
    const o = S.playerChar(state);
    if (!o || o.status !== "serving" || S.isRuler(state, o)) return null;
    const c = S.governs(state, o);
    return c ? c.id : null;
  };
  S.isPlayer = (state, o) => !!o && !!state.player && o.id === state.player;
  S.persona = (state) => (state.persona = state.persona || { stance: "auto", style: "목민" });

  // A force the player does not rule runs itself.
  const spectating = S.spectating;
  S.spectating = function (state) {
    if (state.player && state.playerForce && !S.playerRules(state)) return true;
    return spectating.apply(this, arguments);
  };
  // A player who governs picks his own way of governing.
  const governorType = S.governorType;
  S.governorType = function (state, o) {
    const t = governorType.apply(this, arguments);
    if (t && S.isPlayer(state, o)) return S.persona(state).style || "목민";
    return t;
  };

  // The player keeps faith as he likes: he never mourns a fallen lord into retirement.
  const faithful = S.faithful;
  S.faithful = function (o) {
    if (S.GAME && S.GAME.player === o.id) return false;
    return faithful.apply(this, arguments);
  };
  // Keep state.playerForce on the force the character stands in.
  S.syncPlayer = function (state) {
    const o = S.playerChar(state);
    if (!o) return;
    if (o.status === "dead" || o.status === "retired" || o.status === "young") {
      if (!state.heirPick) {
        const list = S.heirsOf(state, o);
        if (!list.length) { state.over = { result: "lose", reason: "dead", who: o.name }; return; }
        state.heirPick = { from: o.id, list: list.map((x) => x.id) };
        S.addLog(state, `${o.name}의 뒤를 이을 인물을 골라야 합니다.`, "warn");
      }
      return;
    }
    S.persona(state).wasRuler = o.status === "serving" && S.isRuler(state, o) ? o.id : null;
    const fid = o.status === "serving" ? o.force
      : o.status === "captive" && o.force && state.forces[o.force] && state.forces[o.force].alive ? o.force : null;
    if (fid !== state.playerForce) {
      state.playerForce = fid;
      state.auto = false;
      if (fid && state.aiDays) delete state.aiDays[fid];
    }
  };
  const tickDay = S.tickDay;
  S.tickDay = function (state) {
    if (state.player && !state.over) {
      S.syncPlayer(state);
      if (state.over) return null;
      // The player's city, delegated, is run on the 1st like a ruler's.
      const cid = S.playerCity(state);
      if (cid && (state.day || 1) === 1 && state.governed !== stamp(state)) {
        const c = state.cities[cid];
        const did = S.delegateOf(state, c) ? S.govern(state, c) : "";
        if (did) S.addLog(state, `${c.name} 위임(${S.DELEGATE[S.delegateOf(state, c)]}): ${did}`, "info");
      }
    }
    const r = tickDay.apply(this, arguments);
    if (state.player && !state.over) S.syncPlayer(state);
    return r;
  };
  // Losing the force no longer ends the game: the character lives on.
  const checkOver = S.checkOver;
  S.checkOver = function (state) {
    if (!state.player || state.over) return checkOver.apply(this, arguments);
    const pf = state.playerForce;
    state.playerForce = null; // judged by the character, not the force
    try { checkOver.apply(this, arguments); } finally { state.playerForce = pf; }
    if (state.over && state.over.result === "win") {
      const o = S.playerChar(state);
      state.over.mine = !!o && o.status === "serving" && o.force === state.over.force;
      if (!state.over.mine) state.over.result = "lose";
    }
    return state.over;
  };

  // ---------- choosing ----------
  S.setPlayer = function (state, oid) {
    const o = state.officers[oid];
    if (!o || o.status === "dead" || o.status === "young" || o.status === "retired") return fail("고를 수 없는 인물입니다.");
    state.player = o.id;
    state.heirPick = null;
    if (o.status === "free") o.hidden = false;
    S.syncPlayer(state);
    return { ok: true, msg: `${S.josa(o.name, "으로", "로")} 이어 갑니다. 지금 자리는 ${S.ROLES[S.playerRole(state)]}입니다.` };
  };
  // Who may carry on after o: kin, his family, those close to him, the man
  // who took his seat. Alive and grown, not in hiding.
  S.heirsOf = function (state, o) {
    const H = P.heir;
    const was = S.persona(state).wasRuler === o.id;
    const seat = was && o.force && state.forces[o.force] && state.forces[o.force].alive ? rulerOf(state, o.force) : null;
    const out = [];
    for (const x of Object.values(state.officers)) {
      if (x === o || x.hidden || !["serving", "free", "captive"].includes(x.status)) continue;
      const why = kin(o, x) ? "일족" : x === seat && seat.id !== o.id ? "뒤를 이은 군주" : S.tieOf(o, x) >= H.tie ? "인연" : S.opinion(state, o, x) >= H.opinion ? "가까운 사이" : null;
      if (why) out.push({ x, why, v: (why === "일족" ? 100 : why === "뒤를 이은 군주" ? 90 : 0) + S.tieOf(o, x) + (x.fame || 0) / 2 });
    }
    return out.sort((a, b) => b.v - a.v).slice(0, 12).map((r) => r.x);
  };
  S.heirReason = function (state, from, x) {
    const H = P.heir;
    if (kin(from, x)) return "일족";
    if (S.persona(state).wasRuler === from.id && from.force && state.forces[from.force] && state.forces[from.force].ruler === x.id) return "뒤를 이은 군주";
    if (S.tieOf(from, x) >= H.tie) return "인연";
    return "가까운 사이";
  };
  S.takeHeir = function (state, oid) {
    const h = state.heirPick;
    if (!h || !h.list.includes(oid)) return fail("이어받을 수 없는 인물입니다.");
    return S.setPlayer(state, oid);
  };

  // ---------- what he may do this month ----------
  const used = (state, o) => o.pact === stamp(state);
  const spend = (state, o) => { o.pact = stamp(state); };
  // Why he cannot act now, or "".
  function blocked(state, o) {
    if (!o) return "고른 인물이 없습니다.";
    if (state.over) return "게임이 끝났습니다.";
    if (state.heirPick) return "먼저 뒤를 이을 인물을 고르세요.";
    if (o.transit) return "길 위에 있어 지금은 할 수 없습니다.";
    if (o.homeBy != null && S.today(state) < o.homeBy) return `풀려나 돌아가는 길입니다. (${o.homeBy - S.today(state)}일 남음)`;
    if (used(state, o)) return "이번 달에는 이미 움직였습니다.";
    return "";
  }
  S.personaBlocked = (state) => blocked(state, S.playerChar(state));
  const serving = (o) => o && o.status === "serving";
  const underLord = (state, o) => serving(o) && !S.isRuler(state, o);

  // 교류: someone in the same city.
  S.minglePeers = function (state) {
    const o = S.playerChar(state);
    if (!o || o.status === "captive") return [];
    return S.officersIn(state, o.city, (x) => x !== o && (x.status === "serving" || (x.status === "free" && !x.hidden)) && !x.transit);
  };
  S.pMingle = function (state, tid) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    const t = state.officers[tid];
    if (!t || !S.minglePeers(state).includes(t)) return fail("같은 곳에 있는 사람과만 교류할 수 있습니다.");
    const g = Math.round(P.mingle.base + o.speech / P.mingle.speech);
    S.opAdd(o, t, g);
    S.opAdd(t, o, g);
    spend(state, o);
    return { ok: true, msg: `${S.josa(t.name, "과", "와")} 어울려 서로의 의견이 ${g} 올랐습니다. (${t.name}의 의견 ${S.opinion(state, t, o)})` };
  };

  // 관직 요구: a seat higher than his own.
  S.seatsToAsk = function (state) {
    const o = S.playerChar(state);
    if (!underLord(state, o)) return [];
    const have = S.seatValue(state, o);
    const mine = S.officeOf(state, o);
    return S.openSeats(state, o.force).filter((x) => S.STANDING.rankValue[x.rank] > have && x !== mine);
  };
  S.pAskSeat = function (state, key) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    if (!underLord(state, o)) return fail("주군을 섬길 때만 관직을 청할 수 있습니다.");
    const off = S.seatsToAsk(state).find((x) => x.key === key);
    if (!off) return fail("청할 수 있는 자리가 아닙니다.");
    const A = S.STANDING.ask;
    if (o.askAt != null && now(state) - o.askAt < A.wait) return fail(`관직은 ${A.wait - (now(state) - o.askAt)}달 뒤에 다시 청할 수 있습니다.`);
    const yes = S.grantAsk(state, o.force, o, key);
    const pushed = S.holder(state, o.force, key);
    const r = rulerOf(state, o.force);
    const res = S.settleAsk(state, o.force, o, key, yes);
    spend(state, o);
    if (!res.ok) return res;
    return { ok: true, msg: yes
      ? `${S.josa(r.name, "이", "가")} 청을 받아들여 ${S.josa(off.name, "이", "가")} 되었습니다.` + (pushed ? ` ${S.josa(pushed.name, "은", "는")} 밀려나 원망합니다.` : "")
      : `${S.josa(r.name, "이", "가")} ${off.name} 청을 물리쳤습니다. 만족이 떨어졌습니다.` };
  };

  // 부임 청원: to head a city of his lord's (not the capital), or to come back to the capital.
  S.postsToAsk = function (state) {
    const o = S.playerChar(state);
    if (!underLord(state, o)) return [];
    const capId = S.capitalOf(state, o.force);
    return S.citiesOf(state, o.force).filter((c) => c.id !== o.city && (c.id === capId || !S.besieged(state, c.id)));
  };
  S.postChance = function (state, c) {
    const o = S.playerChar(state);
    if (!o || c.id === S.capitalOf(state, o.force)) return 100;
    const r = rulerOf(state, o.force);
    const head = S.cityHead(state, c);
    let v = S.opinion(state, r, o) + (o.merit || 0) / 5 + (o.pol + o.cmd - 100) / 4;
    if (head && head !== o && !S.isRuler(state, head)) v -= Math.max(0, S.opinion(state, r, head)) / 2 + (S.worthOf(head) - S.worthOf(o)) / 2;
    return clamp(Math.round(50 + v), 5, 95);
  };
  function leaveSeat(state, o) {
    const k = S.postOf(state, o);
    const c = state.cities[o.city];
    if (k && c && c.posts) c.posts[k] = null;
  }
  S.pAskPost = function (state, cid) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    const c = S.postsToAsk(state).find((x) => x.id === cid);
    if (!c) return fail("갈 수 있는 도시가 아닙니다.");
    if (o.postAt != null && now(state) - o.postAt < P.post.wait) return fail(`부임은 ${P.post.wait - (now(state) - o.postAt)}달 뒤에 다시 청할 수 있습니다.`);
    o.postAt = now(state);
    spend(state, o);
    const r = rulerOf(state, o.force);
    const capital = c.id === S.capitalOf(state, o.force);
    if (!capital && !S.chance(state, S.postChance(state, c))) return { ok: true, msg: `${S.josa(r.name, "이", "가")} ${c.name} 부임 청을 물리쳤습니다.` };
    const head = S.cityHead(state, c);
    leaveSeat(state, o);
    o.city = c.id;
    S.officersMoved(state);
    if (!capital && head && head !== o && !S.isRuler(state, head)) S.opAdd(head, o, P.post.displaced);
    return { ok: true, msg: capital ? `${S.ro(c.name)} 돌아왔습니다.` : `${S.josa(r.name, "이", "가")} 받아들여 ${c.name} 태수가 되었습니다.` + (head && head !== o && !S.isRuler(state, head) ? ` 밀려난 ${S.josa(head.name, "은", "는")} 언짢아합니다.` : "") };
  };

  // 참소: a rival in the same force.
  S.slanderTargets = function (state) {
    const o = S.playerChar(state);
    if (!underLord(state, o)) return [];
    return S.officersOf(state, o.force).filter((x) => x !== o && !S.isRuler(state, x));
  };
  S.pSlander = function (state, tid) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    const t = S.slanderTargets(state).find((x) => x.id === tid);
    if (!t) return fail("참소할 수 있는 상대가 아닙니다.");
    if (o.slanderAt != null && now(state) - o.slanderAt < P.slander.wait) return fail(`참소는 ${P.slander.wait - (now(state) - o.slanderAt)}달 뒤에 다시 할 수 있습니다.`);
    o.slanderAt = now(state);
    spend(state, o);
    const believe = S.chance(state, S.believeChance(state, o.force, o, t));
    const res = S.answerSlander(state, o.force, believe, { by: o, target: t });
    S.opAdd(t, o, -15);
    return res;
  };

  // 출분: to a lord whose land touches his own lord's.
  S.fleeOptions = function (state) {
    const o = S.playerChar(state);
    if (!underLord(state, o)) return [];
    const near = new Map();
    for (const own of S.citiesOf(state, o.force)) {
      for (const n of S.neighbors(own.id)) {
        const c = state.cities[n];
        if (c && c.owner && c.owner !== o.force && !near.has(c.owner) && !S.besieged(state, c.id)) near.set(c.owner, c.id);
      }
    }
    return [...near].map(([fid, city]) => ({ fid, city, p: fleeChance(state, o, fid) })).filter((x) => x.p > 0);
  };
  function fleeChance(state, o, fid) {
    const r = rulerOf(state, fid);
    if (!r || S.recruitBar(state, fid, o)) return 0;
    const F = P.flee;
    return clamp(Math.round(F.base + (o.fame || 0) * F.fame + S.opinion(state, r, o) * F.opinion + S.feelFor(o, fid) / 2 - (o.fled || 0) * F.again), 5, 90);
  }
  function joinForce(state, o, fid, cid, loyalty) {
    leaveSeat(state, o);
    o.force = fid;
    o.lastForce = fid;
    o.status = "serving";
    o.hidden = false;
    o.captor = null;
    o.city = cid;
    o.loyalty = loyalty;
    o.merit = 0;
    S.joinBond(state, o, S.BOND.join);
    S.officersMoved(state);
  }
  S.pFlee = function (state, fid) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    const opt = S.fleeOptions(state).find((x) => x.fid === fid);
    if (!opt) return fail("달아날 수 있는 곳이 아닙니다.");
    spend(state, o);
    const from = o.force;
    const lord = rulerOf(state, from);
    if (!S.chance(state, opt.p)) {
      S.opAdd(lord, o, P.flee.fail);
      return { ok: true, msg: `${S.forceName(state, fid)}에 몸을 맡기려 했으나 받아 주지 않았습니다. 소문이 돌아 ${lord.name}의 의견이 떨어졌습니다.` };
    }
    S.opAdd(lord, o, P.flee.lord);
    o.fled = (o.fled || 0) + 1; // a known turncoat is trusted less next time
    joinForce(state, o, fid, opt.city, 60);
    S.syncPlayer(state);
    const msg = `${S.josa(S.forceName(state, from), "을", "를")} 버리고 ${S.forceName(state, fid)}의 ${S.ro(state.cities[opt.city].name)} 달아났습니다(출분).`;
    S.addLog(state, `${S.josa(o.name, "이", "가")} ${msg}`, "strife");
    return { ok: true, logged: true, msg };
  };

  // 하야: leave service for the life of a wanderer.
  S.pLeave = function (state) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    if (!underLord(state, o)) return fail("주군을 섬길 때만 떠날 수 있습니다.");
    const from = o.force;
    S.opAdd(rulerOf(state, from), o, P.leave.op);
    leaveSeat(state, o);
    S.feelAdd(o, from, -10);
    o.status = "free";
    o.force = null;
    o.hidden = false;
    o.city = S.homeCity(state, o.city);
    spend(state, o);
    S.officersMoved(state);
    S.syncPlayer(state);
    return { ok: true, msg: `${S.josa(S.forceName(state, from), "을", "를")} 떠나 재야가 되었습니다.` };
  };

  // ---------- the governor ----------
  S.setStyle = function (state, style) {
    if (!S.GOVERNOR_TYPES[style]) return fail("알 수 없는 방식입니다.");
    S.persona(state).style = style;
    return { ok: true, msg: `이제 ${style}형으로 성을 다스립니다.` };
  };
  S.raidOptions = function (state) {
    const cid = S.playerCity(state);
    return cid ? S.raidTargets(state, state.cities[cid]) : [];
  };
  S.pRaid = function (state, tid) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    const cid = S.playerCity(state);
    if (!cid) return fail("태수만 습격할 수 있습니다.");
    const c = state.cities[cid];
    const t = S.raidOptions(state).find((x) => x.id === tid);
    if (!t) return fail("습격할 수 있는 곳이 아닙니다.");
    if (c.troops < S.CONDUCT.raid.minTroops) return fail(`병사가 ${S.CONDUCT.raid.minTroops}명은 있어야 습격할 수 있습니다.`);
    if (o.raidAt != null && now(state) - o.raidAt < P.raid.wait) return fail(`습격은 ${P.raid.wait - (now(state) - o.raidAt)}달 뒤에 다시 할 수 있습니다.`);
    o.raidAt = now(state);
    spend(state, o);
    return { ok: true, logged: true, msg: S.raidNow(state, o, c, t) };
  };
  // 반란: the governor raises his own banner with his city (and the
  // discontented of his faction heading others).
  S.pRebel = function (state) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    const cid = S.playerCity(state);
    if (!cid) return fail("태수만 반기를 들 수 있습니다.");
    spend(state, o);
    const msg = S.rebelNow(state, o, state.cities[cid]);
    S.syncPlayer(state);
    return { ok: true, msg };
  };

  // ---------- the wanderer ----------
  S.travelOptions = function (state) {
    const o = S.playerChar(state);
    if (!o || o.status !== "free") return [];
    return S.neighbors(o.city).map((n) => state.cities[n]).filter(Boolean);
  };
  S.pTravel = function (state, cid) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    const c = S.travelOptions(state).find((x) => x.id === cid);
    if (!c) return fail("이웃 도시로만 갈 수 있습니다.");
    o.city = c.id;
    spend(state, o);
    S.officersMoved(state);
    return { ok: true, msg: `${S.ro(c.name)} 옮겨 갔습니다.` + (c.owner ? ` ${S.forceName(state, c.owner)}의 땅입니다.` : " 아무도 다스리지 않는 땅입니다.") };
  };
  S.serveChance = function (state) {
    const o = S.playerChar(state);
    const c = o && state.cities[o.city];
    if (!o || o.status !== "free" || !c || !c.owner) return 0;
    if (S.recruitBar(state, c.owner, o)) return 0;
    const V = P.serve;
    const r = rulerOf(state, c.owner);
    return clamp(Math.round(V.base + (o.fame || 0) * V.fame + (best(o) - 60) * V.ability + S.feelFor(o, c.owner) * V.feel + S.opinion(state, r, o) * V.opinion), 5, 95);
  };
  S.pServe = function (state) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    const c = state.cities[o.city];
    if (o.status !== "free" || !c || !c.owner) return fail("세력이 다스리는 도시에서만 사관할 수 있습니다.");
    const bar = S.recruitBar(state, c.owner, o);
    if (bar) return fail(bar);
    o.serveAt = o.serveAt || {};
    if (o.serveAt[c.owner] != null && now(state) - o.serveAt[c.owner] < P.serve.wait) return fail(`${S.forceName(state, c.owner)}은 얼마 전에 거절했습니다.`);
    spend(state, o);
    if (!S.chance(state, S.serveChance(state))) {
      o.serveAt[c.owner] = now(state);
      return { ok: true, msg: `${S.forceName(state, c.owner)}에 사관을 청했으나 받아 주지 않았습니다.` };
    }
    joinForce(state, o, c.owner, c.id, 75);
    S.syncPlayer(state);
    S.addLog(state, `${S.josa(o.name, "이", "가")} ${S.forceName(state, c.owner)}에 사관했습니다.`, "info");
    return { ok: true, msg: `${S.forceName(state, c.owner)}에 사관했습니다. 이제 ${S.josa(rulerOf(state, c.owner).name, "을", "를")} 주군으로 섬깁니다.` };
  };
  // 거병: in a city no one holds, he founds a force of his own.
  S.canRise = function (state) {
    const o = S.playerChar(state);
    const c = o && state.cities[o.city];
    if (!o || o.status !== "free" || !c) return "재야일 때만 거병할 수 있습니다.";
    if (c.owner) return "아무도 다스리지 않는 도시에서만 거병할 수 있습니다.";
    if ((o.fame || 0) < P.rise.fame) return `명성이 ${P.rise.fame}은 되어야 사람들이 따릅니다.`;
    return "";
  };
  const RISE_COLORS = ["#b8860b", "#8b4f8f", "#3f7f7a", "#9a5b2e", "#5d6fa3"];
  S.pRise = function (state) {
    const o = S.playerChar(state);
    const err = blocked(state, o) || S.canRise(state);
    if (err) return fail(err);
    const c = state.cities[o.city];
    let n = 1;
    while (state.forces["p" + n]) n++;
    const id = "p" + n;
    state.forces[id] = { id, name: o.name, color: RISE_COLORS[(n - 1) % RISE_COLORS.length], ruler: o.id, alive: true, weariness: 0, tech: {}, capital: c.id, since: now(state) };
    c.owner = id;
    c.delegate = null;
    c.unrest = null;
    o.status = "serving";
    o.force = id;
    o.lastForce = id;
    o.loyalty = 100;
    o.bond = 100;
    o.hidden = false;
    spend(state, o);
    // Wanderers here who think well of him follow.
    const follow = S.officersIn(state, c.id, (x) => x !== o && x.status === "free" && !x.hidden && !S.recruitBar(state, id, x) && S.opinion(state, x, o) >= P.rise.followers);
    for (const x of follow) { x.status = "serving"; x.force = id; x.lastForce = id; x.loyalty = 80; S.joinBond(state, x, S.BOND.join); }
    S.officersMoved(state);
    S.capitalOf(state, id);
    S.syncPlayer(state);
    const msg = `${c.name}에서 거병했습니다!` + (follow.length ? ` ${S.josa(follow.map((x) => x.name).join("·"), "이", "가")} 따릅니다.` : "");
    S.addLog(state, `${S.josa(o.name, "이", "가")} ${msg}`, "fall");
    return { ok: true, logged: true, msg };
  };

  // ---------- the captive ----------
  S.pSurrender = function (state) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    if (o.status !== "captive" || !o.captor || !state.forces[o.captor] || !state.forces[o.captor].alive) return fail("포로일 때만 투항할 수 있습니다.");
    const bar = S.recruitBar(state, o.captor, o);
    if (bar) return fail(bar);
    const from = o.force, to = o.captor;
    if (from && state.forces[from] && state.forces[from].ruler === o.id) return fail("군주는 투항하지 않습니다.");
    o.lord = false;
    joinForce(state, o, to, o.city, 65);
    spend(state, o);
    S.syncPlayer(state);
    S.addLog(state, `포로 ${S.josa(o.name, "이", "가")} ${S.forceName(state, to)}에 투항했습니다.`, "info");
    return { ok: true, msg: `${S.forceName(state, to)}에 투항했습니다.` };
  };
  S.selfEscapeChance = (state) => { const o = S.playerChar(state); return o ? clamp(Math.round(P.escape.base + o.war / P.escape.war + o.wit / P.escape.wit), 5, 60) : 0; };
  S.pEscape = function (state) {
    const o = S.playerChar(state);
    const err = blocked(state, o);
    if (err) return fail(err);
    if (o.status !== "captive") return fail("포로일 때만 달아날 수 있습니다.");
    spend(state, o);
    if (!S.chance(state, S.selfEscapeChance(state))) return { ok: true, msg: "달아나려 했으나 붙잡혔습니다." };
    S.freeCaptive(state, o);
    S.syncPlayer(state);
    return { ok: true, msg: o.status === "serving" ? `탈출해 ${S.forceName(state, o.force)}의 ${S.ro(state.cities[o.city].name)} 돌아왔습니다.` : "탈출해 재야로 떠돌게 되었습니다." };
  };

  // ---------- each month ----------
  // A governor keeping his own way (할거) does not go unnoticed.
  S.runPersona = function (state) {
    const o = S.playerChar(state);
    if (!o || !S.playerCity(state)) return;
    const d = P.style[S.persona(state).style];
    if (d) S.opAdd(rulerOf(state, o.force), o, d);
  };

  // ---------- new games and old saves ----------
  // opts.player: the officer to play (default: the ruler of the force).
  const newGame = S.newGame;
  S.newGame = function (scenario, playerForce, seed, opts) {
    const state = newGame.apply(this, arguments);
    if (playerForce && state.forces[playerForce]) {
      const pick = opts && opts.player && state.officers[opts.player];
      state.player = pick ? pick.id : state.forces[playerForce].ruler;
      S.syncPlayer(state);
    }
    return state;
  };
  const migrate = S.migrate;
  S.migrate = function (state) {
    const s = migrate.apply(this, arguments);
    if (s.player === undefined) s.player = s.playerForce && s.forces[s.playerForce] ? s.forces[s.playerForce].ruler : null;
    s.version = S.SAVE_VERSION;
    return s;
  };
  // Who may be chosen at the start: the force's people, and the wanderers in its cities.
  S.playable = function (state, fid) {
    const f = state.forces[fid];
    if (!f) return [];
    const cities = new Set(S.citiesOf(state, fid).map((c) => c.id));
    const list = Object.values(state.officers).filter((o) => !o.hidden &&
      ((o.status === "serving" && o.force === fid) || (o.status === "free" && cities.has(o.city))));
    return list.sort((a, b) => (b.id === f.ruler) - (a.id === f.ruler) || (b.status === "serving") - (a.status === "serving") || (b.fame || 0) - (a.fame || 0));
  };
})(globalThis.SAM = globalThis.SAM || {});
