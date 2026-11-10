// Computer-controlled forces. Uses only the public engine commands, so the AI
// plays by the same rules as the player.
(function (S) {
  const byDesc = (key) => (a, b) => b[key] - a[key];

  function enemyNeighbors(state, c) {
    return S.neighbors(c.id).map((id) => state.cities[id]).filter((n) => n.owner !== c.owner && !S.allied(state, c.owner, n.owner));
  }
  // Cities the AI is willing to attack right now.
  // Along the roads, so enemy strongholds must be taken before what lies behind them.
  function attackable(state, c) {
    const truce = S.inTruce(state);
    return S.attackTargets(state, c.id).map((x) => S.place(state, x.id)).filter((n) => !truce || !n.owner);
  }

  // Next step from an interior city toward the nearest frontier city.
  function stepToFront(state, c) {
    const seen = new Set([c.id]);
    let queue = S.neighbors(c.id).filter((n) => state.cities[n].owner === c.owner).map((n) => [n, n]);
    queue.forEach(([n]) => seen.add(n));
    while (queue.length) {
      const next = [];
      for (const [id, first] of queue) {
        if (enemyNeighbors(state, state.cities[id]).length) return first;
        for (const n of S.neighbors(id)) {
          if (!seen.has(n) && state.cities[n].owner === c.owner) { seen.add(n); next.push([n, first]); }
        }
      }
      queue = next;
    }
    return null;
  }

  // Closest own city that borders an enemy, through own territory.
  function nearestFront(state, c) {
    const dist = S.reachable(state, c.id);
    let best = null;
    for (const [id, d] of Object.entries(dist)) {
      if (enemyNeighbors(state, state.cities[id]).length && (!best || d < dist[best])) best = id;
    }
    return best;
  }

  // Try 이간 on the shakiest officer next door, else 유언비어 on the steadiest city.
  function scheme(state, o, c) {
    const targets = S.schemeTargets(state, c.id);
    if (!targets.length) return;
    let best = null;
    for (const t of targets) {
      for (const v of S.serving(state, t.id).filter((x) => x.force === t.owner)) {
        const p = S.discordChance(state, o, v);
        if (v.loyalty < 75 && p >= 35 && (!best || v.loyalty < best.loyalty)) best = v;
      }
    }
    if (best) { S.discord(state, o.id, c.id, best.id); return; }
    const t = targets.reduce((a, b) => (b.order > a.order ? b : a));
    if (t.order > 40 && S.rumorChance(state, o, t.id) >= 40) S.rumor(state, o.id, c.id, t.id);
  }

  // Distance-limited path step from one own city toward another.
  function stepToward(state, from, to) {
    const owner = state.cities[from].owner;
    const prev = { [from]: null };
    const queue = [from];
    while (queue.length) {
      const id = queue.shift();
      if (id === to) break;
      for (const n of S.neighbors(id)) {
        if (!(n in prev) && state.cities[n].owner === owner) { prev[n] = id; queue.push(n); }
      }
    }
    if (!(to in prev)) return null;
    let step = to;
    while (prev[step] !== from) step = prev[step];
    return step;
  }

  // Pick the enemy city this force should concentrate on, and where to gather.
  function planCampaign(state, fid) {
    let best = null;
    for (const c of S.citiesOf(state, fid)) {
      for (const t of attackable(state, c)) {
        const defense = t.troops * (1 + t.wall / 2000) + 500;
        const score = c.troops / defense + (t.owner ? 0 : 0.3) + S.courtPull(state, fid, t);
        if (!best || score > best.score) best = { target: t.id, stage: c.id, score };
      }
    }
    return best;
  }

  function tryAttack(state, c, log) {
    const targets = attackable(state, c);
    if (!targets.length) return;
    const idle = S.idle(state, c.id);
    if (!idle.length) return;
    const garrison = Math.max(1500, Math.round(c.troops * 0.25));
    // Gentry retainers stay home, so only state troops can march.
    const troops = Math.min(c.troops - garrison, S.marchable(c));
    if (troops < 3000) return;
    const team = [...idle].sort((a, b) => b.cmd + b.war - (a.cmd + a.war)).slice(0, S.MAX_SORTIE_OFFICERS);
    // Keep at least one officer home when possible.
    if (team.length === S.idle(state, c.id).length && S.serving(state, c.id).length > 1 && team.length > 1) team.pop();
    const ids = team.map((o) => o.id);
    let best = null;
    for (const t of targets) {
      const unit = pickUnit(state, c, t, troops);
      const est = S.estimate(state, c.id, t.id, ids, troops, unit);
      const pull = S.courtPull(state, c.owner, t); // the emperor, or a secret letter's target
      const bonus = (t.owner ? 0 : 0.2) + pull; // vacant cities are easy pickings
      if (!best || est.ratio + bonus > best.score) best = { t, unit, score: est.ratio + bonus, est, pull };
    }
    // A war-weary force needs a clearer edge before it marches again.
    const w = state.forces[c.owner].weariness;
    // The ruler's temperament sets how sure a win must look.
    const ruler = state.officers[state.forces[c.owner].ruler];
    const nerve = (S.hasTrait(ruler, "과감") ? -0.15 : S.hasTrait(ruler, "신중") ? 0.2 : 0) + (S.hasTrait(ruler, "야심") ? -0.1 : 0);
    if (w > 70 || !best || best.est.ratio < 1.3 + w / 40 - best.pull + nerve) return;
    if (!S.chance(state, 45)) return;
    S.attack(state, c.id, best.t.id, ids, troops, best.unit);
  }

  // The soldiers for an attack, by type: those good against the walls, and
  // not easily beaten if the garrison marches out to meet them on the last
  // stretch of road. A better fit only weighs more, with some chance in it,
  // so the enemy cannot count on one answer.
  function pickUnit(state, c, t, troops) {
    const way = S.attackTargets(state, c.id).find((x) => x.id === t.id);
    const P = way ? way.path[way.path.length - 2] : c.id;
    const where = S.waterLink(state, P, t.id) ? "water" : "field";
    const rough = S.linkRough(state, P, t.id);
    const gu = S.garrisonUnit(t);
    const luck = {};
    for (const k of Object.keys(S.UNITS)) luck[k] = 0.6 + S.rand(state) * 0.8;
    return S.pickTroops(c, troops, (k) => {
      const walls = S.unitMul(k, gu, "siegeA", 1) / S.unitMul(gu, k, "siegeD", 1);
      const field = where === "water" ? 1 : S.unitEdge(k, gu, where, rough); // on a river both sides fight in ships
      return Math.pow(walls * field, 2) * luck[k];
    });
  }

  // The type to draft: one the stores can arm, good against the garrisons
  // next door, with some chance in it.
  function pickDraft(state, c) {
    const foes = S.links(state, c.id).map((n) => S.place(state, n)).filter((p) => p && p.owner && p.owner !== c.owner);
    let best = null;
    for (const k of S.raisableAt(state, c)) {
      if (S.armable(c, k) < 300) continue;
      const edge = foes.length ? foes.reduce((s, p) => s + S.unitEdge(k, S.garrisonUnit(p), "field", 1), 0) / foes.length : 1;
      const v = Math.pow(edge, 2) * (0.5 + S.rand(state)) * (1 + (S.unitOf(k).tier - 1) * 0.3);
      if (!best || v > best.v) best = { k, v };
    }
    return best && best.k;
  }

  // Put spare officers and hired clerks on the four domestic posts, keeping
  // some officers free for commands (more on the frontier unless told).
  function staffPosts(state, c, frontier, keep) {
    const reserve = keep != null ? keep : frontier ? 3 : 1;
    const serving = S.serving(state, c.id);
    const unposted = () => serving.filter((o) => !S.postOf(state, o));
    // Free up posted officers when the city lacks commanders.
    for (const o of serving.filter((x) => S.postOf(state, x)).sort((a, b) => b.cmd + b.war - a.cmd - a.war)) {
      if (unposted().length >= reserve) break;
      S.assignPost(state, c.id, S.postOf(state, o), null);
    }
    const spare = unposted().filter((o) => !o.done).sort((a, b) => b.cmd + b.war - a.cmd - a.war).slice(reserve);
    for (const o of spare) {
      let best = null;
      for (const k of S.POST_KEYS) {
        const policy = S.POSTS[k].policy;
        if (policy && c.gentry < 45) continue;
        const cur = S.postAbility(state, c.posts[k], k);
        // An empty development post loses value; an unused policy merely gains nothing.
        const gain = S.POSTS[k].stat(o) - (cur == null ? (policy ? 20 : -40) : cur);
        if (gain > 5 && (!best || gain > best.gain)) best = { k, gain };
      }
      if (best) S.assignPost(state, c.id, best.k, { type: "officer", id: o.id });
    }
    for (const k of S.POST_KEYS) {
      const p = c.posts[k];
      const margin = S.balance(c);
      if (!p) {
        if (S.POSTS[k].policy && (c.gentry < 50 || margin < 60)) continue;
        let tier = -1;
        for (let t = S.CLERKS.length - 1; t >= 0; t--) {
          if (S.CLERKS[t].salary <= Math.max(10, margin * 0.4) && c.gold > S.CLERKS[t].salary * 6) { tier = t; break; }
        }
        if (tier >= 0) S.assignPost(state, c.id, k, { type: "clerk", tier });
      } else if (p.type === "clerk" && p.tier < S.CLERKS.length - 1 && margin > 60 && c.gold > 1500) {
        S.assignPost(state, c.id, k, { type: "clerk", tier: p.tier + 1 });
      }
    }
  }

  function domestic(state, c, fid) {
    staffPosts(state, c, enemyNeighbors(state, c).length > 0);
    let idle = S.idle(state, c.id);
    const take = (sorter) => {
      if (!idle.length) return null;
      idle.sort(sorter);
      return idle.shift();
    };
    const frontier = enemyNeighbors(state, c).length > 0;

    // Recruit visible free officers and captives first.
    const targets = S.visibleFree(state, c.id).concat(S.captivesIn(state, c.id, fid));
    for (const t of targets) {
      const o = take(byDesc("speech"));
      if (!o) return;
      if (S.recruitChance(state, o, t) > 0) S.recruit(state, o.id, c.id, t.id);
      else { idle.unshift(o); if (t.status === "captive") S.release(state, c.id, t.id); }
    }
    // Look for hidden talent now and then.
    if (idle.length > 1 && S.chance(state, 25)) {
      const o = take(byDesc("wit"));
      S.search(state, o.id, c.id);
    }
    // Research the arms the force fights with.
    const studied = S.researchAI(state, c, idle);
    if (studied.length) idle = idle.filter((x) => !studied.includes(x));
    // A cunning officer on the frontier spreads rumours or sows discord next door.
    if (frontier && idle.length > 1 && c.gold > 600 && S.chance(state, 30)) {
      const o = [...idle].sort(byDesc("plot"))[0];
      if (o.plot >= 65) scheme(state, o, c);
      if (o.done) idle = idle.filter((x) => x !== o);
    }
    // Win over the great families when they grow reluctant.
    if (idle.length && c.gentry > 40 && c.consent < 45 && c.gold > 300) {
      S.woo(state, take(byDesc("speech")).id, c.id);
    }
    // Move surplus toward the campaign staging city, or from the interior to the front.
    const plan = state._plans && state._plans[fid];
    const surplus = Math.min(S.marchable(c), frontier ? c.troops - Math.max(3000, c.troops * 0.4) : c.troops - 2000);
    if (plan && plan.stage !== c.id && idle.length && S.serving(state, c.id).length > 1 && surplus > 2000) {
      const to = stepToward(state, c.id, plan.stage);
      if (to) {
        const o = take((a, b) => b.war - a.war);
        S.move(state, c.id, to, [o.id], Math.floor(surplus), Math.max(0, c.gold - 500), Math.max(0, c.food - 4000));
      }
    } else if (!frontier && idle.length && S.serving(state, c.id).length > 1 && (c.troops > 3000 || c.gold > 1000)) {
      const to = stepToFront(state, c);
      if (to) {
        const o = take((a, b) => b.war - a.war);
        const keep = 2000;
        S.move(state, c.id, to, [o.id], Math.max(0, Math.min(S.marchable(c), c.troops - keep)), Math.max(0, c.gold - 300), Math.max(0, c.food - 3000));
      }
    }
    // Spare officers in the interior go where the fighting is.
    if (!frontier && idle.length > 1) {
      const to = nearestFront(state, c);
      if (to) {
        const go = [...idle].sort((a, b) => b.cmd + b.war - a.cmd - a.war).slice(0, idle.length - 1);
        if (S.relocate(state, c.id, to, go.map((o) => o.id)).ok) idle = idle.filter((o) => !go.includes(o));
      }
    }
    // Frontier cities keep drafting while the treasury can pay the upkeep.
    const affordable = () => frontier
      ? c.troops / 100 + 15 < S.income(c) - S.salaries(c) + c.gold / 36
      : c.troops < 2500;
    while (idle.length) {
      const foodMonths = c.troops > 0 ? c.food / (c.troops / 50) : 99;
      let r = null;
      const unit = affordable() && c.manpower > 400 && c.gold > 250 && c.order > 50 && foodMonths > 10 ? pickDraft(state, c) : null;
      if (unit) r = S.draft(state, take(byDesc("cmd")).id, c.id, unit);
      else if (c.train < 75 && c.troops > 1000) r = S.drill(state, take(byDesc("cmd")).id, c.id);
      else break;
      if (r && !r.ok) break;
    }
    // Reward wavering officers.
    for (const o of S.serving(state, c.id)) {
      if (o.loyalty < 70 && c.gold > 400) S.reward(state, c.id, o.id);
    }
  }

  // ---------- delegation (위임) ----------
  // A player city can be left to its governor, with a policy. On the 1st of
  // each month (and when first delegated) the governor staffs the posts,
  // recruits, wins over the gentry, drafts and drills, and rewards wavering
  // officers. He never attacks, moves troops or officers, schemes, researches
  // or releases captives: those stay the player's. Direct commands still work.
  S.DELEGATE = { domestic: "내정 중시", military: "군비 확장" };
  S.delegateOf = (state, c) => (c.delegate && c.delegate.fid === c.owner ? c.delegate.policy : null);
  S.setDelegate = function (state, cid, policy) {
    const c = state.cities[cid];
    if (!c || !c.owner || c.owner !== state.playerForce) return { ok: false, msg: "아군 도시가 아닙니다." };
    if (policy && !S.DELEGATE[policy]) return { ok: false, msg: "알 수 없는 방침입니다." };
    c.delegate = policy ? { fid: c.owner, policy } : null;
    if (!policy) return { ok: true, msg: `${c.name}을 직접 다스립니다.` };
    const did = S.govern(state, c);
    return { ok: true, msg: `${c.name}을 태수에게 맡겼습니다(${S.DELEGATE[policy]}).` + (did ? ` 이번 달: ${did}` : "") };
  };
  // Returns a short account of what was done, or "".
  S.govern = function (state, c) {
    const policy = S.delegateOf(state, c);
    if (!policy) return "";
    const mil = policy === "military";
    const frontier = enemyNeighbors(state, c).length > 0;
    const done = {};
    const note = (r, label) => { if (r && r.ok) done[label] = (done[label] || 0) + 1; return r; };
    staffPosts(state, c, frontier, mil ? (frontier ? 3 : 2) : frontier ? 2 : 1);
    let idle = S.idle(state, c.id);
    const take = (key) => {
      if (!idle.length) return null;
      idle.sort(byDesc(key));
      return idle.shift();
    };
    // Recruit those who would come; captives are left for the player.
    for (const t of S.visibleFree(state, c.id)) {
      if (!idle.length) break;
      const o = [...idle].sort(byDesc("speech"))[0];
      if (S.recruitChance(state, o, t) <= 0) continue;
      idle = idle.filter((x) => x !== o);
      note(S.recruit(state, o.id, c.id, t.id), "등용");
    }
    if (!mil && idle.length > 1 && S.chance(state, 40)) note(S.search(state, take("wit").id, c.id), "탐색");
    if (idle.length && c.gentry > 40 && c.consent < (mil ? 40 : 55) && c.gold > 300) note(S.woo(state, take("speech").id, c.id), "회유");
    const want = () => mil
      ? (frontier ? c.troops / 100 + 15 < S.income(c) - S.salaries(c) + c.gold / 36 : c.troops < 6000)
      : c.troops < (frontier ? 5000 : 2500);
    while (idle.length) {
      const foodMonths = c.troops > 0 ? c.food / (c.troops / 50) : 99;
      const ok = want() && c.manpower > 400 && c.gold > (mil ? 250 : 600) && c.order > (mil ? 50 : 60) && foodMonths > (mil ? 8 : 12);
      const unit = ok ? pickDraft(state, c) : null;
      let r = null;
      if (unit) r = note(S.draft(state, take("cmd").id, c.id, unit), "징병");
      else if (c.train < (mil ? 80 : 60) && c.troops > 1000) r = note(S.drill(state, take("cmd").id, c.id), "훈련");
      else break;
      if (!r.ok) break;
    }
    for (const o of S.serving(state, c.id)) {
      if (o.loyalty < 70 && c.gold > 400) note(S.reward(state, c.id, o.id), "포상");
    }
    return Object.entries(done).map(([k, n]) => (n > 1 ? `${k} ${n}회` : k)).join(", ");
  };

  S.runAI = function (state, fid, onEvent) {
    const log = onEvent || (() => {});
    const cities = S.citiesOf(state, fid);
    // Shuffle so the AI does not always act in the same city order.
    for (let i = cities.length - 1; i > 0; i--) {
      const j = Math.floor(S.rand(state) * (i + 1));
      [cities[i], cities[j]] = [cities[j], cities[i]];
    }
    for (const c of cities) {
      if (c.owner !== fid) continue;
      tryAttack(state, c, log);
    }
    // Strongholds with a strong garrison can strike too.
    for (const f of S.fortsOf(state, fid)) if (f.troops >= 5000) tryAttack(state, f, log);
    manageForts(state, fid);
    S.reliefAI(state, fid);
    state._plans = state._plans || {};
    state._plans[fid] = planCampaign(state, fid);
    for (const c of S.citiesOf(state, fid)) domestic(state, c, fid);
    seekAlly(state, fid);
    S.courtAI(state, fid);
    S.capitalAI(state, fid);
  };

  // Keep frontline strongholds manned from the city behind them, call idle
  // officers home from quiet ones, and build where a builder is free.
  function manageForts(state, fid) {
    for (const f of S.fortsOf(state, fid)) {
      const near = S.links(state, f.id);
      const front = near.some((n) => { const p = S.place(state, n); return p.owner !== fid && !(p.owner && S.allied(state, fid, p.owner)); });
      const staff = S.serving(state, f.id);
      const home = near.map((n) => state.cities[n]).filter((x) => x && x.owner === fid).sort((a, b) => S.marchable(b) - S.marchable(a))[0];
      const keep = front ? 4000 : 1000;
      const idle = S.idle(state, f.id);
      if (front && (f.troops < 3000 || !staff.length)) {
        if (home && S.idle(state, home.id).length > 1) {
          const send = Math.max(0, Math.min(keep - f.troops, S.marchable(home) - 3000));
          const o = S.idle(state, home.id).sort((a, b) => b.cmd - a.cmd)[0];
          if (send >= 500 || !staff.length) S.move(state, home.id, f.id, [o.id], send, 0, Math.min(2000, Math.max(0, home.food - 4000)));
        }
      } else if (f.troops > keep * 1.5 && home) {
        // Too many men sitting in the stronghold: an officer leads the surplus home.
        if (idle.length && (front ? idle.length > 1 : true)) S.move(state, f.id, home.id, [idle[0].id], f.troops - keep, 0, 0);
        else if (!staff.length && S.idle(state, home.id).length > 1) S.relocate(state, home.id, f.id, [S.idle(state, home.id)[0].id]);
      } else if (!front && idle.length && home) {
        S.relocate(state, f.id, home.id, idle.map((o) => o.id));
      }
    }
    // Take over empty strongholds next to our cities.
    for (const f of Object.values(state.forts || {})) {
      if (!f.built || f.owner || f.troops > 0) continue;
      const c = S.links(state, f.id).map((n) => state.cities[n]).find((x) => x && x.owner === fid && S.idle(state, x.id).length > 1 && S.marchable(x) > 5000);
      if (c && S.chance(state, 25)) S.move(state, c.id, f.id, [S.idle(state, c.id)[0].id], 2000, 0, 1500);
    }
    for (const c of S.citiesOf(state, fid)) {
      const sites = S.buildSites(state, c.id);
      const who = S.builders(state, c.id);
      if (sites.length && who.length && c.gold > S.BUILD_COST + 800 && S.chance(state, 10)) S.buildFort(state, c.id, sites[0].id, who[0].id);
    }
  }

  // Now and then a computer force sends an envoy to another computer force.
  function seekAlly(state, fid) {
    if (!S.chance(state, 3) || S.allies(state, fid).length >= 2) return;
    // Only neighbours, or forces that share a neighbour with this one, are worth courting.
    // The forces each one borders, worked out once per force.
    const borders = new Map();
    const nb = (f) => {
      if (!borders.has(f)) borders.set(f, new Set(S.citiesOf(state, f).flatMap((c) => S.neighbors(c.id).map((n) => state.cities[n].owner))));
      return borders.get(f);
    };
    const near = (to) => nb(fid).has(to) || [...nb(fid)].some((x) =>
      x && x !== fid && x !== to && state.forces[x].alive && nb(to).has(x));
    const others = Object.values(state.forces).filter((f) => f.alive && f.id !== fid && f.id !== state.playerForce &&
      !S.allied(state, fid, f.id) && !S.pactCooldown(state, fid, f.id) && near(f.id));
    if (!others.length) return;
    const to = others[Math.floor(S.rand(state) * others.length)].id;
    if (S.pactChance(state, fid, to) >= 40) S.proposePact(state, fid, to);
  }

  // All non-player forces act, then the month advances.
  // ---------- the clock ----------
  // Time runs in days, 30 to a month. Each computer force acts on its own day
  // of the month, so news arrives across the month instead of all at once.
  // Monthly rules (income, harvest, loyalty, the court) run when a month ends.
  S.DAYS_PER_MONTH = 30;
  function planAIDays(state) {
    state.aiDays = {};
    for (const f of Object.values(state.forces)) {
      if (f.alive && f.id !== state.playerForce) state.aiDays[f.id] = 1 + Math.floor(S.rand(state) * S.DAYS_PER_MONTH);
    }
  }
  // One day passes. Returns "month" when a new month has begun.
  S.tickDay = function (state, onEvent) {
    if (state.over) return null;
    if (!state.day) state.day = 1;
    if (!state.aiDays) planAIDays(state);
    // The ruler gives his orders on the 1st first; the governors of delegated
    // cities act as the 1st turns to the 2nd, once a month.
    const stamp = state.year * 100 + state.month;
    if (state.day === 1 && state.playerForce && state.governed !== stamp) {
      state.governed = stamp;
      for (const c of S.citiesOf(state, state.playerForce)) {
        const did = S.govern(state, c);
        if (did) S.addLog(state, `${c.name} 위임(${S.DELEGATE[S.delegateOf(state, c)]}): ${did}`, "info");
      }
    }
    S.runMarches(state, onEvent);
    S.runBattles(state, onEvent);
    if (state.over) return null;
    for (const [fid, d] of Object.entries(state.aiDays)) {
      if (d !== state.day || !state.forces[fid].alive) continue;
      S.runAI(state, fid, onEvent);
      if (S.checkOver(state)) return null;
    }
    state.day++;
    if (state.day <= S.DAYS_PER_MONTH) return null;
    S.endMonth(state);
    state.day = 1;
    planAIDays(state);
    return "month";
  };
  // A whole month at once (headless simulations).
  S.advanceTurn = function (state, onEvent) {
    while (!state.over && S.tickDay(state, onEvent) !== "month") { /* next day */ }
  };
})(globalThis.SAM = globalThis.SAM || {});
