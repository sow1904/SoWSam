// Computer-controlled forces. Uses only the public engine commands, so the AI
// plays by the same rules as the player.
(function (S) {
  const byDesc = (key) => (a, b) => b[key] - a[key];

  function enemyNeighbors(state, c) {
    return S.neighbors(c.id).map((id) => state.cities[id]).filter((n) => n.owner !== c.owner);
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
        const score = c.troops / defense + (t.owner ? 0 : 0.3);
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
    const troops = c.troops - garrison;
    if (troops < 3000) return;
    const team = [...idle].sort((a, b) => b.lead + b.war - (a.lead + a.war)).slice(0, S.MAX_SORTIE_OFFICERS);
    // Keep at least one officer home when possible.
    if (team.length === S.idle(state, c.id).length && S.serving(state, c.id).length > 1 && team.length > 1) team.pop();
    const ids = team.map((o) => o.id);
    let best = null;
    for (const t of targets) {
      const est = S.estimate(state, c.id, t.id, ids, troops);
      const bonus = t.owner ? 0 : 0.2; // vacant cities are easy pickings
      if (!best || est.ratio + bonus > best.score) best = { t, score: est.ratio + bonus, est };
    }
    if (!best || best.est.ratio < 1.3) return;
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

  function domestic(state, c, fid) {
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
      const o = take(byDesc("int"));
      if (!o) return;
      if (S.recruitChance(state, o, t) > 0) S.recruit(state, o.id, c.id, t.id);
      else { idle.unshift(o); if (t.status === "captive") S.release(state, c.id, t.id); }
    }
    // Look for hidden talent now and then.
    if (idle.length > 1 && S.chance(state, 25)) {
      const o = take(byDesc("int"));
      S.search(state, o.id, c.id);
    }
    // Move surplus toward the campaign staging city, or from the interior to the front.
    const plan = state._plans && state._plans[fid];
    const surplus = frontier ? c.troops - Math.max(3000, c.troops * 0.4) : c.troops - 2000;
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
        S.move(state, c.id, to, [o.id], Math.max(0, c.troops - keep), Math.max(0, c.gold - 300), Math.max(0, c.food - 3000));
      }
    }
    // Frontier cities keep drafting while the treasury can pay the upkeep.
    const affordable = () => frontier
      ? c.troops / 100 + 15 < S.income(c) + c.gold / 36
      : c.troops < 2500;
    while (idle.length) {
      const foodMonths = c.troops > 0 ? c.food / (c.troops / 50) : 99;
      let r = null;
      if (c.order < 45) r = S.patrol(state, take((a, b) => b.war + b.lead - a.war - a.lead).id, c.id);
      else if (affordable() && c.gold > 250 && c.order > 50 && foodMonths > 10) r = S.draft(state, take(byDesc("lead")).id, c.id);
      else if (c.train < 75 && c.troops > 1000) r = S.drill(state, take(byDesc("lead")).id, c.id);
      else if (c.gold >= S.COST.develop + 50) {
        const ratios = ["farm", "trade", "wall"].map((k) => [k, c[k] / c[k + "Max"]]);
        if (foodMonths < 12) ratios[0][1] -= 0.3;
        if (frontier) ratios[2][1] -= 0.15;
        ratios.sort((a, b) => a[1] - b[1]);
        const [kind, ratio] = ratios[0];
        if (ratio >= 1) r = S.patrol(state, take((a, b) => b.war - a.war).id, c.id);
        else r = S.develop(state, take(byDesc(kind === "wall" ? "lead" : "pol")).id, c.id, kind);
      } else if (c.order < 100) r = S.patrol(state, take((a, b) => b.war - a.war).id, c.id);
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
  };

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
