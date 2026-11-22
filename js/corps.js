// Corps (군단): a force's land in parts, each with its own main army.
//
// Every force has 1군단, the ruler's own: the capital is its seat (치소) and
// every city not given to another corps is in it. The ruler may cut a part
// of his land away as 2군단, 3군단, ... under a 도독, with a seat of its
// own. A corps is wholly left to its 도독: its cities send their soldiers,
// grain and gold to its seat (the seat sends half of the gold it can spare
// on to the capital), its spare officers gather there, and its main army
// sits there and goes to war from there by the corps' policy (방침):
//   전쟁 위임  the 도독 picks his foes and wars as a ruler would
//   국지전 위임  only border wars (국지전) of his own choosing
//   방어      no war of his own; he only meets invaders
// The ruler may still order a corps to march (출진 명령). Wars, broken main
// armies and campaigns belong to a corps (js/war.js): an invader meets the
// corps whose land he enters. A city taken joins the corps that took it.
// Peace, truces and alliances stay the ruler's.
//
// Dissolving a corps returns its cities to 1군단 and sends its main army
// marching to the capital; while those men are on the road, a new corps may
// take them instead (S.redirectMarch).
//
// Computer forces cut corps of their own once they grow large and their
// land lies far from every seat (S.CORPS.ai), with a trusted man at the head.
//
// Data: f.corps = [{n, seat, head, policy, war, brokenUntil, since}];
// c.corps = n and c.corpsFid = the owner it was set under (a city that
// changes hands falls back to 1군단). Corps 1 keeps its war on f itself.
(function (S) {
  const CORPS = S.CORPS = {
    policies: { war: "전쟁 위임", border: "국지전 위임", defend: "방어" },
    max: 6, // corps per force, 1군단 included
    goldShare: 0.5, // of the gold a seat can spare, sent to the capital each month
    // When a computer force cuts a new corps: it holds this many cities, and
    // one corps per this many; the new seat lies over this many days' march
    // from every seat; at least this many cities go to it; its 도독 is this
    // loyal; and this share of the capital's spare army goes along.
    ai: { cities: 10, per: 7, far: 12, min: 3, loyalty: 70, share: 0.35 },
  };
  const fail = (msg) => ({ ok: false, msg });
  const listOf = (f) => (f && f.corps) || [];
  const months = (state) => S.monthsElapsed(state);

  // ---------- reading ----------
  S.corpsName = (n) => `${n || 1}군단`;
  // The record that holds a corps' war: the force itself for 1군단.
  S.corpsRec = function (state, fid, n) {
    const f = state.forces[fid];
    if (!f) return null;
    return (n && n > 1 && listOf(f).find((k) => k.n === n)) || f;
  };
  S.corpsExists = (state, fid, n) => !n || n === 1 || listOf(state.forces[fid]).some((k) => k.n === n);
  // Every corps of a force, 1군단 first: {n, seat, head, policy, rec}.
  S.corpsList = function (state, fid) {
    const f = state.forces[fid];
    if (!f) return [];
    return [{ n: 1, seat: S.capitalOf(state, fid), head: f.ruler, policy: null, rec: f }]
      .concat(listOf(f).map((k) => ({ n: k.n, seat: k.seat, head: k.head, policy: k.policy, rec: k })));
  };
  S.corpsSeat = function (state, fid, n) {
    if (!n || n === 1) return S.capitalOf(state, fid);
    const k = listOf(state.forces[fid]).find((x) => x.n === n);
    return k ? k.seat : S.capitalOf(state, fid);
  };
  // The corps a city belongs to.
  S.cityCorps = function (state, c) {
    if (!c || !c.owner || !c.corps || c.corps === 1 || c.corpsFid !== c.owner) return 1;
    if (S.capitalOf(state, c.owner) === c.id) return 1;
    return S.corpsExists(state, c.owner, c.corps) ? c.corps : 1;
  };
  // A stronghold goes with the corps of the own city next to it.
  S.placeCorps = function (state, p) {
    if (!p) return 1;
    if (state.cities[p.id]) return S.cityCorps(state, p);
    const c = S.links(state, p.id).map((id) => state.cities[id]).find((x) => x && x.owner === p.owner);
    return c ? S.cityCorps(state, c) : 1;
  };
  S.isSeatCity = function (state, c) {
    if (!c || !c.owner || !state.cities[c.id]) return false;
    if (S.capitalOf(state, c.owner) === c.id) return true;
    return listOf(state.forces[c.owner]).some((k) => k.seat === c.id);
  };
  S.seatOfCity = (state, c) => S.corpsSeat(state, c.owner, S.cityCorps(state, c));
  S.corpsCities = (state, fid, n) => S.citiesOf(state, fid).filter((c) => S.cityCorps(state, c) === (n || 1));
  S.corpsOfHead = (state, o) => (o && o.force ? listOf(state.forces[o.force]).find((k) => k.head === o.id) || null : null);
  // "조조군" or "조조군 2군단".
  S.corpsLabel = (state, fid, n) => (n && n > 1 ? `${S.forceName(state, fid)} ${S.corpsName(n)}` : S.forceName(state, fid));
  // Is the corps run by its 도독 (not the player's own hand)?
  S.corpsRunsItself = (state, fid, n) => fid !== state.playerForce || (n && n > 1) || S.spectating(state);

  // ---------- wars of all corps ----------
  S.anyBroken = (state, fid) => S.corpsList(state, fid).some((k) => (k.rec.brokenUntil || 0) > months(state));
  S.warAgainst = (state, fid, foe) => {
    const k = S.corpsList(state, fid).find((x) => x.rec.war && x.rec.war.foe === foe);
    return k ? k.rec.war : null;
  };
  S.atWarWith = (state, fid, foe) => !!S.warAgainst(state, fid, foe);
  S.endWarsWith = function (state, fid, foe) {
    for (const k of S.corpsList(state, fid)) if (k.rec.war && k.rec.war.foe === foe) k.rec.war = null;
  };

  // ---------- armies on the road ----------
  // Turn a march (on its way to an own place) toward another own place, from
  // where it is now: on along the road it is on, or back the way it came,
  // whichever is shorter, then by the shortest way.
  S.redirectMarch = function (state, m, to) {
    const now = S.today(state);
    const total = Math.max(1, m.arrive - m.start);
    let done = (m.skip || 0) + Math.max(0, Math.min(1, (now - m.start) / total)) * m.km;
    let i = 1;
    for (; i < m.path.length; i++) {
      const leg = S.legKm(state, m.path[i - 1], m.path[i]);
      if (done <= leg || i === m.path.length - 1) break;
      done -= leg;
    }
    const from = m.path[i - 1], next = m.path[i] || from;
    const leg = S.legKm(state, from, next) || 0;
    done = Math.min(done, leg);
    // On to the next place, or back to the last one, whichever is shorter.
    const way = (a) => (a === to ? { path: [to], km: 0 } : S.route(state, a, to, "army"));
    const fwd = way(next), back = from !== next ? way(from) : null;
    const goBack = back && (!fwd || done + back.km < leg - done + fwd.km);
    const r = goBack ? back : fwd;
    if (!r) return false;
    m.path = (from === next ? [next] : goBack ? [next, from] : [from, next]).concat(r.path.slice(1));
    m.skip = goBack ? leg - done : done;
    m.km = Math.max(1, S.pathKm(state, m.path) - m.skip);
    m.start = now;
    m.arrive = now + S.travelDays(m.km, m.speed || "army");
    m.target = to;
    return true;
  };
  // Armies of a dissolved corps still marching to the capital.
  S.homelessArmies = (state, fid) => (state.marches || []).filter((m) => m.force === fid && m.kind === "move" && m.fromCorps && m.troops > 0);

  // ---------- making and unmaking ----------
  const freeN = (f) => { for (let n = 2; ; n++) if (!listOf(f).some((k) => k.n === n)) return n; };
  // Who may head a corps: an officer of the force, not the ruler, heading no other.
  S.canHeadCorps = (state, fid, o, n) => !!o && o.status === "serving" && o.force === fid && o.id !== state.forces[fid].ruler &&
    !listOf(state.forces[fid]).some((k) => k.head === o.id && k.n !== n);
  function checkCities(state, fid, ids, n) {
    const capId = S.capitalOf(state, fid);
    for (const id of ids) {
      const c = state.cities[id];
      if (!c || c.owner !== fid) return "아군 도시만 군단에 넣을 수 있습니다.";
      if (id === capId) return "세력 수도는 언제나 1군단의 치소입니다.";
      const k = S.cityCorps(state, c);
      if (k !== 1 && k !== n) return `${c.name}은 이미 ${S.corpsName(k)}에 속해 있습니다.`;
      if (k !== n && S.isSeatCity(state, c)) return `${c.name}은 다른 군단의 치소입니다.`;
    }
    return null;
  }
  function bringHead(state, k) {
    const o = state.officers[k.head];
    if (!o || o.city === k.seat || o.transit || o.done || S.postOf(state, o)) return;
    S.relocate(state, o.city, k.seat, [o.id]);
  }
  // spec: {cities: [ids], seat, head, policy, armies: [march ids to take]}
  S.formCorps = function (state, fid, spec) {
    const f = state.forces[fid];
    if (!f || !f.alive) return fail("세력이 없습니다.");
    if (listOf(f).length + 1 >= CORPS.max) return fail(`군단은 ${CORPS.max}개까지 둘 수 있습니다.`);
    const ids = [...new Set(spec.cities || [])];
    if (!ids.length) return fail("군단에 넣을 도시를 골라 주세요.");
    const bad = checkCities(state, fid, ids, -1);
    if (bad) return fail(bad);
    if (!ids.includes(spec.seat)) return fail("치소는 군단에 넣은 도시 가운데서 골라 주세요.");
    const head = state.officers[spec.head];
    if (!S.canHeadCorps(state, fid, head, -1)) return fail("도독으로 세울 수 없는 사람입니다(군주이거나 이미 다른 군단의 도독).");
    if (!CORPS.policies[spec.policy]) return fail("군단 방침을 골라 주세요.");
    f.corps = listOf(f).slice();
    const k = { n: freeN(f), seat: spec.seat, head: head.id, policy: spec.policy, war: null, brokenUntil: 0, since: months(state) };
    f.corps.push(k);
    for (const id of ids) { state.cities[id].corps = k.n; state.cities[id].corpsFid = fid; state.cities[id].delegate = null; }
    bringHead(state, k);
    let took = 0;
    for (const mid of spec.armies || []) {
      const m = (state.marches || []).find((x) => x.id === mid && x.force === fid && x.kind === "move");
      if (m && S.redirectMarch(state, m, k.seat)) { delete m.fromCorps; took += m.troops; }
    }
    const seat = state.cities[k.seat];
    S.addLog(state, `${S.corpsLabel(state, fid, k.n)}을 세웠습니다. 도독 ${head.name}, 치소 ${seat.name}, 도시 ${ids.length}곳, ${CORPS.policies[k.policy]}.` +
      (took ? ` 이동 중이던 병사 ${took}명이 ${S.ro(seat.name)} 향합니다.` : ""), fid === state.playerForce ? "sys" : "info");
    return { ok: true, logged: true, n: k.n, msg: `${S.corpsName(k.n)}을 세웠습니다.` };
  };
  // Change a corps: {seat, head, policy, cities: [ids] (the whole new set)}.
  S.editCorps = function (state, fid, n, spec) {
    const f = state.forces[fid];
    const k = listOf(f).find((x) => x.n === n);
    if (!k) return fail("그런 군단이 없습니다.");
    const ids = spec.cities ? [...new Set(spec.cities)] : S.corpsCities(state, fid, n).map((c) => c.id);
    if (!ids.length) return fail("도시가 하나도 없으면 군단을 해체해야 합니다.");
    const bad = checkCities(state, fid, ids, n);
    if (bad) return fail(bad);
    const seat = spec.seat || k.seat;
    if (!ids.includes(seat)) return fail("치소는 군단의 도시 가운데서 골라 주세요.");
    const head = spec.head ? state.officers[spec.head] : state.officers[k.head];
    if (!S.canHeadCorps(state, fid, head, n)) return fail("도독으로 세울 수 없는 사람입니다(군주이거나 이미 다른 군단의 도독).");
    if (spec.policy && !CORPS.policies[spec.policy]) return fail("알 수 없는 방침입니다.");
    const changes = [];
    for (const c of S.corpsCities(state, fid, n)) if (!ids.includes(c.id)) { c.corps = 1; delete c.corpsFid; }
    const added = ids.filter((id) => S.cityCorps(state, state.cities[id]) !== n);
    for (const id of ids) { state.cities[id].corps = n; state.cities[id].corpsFid = fid; state.cities[id].delegate = null; }
    if (added.length) changes.push(`도시 ${added.length}곳 편입`);
    if (seat !== k.seat) {
      // The old seat's main army moves to the new one.
      const old = state.cities[k.seat];
      k.seat = seat;
      if (old && old.owner === fid) sendArmy(state, old, seat, null);
      changes.push(`치소 ${state.cities[seat].name}`);
    }
    if (head.id !== k.head) { k.head = head.id; changes.push(`도독 ${head.name}`); }
    if (spec.policy && spec.policy !== k.policy) {
      k.policy = spec.policy;
      if (k.policy === "defend" || (k.policy === "border" && k.war && k.war.aim !== "border")) k.war = null;
      changes.push(CORPS.policies[k.policy]);
    }
    bringHead(state, k);
    if (changes.length && fid === state.playerForce) S.addLog(state, `${S.corpsName(n)}: ${changes.join(", ")}.`, "sys");
    return { ok: true, logged: true, msg: changes.length ? `${S.corpsName(n)}: ${changes.join(", ")}` : "바뀐 것이 없습니다." };
  };
  // The soldiers of c beyond its garrison march to another seat. Tagged with
  // the corps they left, if it is gone (they may be claimed on the way).
  function sendArmy(state, c, to, fromCorps) {
    const n = Math.floor(Math.max(0, S.marchable(c) - S.garrisonCapOf(state, c)));
    if (n < 100 || !to || to === c.id) return 0;
    const route = S.route(state, c.id, to, "army");
    if (!route) return 0;
    const counts = S.mixCounts(S.garrisonUnit(c), n);
    const unit = S.takeTroops(c, counts);
    if (!unit) return 0;
    const m = S.launch(state, { kind: "move", force: c.owner, path: route.path, km: route.km, speed: S.unitSpeed(counts),
      officers: [], troops: S.countsTotal(counts), unit, train: c.train, origin: c.id, target: to, corps: 1 });
    if (fromCorps) m.fromCorps = fromCorps;
    return m.troops;
  }
  // The cap the seat will have once it is a seat no longer.
  S.garrisonCapOf = (state, c) => Math.round(S.WAR.cap.base + c.pop * S.WAR.cap.pop);

  S.dissolveCorps = function (state, fid, n, quiet) {
    const f = state.forces[fid];
    const k = listOf(f).find((x) => x.n === n);
    if (!k) return fail("그런 군단이 없습니다.");
    const seat = state.cities[k.seat];
    f.corps = listOf(f).filter((x) => x !== k);
    for (const c of S.citiesOf(state, fid)) if (c.corps === n && c.corpsFid === fid) { c.corps = 1; delete c.corpsFid; }
    const capId = S.capitalOf(state, fid);
    let sent = 0;
    if (seat && seat.owner === fid) sent = sendArmy(state, seat, capId, n);
    // Soldiers still on their way to the old seat turn for the capital too.
    for (const m of state.marches || []) {
      if (m.force !== fid || m.kind !== "move" || m.target !== k.seat || !m.troops || m.officers.length) continue;
      if (S.redirectMarch(state, m, capId)) { m.fromCorps = n; sent += m.troops; }
    }
    if (!quiet) S.addLog(state, `${S.corpsLabel(state, fid, n)}을 해체했습니다. 도시는 1군단으로 돌아갑니다.` +
      (sent ? ` 주력군 ${sent}명이 수도로 행군합니다.` : ""), fid === state.playerForce ? "sys" : "info");
    return { ok: true, logged: !quiet, msg: `${S.corpsName(n)}을 해체했습니다.` + (sent ? ` 주력군 ${sent}명이 수도로 향합니다.` : "") };
  };

  // ---------- the ruler orders a corps to march (출진 명령) ----------
  // The corps' expeditions now, best first: [{t, ratio, team, troops, unit}].
  S.corpsExpeditions = function (state, fid, n) {
    const seatId = S.corpsSeat(state, fid, n);
    const seat = seatId && state.cities[seatId];
    if (!seat || S.besieged(state, seatId) || S.isBroken(state, fid, n) || S.onCampaign(state, fid, n)) return [];
    const idle = S.idle(state, seatId).sort((a, b) => S.leadScore(state, b) - S.leadScore(state, a));
    if (!idle.length) return [];
    const team = idle.slice(0, Math.min(S.MAX_SORTIE_OFFICERS, Math.max(1, idle.length - 1)));
    const troops = Math.floor(S.marchable(seat) - Math.max(S.WAR.expedition.guardMin, seat.troops * S.WAR.aim.guard.border));
    if (troops < S.WAR.expedition.min) return [];
    const out = [];
    for (const way of S.attackTargets(state, seatId)) {
      const t = S.place(state, way.id);
      if (!t || !t.owner || t.owner === fid || S.allied(state, fid, t.owner) || S.truceLeft(state, fid, t.owner) || S.inTruce(state)) continue;
      if (S.landingLink(way.path)) continue;
      const unit = S.pickAttackUnit(state, seat, t, troops);
      const est = S.estimate(state, seatId, t.id, team.map((o) => o.id), troops, unit);
      if (est) out.push({ t, ratio: Math.round(est.ratio * 100) / 100, team, troops, unit });
    }
    return out.sort((a, b) => b.ratio - a.ratio);
  };
  S.orderCorps = function (state, fid, n, targetId) {
    const e = S.corpsExpeditions(state, fid, n).find((x) => x.t.id === targetId);
    if (!e) return fail("지금 그 군단은 그곳으로 출진할 수 없습니다(치소의 병력·무장 부족, 이미 출진 중, 꺾임, 길 없음).");
    const seatId = S.corpsSeat(state, fid, n);
    const r = S.attack(state, seatId, e.t.id, e.team.map((o) => o.id), e.troops, e.unit);
    if (!r.ok) return r;
    r.march.corps = n;
    const rec = S.corpsRec(state, fid, n);
    const aim = rec.war && rec.war.foe === e.t.owner ? rec.war.aim : "border";
    r.march.campaign = { foe: e.t.owner, taken: 0, since: months(state), aim, ordered: true };
    if (!rec.war || rec.war.foe !== e.t.owner) rec.war = { foe: e.t.owner, aim, since: months(state), ordered: true };
    S.addLog(state, `${S.corpsLabel(state, fid, n)} 주력군 ${r.march.troops}명이 명을 받아 ${S.ro(e.t.name)} 출진합니다.`,
      fid === state.playerForce ? "sys" : e.t.owner === state.playerForce ? "threat" : "info");
    return { ok: true, logged: true, msg: `${S.corpsName(n)} 주력군 ${r.march.troops}명이 ${S.ro(e.t.name)} 출진합니다.` };
  };

  // ---------- a corps run by its 도독 ----------
  // What a corps does on its day: the cities are run as a computer force
  // would, relief goes out, and the main army goes to war by the policy.
  S.runCorpsAI = function (state, fid, n) {
    const k = listOf(state.forces[fid]).find((x) => x.n === n);
    if (!k) return;
    bringHead(state, k);
    if (k.policy !== "defend") S.warAI(state, fid, n);
    S.reliefAI(state, fid, n);
    const mine = fid === state.playerForce && S.playerCity ? S.playerCity(state) : null;
    for (const c of S.corpsCities(state, fid, n)) if (c.id !== mine && S.aiDomestic) S.aiDomestic(state, c, fid);
  };

  // ---------- each month ----------
  // A corps keeps a seat, a head and land: a lost seat moves to its largest
  // city, a lost head is replaced, a corps with no land is gone. Seats send
  // gold on to the capital. Computer forces cut new corps once a year.
  S.runCorps = function (state) {
    for (const f of Object.values(state.forces)) {
      if (!f.alive || !listOf(f).length) continue;
      for (const k of listOf(f).slice()) {
        const cities = S.corpsCities(state, f.id, k.n);
        if (!cities.length || (f.id !== state.playerForce && cities.length < 2)) { S.dissolveCorps(state, f.id, k.n, f.id !== state.playerForce); continue; }
        if (!cities.some((c) => c.id === k.seat)) {
          const best = cities.slice().sort((a, b) => b.size - a.size || S.marchable(b) - S.marchable(a))[0];
          k.seat = best.id;
          if (f.id === state.playerForce) S.addLog(state, `${S.corpsName(k.n)}의 치소를 잃어 ${S.ro(best.name)} 옮겼습니다.`, "warn");
        }
        const o = state.officers[k.head];
        if (!S.canHeadCorps(state, f.id, o, k.n)) {
          const next = pickHead(state, f.id, cities);
          if (!next) { S.dissolveCorps(state, f.id, k.n, f.id !== state.playerForce); continue; }
          k.head = next.id;
          if (f.id === state.playerForce) S.addLog(state, `${S.corpsName(k.n)}의 도독이 없어 ${S.josa(next.name, "을", "를")} 새 도독으로 세웠습니다.`, "warn");
        }
        // Half the gold the seat can spare goes to the capital.
        const seat = state.cities[k.seat], capId = S.capitalOf(state, f.id);
        if (seat && capId && capId !== seat.id && !S.besieged(state, seat.id) && S.route(state, seat.id, capId, "cargo")) {
          const gold = Math.max(0, Math.floor((seat.gold - S.keepGold(seat) * 2) * CORPS.goldShare));
          seat.gold -= gold;
          state.cities[capId].gold += gold;
          seat.sentCap = gold;
        }
      }
    }
    if (state.month === 1) for (const f of Object.values(state.forces)) {
      if (f.alive && (f.id !== state.playerForce || state.auto)) splitAI(state, f.id);
    }
  };
  // The man a computer force trusts with a corps: able, loyal, kin first.
  function pickHead(state, fid, cities) {
    const f = state.forces[fid];
    const ruler = state.officers[f.ruler];
    const clan = (o) => (S.CLAN && S.CLAN[o.name] ? S.CLAN[o.name].clan : null);
    const here = new Set((cities || []).map((c) => c.id));
    const pool = Object.values(state.officers).filter((o) => S.canHeadCorps(state, fid, o, -1) && (o.loyalty || 0) >= CORPS.ai.loyalty);
    const score = (o) => o.cmd + o.pol / 3 + (o.loyalty || 0) / 4 + (ruler && clan(o) && clan(o) === clan(ruler) ? 15 : 0) + (here.has(o.city) ? 10 : 0);
    return pool.sort((a, b) => score(b) - score(a))[0] || null;
  }
  S.pickCorpsHead = pickHead;
  // A large computer force cuts off the land that lies far from every seat.
  function splitAI(state, fid) {
    const A = CORPS.ai;
    const f = state.forces[fid];
    const all = S.citiesOf(state, fid);
    const have = listOf(f).length + 1;
    if (all.length < A.cities || have >= Math.min(CORPS.max, 1 + Math.floor(all.length / A.per))) return;
    const seats = S.corpsList(state, fid).map((k) => k.seat).filter(Boolean);
    const days = (a, b) => { if (a === b) return 0; const r = S.route(state, a, b, "army"); return r ? r.days : 999; };
    const near = (c) => Math.min(...seats.map((s) => days(c.id, s)));
    const free = all.filter((c) => S.cityCorps(state, c) === 1 && !S.isSeatCity(state, c));
    const far = free.filter((c) => { const d = near(c); return d > A.far && d < 999; });
    if (far.length < A.min) return;
    const seat = far.slice().sort((a, b) => b.size - a.size || S.marchable(b) - S.marchable(a))[0];
    const mine = free.filter((c) => days(c.id, seat.id) < near(c));
    if (mine.length < A.min) return;
    const head = pickHead(state, fid, mine);
    if (!head) return;
    const r = S.formCorps(state, fid, { cities: mine.map((c) => c.id), seat: seat.id, head: head.id, policy: "war" });
    if (!r.ok) return;
    // A share of the capital's army goes with it.
    const cap = state.cities[S.capitalOf(state, fid)];
    if (!cap) return;
    const n = Math.floor(Math.max(0, S.marchable(cap) - Math.max(S.WAR.expedition.guardMin, cap.troops * 0.5)) * A.share);
    const route = n >= 2000 && S.route(state, cap.id, seat.id, "army");
    if (!route) return;
    const counts = S.mixCounts(S.garrisonUnit(cap), n);
    const unit = S.takeTroops(cap, counts);
    if (unit) S.launch(state, { kind: "move", force: fid, path: route.path, km: route.km, speed: S.unitSpeed(counts),
      officers: [], troops: S.countsTotal(counts), unit, train: cap.train, origin: cap.id, target: seat.id, corps: r.n });
  }
})(globalThis.SAM = globalThis.SAM || {});
