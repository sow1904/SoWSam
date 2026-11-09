// Distances and travel. Every road between two commanderies has a length in
// km, from the seats' latitude and longitude, lengthened for winding roads and
// mountain passes. Officers, convoys and armies travel along roads at their
// own speed, so orders take days to carry out. Whatever is on the road lives in
// state.marches until it arrives.
(function (S) {
  const clamp = S.clamp;
  const fail = (msg) => ({ ok: false, msg });

  S.SPEED = { officer: 45, cargo: 25, army: 20 }; // km per day
  S.SPEED_NAMES = { officer: "무장", cargo: "수송대", army: "군단" };
  S.ROAD_FACTOR = 1.3; // roads wind; straight-line distance is too short
  // Mountain roads and gorges, by how much longer they take.
  const ROUGH = {
    "youfufeng|hanzhong": 1.6, // 포사도
    "wudu|hanzhong": 1.4,
    "hanzhong|guanghan": 1.5, // 금우도
    "hanzhong|bajun": 1.5, // 미창도
    "wudu|guanghan": 1.8, // 음평도
    "bajun|nanjun": 1.4, // 장강 삼협
    "bajun|zangke": 1.5, // 야랑도
    "qianwei|yuexi": 1.4, "yuexi|yizhoujun": 1.4, "yuexi|yongchang": 1.5,
    "hongnong|jingzhao": 1.2, // 동관
    "hedong|shangdang": 1.3, "shangdang|taiyuan": 1.3, // 태항산
  };
  const key = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  const ROUGH_KEYED = {};
  for (const [k, v] of Object.entries(ROUGH)) ROUGH_KEYED[key(...k.split("|"))] = v;

  function greatCircle(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const [la1, lo1] = [a[3] * rad, a[4] * rad], [la2, lo2] = [b[3] * rad, b[4] * rad];
    const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Road length between two commanderies (adjacent or not, for detours).
  // Cached on the map itself, since each scenario has its own map.
  S.roadKm = function (a, b) {
    const cache = S.MAP.km || (S.MAP.km = {});
    const k = key(a, b);
    if (!(k in cache)) {
      const A = S.MAP.cities[a], B = S.MAP.cities[b];
      cache[k] = Math.round(greatCircle(A, B) * S.ROAD_FACTOR * (ROUGH_KEYED[k] || 1));
    }
    return cache[k];
  };
  S.travelDays = (km, kind) => Math.max(1, Math.ceil(km / S.SPEED[kind]));

  // Absolute day count since the game began (30 days a month).
  S.today = (state) => S.monthsElapsed(state) * S.DAYS_PER_MONTH + (state.day || 1) - 1;

  // Shortest road from one own city to another through own territory.
  // Returns { path, km, days } or null.
  S.route = function (state, from, to, kind) {
    const owner = state.cities[from].owner;
    const dist = { [from]: 0 }, prev = {}, done = new Set();
    for (;;) {
      let cur = null;
      for (const id in dist) if (!done.has(id) && (cur === null || dist[id] < dist[cur])) cur = id;
      if (cur === null) return null;
      if (cur === to) break;
      done.add(cur);
      for (const n of S.neighbors(cur)) {
        if (state.cities[n].owner !== owner || done.has(n)) continue;
        const d = dist[cur] + S.roadKm(cur, n);
        if (!(n in dist) || d < dist[n]) { dist[n] = d; prev[n] = cur; }
      }
    }
    const path = [to];
    while (path[0] !== from) path.unshift(prev[path[0]]);
    return { path, km: dist[to], days: S.travelDays(dist[to], kind) };
  };
  // Days for an officer to reach each own city through own territory.
  S.reachable = function (state, cid, kind) {
    const owner = state.cities[cid].owner;
    const dist = { [cid]: 0 }, done = new Set();
    for (;;) {
      let cur = null;
      for (const id in dist) if (!done.has(id) && (cur === null || dist[id] < dist[cur])) cur = id;
      if (cur === null) break;
      done.add(cur);
      for (const n of S.neighbors(cur)) {
        if (state.cities[n].owner !== owner) continue;
        const d = dist[cur] + S.roadKm(cur, n);
        if (!(n in dist) || d < dist[n]) dist[n] = d;
      }
    }
    delete dist[cid];
    for (const id in dist) dist[id] = S.travelDays(dist[id], kind || "officer");
    return dist;
  };

  // ---------- on the road ----------
  // kind: "army" marches on an enemy city; "move" carries officers and goods
  // to an own city; "return" brings a beaten army home.
  S.launch = function (state, spec) {
    state.marches = state.marches || [];
    state.marchSeq = (state.marchSeq || 0) + 1;
    const km = spec.km != null ? spec.km : spec.path.slice(1).reduce((s, id, i) => s + S.roadKm(spec.path[i], id), 0);
    const days = S.travelDays(km, spec.speed);
    const now = S.today(state);
    const m = Object.assign({ troops: 0, gold: 0, food: 0, train: 0, officers: [] }, spec,
      { id: state.marchSeq, km, start: now, arrive: now + days });
    state.marches.push(m);
    for (const id of m.officers) {
      const o = state.officers[id];
      o.transit = m.id;
      o.done = true;
    }
    return m;
  };
  S.marchesOf = (state, fid) => (state.marches || []).filter((m) => m.force === fid);
  S.daysLeft = (state, m) => Math.max(0, m.arrive - S.today(state));

  // Where a march is now, as map coordinates; frac is the part of today gone by.
  S.marchPos = function (state, m, frac) {
    const total = Math.max(1, m.arrive - m.start);
    const p = clamp((S.today(state) + (frac || 0) - m.start) / total, 0, 1);
    let want = p * m.km;
    for (let i = 1; i < m.path.length; i++) {
      const A = state.cities[m.path[i - 1]], B = state.cities[m.path[i]];
      const leg = S.roadKm(m.path[i - 1], m.path[i]);
      if (want <= leg || i === m.path.length - 1) {
        const f = leg ? clamp(want / leg, 0, 1) : 1;
        return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f };
      }
      want -= leg;
    }
    const c = state.cities[m.path[0]];
    return { x: c.x, y: c.y };
  };

  // Officers still with the force that sent them.
  function crew(state, m) {
    return m.officers.map((id) => state.officers[id]).filter((o) => o && o.status === "serving" && o.force === m.force);
  }
  function release(state, m) {
    for (const id of m.officers) if (state.officers[id] && state.officers[id].transit === m.id) state.officers[id].transit = null;
  }
  function deliver(state, m, c) {
    const team = crew(state, m);
    release(state, m);
    for (const o of team) o.city = c.id;
    if (m.troops) {
      c.train = Math.round((c.train * c.troops + m.train * m.troops) / (c.troops + m.troops));
      c.troops += m.troops;
    }
    c.gold += m.gold;
    c.food += m.food;
    if (m.force === state.playerForce) {
      const who = team.map((o) => o.name).join(", ");
      const cargo = [m.troops && `병사 ${m.troops}`, m.gold && `금 ${m.gold}`, m.food && `군량 ${m.food}`].filter(Boolean).join(", ");
      S.addLog(state, `${who ? S.josa(who, "이", "가") + " " : ""}${c.name}에 도착했습니다.${cargo ? " (" + cargo + ")" : ""}`, "mine");
    }
  }
  // The destination was lost on the way: head for the nearest own city.
  function reroute(state, m, from) {
    const own = S.citiesOf(state, m.force);
    const team = crew(state, m);
    release(state, m);
    if (!own.length || !state.forces[m.force].alive) return; // the force is gone; the men scatter
    const here = state.cities[from];
    const to = own.reduce((a, b) => (Math.hypot(b.x - here.x, b.y - here.y) < Math.hypot(a.x - here.x, a.y - here.y) ? b : a));
    const km = S.roadKm(from, to.id);
    S.launch(state, { kind: "return", force: m.force, path: [from, to.id], km, speed: m.troops ? "army" : "officer",
      officers: team.map((o) => o.id), troops: m.troops, train: m.train, gold: m.gold, food: m.food, origin: from, target: to.id });
    if (m.force === state.playerForce) S.addLog(state, `${here.name}에 갈 수 없게 되어 ${S.ro(to.name)} 방향을 돌립니다.`, "warn");
  }
  // A beaten army falls back to the city it set out from.
  S.sendHome = function (state, m, survivors) {
    const team = crew(state, m);
    release(state, m);
    if (!survivors && !team.length) return;
    S.launch(state, { kind: "return", force: m.force, path: [m.target, m.origin], speed: "army",
      officers: team.map((o) => o.id), troops: survivors, train: m.train, origin: m.target, target: m.origin });
  };

  function arrive(state, m, onEvent) {
    const t = state.cities[m.target];
    if (!state.forces[m.force].alive) { release(state, m); return; }
    if (t.owner === m.force) return deliver(state, m, t);
    if (m.kind !== "army") return reroute(state, m, m.target);
    if (S.allied(state, m.force, t.owner)) {
      if (m.force === state.playerForce) S.addLog(state, `${S.forceName(state, t.owner)}과 동맹을 맺어 ${t.name} 공격을 거두고 돌아갑니다.`, "mine");
      return S.sendHome(state, m, m.troops);
    }
    const r = S.fight(state, m);
    if (onEvent) onEvent(r);
    // Computer forces let go of captives who will never serve them.
    if (m.force !== state.playerForce && r.report.attackerWon) {
      const lead = crew(state, m)[0];
      for (const pid of r.report.captured) {
        const p = state.officers[pid];
        if (lead && S.recruitChance(state, lead, p) === 0) S.release(state, p.city, pid);
      }
    }
  }

  S.runMarches = function (state, onEvent) {
    if (!state.marches || !state.marches.length) return;
    const now = S.today(state);
    const due = state.marches.filter((m) => m.arrive <= now);
    if (!due.length) return;
    state.marches = state.marches.filter((m) => m.arrive > now);
    for (const m of due) {
      arrive(state, m, onEvent);
      if (S.checkOver(state)) return;
    }
  };
})(globalThis.SAM = globalThis.SAM || {});
