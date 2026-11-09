// Computer-controlled forces. Uses only the public engine commands, so the AI
// plays by the same rules as the player.
(function (S) {
  const byDesc = (key) => (a, b) => b[key] - a[key];

  function enemyNeighbors(state, c) {
    return S.neighbors(c.id).map((id) => state.cities[id]).filter((n) => n.owner !== c.owner && !S.allied(state, c.owner, n.owner));
  }
  // Cities the AI is willing to attack right now.
  function attackable(state, c) {
    const truce = S.inTruce(state);
    return enemyNeighbors(state, c).filter((n) => !truce || !n.owner);
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
      const est = S.estimate(state, c.id, t.id, ids, troops);
      const pull = S.courtPull(state, c.owner, t); // the emperor, or a secret letter's target
      const bonus = (t.owner ? 0 : 0.2) + pull; // vacant cities are easy pickings
      if (!best || est.ratio + bonus > best.score) best = { t, score: est.ratio + bonus, est, pull };
    }
    // A war-weary force needs a clearer edge before it marches again.
    const w = state.forces[c.owner].weariness;
    if (w > 70 || !best || best.est.ratio < 1.3 + w / 40 - best.pull) return;
    if (!S.chance(state, 45)) return;
    const r = S.attack(state, c.id, best.t.id, ids, troops);
    if (r.ok) {
      log(r);
      // AI tries to recruit captives right away next month; release rulers.
      for (const pid of r.report.captured) {
        const p = state.officers[pid];
        if (S.recruitChance(state, team[0], p) === 0) S.release(state, p.city, pid);
      }
    }
  }

  // Put spare officers and hired clerks on the four domestic posts.
  function staffPosts(state, c, frontier) {
    const reserve = frontier ? 3 : 1;
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
      if (affordable() && c.manpower > 400 && c.gold > 250 && c.order > 50 && foodMonths > 10) r = S.draft(state, take(byDesc("cmd")).id, c.id);
      else if (c.train < 75 && c.troops > 1000) r = S.drill(state, take(byDesc("cmd")).id, c.id);
      else break;
      if (r && !r.ok) break;
    }
    // Reward wavering officers.
    for (const o of S.serving(state, c.id)) {
      if (o.loyalty < 70 && c.gold > 400) S.reward(state, c.id, o.id);
    }
  }

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
    state._plans = state._plans || {};
    state._plans[fid] = planCampaign(state, fid);
    for (const c of S.citiesOf(state, fid)) domestic(state, c, fid);
    seekAlly(state, fid);
    S.courtAI(state, fid);
  };

  // Now and then a computer force sends an envoy to another computer force.
  function seekAlly(state, fid) {
    if (!S.chance(state, 3) || S.allies(state, fid).length >= 2) return;
    // Only neighbours, or forces that share a neighbour with this one, are worth courting.
    const near = (to) => S.touches(state, fid, to) || Object.keys(state.forces).some((x) =>
      x !== fid && x !== to && state.forces[x].alive && S.touches(state, fid, x) && S.touches(state, to, x));
    const others = Object.values(state.forces).filter((f) => f.alive && f.id !== fid && f.id !== state.playerForce &&
      !S.allied(state, fid, f.id) && !S.pactCooldown(state, fid, f.id) && near(f.id));
    if (!others.length) return;
    const to = others[Math.floor(S.rand(state) * others.length)].id;
    if (S.pactChance(state, fid, to) >= 40) S.proposePact(state, fid, to);
  }

  // All non-player forces act, then the month advances.
  S.advanceTurn = function (state, onEvent) {
    const order = Object.values(state.forces).filter((f) => f.alive && f.id !== state.playerForce).map((f) => f.id);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(S.rand(state) * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const fid of order) {
      if (state.forces[fid].alive) S.runAI(state, fid, onEvent);
      if (S.checkOver(state)) return;
    }
    S.endMonth(state);
  };
})(globalThis.SAM = globalThis.SAM || {});
