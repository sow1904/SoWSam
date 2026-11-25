// Standing (phase 2 of the redesign, docs/redesign.md): what each person
// has made of himself and what he wants.
//
//   명성 o.fame (0-100): his name in the realm. From ability and rank at the
//     start; victories raise it, defeats lower it.
//   공적 o.merit: what he has done for the lord he serves now. Work, posts,
//     offices and battles add to it; it starts again under a new lord.
//   관직: a seat at court (f.offices[key] = officer id). Seats are few and
//     open as the force grows.
//   의견 S.opinion(a, b) (-100..100): old ties, the bond with his lord, a
//     grudge against a force, and what has passed between the two (o.op).
//   야망 S.ambitionOf(o): what he wants, weighed: 출세, 영토, 안위, 한조, 가문.
//   만족 o.content (0-100): how near his lot is to what he wants. It drifts
//     each month toward its mark; low contentment wears loyalty down faster
//     and feeds rebellion.
// One who wants to rise and has earned more than his seat asks for a higher
// one; the lord grants it (the one pushed out resents it) or refuses (the
// asker resents that). A player ruler is asked.
// why: the user's design: officers earn merit and want to reach the centre.
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });
  const ST = S.STANDING = {
    worth: { merit: 6, meritMax: 300 }, // worth = fame + merit / 6 (merit counted up to 300)
    expect: [80, 65, 50], // worth needed at least to expect a seat of rank 1, 2, 3
    rankValue: { 1: 3, 2: 2, 3: 1 }, governorValue: 1,
    drift: 0.15, // share of the way to its mark contentment moves each month
    merit: { work: 1, post: 1, office: 2, governor: 1, capture: 10, lead: 1.5, decisive: 15 },
    fame: { capture: 2, captureMen: 1, decisive: 5, decisiveMen: 2, beaten: 3 },
    ask: { content: 50, merit: 40, chance: 10, wait: 12, answer: 1 },
    op: { granted: 15, pushed: -15, refused: -10, appointed: 10, dismissed: -20, decay: 0.8 },
    // Counsel to the player (js/ui/commands.js): a 군사 judges by 군략, a 장사
    // by 정치. He misjudges each officer's worth by up to blur × (100 - his
    // ability)%: ±10% at 80, ±25% at 50, none at 100.
    counsel: { blur: 0.5 },
  };
  // How far off (as a share) a counsellor's judgement may be.
  S.counselBlur = (o, key) => Math.max(0, 100 - (key === "adviser" ? o.strat : o.pol)) / 100 * ST.counsel.blur;

  // Seats at court. min: cities the force needs before the seat opens.
  // 장사 and 군사 are every force's, whatever its ruler's title (js/titles.js);
  // for the player they also counsel on commands (js/ui/commands.js).
  S.OFFICES = [
    { key: "chancellor", name: "장사", role: "내정", rank: 1, min: 1, stat: (o) => o.pol,
      help: "수도로 오는 상납 금이 정치에 비례해 늘어납니다(정치 90이면 9%). 플레이어 세력이면 인사·경제 명령에서 실행할 무장을 추천합니다." },
    { key: "marshal", name: "대장군", role: "군권", rank: 1, min: 2, stat: (o) => Math.round(o.cmd * 0.6 + o.war * 0.2 + o.strat * 0.2),
      help: "수도에 있으면 원정과 맞대응 주력군을 앞장서 이끕니다." },
    { key: "adviser", name: "군사", role: "작전", rank: 2, min: 1, stat: (o) => o.strat,
      help: "원정을 정할 때 군략이 높을수록 이길 수 있는 싸움을 더 잘 알아봅니다. 원정에 함께 나섭니다. 플레이어 세력이면 군사·계략·외교 명령에서 실행할 무장을 추천합니다." },
    { key: "secretary", name: "상서령", role: "인사", rank: 2, min: 6, stat: (o) => Math.round((o.pol + o.wit) / 2),
      help: "사람을 고르게 써서 세력 무장들의 만족이 오릅니다." },
    { key: "envoy", name: "대홍려", role: "외교·첩보", rank: 2, min: 6, stat: (o) => Math.round((o.speech + o.wit) / 2),
      help: "적군이 다가온다는 소식이 며칠 더 빨리 들어옵니다." },
    { key: "front", name: "전장군", role: "출정", rank: 3, min: 2, stat: (o) => Math.round((o.cmd + o.war) / 2), help: "원정에 앞장섭니다." },
    { key: "rear", name: "후장군", role: "출정", rank: 3, min: 8, stat: (o) => Math.round((o.cmd + o.war) / 2), help: "원정에 앞장섭니다." },
    { key: "left", name: "좌장군", role: "출정", rank: 3, min: 14, stat: (o) => Math.round((o.cmd + o.war) / 2), help: "원정에 앞장섭니다." },
    { key: "right", name: "우장군", role: "출정", rank: 3, min: 20, stat: (o) => Math.round((o.cmd + o.war) / 2), help: "원정에 앞장섭니다." },
  ];
  const OFF = Object.fromEntries(S.OFFICES.map((x) => [x.key, x]));
  S.officeDef = (key) => OFF[key] || null;
  S.AMBITIONS = { rise: "출세", land: "영토", safety: "안위", han: "한조", house: "가문" };
  const now = (state) => S.monthsElapsed(state);
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const kinOf = (a, b) => !!(S.CLAN[a.name] && S.CLAN[b.name] && S.CLAN[a.name].clan === S.CLAN[b.name].clan);
  const mineLog = (state, fid) => (fid === state.playerForce && !S.spectating(state) ? "warn" : "strife");

  // ---------- fame and merit ----------
  S.baseFame = function (o) {
    const v = S.ABILITY_KEYS.map((k) => o[k] || 0);
    const top = Math.max(...v), avg = v.reduce((s, x) => s + x, 0) / v.length;
    return clamp(Math.round((top - 55) * 1.5 + (avg - 50) * 0.5), 5, 90);
  };
  S.worthOf = (o) => (o.fame || 0) + Math.min(o.merit || 0, ST.worth.meritMax) / ST.worth.merit;
  const addFame = (o, d) => { if (o) o.fame = clamp(Math.round((o.fame || 0) + d), 0, 100); };
  const addMerit = (o, d) => { if (o && o.status === "serving") o.merit = Math.max(0, Math.round((o.merit || 0) + d)); };
  S.addMerit = addMerit;

  // ---------- opinion ----------
  S.opAdd = function (a, b, d) {
    if (!a || !b || a === b) return;
    a.op = a.op || {};
    a.op[b.id] = clamp((a.op[b.id] || 0) + d, -60, 60);
  };
  // What a thinks of b.
  S.opinion = function (state, a, b) {
    if (!a || !b || a === b) return 0;
    let v = S.tieOf(a, b) + ((a.op && a.op[b.id]) || 0);
    if (a.status === "serving" && rulerOf(state, a.force) === b) v += ((a.bond || 0) - 30) * 0.8;
    if (b.status === "serving" && S.isRuler(state, b)) v += S.feelFor(a, b.force) / 2;
    return clamp(Math.round(v), -100, 100);
  };

  // ---------- ambition ----------
  S.ambitionOf = function (state, o) {
    const t = (k) => S.hasTrait(o, k);
    return {
      rise: Math.max(0.1, 1 + (t("야심") ? 1.5 : 0) + (t("과감") ? 0.3 : 0) - (t("무욕") ? 0.8 : 0)),
      land: { 천하: 1.5, 지방: 1, 주: 0.5, 성: 0.2 }[S.reachOf(o)] || 0.5,
      safety: 0.5 + (t("신중") ? 0.8 : 0) + (t("무욕") ? 0.7 : 0) + (S.age(state, o) >= 55 ? 0.5 : 0),
      han: { H: 1.2, U: 0.2, N: 0 }[o.han] || 0,
      house: S.CLAN[o.name] ? 0.6 : 0.2,
    };
  };
  // His chief wants, the heaviest first.
  S.ambitionLabels = function (state, o, n) {
    const a = S.ambitionOf(state, o);
    return Object.entries(a).filter(([, w]) => w >= 0.6).sort((x, y) => y[1] - x[1]).slice(0, n || 2).map(([k]) => S.AMBITIONS[k]);
  };

  // ---------- offices ----------
  S.officesOf = (state, fid) => (state.forces[fid] && (state.forces[fid].offices = state.forces[fid].offices || {})) || {};
  S.openSeats = (state, fid) => S.OFFICES.filter((x) => S.citiesOf(state, fid).length >= x.min);
  S.holder = function (state, fid, key) {
    const id = S.officesOf(state, fid)[key];
    const o = id && state.officers[id];
    return o && o.status === "serving" && o.force === fid && !S.isRuler(state, o) ? o : null;
  };
  S.officeOf = function (state, o) {
    if (!o || o.status !== "serving" || !o.force) return null;
    const offs = S.officesOf(state, o.force);
    for (const k in offs) if (offs[k] === o.id) return OFF[k] || null;
    return null;
  };
  // A governor: at the head of a city other than the capital.
  S.governs = function (state, o) {
    if (!o || o.status !== "serving" || S.isRuler(state, o)) return null;
    const c = state.cities[o.city];
    if (!c || c.owner !== o.force || S.capitalOf(state, o.force) === c.id) return null;
    return S.cityHead(state, c) === o ? c : null;
  };
  // The value of the seat he holds now (a governor counts as rank 3).
  S.seatValue = function (state, o) {
    const off = S.officeOf(state, o);
    if (off) return ST.rankValue[off.rank];
    return S.governs(state, o) ? ST.governorValue : 0;
  };
  // The value of the seat he thinks he has earned: the seats of his force,
  // shared out by worth (the worthiest expect the highest), and only to those
  // worth enough at all. Reckoned once a day per force.
  const expectMemo = new WeakMap();
  S.expectMap = function (state, fid) {
    const f = state.forces[fid];
    const m = expectMemo.get(f);
    const day = S.today(state);
    if (m && m.day === day) return m.map;
    const seats = { 3: 0, 2: 0, 1: 0 };
    for (const x of S.openSeats(state, fid)) seats[ST.rankValue[x.rank]]++;
    seats[1] += Math.max(0, S.citiesOf(state, fid).length - 1); // governors
    const men = S.officersOf(state, fid).filter((o) => !S.isRuler(state, o)).sort((a, b) => S.worthOf(b) - S.worthOf(a));
    const map = {};
    let i = 0;
    for (const v of [3, 2, 1]) {
      for (let n = 0; n < seats[v] && i < men.length; i++) {
        const o = men[i];
        // Too little worth for this rank: he may still expect a lower one.
        const lv = S.worthOf(o) >= ST.expect[0] ? 3 : S.worthOf(o) >= ST.expect[1] ? 2 : S.worthOf(o) >= ST.expect[2] ? 1 : 0;
        if (lv < v) break;
        map[o.id] = v;
        n++;
      }
    }
    expectMemo.set(f, { day, map });
    return map;
  };
  S.expectValue = (state, o) => (o.status === "serving" && o.force ? S.expectMap(state, o.force)[o.id] || 0 : 0);
  // How well o would fill a seat, in the eyes of his ruler.
  S.officeFit = function (state, fid, o, key) {
    const r = rulerOf(state, fid);
    return OFF[key].stat(o) + (o.fame || 0) * 0.4 + Math.min(o.merit || 0, ST.worth.meritMax) * 0.05 + (r ? S.opinion(state, r, o) / 4 : 0);
  };
  // Those who could be given a seat: serving, not the ruler, not alone at
  // the head of a far city.
  S.officeCandidates = function (state, fid, key) {
    const cap = S.capitalOf(state, fid);
    return S.officersOf(state, fid).filter((o) => {
      if (S.isRuler(state, o)) return false;
      const c = state.cities[o.city];
      if (c && c.id !== cap && c.owner === fid && S.serving(state, c.id).filter((x) => x.force === fid).length <= 1) return false;
      return true;
    }).sort((a, b) => S.officeFit(state, fid, b, key) - S.officeFit(state, fid, a, key));
  };
  function vacate(state, fid, key) {
    const offs = S.officesOf(state, fid);
    delete offs[key];
  }
  // Seat o in key. Returns the one pushed out, if any.
  function seat(state, fid, key, o) {
    const offs = S.officesOf(state, fid);
    const old = S.officeOf(state, o);
    const prev = S.holder(state, fid, key);
    if (old) vacate(state, fid, old.key);
    offs[key] = o.id;
    // One who gave up a seat for this one: the one pushed out may take it.
    if (prev && prev !== o && old && OFF[old.key] && S.citiesOf(state, fid).length >= OFF[old.key].min) offs[old.key] = prev.id;
    return prev && prev !== o ? prev : null;
  }
  // The ruler appoints o to key (by: "ai" | "player" | "ask").
  S.appoint = function (state, fid, key, oid) {
    const o = state.officers[oid];
    const off = OFF[key];
    if (!off || !o || o.status !== "serving" || o.force !== fid || S.isRuler(state, o)) return fail("임명할 수 없습니다.");
    if (!S.openSeats(state, fid).includes(off)) return fail(`${off.name} 자리는 도시가 ${off.min}개 이상이어야 열립니다.`);
    if (S.holder(state, fid, key) === o) return fail(`${S.josa(o.name, "은", "는")} 이미 ${off.name}입니다.`);
    const r = rulerOf(state, fid);
    const before = S.seatValue(state, o);
    const pushed = seat(state, fid, key, o);
    if (S.seatValue(state, o) >= before) { S.opAdd(o, r, ST.op.appointed); o.content = clamp((o.content ?? 50) + 8, 0, 100); }
    if (pushed) {
      S.opAdd(pushed, r, ST.op.pushed);
      pushed.content = clamp((pushed.content ?? 50) - 10, 0, 100);
    }
    return { ok: true, pushed, msg: `${S.josa(o.name, "을", "를")} ${off.name}에 임명했습니다.` + (pushed ? ` ${S.josa(pushed.name, "은", "는")} 자리에서 물러나 불만을 품습니다.` : "") };
  };
  S.dismiss = function (state, fid, key) {
    const o = S.holder(state, fid, key);
    if (!o) return fail("그 자리는 비어 있습니다.");
    vacate(state, fid, key);
    S.opAdd(o, rulerOf(state, fid), ST.op.dismissed);
    o.content = clamp((o.content ?? 50) - 12, 0, 100);
    return { ok: true, msg: `${S.josa(o.name, "을", "를")} ${OFF[key].name}에서 파면했습니다. 그는 불만을 품습니다.` };
  };
  // A computer ruler fills each empty seat with the fittest man.
  S.fillSeats = function (state, fid) {
    const out = [];
    for (const off of S.openSeats(state, fid)) {
      if (S.holder(state, fid, off.key)) continue;
      const pick = S.officeCandidates(state, fid, off.key).find((o) => !S.officeOf(state, o));
      if (!pick) continue;
      seat(state, fid, off.key, pick);
      out.push([off, pick]);
    }
    return out;
  };

  // Seats that slipped away: a dead or departed holder, a new ruler, a
  // force grown too small.
  function tidySeats(state, fid) {
    const offs = S.officesOf(state, fid);
    const open = new Set(S.openSeats(state, fid).map((x) => x.key));
    for (const k of Object.keys(offs)) if (!open.has(k) || !S.holder(state, fid, k)) delete offs[k];
  }

  // ---------- effects of offices ----------
  // Ordering for those who lead an army out: the 대장군 first, then the 군사
  // and the generals.
  S.leadScore = function (state, o) {
    const off = S.officeOf(state, o);
    const lift = !off ? 0 : off.key === "marshal" ? 1000 : off.key === "adviser" ? 400 : off.rank === 3 ? 200 : 0;
    return o.cmd + o.war + lift;
  };
  // Days sooner the news of an army reaches fid.
  S.spyEdge = function (state, fid) {
    const o = fid && S.holder(state, fid, "envoy");
    return o ? clamp(Math.round((OFF.envoy.stat(o) - 50) / 8), 0, 6) : 0;
  };
  // Lighter odds a 군사 grants when choosing a war.
  S.adviserEdge = function (state, fid) {
    const o = fid && S.holder(state, fid, "adviser");
    return o ? clamp((o.strat - 60) / 400, 0, 0.1) : 0;
  };

  // ---------- contentment ----------
  // Where contentment drifts to.
  S.contentMark = function (state, o) {
    const f = state.forces[o.force];
    const r = rulerOf(state, o.force);
    const a = S.ambitionOf(state, o);
    let v = 50 + S.opinion(state, o, r) / 4;
    // 출세: the seat he holds against the one he has earned.
    v += a.rise * Math.max(-20 / a.rise, Math.min(1, S.seatValue(state, o) - S.expectValue(state, o)) * 5);
    // 영토: the force growing or shrinking this past year.
    const grew = f.sizeLog && f.sizeLog.length ? S.citiesOf(state, o.force).length - f.sizeLog[0] : 0;
    v += a.land * clamp(grew, -3, 3) * 3;
    // 안위: peace at home.
    v += a.safety * (f.weariness > 50 ? -(f.weariness - 50) / 5 : 2) - (S.besieged(state, o.city) ? 10 * a.safety : 0);
    // 한조: how the emperor fares in this force.
    if (state.han && !state.han.ended && state.han.holder === o.force) v += a.han * (state.han.favor - 50) / 5;
    if (f.emperor) v -= a.han * 10;
    // 가문: kin of the lord.
    if (r && kinOf(o, r)) v += a.house * 8;
    // A fair 상서령.
    const sec = S.holder(state, o.force, "secretary");
    if (sec && sec !== o) v += clamp((OFF.secretary.stat(sec) - 50) / 5, 0, 9);
    return clamp(Math.round(v), 0, 100);
  };
  S.contentLabel = (v) => (v >= 70 ? "만족" : v >= 45 ? "보통" : v >= 25 ? "불만" : "격분");

  // Loyalty wears down faster in the discontented.
  const drift = S.loyaltyDrift;
  S.loyaltyDrift = function (o) {
    const c = o.content == null ? 50 : o.content;
    return drift(o) * (c < 25 ? 2 : c < 45 ? 1.4 : c >= 70 ? 0.6 : 1);
  };
  // A new lord: merit starts again, and the seat is gone.
  const joinBond = S.joinBond;
  S.joinBond = function (state, o, base) {
    joinBond.apply(this, arguments);
    o.merit = 0;
    o.content = 50;
    o.askAt = null;
  };

  // ---------- start ----------
  function initOne(state, o) {
    if (o.fame == null) {
      o.fame = S.baseFame(o);
      if (o.status === "serving" && S.isRuler(state, o)) o.fame = clamp(Math.max(o.fame, 40 + S.citiesOf(state, o.force).length * 2), 0, 100);
    }
    if (o.merit == null) o.merit = o.status === "serving" ? Math.round(o.fame * 0.6) : 0;
  }
  S.initStanding = function (state) {
    for (const o of Object.values(state.officers)) initOne(state, o);
    for (const f of Object.values(state.forces)) {
      if (!f.alive) continue;
      f.sizeLog = f.sizeLog || [];
      S.fillSeats(state, f.id);
    }
    for (const o of Object.values(state.officers)) if (o.status === "serving" && o.content == null) o.content = S.contentMark(state, o);
  };

  // ---------- battle ----------
  const serving = (state, ids, fid) => (ids || []).map((id) => state.officers[id]).filter((o) => o && o.status === "serving" && o.force === fid);
  // An army took a city: merit and fame for those in it, most for its leader.
  S.creditCapture = function (state, A) {
    const men = serving(state, A.officers, A.force);
    men.forEach((o, i) => {
      addMerit(o, ST.merit.capture * (i === 0 ? ST.merit.lead : 1));
      addFame(o, i === 0 ? ST.fame.capture : ST.fame.captureMen);
    });
    const r = rulerOf(state, A.force);
    if (r) addFame(r, 1);
  };
  // A main army beat another in the field.
  S.creditDecisive = function (state, win, lose) {
    serving(state, win.officers, win.force).forEach((o, i) => {
      addMerit(o, ST.merit.decisive * (i === 0 ? ST.merit.lead : 1));
      addFame(o, i === 0 ? ST.fame.decisive : ST.fame.decisiveMen);
    });
    const beaten = serving(state, lose.officers, lose.force)[0];
    if (beaten) addFame(beaten, -ST.fame.beaten);
  };

  // ---------- asking for a seat ----------
  // The seat o would ask for: one worth more than his own, held by someone
  // worth less (or empty), the highest he has earned.
  S.seatWanted = function (state, o) {
    const want = S.expectValue(state, o);
    const have = S.seatValue(state, o);
    if (want <= have) return null;
    const mine = S.officeOf(state, o);
    const seats = S.openSeats(state, o.force).filter((x) => ST.rankValue[x.rank] > have && ST.rankValue[x.rank] <= want && x !== mine);
    let best = null;
    for (const x of seats) {
      const h = S.holder(state, o.force, x.key);
      if (h && S.worthOf(h) >= S.worthOf(o) * 0.9) continue;
      const v = ST.rankValue[x.rank] * 100 + x.stat(o);
      if (!best || v > best.v) best = { off: x, holder: h, v };
    }
    return best;
  };
  // Would a computer ruler grant it?
  S.grantAsk = function (state, fid, o, key) {
    const r = rulerOf(state, fid);
    const h = S.holder(state, fid, key);
    let v = S.opinion(state, r, o) / 2 + (S.officeFit(state, fid, o, key) - (h ? S.officeFit(state, fid, h, key) : 0)) / 2;
    if (h) v += (S.worthOf(o) - S.worthOf(h)) / 2 - Math.max(0, S.opinion(state, r, h)) / 3;
    if (S.hasTrait(r, "신중")) v -= 5;
    if (S.hasTrait(r, "과감")) v += 5;
    return v > 0;
  };
  function settleAsk(state, fid, o, key, yes) {
    const r = rulerOf(state, fid);
    const off = OFF[key];
    o.askAt = now(state);
    if (!yes) {
      S.opAdd(o, r, ST.op.refused);
      o.content = clamp((o.content ?? 50) - 8, 0, 100);
      return { ok: true, msg: `${o.name}의 ${off.name} 요구를 물리쳤습니다. 그는 불만을 품습니다.` };
    }
    const res = S.appoint(state, fid, key, o.id);
    if (!res.ok) return res;
    S.opAdd(o, r, ST.op.granted - ST.op.appointed);
    return res;
  }
  S.settleAsk = settleAsk;
  S.answerOfficeAsk = function (state, id, yes) {
    const asks = state.officeAsks || [];
    const a = asks.find((x) => x.id === id);
    if (!a) return fail("그 요구는 이미 끝났습니다.");
    state.officeAsks = asks.filter((x) => x !== a);
    const o = state.officers[a.oid];
    if (!o || o.status !== "serving" || o.force !== a.fid) return fail(`${o ? o.name : "그"}는 이미 떠났습니다.`);
    return settleAsk(state, a.fid, o, a.key, yes);
  };

  // ---------- each month ----------
  S.runStanding = function (state) {
    const t = now(state);
    const player = state.playerForce && !S.spectating(state) ? state.playerForce : null;
    // The player's asks lapse: unanswered is refused.
    for (const a of (state.officeAsks || []).filter((x) => x.until <= t)) {
      const o = state.officers[a.oid];
      if (o && o.status === "serving" && o.force === a.fid) settleAsk(state, a.fid, o, a.key, false);
    }
    state.officeAsks = (state.officeAsks || []).filter((x) => x.until > t);
    for (const f of Object.values(state.forces)) {
      if (!f.alive) continue;
      tidySeats(state, f.id);
      f.sizeLog = f.sizeLog || [];
      f.sizeLog.push(S.citiesOf(state, f.id).length);
      if (f.sizeLog.length > 12) f.sizeLog.shift();
      if (f.id !== player && !S.rulerAway(state, f.id)) {
        for (const [off, o] of S.fillSeats(state, f.id)) {
          if (f.id === state.playerForce) S.addLog(state, `${S.josa(o.name, "이", "가")} ${off.name}에 올랐습니다.`, "strife");
        }
      }
      // 승상: more gold reaches the capital.
      const ch = S.holder(state, f.id, "chancellor");
      const capId = S.capitalOf(state, f.id);
      if (ch && capId) {
        const sent = S.citiesOf(state, f.id).reduce((s, c) => s + ((c.sent && c.sent.gold) || 0), 0);
        state.cities[capId].gold += Math.round(sent * OFF.chancellor.stat(ch) / 1000);
      }
    }
    for (const o of Object.values(state.officers)) {
      if (o.status !== "serving") continue;
      initOne(state, o);
      if (state.month === 1) {
        if (o.op) for (const k of Object.keys(o.op)) { o.op[k] = Math.round(o.op[k] * ST.op.decay); if (Math.abs(o.op[k]) < 2) delete o.op[k]; }
        if (S.isRuler(state, o)) o.fame = clamp(Math.max(o.fame, Math.min(100, 40 + S.citiesOf(state, o.force).length * 2)), 0, 100);
      }
      if (S.isRuler(state, o)) continue;
      // Merit for the month's work.
      const off = S.officeOf(state, o);
      addMerit(o, (o.done ? ST.merit.work : 0) + (S.postOf(state, o) ? ST.merit.post : 0) + (off ? ST.merit.office : 0) + (S.governs(state, o) ? ST.merit.governor : 0));
      const mark = S.contentMark(state, o);
      const c = o.content == null ? mark : o.content;
      o.content = clamp(Math.round(c + (mark - c) * ST.drift), 0, 100);
      // One who has earned more asks for it.
      const A = ST.ask;
      if (o.content >= A.content || (o.merit || 0) < A.merit || (o.askAt != null && t - o.askAt < A.wait)) continue;
      if (S.ambitionOf(state, o).rise < 1 || (S.isPlayer && S.isPlayer(state, o)) || !S.chance(state, A.chance)) continue;
      const want = S.seatWanted(state, o);
      if (!want) continue;
      const fid = o.force;
      const r = rulerOf(state, fid);
      if (fid === player) {
        if ((state.officeAsks || []).some((x) => x.oid === o.id)) continue;
        state.askSeq = (state.askSeq || 0) + 1;
        state.officeAsks.push({ id: state.askSeq, fid, oid: o.id, key: want.off.key, until: t + A.answer });
        o.askAt = t;
        S.addLog(state, `${S.josa(o.name, "이", "가")} ${want.off.name} 자리를 청합니다.`, "warn");
        continue;
      }
      const yes = S.grantAsk(state, fid, o, want.off.key);
      const pushed = want.holder;
      settleAsk(state, fid, o, want.off.key, yes);
      S.addLog(state, yes
        ? `${S.forceName(state, fid)}: ${S.josa(o.name, "이", "가")} ${want.off.name} 자리를 청해 ${S.josa(r.name, "이", "가")} 받아들였습니다.` + (pushed ? ` ${S.josa(pushed.name, "은", "는")} 밀려났습니다.` : "")
        : `${S.forceName(state, fid)}: ${S.josa(o.name, "이", "가")} ${want.off.name} 자리를 청했으나 ${S.josa(r.name, "이", "가")} 물리쳤습니다.`, mineLog(state, fid));
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
