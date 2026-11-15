// Diplomacy: how forces stand with one another (우호도), and the envoys
// (사자) who carry tribute, offers of alliance and exchanges of captives.
//
// Standing runs from 0 to 100 and starts at 50. War wears it down, gifts
// and kept faith build it up, and left alone it drifts back toward 50.
// Friends are attacked less readily and agree to more.
//
// An envoy is an officer who rides from his force's capital to the other's.
// What he was sent to do happens on the day he arrives, and the better he
// speaks, the more a gift is worth, the better the terms of an exchange and
// the likelier an alliance. Then he rides home. While away he can be given
// no other command.
(function (S) {
  const fail = (msg) => ({ ok: false, msg });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const key = (a, b) => (a < b ? a + "|" + b : b + "|" + a);

  S.DIPLO = {
    start: 50, // standing between strangers
    allied: 70, // between those allied when the game begins
    tributeMin: 100,
    tributePer: 40, // gold for one point of standing, before the envoy's tongue
    tributeMax: 25, // most one gift can do
    snub: 3, // months before a refused alliance can be offered again
    askDays: 10, // how long an envoy waits for the player's answer
    attack: -8, capture: -4, behead: -15, beheadLord: -30, release: 5, releaseLord: 10,
    breakPact: -30, pact: 10, swap: 5,
    aiChance: 20, // % a month that a computer force thinks of sending someone
    aiWait: 4, // months between its envoys to the same force
  };
  const D = S.DIPLO;

  // ---------- standing ----------
  S.rel = function (state, a, b) {
    if (!a || !b || a === b) return 100;
    const v = state.rel && state.rel[key(a, b)];
    return v == null ? D.start : v;
  };
  S.relAdd = function (state, a, b, d) {
    if (!a || !b || a === b || !state.forces[a] || !state.forces[b]) return;
    state.rel = state.rel || {};
    state.rel[key(a, b)] = clamp(Math.round(S.rel(state, a, b) + d), 0, 100);
  };
  S.relLabel = (v) => (v >= 80 ? "친밀" : v >= 60 ? "우호" : v >= 40 ? "보통" : v >= 20 ? "냉담" : "원수");
  S.initRelations = function (state, scenario) {
    state.rel = {};
    for (const k of Object.keys(state.pacts || {})) if (state.pacts[k].active) state.rel[k] = D.allied;
    for (const [a, b, v] of (scenario && scenario.relations) || []) if (state.forces[a] && state.forces[b]) state.rel[key(a, b)] = v;
  };
  // Each month: allies grow closer, and the rest forget, a little at a time.
  S.runRelations = function (state) {
    state.rel = state.rel || {};
    const ids = Object.keys(state.forces).filter((f) => state.forces[f].alive);
    const even = S.monthsElapsed(state) % 2 === 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j], v = S.rel(state, a, b);
      if (S.allied(state, a, b)) { if (v < 85) S.relAdd(state, a, b, 1); }
      else if (even && v !== D.start) S.relAdd(state, a, b, v < D.start ? 1 : -1);
    }
  };

  // ---------- the road ----------
  // Days for a rider between two capitals, by any road, whoever holds it.
  S.envoyDays = function (state, from, to) {
    const a = S.capitalOf(state, from), b = S.capitalOf(state, to);
    if (!a || !b) return null;
    const dist = { [a]: 0 }, done = new Set();
    for (;;) {
      let cur = null;
      for (const id in dist) if (!done.has(id) && (cur === null || dist[id] < dist[cur])) cur = id;
      if (cur === null) return S.travelDays(S.nodeKm(state, a, b), "officer");
      if (cur === b) return S.travelDays(dist[b], "officer");
      done.add(cur);
      for (const n of S.links(state, cur)) {
        if (done.has(n)) continue;
        const d = dist[cur] + S.linkKm(state, cur, n);
        if (!(n in dist) || d < dist[n]) dist[n] = d;
      }
    }
  };
  // Who can be sent: officers at rest in the capital, the ruler excepted.
  S.envoyCandidates = function (state, fid) {
    const cap = S.capitalOf(state, fid);
    if (!cap) return [];
    return S.idle(state, cap).filter((o) => o.force === fid && !S.isRuler(state, o)).sort((a, b) => b.speech - a.speech);
  };
  S.envoysOf = (state, fid) => (state.envoys || []).filter((e) => e.from === fid);
  // Envoys waiting at this force's capital for an answer.
  S.asksFor = (state, fid) => (state.envoys || []).filter((e) => e.to === fid && e.phase === "wait");
  S.envoyKind = { tribute: "조공", pact: "동맹 제의", swap: "포로 교환" };

  // ---------- what an envoy can win ----------
  S.tributeGain = function (state, to, gold, speech) {
    const size = clamp(4 / (3 + S.citiesOf(state, to).length), 0.3, 1); // a great lord is harder to impress
    return clamp(Math.round((gold / D.tributePer) * (0.5 + speech / 100) * size), 1, D.tributeMax);
  };
  // What a captive is worth in an exchange, in gold: by his two best abilities.
  S.captiveWorth = function (o) {
    const v = S.ABILITY_KEYS.map((k) => o[k]).sort((a, b) => b - a);
    return Math.round(100 + Math.pow(v[0] + v[1], 2) / 50);
  };
  // Captives the two forces hold of each other's: give (held by a, b's men)
  // and take (held by b, a's men).
  S.swappable = function (state, a, b) {
    const give = [], take = [];
    for (const o of Object.values(state.officers)) {
      if (o.status !== "captive" || o.lord) continue;
      if (o.captor === a && o.force === b) give.push(o);
      else if (o.captor === b && o.force === a) take.push(o);
    }
    const byWorth = (x, y) => S.captiveWorth(y) - S.captiveWorth(x);
    return { give: give.sort(byWorth), take: take.sort(byWorth) };
  };
  const worthOf = (state, ids) => ids.reduce((s, id) => s + S.captiveWorth(state.officers[id]), 0);
  // How likely the other side is to agree to an exchange. The envoy's tongue
  // makes what is offered look like more than it is.
  S.swapChance = function (state, from, to, give, take, gold, speech) {
    const ask = worthOf(state, take);
    const offer = worthOf(state, give) + (gold || 0);
    if (!ask) return give.length || gold ? 95 : 0;
    const ratio = (offer * (0.8 + speech / 250)) / ask;
    if (ratio < 0.4) return 0;
    return clamp(Math.round(35 + (ratio - 1) * 110 + (S.rel(state, from, to) - 50) * 0.5 + speech * 0.2), 0, 95);
  };
  const alive = (state, f) => state.forces[f] && state.forces[f].alive;
  const others = (state, a, b) => Object.keys(state.forces).filter((f) => f !== a && f !== b && alive(state, f));
  // A third force that borders both and is friend to neither.
  S.commonFoe = function (state, a, b) {
    const least = Math.min(S.forcePower(state, a), S.forcePower(state, b));
    return others(state, a, b).find((z) => !S.allied(state, a, z) && !S.allied(state, b, z) &&
      S.touches(state, a, z) && S.touches(state, b, z) && S.forcePower(state, z) > least * 0.8) || null;
  };
  // How likely a force is to accept an alliance: by standing, by who borders
  // whom and how strong each is, by who else each is tied to, and by the envoy.
  S.pactChance = function (state, from, to, speech) {
    if (!alive(state, to) || !alive(state, from) || S.allied(state, from, to) || S.pactCooldown(state, from, to)) return 0;
    const rel = S.rel(state, from, to);
    if (rel < 20) return 0; // too much blood between them
    if (speech == null) {
      const who = S.envoyCandidates(state, from);
      speech = who.length ? who[0].speech : 40;
    }
    const mine = S.forcePower(state, from);
    const theirs = S.forcePower(state, to) || 1;
    const near = S.touches(state, from, to);
    let p = 10 + speech / 3 + (rel - 50) * 0.6;
    if (mine >= theirs) p += 10; // a strong friend is worth having
    if (state.forces[to].weariness > 30) p += 10;
    if (near && theirs > mine * 1.5) p -= 25; // they would rather conquer
    // A stronger neighbour of theirs that is no friend: they need help.
    const rest = others(state, from, to);
    const threat = rest.some((f) => !S.allied(state, to, f) && S.touches(state, to, f) && S.forcePower(state, f) > theirs);
    if (threat) p += 15;
    const foe = S.commonFoe(state, from, to);
    if (foe) p += 10;
    else if (!near) p -= 10; // far away and nothing shared
    // Who else each is tied to.
    if (rest.some((f) => S.allied(state, from, f) && S.allied(state, to, f))) p += 10;
    if (rest.some((f) => S.allied(state, from, f) && S.rel(state, to, f) < 30)) p -= 15;
    const toRuler = state.officers[state.forces[to].ruler];
    if (S.hasTrait(toRuler, "야심")) p -= 10;
    if (S.hasTrait(toRuler, "무욕")) p += 10;
    return clamp(Math.round(p), 3, 90);
  };
  S.pactSnub = function (state, from, to) {
    const at = state.snubs && state.snubs[from + ">" + to];
    return at == null ? 0 : Math.max(0, at + D.snub - S.monthsElapsed(state));
  };

  // ---------- sending ----------
  // kind: "tribute" { gold }, "pact" {}, "swap" { give: [ids], take: [ids], gold }.
  S.sendEnvoy = function (state, from, to, oid, kind, opts) {
    opts = opts || {};
    if (!alive(state, from) || !alive(state, to) || from === to) return fail("사자를 보낼 수 없는 세력입니다.");
    const capId = S.capitalOf(state, from);
    const cap = state.cities[capId];
    const o = state.officers[oid];
    if (!o || o.status !== "serving" || o.force !== from || o.transit || o.city !== capId) return fail("사자는 세력 수도에 있는 무장이어야 합니다.");
    if (S.isRuler(state, o)) return fail("군주는 사자로 갈 수 없습니다.");
    if (o.done) return fail(`${S.josa(o.name, "은", "는")} 이번 달 이미 행동했습니다.`);
    if (S.postOf(state, o)) return fail(`${S.josa(o.name, "은", "는")} 담당 업무 중입니다.`);
    if (S.besieged(state, capId)) return fail("포위당한 수도에서는 사자를 보낼 수 없습니다.");
    if (S.envoysOf(state, from).some((e) => e.to === to)) return fail("그 세력에는 이미 사자가 가 있습니다.");
    const name = S.forceName(state, to);
    let gold = 0, give = [], take = [];
    if (kind === "tribute") {
      gold = Math.floor(opts.gold || 0);
      if (gold < D.tributeMin) return fail(`조공은 금 ${D.tributeMin} 이상이어야 합니다.`);
    } else if (kind === "pact") {
      if (S.allied(state, from, to)) return fail("이미 동맹 중입니다.");
      const cd = S.pactCooldown(state, from, to);
      if (cd) return fail(`동맹이 깨진 지 얼마 되지 않았습니다. ${cd}개월 뒤에 다시 제의할 수 있습니다.`);
      const snub = S.pactSnub(state, from, to);
      if (snub) return fail(`얼마 전에 거절당했습니다. ${snub}개월 뒤에 다시 제의할 수 있습니다.`);
      gold = S.PACT_COST;
    } else if (kind === "swap") {
      const can = S.swappable(state, from, to);
      give = (opts.give || []).filter((id) => can.give.some((x) => x.id === id));
      take = (opts.take || []).filter((id) => can.take.some((x) => x.id === id));
      gold = Math.max(0, Math.floor(opts.gold || 0));
      if (!give.length && !take.length) return fail("주고받을 포로를 골라 주세요.");
    } else return fail("알 수 없는 용건입니다.");
    if (cap.gold < gold) return fail(`${cap.name}의 금이 부족합니다. (필요 ${gold})`);
    cap.gold -= gold;
    const days = S.envoyDays(state, from, to);
    state.envoys = state.envoys || [];
    state.envoySeq = (state.envoySeq || 0) + 1;
    const now = S.today(state);
    const e = { id: state.envoySeq, from, to, officer: oid, kind, gold, give, take, start: now, days, arrive: now + days, phase: "out" };
    state.envoys.push(e);
    o.transit = "e" + e.id;
    o.done = true;
    state.envoyAt = state.envoyAt || {};
    state.envoyAt[from + ">" + to] = S.monthsElapsed(state);
    return { ok: true, envoy: e, msg: `${S.josa(o.name, "이", "가")} ${S.envoyKind[kind]}의 사자로 ${name}의 수도 ${S.ro(S.placeName(state, S.capitalOf(state, to)))} 떠났습니다. ${days}일 뒤 도착합니다.` };
  };

  // ---------- arriving ----------
  const involves = (state, e) => !!state.playerForce && (e.from === state.playerForce || e.to === state.playerForce);
  function say(state, e, text, kind) {
    S.addLog(state, text, involves(state, e) ? kind || "sys" : "info");
  }
  function pay(state, fid, gold) {
    const cap = gold > 0 && state.cities[S.capitalOf(state, fid)];
    if (cap) cap.gold += gold;
  }
  function turnBack(state, e, refund) {
    if (refund) pay(state, e.from, e.gold);
    e.phase = "back";
    e.back = S.today(state) + e.days;
  }
  // Drop from an exchange whoever is no longer held as he was.
  function prune(state, e) {
    const held = (id, captor, force) => {
      const o = state.officers[id];
      return o && o.status === "captive" && !o.lord && o.captor === captor && o.force === force;
    };
    e.give = e.give.filter((id) => held(id, e.from, e.to));
    e.take = e.take.filter((id) => held(id, e.to, e.from));
  }
  const names = (state, ids) => ids.map((id) => state.officers[id].name).join(", ");
  function settle(state, e, yes) {
    const o = state.officers[e.officer];
    const F = S.forceName(state, e.from), T = S.forceName(state, e.to);
    if (e.kind === "pact") {
      pay(state, e.to, e.gold); // the gift is kept either way
      if (yes && !S.allied(state, e.from, e.to) && !S.pactCooldown(state, e.from, e.to)) {
        S.makePact(state, e.from, e.to);
        S.relAdd(state, e.from, e.to, D.pact);
        say(state, e, `${S.josa(F, "과", "와")} ${S.josa(T, "이", "가")} 동맹을 맺었습니다. (사자 ${o.name})`);
      } else {
        state.snubs = state.snubs || {};
        state.snubs[e.from + ">" + e.to] = S.monthsElapsed(state);
        if (involves(state, e)) say(state, e, `${S.josa(T, "이", "가")} ${F}의 동맹 제의를 거절했습니다. (사자 ${o.name})`, e.from === state.playerForce ? "warn" : "sys");
      }
      return turnBack(state, e, false);
    }
    // swap
    prune(state, e);
    if (yes && (e.give.length || e.take.length)) {
      const back = e.take.slice(), gone = e.give.slice();
      for (const id of back.concat(gone)) S.freeCaptive(state, state.officers[id]);
      pay(state, e.to, e.gold);
      S.relAdd(state, e.from, e.to, D.swap);
      const parts = [gone.length && `${F}이 ${names(state, gone)}`, back.length && `${T}이 ${names(state, back)}`].filter(Boolean).join(", ");
      say(state, e, `${S.josa(F, "과", "와")} ${S.josa(T, "이", "가")} 포로를 교환했습니다. ${S.josa(parts, "을", "를")} 돌려보냈습니다.${e.gold ? ` (몸값 금 ${e.gold})` : ""}`);
      return turnBack(state, e, false);
    }
    if (involves(state, e)) say(state, e, `${S.josa(T, "이", "가")} ${F}의 포로 교환을 거절했습니다. (사자 ${o.name})`, e.from === state.playerForce ? "warn" : "sys");
    turnBack(state, e, true);
  }
  function resolve(state, e, onEvent) {
    const o = state.officers[e.officer];
    if (!alive(state, e.to)) return turnBack(state, e, true);
    if (e.kind === "tribute") {
      const gain = S.tributeGain(state, e.to, e.gold, o.speech);
      pay(state, e.to, e.gold);
      S.relAdd(state, e.from, e.to, gain);
      if (involves(state, e)) say(state, e, `${S.forceName(state, e.from)}의 사자 ${S.josa(o.name, "이", "가")} ${S.forceName(state, e.to)}에 금 ${e.gold}을 바쳤습니다. (우호도 +${gain})`);
      return turnBack(state, e, false);
    }
    if (e.kind === "pact" && (S.allied(state, e.from, e.to) || S.pactCooldown(state, e.from, e.to))) return turnBack(state, e, true);
    if (e.kind === "swap") {
      prune(state, e);
      if (!e.give.length && !e.take.length) return turnBack(state, e, true);
    }
    // The player answers for himself; the envoy waits a while.
    if (e.to === state.playerForce && !S.spectating(state)) {
      e.phase = "wait";
      e.expires = S.today(state) + D.askDays;
      S.addLog(state, `${S.forceName(state, e.from)}의 사자 ${S.josa(o.name, "이", "가")} ${S.envoyKind[e.kind]}${e.kind === "pact" ? "를" : "을"} 들고 왔습니다. 외교 창에서 답할 수 있습니다.`, "sys");
      if (onEvent) onEvent({ envoy: e });
      return;
    }
    const pct = e.kind === "pact" ? S.pactChance(state, e.from, e.to, o.speech)
      : S.swapChance(state, e.from, e.to, e.give, e.take, e.gold, o.speech);
    settle(state, e, S.chance(state, pct));
  }
  // The player's answer to a waiting envoy.
  S.answerEnvoy = function (state, id, yes) {
    const e = (state.envoys || []).find((x) => x.id === id && x.phase === "wait");
    if (!e) return fail("기다리는 사자가 없습니다.");
    const F = S.forceName(state, e.from);
    settle(state, e, !!yes);
    return { ok: true, msg: `${F}의 ${S.envoyKind[e.kind]}${e.kind === "pact" ? "를" : "을"} ${yes ? "받아들였습니다" : "거절했습니다"}.` };
  };

  // Every day: envoys arrive, wait, and come home.
  S.runEnvoys = function (state, onEvent) {
    if (!state.envoys || !state.envoys.length) return;
    const now = S.today(state);
    const keep = [];
    for (const e of state.envoys) {
      const o = state.officers[e.officer];
      const tag = "e" + e.id;
      const fit = alive(state, e.from) && o && o.status === "serving" && o.force === e.from && o.transit === tag;
      if (!fit) {
        // The envoy died, or his force fell while he was away.
        if (o && o.transit === tag) o.transit = null;
        if (e.phase !== "back" && alive(state, e.from)) pay(state, e.from, e.gold);
        continue;
      }
      if (e.phase === "out" && now >= e.arrive) resolve(state, e, onEvent);
      else if (e.phase === "wait" && (now >= e.expires || !alive(state, e.to) || S.spectating(state))) {
        if (!alive(state, e.to)) turnBack(state, e, true);
        else if (S.spectating(state)) {
          const pct = e.kind === "pact" ? S.pactChance(state, e.from, e.to, o.speech) : S.swapChance(state, e.from, e.to, e.give, e.take, e.gold, o.speech);
          settle(state, e, S.chance(state, pct));
        } else settle(state, e, false); // no answer is a refusal
      } else if (e.phase === "back" && now >= e.back) {
        o.transit = null;
        const cap = S.capitalOf(state, e.from);
        if (cap && o.city !== cap) { o.city = cap; S.officersMoved(state); }
        if (e.from === state.playerForce) S.addLog(state, `사자 ${S.josa(o.name, "이", "가")} ${S.forceName(state, e.to)}에서 돌아왔습니다.`, "mine");
        continue;
      }
      keep.push(e);
    }
    state.envoys = keep;
  };

  // ---------- the computer's diplomacy ----------
  // How much a force wants to stand well with another: neighbours it fears,
  // partners against a shared foe, a border to keep quiet while it fights
  // elsewhere. Weak neighbours with no one else in the way are prey instead.
  S.courtWish = function (state, me, x) {
    const mine = S.forcePower(state, me) || 1;
    const r = S.forcePower(state, x) / mine;
    const near = S.touches(state, me, x);
    const rest = others(state, me, x);
    // Another neighbour, no friend, that outmatches this force.
    const pressed = rest.some((z) => !S.allied(state, me, z) && S.touches(state, me, z) && S.forcePower(state, z) > mine * 1.2);
    const foe = S.commonFoe(state, me, x);
    let w = 0;
    if (near) {
      w += 10;
      if (r > 1.2) w += Math.min(30, 20 * (r - 1)); // better a friend than a conqueror
      if (pressed) w += 15;
      if (r < 0.6 && !pressed) w -= 30;
    }
    if (foe) w += 25 + (S.rel(state, x, foe) < 40 ? 10 : 0);
    else if (!near) w -= 10;
    if (rest.some((z) => S.allied(state, me, z) && S.allied(state, x, z))) w += 10;
    if (rest.some((z) => S.allied(state, x, z) && S.rel(state, me, z) < 30)) w -= 15;
    if (S.rel(state, me, x) < 20) w -= 15;
    const ruler = state.officers[state.forces[me].ruler];
    if (S.hasTrait(ruler, "야심")) w -= 10;
    if (S.hasTrait(ruler, "무욕")) w += 10;
    return w;
  };
  S.diploAI = function (state, fid) {
    if (!S.chance(state, D.aiChance)) return;
    const cap = state.cities[S.capitalOf(state, fid)];
    const who = S.envoyCandidates(state, fid);
    if (!cap || !who.length || S.serving(state, cap.id).length < 2 || S.besieged(state, cap.id)) return;
    const envoy = who[0];
    const out = S.envoysOf(state, fid);
    if (out.length >= 2) return;
    const month = S.monthsElapsed(state);
    const free = (x) => !out.some((e) => e.to === x) &&
      !(state.envoyAt && state.envoyAt[fid + ">" + x] != null && month - state.envoyAt[fid + ">" + x] < D.aiWait);
    const all = Object.keys(state.forces).filter((x) => x !== fid && alive(state, x) && free(x));
    // First, our own men back: theirs for ours, and gold for the difference.
    for (const x of all) {
      const can = S.swappable(state, fid, x);
      if (!can.take.length) continue;
      const take = can.take.slice(0, 3).map((o) => o.id);
      const ask = worthOf(state, take);
      const give = [];
      let offer = 0;
      for (const o of can.give) {
        if (offer >= ask) break;
        give.push(o.id);
        offer += S.captiveWorth(o);
      }
      const gold = clamp(Math.ceil((ask - offer) / 50) * 50, 0, Math.max(0, cap.gold - 600));
      if (S.swapChance(state, fid, x, give, take, gold, envoy.speech) >= 40) {
        S.sendEnvoy(state, fid, x, envoy.id, "swap", { give, take, gold });
        return;
      }
    }
    let best = null;
    for (const x of all) {
      const w = S.courtWish(state, fid, x);
      if (!best || w > best.w) best = { x, w };
    }
    if (!best || best.w < 25) return;
    const x = best.x, rel = S.rel(state, fid, x);
    const allied = S.allied(state, fid, x);
    if (!allied && rel >= 55 && S.allies(state, fid).length < 3 && cap.gold >= S.PACT_COST + 300 &&
      !S.pactSnub(state, fid, x) && S.pactChance(state, fid, x, envoy.speech) >= 35) {
      S.sendEnvoy(state, fid, x, envoy.id, "pact");
      return;
    }
    // Otherwise a gift, to be better thought of.
    if (rel < (allied ? 60 : 75) && cap.gold >= 1000) {
      const gold = clamp(Math.floor((cap.gold - 700) / 100) * 100, 200, best.w >= 45 ? 800 : 500);
      S.sendEnvoy(state, fid, x, envoy.id, "tribute", { gold });
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
