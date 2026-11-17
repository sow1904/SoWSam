// The great families (호족) push back.
//
// 둔전 takes land and tenants from the local great families. What has been
// taken from them since they last rose (c.cut, in points of gentry strength)
// builds up, and so does the chance that they rise against the lord (호족
// 반발). When they rise the lord either puts them down with the city's
// soldiers or buys them off with gold; both cost more the more had been
// taken. Once the families have been pushed down to the floor (45) without
// rising, they have accepted it and the count starts again.
//
// A 호족연합형 force that takes cities from others gains a name and spoils of
// its own, and leans less on the families: they weaken a little everywhere and
// work with it more willingly. (손권 sought victories partly to rule the 강동
// clans rather than be carried by them.)
// why: the families' resistance is what made 둔전 costly in practice; 조조
// pushed it through, the 강동 lords could not.
(function (S) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const U = S.UNREST = {
    floor: 45, // pushed down this far without rising, the families accept it
    chance: 1.2, // % a month per point taken
    gold: 60, // gold per point taken, x (city size + 1)
    troops: 0.06, maxLoss: 0.6, // share of the garrison lost per point when put down
    giveBack: 0.5, // share of the taken strength given back when bought off
    consent: 10, consentPer: 1.5, // 협력 gained when bought off
    order: 10, // 치안 lost when put down
    waitOrder: 5, // 치안 lost each month the rising is left unanswered
    conquest: { gentry: 1, consent: 3 }, // per city a 호족연합형 force takes
  };

  S.unrestCost = function (c, cut) {
    cut = cut != null ? cut : c.cut || 0;
    return {
      gold: Math.round(cut * U.gold * (c.size + 1)),
      troops: Math.round(c.troops * Math.min(U.maxLoss, cut * U.troops)),
    };
  };
  S.unrestChance = (c) => Math.min(60, (c.cut || 0) * U.chance);

  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  // Does the player answer this city's risings, or its governor?
  const playerAnswers = (state, c) => c.owner === state.playerForce && !S.delegateOf(state, c) && !S.spectating(state);

  // Called each month from the 둔전 post with the strength it just took.
  S.gentryCut = function (state, c, d) {
    if (d <= 0) return;
    // Pushed down to the floor without rising: they accept it, and the count
    // starts again (a lord who goes on below it builds a new grievance).
    if (c.gentry <= U.floor && c.gentry + d > U.floor) { c.cut = 0; return; }
    c.cut = (c.cut || 0) + d;
    if (!c.unrest && S.chance(state, S.unrestChance(c))) rise(state, c);
  };

  function rise(state, c) {
    const cost = S.unrestCost(c);
    c.unrest = { cut: c.cut, gold: cost.gold, troops: cost.troops, day: S.today(state) };
    c.cut = 0;
    const mine = c.owner === state.playerForce;
    S.addLog(state, `${c.name}의 호족들이 둔전에 반발해 들고일어났습니다.`, mine ? "warn" : "info");
    if (!playerAnswers(state, c)) S.answerUnrest(state, c.id, S.unrestAI(state, c));
  }

  // While a rising goes unanswered, 둔전 stops and order falls each month.
  S.unrestMonth = function (state, c) {
    if (!c.unrest) return;
    if (!c.owner) { c.unrest = null; return; }
    if (!playerAnswers(state, c)) return S.answerUnrest(state, c.id, S.unrestAI(state, c));
    c.order = Math.max(0, c.order - U.waitOrder);
  };

  // way: "woo" (회유, gold) or "crush" (진압, soldiers).
  S.answerUnrest = function (state, cid, way) {
    const c = state.cities[cid];
    const u = c && c.unrest;
    if (!u) return { ok: false, msg: "그 도시에는 반발이 없습니다." };
    if (way === "woo") {
      if (c.gold < u.gold) return { ok: false, msg: `금이 모자랍니다(${u.gold} 필요).` };
      c.gold -= u.gold;
      c.gentry = Math.min(c.gentryBase, c.gentry + u.cut * U.giveBack);
      c.consent = clamp(c.consent + U.consent + u.cut * U.consentPer, 0, 100);
      c.unrest = null;
      const msg = `${c.name}의 호족들을 ${S.ro("금 " + u.gold)} 달랬습니다. 호족 세력과 협력이 올랐습니다.`;
      S.addLog(state, msg, "info");
      return { ok: true, msg };
    }
    if (way === "crush") {
      const lost = S.loseTroops(c, Math.min(c.troops, u.troops));
      c.order = Math.max(0, c.order - U.order);
      c.unrest = null;
      const msg = `${c.name}의 호족 반발을 진압했습니다. 병사 ${lost}명을 잃었습니다.`;
      S.addLog(state, msg, c.owner === state.playerForce ? "warn" : "info");
      return { ok: true, msg };
    }
    return { ok: false, msg: "알 수 없는 처리입니다." };
  };

  // A computer lord buys the families off when it can afford it and the gold
  // costs less than the soldiers; an ambitious one would rather crush them.
  S.unrestAI = function (state, c) {
    const u = c.unrest;
    const ruler = rulerOf(state, c.owner);
    const proud = ruler && S.hasTrait(ruler, "야심");
    if (c.gold < u.gold) return "crush";
    const soldiers = u.troops * (proud ? 0.4 : 1); // gold a soldier is worth
    return u.gold <= soldiers ? "woo" : "crush";
  };

  // How willing a computer lord is to keep 둔전 going here, 0-1: less the
  // dearer the next rising would be against what the city holds. An
  // ambitious lord holds to the centre and minds the cost half as much.
  S.tuntianWill = function (state, c) {
    if (c.unrest) return 0;
    const ruler = rulerOf(state, c.owner);
    const proud = ruler && S.hasTrait(ruler, "야심");
    const ahead = S.unrestCost(c, (c.cut || 0) + 3); // a year further on
    const pressure = ahead.gold / Math.max(300, c.gold) + ahead.troops / Math.max(1000, c.troops);
    return clamp(1 - pressure * (proud ? 0.25 : 0.5), 0.05, 1);
  };
  S.wantTuntian = (state, c) => S.rand(state) < S.tuntianWill(state, c);
  // The gentry level below which a computer lord no longer bothers with 둔전.
  // An ambitious lord keeps the families from creeping back where they had
  // been broken (just above the city's base), not only down to the floor.
  S.tuntianFloor = function (state, c) {
    const ruler = rulerOf(state, c.owner);
    return ruler && S.hasTrait(ruler, "야심") ? Math.min(U.floor, c.gentryBase + 3) : U.floor;
  };

  // A 호족연합형 force has taken a city from another force.
  S.conquestGentry = function (state, fid) {
    if (!fid || S.regime(state, fid).label !== "호족연합형") return;
    const k = U.conquest;
    for (const c of S.citiesOf(state, fid)) {
      c.gentry = Math.max(5, c.gentry - k.gentry);
      c.gentryBase = Math.max(5, c.gentryBase - k.gentry);
      c.consent = clamp(c.consent + k.consent, 0, 100);
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
