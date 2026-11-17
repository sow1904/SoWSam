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

  // Men a city should keep at home against its neighbours: a third of what the
  // strongest enemy next door could send, and a little of what the others
  // could. Only a share, so that borders do not freeze with armies glaring
  // at each other: the main strength still gathers for campaigns.
  //   except: a place left out (the one about to be attacked)
  S.AI_GUARD = { top: 0.35, rest: 0.1, min: 1500 };
  function guardNeed(state, c, except) {
    const can = S.links(state, c.id).map((id) => S.place(state, id))
      .filter((p) => p && p.owner && p.owner !== c.owner && p.id !== except && !S.allied(state, c.owner, p.owner))
      .map((p) => Math.max(0, p.troops - (p.retainers || 0))).sort((a, b) => b - a);
    const rest = can.slice(1).reduce((s, n) => s + n, 0);
    return Math.max(S.AI_GUARD.min, Math.round((can[0] || 0) * S.AI_GUARD.top + rest * S.AI_GUARD.rest));
  }
  S.guardNeed = guardNeed;
  // Own frontier cities reachable through own cities, with how far (in steps).
  function fronts(state, c) {
    const out = [];
    const seen = new Set([c.id]);
    let queue = [c.id], d = 0;
    while (queue.length) {
      const next = [];
      d++;
      for (const id of queue) for (const n of S.neighbors(id)) {
        if (seen.has(n) || state.cities[n].owner !== c.owner) continue;
        seen.add(n);
        next.push(n);
        if (enemyNeighbors(state, state.cities[n]).length) out.push({ c: state.cities[n], d });
      }
      queue = next;
    }
    return out;
  }
  // The frontier city that most needs men, if any is short.
  function neediestFront(state, c) {
    let best = null;
    for (const f of fronts(state, c)) {
      const short = guardNeed(state, f.c) - f.c.troops;
      const score = short / (1 + f.d * 0.3);
      if (short > 0 && (!best || score > best.score)) best = { id: f.c.id, score };
    }
    return best && best.id;
  }
  // The nearest frontier city with no officer at all, if any.
  function unmannedFront(state, c) {
    const f = fronts(state, c).filter((x) => !S.serving(state, x.c.id).some((o) => o.force === c.owner)).sort((a, b) => a.d - b.d)[0];
    return f && f.c.id;
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

  // What a computer force does with a captive. fresh: he was just taken and
  // has refused to serve. By how the two forces stand, the ruler's own feuds
  // and grudges and his temper (S.beheadWish) the captive is put to death;
  // if he pleads for his life the ruler may take him in. One who would never
  // serve, and a ruler, are otherwise let go; the rest are kept. Kept
  // captives are weighed again only if they would never serve.
  // Returns true when his fate was settled.
  S.judgeCaptive = function (state, t, fresh) {
    const fid = t.captor;
    if (t.status !== "captive") return false;
    const never = t.lord || !!S.recruitBar(state, fid, t);
    if (!fresh && !never) return false;
    if (S.chance(state, S.beheadWish(state, fid, t))) {
      const r = S.behead(state, t.city, t.id);
      if (r.ok && r.begged) {
        const ruler = state.officers[state.forces[fid].ruler];
        const able = Math.max(t.cmd, t.war, t.wit, t.pol) >= 80;
        const hates = S.tieOf(ruler, t) < 0 || S.feelFor(ruler, t.force) < 0;
        if (!hates && S.chance(state, able ? 60 : 35)) S.spare(state, t.city, t.id);
        else S.behead(state, t.city, t.id);
      }
      return true;
    }
    if (!never) return false;
    const lord = t.lord;
    const r = S.release(state, t.city, t.id);
    if (r.ok && !lord) S.addLog(state, `${S.josa(S.forceName(state, fid), "이", "가")} 뜻을 굽히지 않는 포로 ${S.josa(t.name, "을", "를")} 놓아주었습니다.`, "info");
    return true;
  };

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
    // Gentry retainers stay home, so only state troops can march. Enough
    // stay behind to face the other neighbours (the target is busy).
    const garrisonFor = (t) => Math.max(1500, Math.round(c.troops * 0.25), guardNeed(state, c, t && t.id));
    if (Math.min(c.troops - Math.max(1500, Math.round(c.troops * 0.25)), S.marchable(c)) < 3000) return;
    const team = [...idle].sort((a, b) => b.cmd + b.war - (a.cmd + a.war)).slice(0, S.MAX_SORTIE_OFFICERS);
    // Keep at least one officer home when possible.
    if (team.length === S.idle(state, c.id).length && S.serving(state, c.id).length > 1 && team.length > 1) team.pop();
    const ids = team.map((o) => o.id);
    let best = null;
    const ways = S.attackTargets(state, c.id);
    for (const t of targets) {
      const troops = Math.min(c.troops - garrisonFor(t), S.marchable(c));
      if (troops < 3000) continue;
      const unit = pickUnit(state, c, t, troops);
      // Over water, what is likely left once ashore, if it gets ashore at all.
      const way = ways.find((w) => w.id === t.id);
      const land = way && S.landingLink(way.path) ? S.landingForecast(state, t.id, c.owner, team, troops, c.train) : null;
      if (land && !land.pass) continue;
      const est = S.estimate(state, c.id, t.id, ids, land ? land.left : troops, unit);
      if (land && land.lostD) est.ratio *= t.troops / Math.max(1, t.troops - land.lostD);
      const pull = S.courtPull(state, c.owner, t); // the emperor, or a secret letter's target
      const bonus = (t.owner ? 0 : 0.2) + pull; // vacant cities are easy pickings
      // A fierce officer inside who may sortie makes the place look harder.
      const threat = t.owner ? S.sortieThreat(state, t.id) : null;
      const risk = threat ? threat.pct / 50 : 0;
      const score = est.ratio + bonus - risk;
      if (!best || score > best.score) best = { t, unit, score, est, pull, risk, troops };
    }
    // A war-weary force needs a clearer edge before it marches again.
    const w = state.forces[c.owner].weariness;
    // The ruler's temperament sets how sure a win must look.
    const ruler = state.officers[state.forces[c.owner].ruler];
    const nerve = (S.hasTrait(ruler, "과감") ? -0.15 : S.hasTrait(ruler, "신중") ? 0.2 : 0) + (S.hasTrait(ruler, "야심") ? -0.1 : 0);
    // Those it stands well with are left alone unless the chance is plain,
    // and those it hates are struck a little sooner.
    const amity = best && best.t.owner ? Math.max(-0.15, (S.rel(state, c.owner, best.t.owner) - 50) / 80) : 0;
    if (w > 70 || !best || best.est.ratio < 1.3 + w / 40 - best.pull + nerve + amity + best.risk) return;
    if (!S.chance(state, 45)) return;
    S.attack(state, c.id, best.t.id, ids, best.troops, best.unit);
  }

  // The soldiers for an attack, by type: those good against the walls, and
  // not easily beaten if the garrison sorties against the camp. A better fit only weighs more, with some chance in it,
  // so the enemy cannot count on one answer.
  function pickUnit(state, c, t, troops) {
    const gu = S.garrisonUnit(t);
    const luck = {};
    for (const k of Object.keys(S.UNITS)) luck[k] = 0.6 + S.rand(state) * 0.8;
    return S.pickTroops(c, troops, (k) => {
      if (S.unitOf(k).gear) return 3 * luck[k]; // engines go where the walls are
      if (S.unitOf(k).aid) return 2 * luck[k];
      const walls = S.unitMul(k, gu, "siegeA", 1) / S.unitMul(gu, k, "siegeD", 1);
      const field = S.unitEdge(k, gu, "field", 1); // sorties meet the camp in the open
      return Math.pow(walls * field, 2) * luck[k];
    });
  }

  // The type to draft: one the stores can arm, good against the garrisons
  // next door, with some chance in it.
  function pickDraft(state, c) {
    const foes = S.links(state, c.id).map((n) => S.place(state, n)).filter((p) => p && p.owner && p.owner !== c.owner);
    let best = null;
    // A city facing walls keeps some engines: up to a twentieth of its men, the
    // kind it has least of first.
    const gear = foes.some((p) => p.wall > 0) ? S.raisableAt(state, c).filter((k) => S.unitOf(k).gear && S.armable(c, k) >= 300) : [];
    if (gear.length && c.troops > 4000 && S.gearShare(S.garrisonUnit(c)) < 0.05 && S.chance(state, 35)) {
      const mix = S.garrisonUnit(c);
      return gear.sort((a, b) => (mix[a] || 0) - (mix[b] || 0) || S.unitOf(b).tier - S.unitOf(a).tier)[0];
    }
    // ...and a few carts: wagons only where the neighbours ride.
    const riders = foes.some((p) => S.mountedShare(S.garrisonUnit(p)) > 0.3);
    const carts = foes.length ? S.raisableAt(state, c).filter((k) => S.unitOf(k).aid && S.armable(c, k) >= 300 && (S.unitOf(k).aid !== "wagon" || riders)) : [];
    if (carts.length && c.troops > 4000 && S.aidShare(S.garrisonUnit(c)) < 0.04 && S.chance(state, 20)) {
      const mix = S.garrisonUnit(c);
      return carts.sort((a, b) => (mix[a] || 0) - (mix[b] || 0))[0];
    }
    for (const k of S.raisableAt(state, c)) {
      if (S.armable(c, k) < 300 || S.unitOf(k).gear || S.unitOf(k).aid) continue;
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
    // 둔전 is dropped as the families' next rising grows dearer (js/gentry.js).
    if (c.posts.tuntian && !S.wantTuntian(state, c)) S.assignPost(state, c.id, "tuntian", null);
    const tuntianOk = () => c.gentry >= S.tuntianFloor(state, c) && S.wantTuntian(state, c);
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
        if (policy && !tuntianOk()) continue;
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
        if (S.POSTS[k].policy && (c.gentry < S.tuntianFloor(state, c) + 5 || margin < 60 || !S.wantTuntian(state, c))) continue;
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

  // Sell grain beyond three years' need; with gold to spare, a frontier city
  // away from the herds buys horses, and any city short of iron buys some.
  function marketAI(state, c, frontier) {
    if (S.besieged(state, c.id)) return;
    const keep = S.foodUse(c.troops) * 36 + 8000;
    if (c.food > keep) S.trade(state, c.id, "food", Math.min(c.food - keep, S.tradeMax(state, c, "food", true)), true);
    const buy = (k, upTo, spare) => {
      const price = S.tradePrice(state, c, k);
      const n = Math.min(upTo - c.res[k], Math.floor((c.gold - spare) / price), S.tradeMax(state, c, k, false));
      if (n >= 100) S.trade(state, c.id, k, n, false);
    };
    if (c.res.iron < 400) buy("iron", 1200, 800);
    if (frontier && !S.horseCountry(c) && S.canRaise(state, c.owner, "lighthorse")) buy("horse", 1500, 1500);
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
    for (const t of S.visibleFree(state, c.id).concat(S.captivesIn(state, c.id, fid))) {
      if (t.status === "captive" && S.judgeCaptive(state, t)) continue;
      const o = take(byDesc("speech"));
      if (!o) return;
      if (S.recruitChance(state, o, t) > 0) S.recruit(state, o.id, c.id, t.id);
      else idle.unshift(o);
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
    const surplus = Math.min(S.marchable(c), frontier ? c.troops - Math.max(3000, c.troops * 0.4, guardNeed(state, c)) : c.troops - 2000);
    if (plan && plan.stage !== c.id && idle.length && S.serving(state, c.id).length > 1 && surplus > 2000) {
      const to = stepToward(state, c.id, plan.stage);
      if (to) {
        const o = take((a, b) => b.war - a.war);
        S.move(state, c.id, to, [o.id], Math.floor(surplus), Math.max(0, c.gold - 500), Math.max(0, c.food - 4000));
      }
    } else if (!frontier && idle.length && S.serving(state, c.id).length > 1 && (c.troops > 3000 || c.gold > 1000)) {
      // To the frontier city that most needs men, else the nearest one.
      const need = neediestFront(state, c);
      const to = (need && stepToward(state, c.id, need)) || stepToFront(state, c);
      if (to) {
        const o = take((a, b) => b.war - a.war);
        const keep = 2000;
        S.move(state, c.id, to, [o.id], Math.max(0, Math.min(S.marchable(c), c.troops - keep)), Math.max(0, c.gold - 300), Math.max(0, c.food - 3000));
      }
    }
    // Spare officers in the interior go where the fighting is, first to a
    // frontier city with no officer (which could not draft at all).
    if (!frontier && idle.length > 1) {
      const to = unmannedFront(state, c) || nearestFront(state, c);
      if (to) {
        const go = [...idle].sort((a, b) => b.cmd + b.war - a.cmd - a.war).slice(0, idle.length - 1);
        if (S.relocate(state, c.id, to, go.map((o) => o.id)).ok) idle = idle.filter((o) => !go.includes(o));
      }
    }
    marketAI(state, c, frontier);
    // A frontier city with timber to spare lays stakes before its walls.
    if (frontier && idle.length > 1 && !(c.stakes > 0) && c.res.wood > 5000 && S.chance(state, 10)) {
      const o = [...idle].sort((a, b) => a.cmd - b.cmd)[0];
      if (S.stake(state, o.id, c.id).ok) idle = idle.filter((x) => x !== o);
    }
    // Frontier cities keep drafting while the treasury can pay the upkeep.
    const affordable = () => frontier
      ? c.troops / 100 + 15 < S.income(c) - S.salaries(c) + c.gold / 36
      : c.troops < 2500;
    while (idle.length) {
      const foodMonths = c.troops > 0 ? c.food / S.foodUse(c.troops) : 99;
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
  // 완전 위임 leaves everything to the governor, as a computer force would
  // run the city: it attacks, moves troops, schemes and researches too. With
  // every city so delegated the whole force runs itself (S.spectating) and
  // the player only watches.
  S.DELEGATE = { domestic: "내정 중시", military: "군비 확장", full: "완전 위임" };
  S.spectating = function (state) {
    if (!state.playerForce) return false;
    if (state.auto) return true; // 세력 위임: the whole force, whatever its cities are set to
    const cs = S.citiesOf(state, state.playerForce);
    return cs.length > 0 && cs.every((c) => S.delegateOf(state, c) === "full");
  };
  // 세력 위임: hand the whole force over, or take it back.
  S.setAuto = function (state, on) {
    if (!state.playerForce) return { ok: false, msg: "맡길 세력이 없습니다." };
    state.auto = !!on;
    return { ok: true, msg: on ? "세력을 모두 맡겼습니다. 도시와 군대, 외교와 황실, 포로 처우까지 알아서 합니다." : "세력을 다시 직접 다스립니다. 도시마다의 위임 방침은 그대로입니다." };
  };
  S.delegateOf = (state, c) => (c.delegate && c.delegate.fid === c.owner ? c.delegate.policy : null);
  S.setDelegate = function (state, cid, policy) {
    const c = state.cities[cid];
    if (!c || !c.owner || c.owner !== state.playerForce) return { ok: false, msg: "아군 도시가 아닙니다." };
    if (policy && !S.DELEGATE[policy]) return { ok: false, msg: "알 수 없는 방침입니다." };
    c.delegate = policy ? { fid: c.owner, policy } : null;
    if (!policy) return { ok: true, msg: `${c.name}을 직접 다스립니다.` };
    if (policy === "full") {
      return { ok: true, msg: `${c.name}을 태수에게 모두 맡겼습니다(완전 위임). 다음 달부터 출진과 수송, 계략까지 알아서 합니다.` +
        (S.spectating(state) ? " 모든 도시를 맡겼으므로 외교와 황실, 포로 처우도 알아서 합니다." : "") };
    }
    const did = S.govern(state, c);
    return { ok: true, msg: `${c.name}을 태수에게 맡겼습니다(${S.DELEGATE[policy]}).` + (did ? ` 이번 달: ${did}` : "") };
  };
  // Returns a short account of what was done, or "".
  S.govern = function (state, c) {
    const policy = S.delegateOf(state, c);
    if (!policy) return "";
    if (policy === "full") {
      // The governor does whatever a computer force would do with this city.
      const fid = c.owner;
      state._plans = state._plans || {};
      state._plans[fid] = planCampaign(state, fid);
      const armies = (state.marches || []).filter((m) => m.kind === "army" && m.origin === c.id).length;
      tryAttack(state, c, () => {});
      const sent = (state.marches || []).filter((m) => m.kind === "army" && m.origin === c.id);
      if (c.owner === fid) domestic(state, c, fid);
      return sent.length > armies ? `${S.ro(S.placeName(state, sent[sent.length - 1].target))} 출진` : "";
    }
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
      const foodMonths = c.troops > 0 ? c.food / S.foodUse(c.troops) : 99;
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
    S.diploAI(state, fid);
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
      // With every city wholly delegated the force runs itself, like any other.
      if (S.spectating(state)) S.runAI(state, state.playerForce, onEvent);
      else for (const c of S.citiesOf(state, state.playerForce)) {
        const did = S.govern(state, c);
        if (did) S.addLog(state, `${c.name} 위임(${S.DELEGATE[S.delegateOf(state, c)]}): ${did}`, "info");
      }
    }
    S.runMarches(state, onEvent);
    S.runBattles(state, onEvent);
    if (state.over) return null;
    S.runEnvoys(state, onEvent);
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
