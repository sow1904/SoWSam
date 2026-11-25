// The Han court. 헌제 sits in one city (state.emperor); the force that holds
// that city protects him. He keeps a favour (우호도) toward that warlord,
// asks for gifts now and then, and his favour decides what follows:
// high favour and a strong holder lead to abdication (선양); low favour and a
// strong holder to secret letters calling loyalists against the holder
// (의대조); low favour and a weak holder to his escape.
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });

  S.COURT = {
    baseFavor: { H: 65, U: 50, N: 35 }, // favour toward a new holder, by the holder's 한조 attitude
    rescueBonus: 10, // for taking him from a holder he distrusted
    strong: 0.12, // share of all cities that makes a holder strong
    abdicateShare: 0.3, // share of all cities needed for 선양
    abdicateFavor: 70,
    moveCost: 500,
    moveCooldown: 12, // per holder; resets when the emperor changes hands
    home: "henan", // 낙양: he would rather not leave it
    moveFavor: { leave: -10, back: 10, other: -3 },
    proclaimCities: 8,
    demandChance: 60, // each quarter
    accept: 8, // favour for granting a request
    refuse: 12, // favour lost for refusing or ignoring one
  };

  S.emperorHolder = (state) => {
    if (!state.emperor || (state.han && state.han.ended)) return null;
    return state.cities[state.emperor].owner || null;
  };
  S.cityShare = (state, fid) => S.citiesOf(state, fid).length / Object.keys(state.cities).length;
  S.favorLabel = (f) => (f >= 70 ? "신뢰" : f >= 50 ? "호의" : f >= 30 ? "냉담" : "불신");
  const rulerOf = (state, fid) => state.officers[state.forces[fid].ruler];
  const addFavor = (state, n) => { state.han.favor = clamp(Math.round(state.han.favor + n), 0, 100); };
  const sameClan = (a, b) => !!(S.CLAN[a.name] && S.CLAN[b.name] && S.CLAN[a.name].clan === S.CLAN[b.name].clan);
  const pactKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  function dropPact(state, a, b) {
    const p = state.pacts[pactKey(a, b)];
    if (!p || !p.active) return false;
    p.active = false;
    p.brokenAt = S.monthsElapsed(state);
    return true;
  }
  // Officers who care about the Han take a blow to their loyalty.
  function loyaltyShock(state, fid, drops) {
    for (const o of S.officersOf(state, fid)) {
      if (!S.isRuler(state, o)) o.loyalty = Math.max(0, o.loyalty - drops[o.han]);
    }
  }

  S.courtInit = function (state, favor) {
    state.han = { favor: 50, holder: null, ended: false, pending: null, movedAt: null, letterAt: null, decree: null };
    const h = S.emperorHolder(state);
    state.han.holder = h;
    if (favor != null) state.han.favor = favor;
    else if (h) state.han.favor = S.COURT.baseFavor[rulerOf(state, h).han];
    return state.han;
  };

  // A new holder: set his favour from their attitude. While he sits in a
  // vacant city his favour is kept, so whoever rescues him gets the bonus.
  S.syncCourt = function (state) {
    const han = state.han;
    if (!han || han.ended) return;
    const h = S.emperorHolder(state);
    if (h === han.holder) return;
    han.pending = null;
    han.holder = h;
    han.movedAt = null; // a new keeper may move the court at once
    if (!h) return;
    const before = han.favor;
    han.favor = S.COURT.baseFavor[rulerOf(state, h).han] + (before < 30 ? S.COURT.rescueBonus : 0);
    S.addLog(state, `${S.josa(S.forceName(state, h), "이", "가")} ${state.cities[state.emperor].name}에서 헌제를 맞이했습니다.`,
      h === state.playerForce ? "sys" : "info");
  };

  // ---------- requests ----------
  function makeDemand(state) {
    const n = S.citiesOf(state, state.han.holder).length;
    const kinds = [
      { label: "굶주린 백성을 구휼할 군량", food: 1000 + n * 200 },
      { label: "무너진 궁궐을 수리할 금", gold: 200 + n * 30 },
      { label: "종묘 제사에 쓸 금과 군량", gold: 100 + n * 15, food: 500 + n * 100 },
    ];
    return kinds[Math.floor(S.rand(state) * kinds.length)];
  }
  S.demandCargo = (d) => [d.gold && `금 ${d.gold}`, d.food && `군량 ${d.food}`].filter(Boolean).join(", ");
  S.canPayDemand = (state, d) => {
    const c = state.cities[state.emperor];
    return c.gold >= (d.gold || 0) && c.food >= (d.food || 0);
  };
  function payDemand(state, d) {
    const c = state.cities[state.emperor];
    c.gold -= d.gold || 0;
    c.food -= d.food || 0;
    addFavor(state, S.COURT.accept);
  }

  S.answerDemand = function (state, accept) {
    const d = state.han && state.han.pending;
    if (!d || d.type !== "demand" || state.han.holder !== state.playerForce) return fail("헌제의 요청이 없습니다.");
    if (accept) {
      if (!S.canPayDemand(state, d)) return fail(`${state.cities[state.emperor].name}의 금이나 군량이 부족합니다.`);
      payDemand(state, d);
      state.han.pending = null;
      return { ok: true, msg: `헌제의 청을 받들어 ${S.josa(S.demandCargo(d), "을", "를")} 바쳤습니다. 헌제의 우호도가 ${S.COURT.accept} 올랐습니다.` };
    }
    addFavor(state, -S.COURT.refuse);
    state.han.pending = null;
    return { ok: true, msg: `헌제의 청을 거절했습니다. 헌제의 우호도가 ${S.COURT.refuse} 떨어졌습니다.` };
  };

  // ---------- abdication ----------
  S.abdicateChance = (state, share) =>
    clamp(Math.round(state.han.favor - 60 + (share - S.COURT.abdicateShare) * 100), 5, 60);

  function abdicate(state, fid) {
    const han = state.han;
    const f = state.forces[fid];
    han.ended = true;
    han.pending = null;
    han.endedBy = fid;
    han.endedYear = state.year;
    f.emperor = true;
    f.emperorYear = state.year;
    f.dynasty = S.dynastyName ? S.dynastyName(state, fid) : null; // js/titles.js
    if (S.askDynasty) S.askDynasty(state, fid);
    loyaltyShock(state, fid, { H: 15, U: 4, N: 0 });
    S.addLog(state, `헌제가 ${rulerOf(state, fid).name}에게 제위를 물려주었습니다. 4백 년 한 왕조가 막을 내리고 ${f.dynasty || ""} 황제가 즉위합니다.`.replace("  ", " "), "fall");
  }

  S.answerAbdication = function (state, accept) {
    const p = state.han && state.han.pending;
    if (!p || p.type !== "abdicate" || state.han.holder !== state.playerForce) return fail("선양 조서가 없습니다.");
    if (accept) {
      abdicate(state, state.playerForce);
      return { ok: true, msg: "선양을 받아 황제에 올랐습니다. 한조를 중시하는 무장들의 충성이 떨어졌습니다." };
    }
    state.han.pending = null;
    addFavor(state, 5);
    return { ok: true, msg: "선양을 사양했습니다. 헌제의 우호도가 5 올랐습니다." };
  };

  // ---------- proclaiming oneself emperor ----------
  // Cities needed to proclaim: half for a ruler with the 칭제 specialty.
  S.proclaimNeed = (state, fid) => (S.hasSkill(rulerOf(state, fid), "칭제") ? Math.ceil(S.COURT.proclaimCities / 2) : S.COURT.proclaimCities);
  S.canProclaim = function (state, fid) {
    const f = state.forces[fid];
    if (f.emperor) return fail("이미 황제입니다.");
    if (S.emperorHolder(state) === fid) return fail("헌제를 모시는 동안에는 칭제할 수 없습니다. 헌제의 선양을 기다려야 합니다.");
    const n = S.citiesOf(state, fid).length;
    const need = S.proclaimNeed(state, fid);
    if (n < need) return fail(`도시가 ${need}개 이상 있어야 칭제할 수 있습니다. (현재 ${n}개)`);
    return { ok: true };
  };
  // After the Han has ended, a ruler who upholds it claims to continue the dynasty.
  S.isHanHeir = (state, fid) => !!(state.han && state.han.ended && rulerOf(state, fid).han === "H");

  S.proclaim = function (state, fid) {
    const can = S.canProclaim(state, fid);
    if (!can.ok) return can;
    const f = state.forces[fid];
    const ruler = rulerOf(state, fid);
    const heir = S.isHanHeir(state, fid);
    f.emperor = true;
    f.emperorYear = state.year;
    f.hanHeir = heir;
    f.dynasty = S.dynastyName ? S.dynastyName(state, fid) : null; // js/titles.js
    if (S.askDynasty) S.askDynasty(state, fid);
    const as = f.dynasty ? `${f.dynasty} 황제` : "황제";
    if (!heir) {
      loyaltyShock(state, fid, { H: 25, U: 8, N: 0 });
      // Loyalists will not stay allied with a usurper.
      for (const other of S.allies(state, fid)) {
        if (rulerOf(state, other).han === "H" && dropPact(state, fid, other)) {
          S.addLog(state, `${S.josa(S.forceName(state, other), "이", "가")} 역적과 손잡을 수 없다며 ${S.josa(S.forceName(state, fid), "과", "와")}의 동맹을 끊었습니다.`, "info");
        }
      }
    }
    const msg = heir
      ? `${S.josa(ruler.name, "이", "가")} 한 황실을 잇는다며 ${as}에 올랐습니다.`
      : `${S.josa(ruler.name, "이", "가")} 스스로 ${S.josa(as, "을", "를")} 칭했습니다.`;
    if (fid !== state.playerForce) S.addLog(state, msg, "fall");
    return { ok: true, msg: heir ? msg : msg + " 한조를 중시하는 무장들의 충성이 크게 떨어졌습니다." };
  };

  // Recruiting: loyalists come readily to the emperor's protector and shun usurpers.
  S.courtRecruitBonus = function (state, recruiter, target) {
    let b = 0;
    const han = state.han;
    if (han && !han.ended && S.emperorHolder(state) === recruiter.force && han.favor >= 40) b += { H: 15, U: 5, N: 0 }[target.han];
    const f = state.forces[recruiter.force];
    if (f && f.emperor) b += target.han === "H" ? (f.hanHeir ? 10 : -10) : 5;
    return b;
  };

  // ---------- moving the court ----------
  S.moveEmperor = function (state, fid, cid) {
    S.syncCourt(state);
    const han = state.han;
    if (S.emperorHolder(state) !== fid) return fail("헌제를 모시고 있지 않습니다.");
    if (!(cid in S.reachable(state, state.emperor))) return fail("아군 영토로 이어진 도시로만 천도할 수 있습니다.");
    const t = S.monthsElapsed(state);
    if (han.movedAt != null && t - han.movedAt < S.COURT.moveCooldown) {
      return fail(`천도한 지 얼마 되지 않았습니다. ${han.movedAt + S.COURT.moveCooldown - t}개월 뒤에 다시 천도할 수 있습니다.`);
    }
    const from = state.cities[state.emperor];
    if (from.gold < S.COURT.moveCost) return fail(`${from.name}의 금이 부족합니다. (필요 ${S.COURT.moveCost})`);
    from.gold -= S.COURT.moveCost;
    state.emperor = cid;
    han.movedAt = t;
    addFavor(state, S.moveFavorDelta(from.id, cid));
    const msg = `${S.josa(S.forceName(state, fid), "이", "가")} 헌제를 모시고 ${from.name}에서 ${S.ro(state.cities[cid].name)} 천도했습니다.` +
      (cid === S.COURT.home ? " 헌제가 고향 낙양으로 돌아와 기뻐합니다." : from.id === S.COURT.home ? " 헌제가 낙양을 떠나며 슬퍼합니다." : "");
    if (fid !== state.playerForce) S.addLog(state, msg, "info");
    return { ok: true, msg };
  };

  S.moveFavorDelta = (fromId, toId) => (toId === S.COURT.home ? S.COURT.moveFavor.back
    : fromId === S.COURT.home ? S.COURT.moveFavor.leave : S.COURT.moveFavor.other);

  // ---------- escape and secret letters ----------
  S.emperorEscapeChance = (state) => {
    const c = state.cities[state.emperor];
    return Math.max(0, (30 - state.han.favor) / 10 + (c.order < 40 ? 1 : 0));
  };

  // He slips away to the nearest city not held by his keeper, preferring a
  // vacant one or a loyalist's.
  function escape(state) {
    const han = state.han;
    const holder = han.holder;
    const dist = { [state.emperor]: 0 };
    const queue = [state.emperor];
    while (queue.length) {
      const id = queue.shift();
      if (dist[id] >= 3) continue;
      for (const n of S.neighbors(id)) if (!(n in dist)) { dist[n] = dist[id] + 1; queue.push(n); }
    }
    let best = null;
    for (const [id, d] of Object.entries(dist)) {
      const c = state.cities[id];
      if (!d || c.owner === holder) continue;
      const score = (c.owner ? { H: 2, U: 1, N: 0 }[rulerOf(state, c.owner).han] : 3) - d * 0.5 + S.rand(state) * 0.3;
      if (!best || score > best.score) best = { id, score };
    }
    if (!best) return;
    const from = state.cities[state.emperor];
    state.emperor = best.id;
    S.addLog(state, `헌제가 ${S.josa(from.name, "을", "를")} 빠져나와 ${S.ro(state.cities[best.id].name)} 몸을 피했습니다.`,
      holder === state.playerForce ? "warn" : "info");
    S.syncCourt(state);
  }

  // 의대조: a letter sewn into a robe reaches the strongest loyalist ruler.
  function secretLetter(state) {
    const han = state.han;
    const holder = han.holder;
    const loyalists = Object.values(state.forces).filter((f) => f.alive && f.id !== holder && !f.emperor && rulerOf(state, f.id).han === "H");
    if (!loyalists.length) return;
    const to = loyalists.reduce((a, b) => (S.citiesOf(state, b.id).length > S.citiesOf(state, a.id).length ? b : a)).id;
    const toRuler = rulerOf(state, to);
    han.letterAt = S.monthsElapsed(state);
    han.decree = { against: holder, by: to, until: han.letterAt + 24 };
    addFavor(state, -5);
    dropPact(state, holder, to);
    // Loyalists in the holder's camp may go over to the letter's bearer.
    const gone = [];
    const ruler = rulerOf(state, holder);
    for (const o of S.officersOf(state, holder)) {
      if (o.han !== "H" || o.transit || S.isRuler(state, o) || sameClan(o, ruler) || o.loyalty >= 70 || !S.chance(state, 30)) continue;
      const k = S.postOf(state, o);
      if (k) state.cities[o.city].posts[k] = null;
      o.force = to;
      o.city = toRuler.city;
      S.officersMoved(state);
      o.loyalty = 75;
      S.joinBond(state, o, S.BOND.join);
      o.done = true;
      gone.push(o.name);
    }
    loyaltyShock(state, holder, { H: 10, U: 0, N: 0 });
    const mine = holder === state.playerForce || to === state.playerForce;
    S.addLog(state, `헌제가 옷 속에 감춘 밀서를 ${toRuler.name}에게 보냈습니다. ${S.josa(S.forceName(state, holder), "을", "를")} 치라는 밀명입니다.` +
      (gone.length ? ` ${S.josa(gone.join(", "), "이", "가")} ${S.forceName(state, to)}에 가담했습니다.` : ""), mine ? "warn" : "info");
  }

  // Loyalists answering a secret letter go after the holder for two years.
  S.courtPull = function (state, fid, t) {
    const han = state.han;
    if (!han) return 0;
    if (!han.ended && t.id === state.emperor && t.owner !== fid) return { H: 0.4, U: 0.25, N: 0 }[rulerOf(state, fid).han];
    const d = han.decree;
    return d && d.by === fid && d.against === t.owner && S.monthsElapsed(state) < d.until ? 0.2 : 0;
  };

  // ---------- monthly ----------
  S.runCourt = function (state) {
    const han = state.han;
    if (!han || han.ended || !state.emperor) return;
    S.syncCourt(state);
    if (han.pending) {
      if (han.pending.type === "demand") {
        addFavor(state, -S.COURT.refuse);
        S.addLog(state, `헌제의 청에 답하지 않아 우호도가 ${S.COURT.refuse} 떨어졌습니다.`, "warn");
      }
      han.pending = null;
    }
    const h = han.holder;
    if (!h) return;
    const ruler = rulerOf(state, h);
    const share = S.cityShare(state, h);
    const mine = h === state.playerForce;
    // Loyalists in the holder's camp watch how the emperor is treated.
    for (const o of S.officersOf(state, h)) {
      if (o.han !== "H" || S.isRuler(state, o) || !S.chance(state, 30)) continue;
      if (han.favor >= 50) o.loyalty = Math.min(100, o.loyalty + 1);
      else if (han.favor < 30) o.loyalty = Math.max(0, o.loyalty - 1);
    }
    if ((state.month === 1 || state.month === 7) && han.favor >= S.COURT.abdicateFavor && share >= S.COURT.abdicateShare &&
        S.chance(state, S.abdicateChance(state, share))) {
      if (mine) {
        han.pending = { type: "abdicate" };
        S.addLog(state, "헌제가 제위를 물려주겠다는 조서를 내렸습니다.", "sys");
      } else if (ruler.han !== "H" && !S.hasTrait(ruler, "무욕")) {
        abdicate(state, h);
      } else {
        addFavor(state, 5); // a loyalist declines
      }
      return;
    }
    if (state.month % 3 === 1) {
      addFavor(state, { H: 1, U: 0, N: -1 }[ruler.han]);
      if (S.chance(state, S.COURT.demandChance)) {
        const d = makeDemand(state);
        if (mine) {
          han.pending = Object.assign({ type: "demand" }, d);
          S.addLog(state, `헌제가 ${S.josa(d.label, "을", "를")} 청했습니다. (${S.demandCargo(d)})`, "sys");
        } else if (S.canPayDemand(state, d) && S.chance(state, { H: 90, U: 65, N: 35 }[ruler.han] + Math.max(0, 50 - han.favor))) {
          payDemand(state, d);
        } else {
          addFavor(state, -S.COURT.refuse);
        }
      }
    }
    if (han.favor < 30) {
      const t = S.monthsElapsed(state);
      if (share >= S.COURT.strong) {
        if (state.month % 3 === 1 && (han.letterAt == null || t - han.letterAt >= 12) && S.chance(state, (30 - han.favor) * 1.5)) secretLetter(state);
      } else if (S.chance(state, S.emperorEscapeChance(state))) {
        escape(state);
      }
    }
  };

  // ---------- computer forces ----------
  // 한조중시 keepers hold 낙양 and bring him home when they can; 한조이용
  // keepers carry him off to the safest interior city as soon as the front
  // nears; 한조무관 keepers do not bother.
  function moveCourtAI(state, fid, ruler) {
    if (ruler.han === "N") return;
    const home = S.COURT.home;
    const here = state.cities[state.emperor];
    const enemyNear = (c) => S.neighbors(c.id).reduce((s, n) => s + (state.cities[n].owner !== fid ? state.cities[n].troops : 0), 0);
    const exposed = (c) => S.neighbors(c.id).some((n) => state.cities[n].owner !== fid);
    const reach = S.reachable(state, state.emperor);
    const safest = () => {
      const safe = Object.keys(reach).map((id) => state.cities[id]).filter((c) => c.size >= 3 && !exposed(c));
      return safe.length ? safe.reduce((a, b) => (b.size > a.size ? b : a)).id : null;
    };
    if (ruler.han === "H") {
      if (here.id === home) {
        // Leave 낙양 only when it is about to fall.
        if (enemyNear(here) > here.troops * 2 && S.chance(state, 20)) {
          const to = safest();
          if (to) S.moveEmperor(state, fid, to);
        }
      } else if (home in reach && enemyNear(state.cities[home]) < state.cities[home].troops * 1.5) {
        if (S.chance(state, 30)) S.moveEmperor(state, fid, home);
      } else if (exposed(here) && S.chance(state, 15)) {
        const to = safest();
        if (to) S.moveEmperor(state, fid, to);
      }
      return;
    }
    if (exposed(here)) {
      const to = safest();
      if (to) S.moveEmperor(state, fid, to);
    }
  }

  S.courtAI = function (state, fid) {
    const han = state.han;
    if (!han) return;
    const ruler = rulerOf(state, fid);
    if (!han.ended && S.emperorHolder(state) === fid) moveCourtAI(state, fid, ruler);
    if (!S.canProclaim(state, fid).ok) return;
    // The 칭제 specialty halves how big the realm must grow first.
    const n = S.citiesOf(state, fid).length * (S.COURT.proclaimCities / S.proclaimNeed(state, fid));
    let p = 0;
    if (ruler.han === "N" && n >= 12) p = 2;
    else if (han.ended && n >= (ruler.han === "H" ? 8 : 12)) p = 5;
    if (S.hasTrait(ruler, "야심")) p *= 2;
    if (S.hasTrait(ruler, "무욕") && !S.isHanHeir(state, fid)) p = 0;
    if (p && S.chance(state, p)) S.proclaim(state, fid);
  };
})(globalThis.SAM = globalThis.SAM || {});
