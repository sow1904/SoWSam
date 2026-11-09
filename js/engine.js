// Game rules. No DOM access here so the engine can also run headless in node.
(function (S) {
  S.STAT_NAMES = S.ABILITY_NAMES;

  S.COST = { reward: 100, woo: 100, draftPerTroop: 0.1 };
  S.MAX_SORTIE_OFFICERS = 3;
  S.MIN_SORTIE_TROOPS = 500;

  // ---------- random ----------
  function rand(state) {
    // mulberry32, state.seed is advanced on every call
    let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  S.rand = rand;
  S.chance = (state, pct) => rand(state) * 100 < pct;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Korean particle that fits the last syllable: S.josa("조조군", "이", "가") -> "조조군이".
  S.josa = function (word, withFinal, withoutFinal) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
    return word + (hasFinal ? withFinal : withoutFinal);
  };
  S.clamp = clamp;

  // ---------- setup ----------
  function parseOfficer(line) {
    const [name, at] = line.split(/\s+/);
    const a = S.ABILITIES[name];
    if (!a) throw new Error("no abilities for " + name);
    return Object.assign({ name, city: at.slice(1) }, a);
  }

  // Lifespan options. Each January (and once at the start) an officer old
  // enough rolls a die; 1-12 means death in that month, anything else means
  // another year. A month already past at the start of a game is survived.
  // "real" (사실 수명): natural deaths roll a d72 from two years before the
  // recorded death year; those who died by violence are safe until 48, then
  // roll a d144.
  // "virtual" (가상 수명): everyone lives to 99, then rolls a d12.
  S.LIFESPAN = { real: "사실 수명", virtual: "가상 수명" };
  S.VIOLENT_SAFE_AGE = 48;
  S.NATURAL_EARLY_YEARS = 2;
  S.VIRTUAL_AGE = 99;

  function lifeDice(state, o, life) {
    o.born = life.born;
    if (state.lifespan === "virtual") [o.rollFrom, o.die] = [life.born + S.VIRTUAL_AGE, 12];
    else if (life.violent) [o.rollFrom, o.die] = [life.born + S.VIOLENT_SAFE_AGE, 144];
    else [o.rollFrom, o.die] = [life.died - S.NATURAL_EARLY_YEARS, 72];
  }
  function rollDeath(state, o) {
    if (o.death || o.status === "dead" || state.year < o.rollFrom) return;
    const month = 1 + Math.floor(rand(state) * o.die);
    if (month >= state.month && month <= 12) o.death = { year: state.year, month };
  }

  S.age = (state, o) => state.year - o.born;

  S.newGame = function (scenario, playerForce, seed, opts) {
    opts = opts || {};
    const state = {
      version: 1,
      lifespan: opts.lifespan || "real",
      scenario: scenario.id,
      year: scenario.year,
      month: scenario.month,
      start: { year: scenario.year, month: scenario.month },
      seed: seed == null ? (Date.now() & 0x7fffffff) : seed,
      playerForce,
      forces: {},
      cities: {},
      officers: {},
      log: [],
      over: null,
      map: scenario.map,
      emperor: scenario.emperor || null, // city where the Han emperor is held
      pacts: {},
    };
    S.useMap(scenario.map);
    for (const [id, [name, prov, seat, lat, lon, size, gentry]] of Object.entries(S.MAP.cities)) {
      const [x, y] = S.project(lat, lon);
      state.cities[id] = {
        id, name, prov, seat, x, y, size,
        owner: null,
        gold: 200 + size * 100,
        food: 4000 + size * 2000,
        pop: 40000 + size * 40000,
        troops: 800 + size * 400,
        train: 30,
        farm: 80 + size * 60, farmMax: 200 + size * 160,
        trade: 80 + size * 60, tradeMax: 200 + size * 160,
        wall: 150 + size * 80, wallMax: 300 + size * 180,
        order: 50,
        posts: S.emptyPosts(),
        gentry, gentryBase: gentry,
        consent: 50,
        retainers: 0,
      };
      state.cities[id].manpower = Math.round(S.manpowerMax(state.cities[id]) * 0.6);
    }
    let n = 0;
    const addOfficer = (line, force, loyalty) => {
      const o = parseOfficer(line);
      if (!state.cities[o.city]) throw new Error("unknown city " + o.city + " for " + o.name);
      const life = S.PEOPLE[o.name];
      if (!life) throw new Error("no birth/death years for " + o.name);
      if (life.died < state.year && !life.violent) throw new Error(o.name + " died before the scenario starts");
      const id = "o" + n++;
      const young = state.year - life.born < S.ADULT_AGE;
      state.officers[id] = Object.assign(o, {
        id, loyalty,
        force: young ? null : force,
        joins: young ? force : null, // force a young officer joins on coming of age
        status: young ? "young" : force ? "serving" : "free",
        hidden: !force || young,
        done: false,
        captor: null,
      });
      lifeDice(state, state.officers[id], life);
      rollDeath(state, state.officers[id]);
      return id;
    };
    for (const f of scenario.forces) {
      const ids = f.officers.map((line, i) => addOfficer(line, f.id, i === 0 ? 100 : 80 + Math.floor(n % 5) * 4));
      if (state.officers[ids[0]].status !== "serving") throw new Error("ruler of " + f.id + " is too young");
      state.forces[f.id] = { id: f.id, name: f.name, color: f.color, ruler: ids[0], alive: true, weariness: 0 };
      for (const [cid, troops] of Object.entries(f.cities)) {
        const c = state.cities[cid];
        c.owner = f.id;
        c.troops = troops;
        c.train = 55;
        c.gold = 600 + c.size * 150;
        c.food = troops * 2 + 5000;
        c.order = 60;
        c.consent = 55;
        c.retainers = Math.round(troops * (c.gentry / 100) * (1 - c.consent / 100));
        // Existing administration: low-grade clerks in every development post.
        for (const k of S.DEV_KEYS) c.posts[k] = { type: "clerk", tier: 0 };
      }
    }
    for (const line of scenario.free) addOfficer(line, null, 0);
    for (const [a, b] of scenario.alliances || []) S.makePact(state, a, b);
    for (const [cid, over] of Object.entries(scenario.cityState || {})) {
      const c = state.cities[cid];
      Object.assign(c, over);
      c.manpower = Math.round(S.manpowerMax(c) * 0.6);
    }
    S.courtInit(state, scenario.hanFavor);
    S.addLog(state, `${state.year}년 ${state.month}월, ${scenario.title} 시나리오가 시작되었습니다.`, "sys");
    return state;
  };

  // ---------- queries ----------
  // The first year is a truce: the AI only expands into vacant cities.
  S.TRUCE_MONTHS = 12;
  S.monthsElapsed = (state) => (state.year - state.start.year) * 12 + state.month - state.start.month;
  S.inTruce = (state) => S.monthsElapsed(state) < S.TRUCE_MONTHS;

  S.addLog = function (state, text, kind) {
    state.log.push({ y: state.year, m: state.month, text, kind: kind || "info" });
    if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
  };

  // Each scenario has its own map (the set of commanderies changes over time).
  // useMap makes one active; the engine works on a single game at a time.
  let ADJ = {};
  S.useMap = function (id) {
    S.MAP = S.MAPS[id];
    if (!S.MAP) throw new Error("unknown map " + id);
    ADJ = {};
    for (const [a, b] of S.MAP.roads) {
      (ADJ[a] = ADJ[a] || []).push(b);
      (ADJ[b] = ADJ[b] || []).push(a);
    }
  };
  S.neighbors = (cid) => ADJ[cid] || [];

  // Provinces: which commanderies make up each, and who holds how many.
  S.provinceCities = (state, prov) => Object.values(state.cities).filter((c) => c.prov === prov);
  S.provinceHold = function (state, prov, fid) {
    const cs = S.provinceCities(state, prov);
    return { held: cs.filter((c) => c.owner === fid).length, total: cs.length };
  };
  // Provinces a force holds in full.
  S.fullProvinces = (state, fid) =>
    Object.keys(S.PROVINCES).filter((p) => { const h = S.provinceHold(state, p, fid); return h.total && h.held === h.total; });

  S.officersIn = (state, cid, filter) =>
    Object.values(state.officers).filter((o) => o.city === cid && (!filter || filter(o)));
  S.serving = (state, cid) => S.officersIn(state, cid, (o) => o.status === "serving");
  S.idle = (state, cid) => S.serving(state, cid).filter((o) => !o.done && !S.postOf(state, o));
  S.visibleFree = (state, cid) => S.officersIn(state, cid, (o) => o.status === "free" && !o.hidden);
  S.captivesIn = (state, cid, force) =>
    S.officersIn(state, cid, (o) => o.status === "captive" && o.captor === force);
  S.citiesOf = (state, fid) => Object.values(state.cities).filter((c) => c.owner === fid);
  S.officersOf = (state, fid) => Object.values(state.officers).filter((o) => o.force === fid && o.status === "serving");
  S.isRuler = (state, o) => o.force && state.forces[o.force] && state.forces[o.force].ruler === o.id;
  S.forceName = (state, fid) => (fid && state.forces[fid] ? state.forces[fid].name + "군" : "공백지");
  S.best = (list, key) => list.reduce((a, b) => (b[key] > a[key] ? b : a), list[0]);

  // ---------- domestic posts ----------
  // Each city has four development posts. An officer or a hired clerk develops
  // the post every month; an empty post makes it decline. The fifth post,
  // 둔전 (military farms), is an optional policy: it grows food and settles
  // state-controlled households, slowly breaking the local gentry's hold.
  S.POSTS = {
    farm: { label: "농업", statLabel: "정치", stat: (o) => o.pol },
    trade: { label: "상업", statLabel: "정치", stat: (o) => o.pol },
    wall: { label: "성벽", statLabel: "용병", stat: (o) => o.cmd },
    order: { label: "치안", statLabel: "무력·용병", stat: (o) => Math.round((o.war + o.cmd) / 2) },
    tuntian: { label: "둔전", statLabel: "정치", stat: (o) => o.pol, policy: true },
  };
  S.POST_KEYS = Object.keys(S.POSTS);
  S.DEV_KEYS = ["farm", "trade", "wall", "order"];
  // Monthly effect of a 둔전 holder: food, and gentry strength lost per month.
  S.tuntianEffect = (ability) => ({ food: ability * 4, gentry: ability / 300 });
  S.CLERKS = [
    { name: "하급 관리", ability: 35, salary: 10 },
    { name: "중급 관리", ability: 50, salary: 25 },
    { name: "상급 관리", ability: 65, salary: 50 },
  ];
  S.emptyPosts = () => ({ farm: null, trade: null, wall: null, order: null, tuntian: null });

  const postMax = (c, kind) => (kind === "order" ? 100 : c[kind + "Max"]);

  // Monthly change a holder with the given ability would bring.
  S.postGain = (kind, ability) => (kind === "order" ? 1 + Math.round(ability / 25) : 2 + Math.round(ability / 8));
  S.postPenalty = (c, kind) => {
    if (kind === "tuntian") return 0;
    if (kind === "order") return -3;
    if (kind === "wall") return -Math.max(3, Math.round(c.wallMax * 0.01));
    return -Math.max(5, Math.round(c[kind + "Max"] * 0.02));
  };
  S.postAbility = function (state, post, kind) {
    if (!post) return null;
    if (post.type === "clerk") return S.CLERKS[post.tier].ability;
    return S.POSTS[kind].stat(state.officers[post.id]);
  };
  S.postDelta = function (state, c, kind) {
    const ab = S.postAbility(state, c.posts[kind], kind);
    return ab == null ? S.postPenalty(c, kind) : S.postGain(kind, ab);
  };
  S.postOf = function (state, o) {
    const c = state.cities[o.city];
    if (!c || !c.posts) return null;
    return S.POST_KEYS.find((k) => c.posts[k] && c.posts[k].type === "officer" && c.posts[k].id === o.id) || null;
  };
  S.salaries = (c) => S.POST_KEYS.reduce((sum, k) => sum + (c.posts[k] && c.posts[k].type === "clerk" ? S.CLERKS[c.posts[k].tier].salary : 0), 0);
  S.balance = (c) => S.income(c) - S.upkeep(c) - S.salaries(c);

  // spec: {type:"officer", id} | {type:"clerk", tier} | null (leave empty)
  S.assignPost = function (state, cid, kind, spec) {
    const c = state.cities[cid];
    if (!c || !S.POSTS[kind]) return fail("잘못된 담당입니다.");
    const label = S.POSTS[kind].label;
    const old = c.posts[kind];
    if (spec && spec.type === "officer") {
      const o = state.officers[spec.id];
      if (!o || o.status !== "serving" || o.city !== cid || o.force !== c.owner) return fail("이 도시의 무장이 아닙니다.");
      if (o.done) return fail(`${o.name}은(는) 이번 달 이미 행동해 임명할 수 없습니다.`);
      const prev = S.postOf(state, o);
      if (prev === kind) return fail("이미 이 담당입니다.");
      if (prev) c.posts[prev] = null;
      c.posts[kind] = { type: "officer", id: o.id };
    } else if (spec && spec.type === "clerk") {
      if (!S.CLERKS[spec.tier]) return fail("잘못된 관리 등급입니다.");
      c.posts[kind] = { type: "clerk", tier: spec.tier };
    } else {
      c.posts[kind] = null;
    }
    // An officer taken off a post spends the month handing over the work.
    if (old && old.type === "officer" && !(spec && spec.type === "officer" && spec.id === old.id)) {
      const o = state.officers[old.id];
      if (o) o.done = true;
    }
    const who = !spec ? "공석" : spec.type === "clerk" ? S.CLERKS[spec.tier].name : state.officers[spec.id].name;
    return { ok: true, msg: `${c.name}의 ${label} 담당을 ${who}(으)로 정했습니다.` };
  };

  // Drop posts whose officer is no longer serving in the city.
  function validatePosts(state, c) {
    for (const k of S.POST_KEYS) {
      const p = c.posts[k];
      if (p && p.type === "officer") {
        const o = state.officers[p.id];
        if (!o || o.status !== "serving" || o.city !== c.id || o.force !== c.owner) c.posts[k] = null;
      }
    }
  }

  function runPosts(state, c) {
    validatePosts(state, c);
    for (const k of S.DEV_KEYS) {
      c[k] = clamp(c[k] + S.postDelta(state, c, k), 0, postMax(c, k));
    }
    const ab = S.postAbility(state, c.posts.tuntian, "tuntian");
    if (ab != null) {
      const e = S.tuntianEffect(ab);
      c.food += Math.round(e.food);
      c.gentry = Math.max(5, c.gentry - e.gentry);
    } else if (c.gentry < c.gentryBase + 10) {
      // Without state farms the great families slowly reclaim the land.
      c.gentry = Math.min(c.gentryBase + 10, c.gentry + 0.1);
    }
  }

  // ---------- gentry ----------
  // Part of a city's troops are retainers (부곡) of the local great families.
  // They defend their home city in full but will not march away from it.
  // New recruits in a gentry-heavy city partly become retainers, and over
  // time the count drifts toward gentry strength x (1 - consent).
  S.marchable = (c) => Math.max(0, c.troops - c.retainers);
  S.retainerShare = (c) => (c.gentry / 100) * (1 - c.consent / 100);
  S.consentTarget = function (state, c) {
    const w = c.owner ? state.forces[c.owner].weariness : 0;
    const tuntian = c.posts.tuntian ? 15 : 0;
    return clamp(25 + c.order * 0.45 - w * 0.4 - tuntian, 0, 100);
  };
  // Remove soldiers from a city, retainers in proportion.
  function loseTroops(c, n) {
    n = Math.min(c.troops, Math.max(0, Math.round(n)));
    if (c.troops > 0) c.retainers = Math.round(c.retainers * (1 - n / c.troops));
    c.troops -= n;
    return n;
  }
  function runGentry(state, c) {
    c.consent = clamp(c.consent + (S.consentTarget(state, c) - c.consent) * 0.1, 0, 100);
    // Retainers drift slowly toward what the families' power and goodwill imply.
    const target = c.troops * S.retainerShare(c);
    c.retainers = clamp(Math.round(c.retainers + (target - c.retainers) * 0.03), 0, c.troops);
  }
  // Defending gentry fight harder for a lord they support, less for one they do not.
  const gentryDefense = (c) => (c.owner ? 1 + (c.gentry * (c.consent - 30)) / 30000 : 1);

  // Pop-weighted gentry strength decides how a force raises its armies.
  S.regime = function (state, fid) {
    const cs = S.citiesOf(state, fid);
    const pop = cs.reduce((s, c) => s + c.pop, 0) || 1;
    const gentry = cs.reduce((s, c) => s + c.gentry * c.pop, 0) / pop;
    const troops = cs.reduce((s, c) => s + c.troops, 0);
    const retainers = cs.reduce((s, c) => s + c.retainers, 0);
    const label = gentry >= 55 ? "호족연합형" : gentry <= 25 ? "중앙집권형" : "부곡형";
    return { label, gentry: Math.round(gentry), retainerShare: troops ? retainers / troops : 0 };
  };

  // ---------- officer commands ----------
  // Each returns {ok, msg}. On success the officer has used their action this month.
  function act(state, oid, cid) {
    const o = state.officers[oid];
    const c = state.cities[cid];
    if (!o || !c) return [null, null, "잘못된 대상입니다."];
    if (o.status !== "serving" || o.city !== cid || o.force !== c.owner) return [null, null, "이 도시의 무장이 아닙니다."];
    if (o.done) return [null, null, `${o.name}은(는) 이번 달 이미 행동했습니다.`];
    if (S.postOf(state, o)) return [null, null, `${o.name}은(는) 담당 업무 중입니다.`];
    return [o, c, null];
  }
  const fail = (msg) => ({ ok: false, msg });

  S.preview = {
    train: (o) => 5 + Math.round(o.cmd / 8),
    // War-weary people answer the call less willingly.
    draft: (state, c, o) => {
      const w = c.owner ? state.forces[c.owner].weariness : 0;
      const base = Math.min(c.pop * 0.02, 1500 + o.cmd * 15) * (0.6 + c.order / 250) * (1 - w / 200);
      return Math.max(0, Math.round(Math.min(base, c.manpower)));
    },
  };

  S.draft = function (state, oid, cid) {
    const [o, c, err] = act(state, oid, cid);
    if (err) return fail(err);
    const amount = S.preview.draft(state, c, o);
    const cost = Math.ceil(amount * S.COST.draftPerTroop);
    if (amount < 100) return fail("동원할 수 있는 장정이 없습니다. 병역 인구가 회복되기를 기다려야 합니다.");
    if (c.gold < cost) return fail(`금이 부족합니다. (필요 ${cost})`);
    c.gold -= cost;
    c.train = Math.round((c.train * c.troops + 10 * amount) / (c.troops + amount));
    c.troops += amount;
    c.retainers += Math.round(amount * S.retainerShare(c));
    c.pop -= amount;
    c.manpower -= amount;
    c.order = Math.max(0, c.order - 4);
    S.addWeariness(state, c.owner, (amount / forcePop(state, c.owner)) * 400);
    o.done = true;
    return { ok: true, msg: `${o.name}이(가) ${c.name}에서 병사 ${amount}명을 모았습니다.` };
  };

  S.drill = function (state, oid, cid) {
    const [o, c, err] = act(state, oid, cid);
    if (err) return fail(err);
    if (c.troops <= 0) return fail("훈련할 병사가 없습니다.");
    if (c.train >= 100) return fail("훈련도가 이미 최대입니다.");
    const gain = Math.min(100 - c.train, S.preview.train(o));
    c.train += gain;
    o.done = true;
    return { ok: true, msg: `${o.name}이(가) ${c.name}의 병사를 훈련해 훈련도가 ${gain} 올랐습니다.` };
  };

  S.wooPreview = (o) => 4 + Math.round(o.speech / 12);
  S.woo = function (state, oid, cid) {
    const [o, c, err] = act(state, oid, cid);
    if (err) return fail(err);
    if (c.consent >= 100) return fail("호족 협력이 이미 최대입니다.");
    if (c.gold < S.COST.woo) return fail("금이 부족합니다.");
    c.gold -= S.COST.woo;
    const gain = Math.min(100 - c.consent, S.wooPreview(o));
    c.consent += gain;
    o.done = true;
    return { ok: true, msg: `${o.name}이(가) ${c.name}의 호족들을 찾아가 협력이 ${gain} 올랐습니다.` };
  };

  S.search = function (state, oid, cid) {
    const [o, c, err] = act(state, oid, cid);
    if (err) return fail(err);
    o.done = true;
    const hidden = S.officersIn(state, cid, (x) => x.status === "free" && x.hidden);
    for (const h of hidden) {
      if (S.chance(state, S.searchChance(o))) {
        h.hidden = false;
        return { ok: true, found: h.id, msg: `${o.name}이(가) 재야의 인재 ${h.name}을(를) 찾아냈습니다!` };
      }
    }
    if (S.chance(state, 40)) {
      const g = 30 + Math.floor(rand(state) * 120);
      c.gold += g;
      return { ok: true, msg: `${o.name}이(가) 탐색 중 금 ${g}을(를) 얻었습니다.` };
    }
    return { ok: true, msg: `${o.name}이(가) ${c.name}을(를) 탐색했지만 아무것도 찾지 못했습니다.` };
  };

  S.searchChance = (o) => Math.min(100, Math.round(25 + o.wit / 2));

  S.recruitChance = function (state, recruiter, target) {
    const court = S.courtRecruitBonus(state, recruiter, target);
    if (target.status === "free") return clamp(Math.round(35 + recruiter.speech / 2 + court), 5, 95);
    if (target.status === "captive") {
      if (target.force && state.forces[target.force] && state.forces[target.force].ruler === target.id) return 0;
      return clamp(Math.round(30 + recruiter.speech / 3 - (target.loyalty - 50) * 0.6 + court), 3, 90);
    }
    return 0;
  };

  S.recruit = function (state, oid, cid, targetId) {
    const [o, c, err] = act(state, oid, cid);
    if (err) return fail(err);
    const t = state.officers[targetId];
    if (!t || t.city !== cid) return fail("대상이 이 도시에 없습니다.");
    const valid = (t.status === "free" && !t.hidden) || (t.status === "captive" && t.captor === c.owner);
    if (!valid) return fail("등용할 수 없는 대상입니다.");
    const pct = S.recruitChance(state, o, t);
    if (pct <= 0) return fail(`${t.name}은(는) 등용할 수 없습니다.`);
    o.done = true;
    if (S.chance(state, pct)) {
      const old = t.force;
      t.loyalty = t.status === "free" ? 75 : 65;
      t.force = c.owner;
      t.status = "serving";
      t.hidden = false;
      t.captor = null;
      t.done = true;
      const from = old && old !== c.owner ? ` (${S.forceName(state, old)} 출신)` : "";
      return { ok: true, joined: true, msg: `${o.name}의 설득으로 ${t.name}이(가) ${S.forceName(state, c.owner)}에 합류했습니다!${from}` };
    }
    return { ok: true, joined: false, msg: `${o.name}이(가) ${t.name}을(를) 설득했지만 거절당했습니다.` };
  };

  S.reward = function (state, cid, targetId) {
    const c = state.cities[cid];
    const t = state.officers[targetId];
    if (!t || t.status !== "serving" || t.city !== cid || t.force !== c.owner) return fail("포상할 수 없는 대상입니다.");
    if (S.isRuler(state, t)) return fail("군주에게는 포상할 수 없습니다.");
    if (t.loyalty >= 100) return fail("충성이 이미 최대입니다.");
    if (t.rewarded) return fail("이번 달에 이미 포상했습니다.");
    if (c.gold < S.COST.reward) return fail("금이 부족합니다.");
    c.gold -= S.COST.reward;
    const gain = Math.min(100 - t.loyalty, 6 + Math.floor(rand(state) * 6));
    t.loyalty += gain;
    t.rewarded = true;
    return { ok: true, msg: `${t.name}에게 금 ${S.COST.reward}을(를) 하사해 충성이 ${gain} 올랐습니다.` };
  };

  S.release = function (state, cid, targetId) {
    const t = state.officers[targetId];
    const c = state.cities[cid];
    if (!t || t.status !== "captive" || t.city !== cid || t.captor !== c.owner) return fail("석방할 수 없는 대상입니다.");
    freeCaptive(state, t);
    return { ok: true, msg: `${t.name}을(를) 석방했습니다.` };
  };

  // Send a released/escaped captive back to their own force if it still exists.
  function freeCaptive(state, t) {
    t.captor = null;
    const home = t.force && state.forces[t.force] && state.forces[t.force].alive ? S.citiesOf(state, t.force) : [];
    if (home.length) {
      t.status = "serving";
      t.city = home[Math.floor(rand(state) * home.length)].id;
    } else {
      t.status = "free";
      t.force = null;
      t.hidden = false;
    }
  }

  // Move officers and optionally troops/gold/food to an adjacent own city.
  S.move = function (state, cid, targetCid, oids, troops, gold, food) {
    const c = state.cities[cid];
    const t = state.cities[targetCid];
    if (!t || !S.neighbors(cid).includes(targetCid)) return fail("인접한 도시가 아닙니다.");
    if (t.owner !== c.owner) return fail("자기 세력 도시로만 이동할 수 있습니다.");
    if (!oids.length) return fail("이동할 무장을 골라 주세요.");
    for (const id of oids) {
      const [, , err] = act(state, id, cid);
      if (err) return fail(err);
    }
    troops = Math.floor(troops || 0);
    if (troops > S.marchable(c)) return fail(`호족 사병은 고향을 떠나지 않습니다. 보낼 수 있는 병력은 ${S.marchable(c)}명입니다.`);
    troops = clamp(troops, 0, c.troops);
    gold = clamp(Math.floor(gold || 0), 0, c.gold);
    food = clamp(Math.floor(food || 0), 0, c.food);
    if (troops) {
      t.train = Math.round((t.train * t.troops + c.train * troops) / (t.troops + troops));
      t.troops += troops;
      c.troops -= troops;
    }
    c.gold -= gold; t.gold += gold;
    c.food -= food; t.food += food;
    const names = oids.map((id) => state.officers[id]);
    for (const o of names) { o.city = targetCid; o.done = true; }
    const cargo = [troops && `병사 ${troops}`, gold && `금 ${gold}`, food && `군량 ${food}`].filter(Boolean).join(", ");
    return { ok: true, msg: `${names.map((o) => o.name).join(", ")}이(가) ${t.name}(으)로 이동했습니다.${cargo ? " (" + cargo + ")" : ""}` };
  };

  // Officers alone travel to any own city reachable through own territory.
  S.reachable = function (state, cid) {
    const owner = state.cities[cid].owner;
    const dist = { [cid]: 0 };
    const queue = [cid];
    while (queue.length) {
      const id = queue.shift();
      for (const n of S.neighbors(id)) {
        if (!(n in dist) && state.cities[n].owner === owner) { dist[n] = dist[id] + 1; queue.push(n); }
      }
    }
    delete dist[cid];
    return dist;
  };
  S.relocate = function (state, cid, targetCid, oids) {
    const t = state.cities[targetCid];
    if (!t || !(targetCid in S.reachable(state, cid))) return fail("아군 영토로 이어진 도시로만 이동할 수 있습니다.");
    if (!oids.length) return fail("이동할 무장을 골라 주세요.");
    for (const id of oids) {
      const [, , err] = act(state, id, cid);
      if (err) return fail(err);
    }
    const list = oids.map((id) => state.officers[id]);
    for (const o of list) { o.city = targetCid; o.done = true; }
    return { ok: true, msg: `${list.map((o) => o.name).join(", ")}이(가) ${t.name}(으)로 이동했습니다.` };
  };

  // ---------- schemes ----------
  // A schemer's 모략 against the best 지략 among the target city's officers.
  S.COST.rumor = 100;
  S.COST.discord = 150;
  S.schemeTargets = (state, cid) => S.neighbors(cid).map((n) => state.cities[n])
    .filter((t) => t.owner && t.owner !== state.cities[cid].owner && !S.allied(state, state.cities[cid].owner, t.owner));
  S.cityWit = function (state, cid) {
    const t = state.cities[cid];
    const guards = S.serving(state, cid).filter((o) => o.force === t.owner);
    return guards.length ? S.best(guards, "wit") : null;
  };
  // Kin of the ruler cannot be turned against the family.
  const isKin = (state, o) => {
    const k = S.CLAN[o.name];
    const r = state.forces[o.force] && S.CLAN[state.officers[state.forces[o.force].ruler].name];
    return !!(k && r && k.clan === r.clan);
  };
  S.rumorChance = function (state, o, cid) {
    const g = S.cityWit(state, cid);
    return clamp(Math.round(30 + o.plot * 0.7 - (g ? g.wit : 30) * 0.5), 5, 90);
  };
  S.discordChance = function (state, o, t) {
    if (t.status !== "serving" || S.isRuler(state, t) || isKin(state, t)) return 0;
    const g = S.cityWit(state, t.city);
    const wit = Math.max(t.wit, g ? g.wit : 0);
    return clamp(Math.round(20 + o.plot * 0.7 - wit * 0.5 - (t.loyalty - 50) * 0.4), 3, 85);
  };
  S.schemeEffect = {
    rumor: (o) => ({ order: 8 + Math.floor(o.plot / 8), consent: 3 + Math.floor(o.plot / 25) }),
    discord: (o) => 6 + Math.floor(o.plot / 8),
  };
  function schemeStart(state, oid, cid, targetCid, cost) {
    const [o, c, err] = act(state, oid, cid);
    if (err) return [null, null, null, err];
    const t = state.cities[targetCid];
    if (!t || !S.schemeTargets(state, cid).includes(t)) return [null, null, null, "인접한 적 도시만 노릴 수 있습니다."];
    if (c.gold < cost) return [null, null, null, `금이 부족합니다. (필요 ${cost})`];
    c.gold -= cost;
    o.done = true;
    return [o, c, t, null];
  }
  // Failed schemes may be seen through by the target city's sharpest mind.
  function schemeFailed(state, o, t, what) {
    const g = S.cityWit(state, t.id);
    const seen = g && S.chance(state, g.wit / 2);
    if (seen && t.owner === state.playerForce) S.addLog(state, `${S.josa(g.name, "이", "가")} ${S.forceName(state, o.force)} ${o.name}의 ${what}을(를) 간파했습니다.`, "info");
    return { ok: true, success: false, msg: seen
      ? `${S.josa(g.name, "이", "가")} ${o.name}의 ${what}을(를) 간파했습니다.`
      : `${o.name}의 ${S.josa(what, "이", "가")} ${t.name}에서 먹혀들지 않았습니다.` };
  }
  // 유언비어: unsettle the people and the great families of an enemy city.
  S.rumor = function (state, oid, cid, targetCid) {
    const [o, , t, err] = schemeStart(state, oid, cid, targetCid, S.COST.rumor);
    if (err) return fail(err);
    if (!S.chance(state, S.rumorChance(state, o, targetCid))) return schemeFailed(state, o, t, "유언비어");
    const e = S.schemeEffect.rumor(o);
    const order = Math.min(t.order, e.order);
    const consent = Math.min(t.consent, e.consent);
    t.order -= order;
    t.consent -= consent;
    if (t.owner === state.playerForce) S.addLog(state, `${t.name}에 흉흉한 소문이 돌아 치안이 ${order}, 호족 협력이 ${consent} 떨어졌습니다.`, "warn");
    return { ok: true, success: true, msg: `${o.name}의 유언비어로 ${t.name}의 치안이 ${order}, 호족 협력이 ${consent} 떨어졌습니다.` };
  };
  // 이간: shake an enemy officer's loyalty to their lord.
  S.discord = function (state, oid, cid, targetId) {
    const v = state.officers[targetId];
    if (!v || v.status !== "serving") return fail("이간할 수 없는 대상입니다.");
    if (S.isRuler(state, v) || isKin(state, v)) return fail(`${v.name}에게는 이간이 통하지 않습니다.`);
    const [o, , t, err] = schemeStart(state, oid, cid, v.city, S.COST.discord);
    if (err) return fail(err);
    if (!S.chance(state, S.discordChance(state, o, v))) return schemeFailed(state, o, t, "이간");
    const drop = Math.min(v.loyalty, S.schemeEffect.discord(o));
    v.loyalty -= drop;
    if (v.force === state.playerForce) S.addLog(state, `${S.josa(v.name, "이", "가")} 주군을 의심하는 소문에 흔들려 충성이 ${drop} 떨어졌습니다.`, "warn");
    return { ok: true, success: true, msg: `${o.name}의 이간으로 ${S.forceName(state, v.force)} ${v.name}의 충성이 ${drop} 떨어졌습니다. (충성 ${v.loyalty})` };
  };

  // ---------- manpower and war weariness ----------
  // Men of fighting age who can still be called up. Soldiers who die are gone
  // for good; the pool refills slowly from the population.
  S.manpowerMax = (c) => Math.round(c.pop * 0.12);
  S.manpowerRegen = (c) => Math.round(c.pop * 0.001 * (0.5 + c.order / 200));
  function returnManpower(c, n) {
    c.manpower = Math.min(S.manpowerMax(c), c.manpower + Math.round(n));
  }
  function forcePop(state, fid) {
    return Math.max(50000, S.citiesOf(state, fid).reduce((s, c) => s + c.pop, 0));
  }
  S.addWeariness = function (state, fid, amount) {
    const f = fid && state.forces[fid];
    if (f) f.weariness = clamp(f.weariness + amount, 0, 100);
  };
  S.wearinessLabel = (w) => (w < 20 ? "안정" : w < 40 ? "피로" : w < 60 ? "염전" : "한계");

  // ---------- battle ----------
  // A side fights with its best 용병 leading the troops, its best 군략 as the
  // commander's plan, and its best 무력 at the front.
  function sideStats(officers, fallback) {
    if (!officers.length) return { cmd: fallback, war: fallback, strat: fallback };
    return {
      cmd: S.best(officers, "cmd").cmd,
      war: S.best(officers, "war").war,
      strat: S.best(officers, "strat").strat,
    };
  }

  function power(troops, st, train, wallBonus) {
    return troops * (0.6 + st.cmd / 250) * (0.6 + train / 250) * (0.9 + st.war / 1000 + st.strat / 1000) * wallBonus;
  }
  const wallBonus = (c) => 1 + c.wall / 2000;
  // How often a schemer tries a ruse in battle, and how often it works.
  S.ruseAttempt = (p) => clamp(p.plot - 40, 0, 60);
  S.ruseChance = (p, w) => clamp(Math.round(40 + (p.plot - (w ? w.wit : 30)) * 1.5), 10, 90);

  // Rough strength comparison used by the UI and the AI.
  S.estimate = function (state, fromCid, targetCid, oids, troops) {
    const from = state.cities[fromCid];
    const t = state.cities[targetCid];
    const att = sideStats(oids.map((id) => state.officers[id]), 30);
    const def = sideStats(S.serving(state, targetCid).filter((o) => o.force === t.owner), t.owner ? 40 : 35);
    const a = power(troops, att, from.train, 1);
    const d = power(t.troops, def, t.train, wallBonus(t) * gentryDefense(t));
    return { att: Math.round(a), def: Math.round(d), ratio: d > 0 ? a / d : 99 };
  };

  S.attack = function (state, cid, targetCid, oids, troops) {
    const c = state.cities[cid];
    const t = state.cities[targetCid];
    if (!t || !S.neighbors(cid).includes(targetCid)) return fail("인접한 도시만 공격할 수 있습니다.");
    if (t.owner === c.owner) return fail("자기 세력 도시는 공격할 수 없습니다.");
    if (S.allied(state, c.owner, t.owner)) return fail(`${S.josa(S.forceName(state, t.owner), "과", "와")}는 동맹 중입니다. 먼저 동맹을 파기해야 합니다.`);
    if (!oids.length || oids.length > S.MAX_SORTIE_OFFICERS) return fail(`무장을 1~${S.MAX_SORTIE_OFFICERS}명 골라 주세요.`);
    for (const id of oids) {
      const [, , err] = act(state, id, cid);
      if (err) return fail(err);
    }
    troops = Math.floor(troops);
    if (troops < S.MIN_SORTIE_TROOPS || troops > S.marchable(c)) {
      return fail(`출진 병력은 ${S.MIN_SORTIE_TROOPS}~${S.marchable(c)}명이어야 합니다. 호족 사병 ${c.retainers}명은 출진하지 않습니다.`);
    }
    const foodNeed = Math.ceil(troops / 10);
    if (c.food < foodNeed) return fail(`군량이 부족합니다. (필요 ${foodNeed})`);

    const attackers = oids.map((id) => state.officers[id]);
    const defenders = S.serving(state, targetCid).filter((o) => o.force === t.owner);
    attackers.forEach((o) => (o.done = true));
    c.troops -= troops;
    c.food -= foodNeed;

    const atkForce = c.owner;
    const defForce = t.owner;
    const report = { lines: [], attackerWon: false, from: c.name, to: t.name, captured: [], attacker: atkForce, defender: defForce };
    const say = (s) => report.lines.push(s);
    const att = sideStats(attackers, 30);
    const def = sideStats(defenders, defForce ? 40 : 35);
    let A = troops, D = t.troops;
    const A0 = A, D0 = Math.max(D, 1);
    let aMorale = 1, dMorale = 1;
    say(`${S.forceName(state, atkForce)} ${A}명이 ${t.name}(${S.forceName(state, defForce)}, 수비 ${D}명)을(를) 공격합니다.`);

    // Duel between the strongest warriors, when both sides have one.
    if (defenders.length && S.chance(state, 30)) {
      const a = S.best(attackers, "war");
      const d = S.best(defenders, "war");
      if (a.war >= 70 || d.war >= 70) {
        const roll = (a.war - d.war) / 2 + (rand(state) - 0.5) * 40;
        if (Math.abs(roll) < 4) say(`일기토! ${a.name}과(와) ${d.name}이(가) 맞붙었으나 승부가 나지 않았습니다.`);
        else if (roll > 0) { dMorale = 0.85; say(`일기토! ${a.name}이(가) ${d.name}을(를) 물리쳤습니다. 수비군의 사기가 떨어집니다.`); }
        else { aMorale = 0.85; say(`일기토! ${d.name}이(가) ${a.name}을(를) 물리쳤습니다. 공격군의 사기가 떨어집니다.`); }
      }
    }

    // Battle stratagems: each side's best 모략 tries a ruse; the other side's best 지략 may see through it.
    const ruse = (us, them, names, foes) => {
      if (!us.length) return 0;
      const p = S.best(us, "plot");
      if (!S.chance(state, S.ruseAttempt(p))) return 0;
      const w = them.length ? S.best(them, "wit") : null;
      const name = names[Math.floor(rand(state) * names.length)];
      if (!S.chance(state, S.ruseChance(p, w))) {
        say(w ? `${p.name}의 ${name}! 그러나 ${S.josa(w.name, "이", "가")} 간파했습니다.` : `${p.name}의 ${S.josa(name, "이", "가")} 실패했습니다.`);
        return 0;
      }
      const loss = Math.round(foes * (0.03 + p.plot / 2000));
      say(`${p.name}의 ${S.josa(name, "이", "가")} 적중했습니다! 적 ${loss}명이 쓰러지고 사기가 떨어집니다.`);
      return loss;
    };
    const hitD = Math.min(D, ruse(attackers, defenders, ["화공", "매복", "위계", "야습"], D));
    if (hitD) { D -= hitD; dMorale *= 0.92; }
    const hitA = Math.min(A, ruse(defenders, attackers, ["야습", "매복", "역습"], A));
    if (hitA) { A -= hitA; aMorale *= 0.92; }

    const wb = wallBonus(t) * gentryDefense(t);
    for (let round = 1; round <= 8 && A > 0 && D > 0; round++) {
      const aPow = power(A, att, c.train, 1) * aMorale;
      const dPow = power(D, def, t.train, wb) * dMorale;
      const lossD = Math.min(D, Math.round(aPow * 0.09 * (0.85 + rand(state) * 0.3)));
      const lossA = Math.min(A, Math.round(dPow * 0.09 * (0.85 + rand(state) * 0.3)));
      D -= lossD; A -= lossA;
      t.wall = Math.max(0, t.wall - Math.round(lossD * 0.02));
      say(`${round}차 교전: 공격군 -${lossA} (${A}), 수비군 -${lossD} (${D})`);
      if (D <= 0 || D < D0 * 0.2) { report.attackerWon = true; break; }
      if (A < A0 * 0.3) break;
    }
    if (!report.attackerWon && D > 0 && A > 0 && D < A * 0.25) report.attackerWon = true;

    const survivors = Math.max(0, A);
    // Casualties: about a third were wounded or scattered and drift back home;
    // the rest are lost to the manpower pool for good.
    const killedA = A0 - survivors;
    const killedD = t.troops - Math.max(0, D);
    returnManpower(c, killedA * 0.3);
    returnManpower(t, killedD * 0.3);
    S.addWeariness(state, atkForce, (killedA / forcePop(state, atkForce)) * 1500 + (report.attackerWon ? -2 : 3));
    if (defForce) S.addWeariness(state, defForce, (killedD / forcePop(state, defForce)) * 1500 + (report.attackerWon ? 5 : -1));
    if (report.attackerWon) {
      say(`${t.name} 함락! ${S.forceName(state, atkForce)}이(가) 성을 차지했습니다.`);
      // Defending officers escape to an adjacent friendly city or are captured.
      const escapes = defForce ? S.neighbors(targetCid).filter((n) => state.cities[n].owner === defForce) : [];
      for (const d of defenders) {
        if (escapes.length && S.chance(state, S.isRuler(state, d) ? 85 : 55)) {
          d.city = escapes[Math.floor(rand(state) * escapes.length)];
          say(`${d.name}은(는) ${state.cities[d.city].name}(으)로 달아났습니다.`);
        } else {
          d.status = "captive";
          d.captor = atkForce;
          report.captured.push(d.id);
          say(`${d.name}을(를) 사로잡았습니다.`);
        }
      }
      // Captives the defender held are freed.
      for (const p of S.officersIn(state, targetCid, (x) => x.status === "captive" && x.captor === defForce)) {
        if (p.force === atkForce) { p.status = "serving"; p.captor = null; say(`포로였던 ${p.name}이(가) 풀려나 합류했습니다.`); }
        else freeCaptive(state, p);
      }
      const remainingD = Math.max(0, D);
      t.owner = atkForce;
      t.posts = S.emptyPosts();
      t.troops = survivors + Math.floor(remainingD * 0.3);
      // Surrendered locals stay as retainers; the families distrust the new lord.
      t.retainers = Math.floor(remainingD * 0.3);
      t.consent = Math.min(t.consent, 30);
      t.train = c.train;
      t.gold = Math.floor(t.gold / 2);
      t.food = Math.floor(t.food / 2);
      t.order = Math.max(10, t.order - 20);
      attackers.forEach((o) => (o.city = targetCid));
      if (defForce) checkForce(state, defForce, report);
    } else {
      loseTroops(t, t.troops - Math.max(0, D));
      c.troops += survivors;
      say(`공격 실패. 공격군은 ${survivors}명을 이끌고 ${c.name}(으)로 물러났습니다.`);
    }
    const kind = report.attackerWon ? "war" : "warfail";
    S.addLog(state, report.attackerWon
      ? `${S.forceName(state, atkForce)}이(가) ${S.forceName(state, defForce)}의 ${t.name}을(를) 함락했습니다.`
      : `${S.forceName(state, atkForce)}의 ${t.name} 공격이 실패했습니다.`, kind);
    return { ok: true, report, msg: report.lines[report.lines.length - 1] };
  };

  // Family first, in order of succession; otherwise the most capable officer.
  S.pickHeir = function (ruler, heirs) {
    const k = S.CLAN[ruler.name];
    const kin = k ? heirs.filter((o) => S.CLAN[o.name] && S.CLAN[o.name].clan === k.clan) : [];
    if (kin.length) return kin.reduce((a, b) => (S.CLAN[b.name].rank < S.CLAN[a.name].rank ? b : a));
    return heirs.reduce((a, b) => (b.cmd + b.pol > a.cmd + a.pol ? b : a));
  };

  // After losing a city: pick a new ruler if needed, or destroy the force.
  function checkForce(state, fid, report) {
    const f = state.forces[fid];
    const cities = S.citiesOf(state, fid);
    const ruler = state.officers[f.ruler];
    if (!cities.length) {
      f.alive = false;
      for (const o of Object.values(state.officers)) {
        if (o.force !== fid) continue;
        if (o.status === "serving") { o.status = "free"; o.force = null; o.hidden = false; }
      }
      const msg = `${f.name}군이 멸망했습니다.`;
      if (report) report.lines.push(msg);
      S.addLog(state, msg, "fall");
      return;
    }
    if (ruler.status !== "serving") {
      const heirs = S.officersOf(state, fid);
      if (!heirs.length) {
        // No one left to lead; the cities fall vacant.
        cities.forEach((c) => (c.owner = null));
        return checkForce(state, fid, report);
      }
      const heir = S.pickHeir(ruler, heirs);
      f.ruler = heir.id;
      heir.loyalty = 100;
      f.name = heir.name;
      const how = ruler.status === "dead" ? "세상을 떠나" : "사로잡혀";
      const msg = `${S.josa(ruler.name, "이", "가")} ${how} ${S.josa(heir.name, "이", "가")} 세력을 이어받았습니다.`;
      if (report) report.lines.push(msg);
      S.addLog(state, msg, "fall");
    }
  }

  // ---------- turn ----------
  // Monthly gold income and troop upkeep (1 gold per 100 soldiers).
  S.income = (c) => Math.round((c.trade / 3 + c.pop / 5000) * (0.5 + c.order / 200));
  S.upkeep = (c) => Math.ceil(c.troops / 100);

  S.endMonth = function (state) {
    const harvest = state.month === 9;
    for (const c of Object.values(state.cities)) {
      const eff = 0.5 + c.order / 200;
      if (c.owner) {
        runPosts(state, c);
        c.gold += S.balance(c);
        if (c.gold < 0) {
          // Clerks quit first when wages cannot be paid, then soldiers desert.
          const quit = S.POST_KEYS.filter((k) => c.posts[k] && c.posts[k].type === "clerk");
          quit.forEach((k) => (c.posts[k] = null));
          if (quit.length && c.owner === state.playerForce) S.addLog(state, `${c.name}의 금이 바닥나 관리 ${quit.length}명이 그만두었습니다.`, "warn");
          c.gold = 0;
          const lost = loseTroops(c, Math.ceil(c.troops * 0.05));
          if (c.owner === state.playerForce) S.addLog(state, `${c.name}의 금이 바닥나 봉급을 받지 못한 병사 ${lost}명이 달아났습니다.`, "warn");
        }
        if (harvest) c.food += Math.round((c.farm * 10 + c.pop / 50) * eff);
        c.food -= Math.ceil(c.troops / 50);
        if (c.food < 0) {
          c.food = 0;
          const lost = loseTroops(c, Math.ceil(c.troops * 0.1));
          c.order = Math.max(0, c.order - 10);
          if (c.owner === state.playerForce) S.addLog(state, `${c.name}의 군량이 바닥나 병사 ${lost}명이 달아났습니다.`, "warn");
        }
        if (state.month % 3 === 0 && c.order > 30) c.pop = Math.round(c.pop * (1 + (c.order - 30) / 4000));
        wearinessEffects(state, c);
        runGentry(state, c);
      } else {
        // Vacant cities slowly rebuild local militia.
        const cap = 1000 + c.size * 600;
        if (c.troops < cap) c.troops = Math.min(cap, c.troops + 60);
      }
    }
    for (const c of Object.values(state.cities)) returnManpower(c, S.manpowerRegen(c));
    // Loyalty and defection.
    for (const o of Object.values(state.officers)) {
      o.done = false;
      o.rewarded = false;
      if (o.status !== "serving" || S.isRuler(state, o)) continue;
      if (o.loyalty < 40 && S.chance(state, (40 - o.loyalty) / 2)) {
        const f = o.force;
        o.status = "free";
        o.force = null;
        o.hidden = false;
        S.addLog(state, `${o.name}이(가) ${S.forceName(state, f)}을(를) 떠나 재야로 돌아갔습니다.`, f === state.playerForce ? "warn" : "info");
      } else if (S.chance(state, 10 + Math.max(0, state.forces[o.force].weariness - 50) / 2)) {
        o.loyalty = Math.max(0, o.loyalty - 1);
      }
    }
    // Captives occasionally escape.
    for (const o of Object.values(state.officers)) {
      if (o.status === "captive" && S.chance(state, 3)) {
        freeCaptive(state, o);
        S.addLog(state, `포로 ${o.name}이(가) 탈출했습니다.`, "info");
      }
    }
    // Weariness fades in peacetime.
    for (const f of Object.values(state.forces)) {
      const before = f.weariness;
      f.weariness = Math.max(0, f.weariness - (1 + f.weariness * 0.03));
      if (f.id === state.playerForce && before >= 40 && f.weariness < 40) S.addLog(state, "백성들의 전쟁 피로가 조금 가라앉았습니다.", "sys");
    }
    runDeaths(state);
    state.month++;
    if (state.month > 12) { state.month = 1; state.year++; }
    if (state.month === 1) {
      runComingOfAge(state);
      for (const o of Object.values(state.officers)) rollDeath(state, o);
    }
    runPacts(state);
    S.runCourt(state);
    if (harvest) S.addLog(state, "가을 수확으로 각 도시에 군량이 들어왔습니다.", "sys");
    S.checkOver(state);
  };

  // ---------- diplomacy ----------
  // An alliance means the two forces will not attack each other. It lasts until
  // one side breaks it; a broken alliance cannot be renewed for a year.
  const pactKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  S.PACT_COOLDOWN = 12;
  S.PACT_COST = 200;
  S.allied = (state, a, b) => {
    if (!a || !b || a === b) return false;
    const p = state.pacts[pactKey(a, b)];
    return !!(p && p.active);
  };
  S.allies = (state, fid) => Object.keys(state.forces).filter((f) => S.allied(state, fid, f));
  S.makePact = function (state, a, b) {
    state.pacts[pactKey(a, b)] = { active: true, since: S.monthsElapsed(state) };
  };
  S.pactCooldown = function (state, a, b) {
    const p = state.pacts[pactKey(a, b)];
    if (!p || p.active || p.brokenAt == null) return 0;
    return Math.max(0, p.brokenAt + S.PACT_COOLDOWN - S.monthsElapsed(state));
  };
  // Breaking faith costs the breaker public order everywhere.
  S.breakPact = function (state, fid, other) {
    if (!S.allied(state, fid, other)) return fail("동맹 관계가 아닙니다.");
    const p = state.pacts[pactKey(fid, other)];
    p.active = false;
    p.brokenAt = S.monthsElapsed(state);
    for (const c of S.citiesOf(state, fid)) c.order = Math.max(0, c.order - 5);
    const msg = `${S.josa(S.forceName(state, fid), "이", "가")} ${S.josa(S.forceName(state, other), "과", "와")}의 동맹을 파기했습니다.`;
    S.addLog(state, msg, fid === state.playerForce || other === state.playerForce ? "warn" : "info");
    return { ok: true, msg };
  };
  S.forcePower = (state, fid) => S.citiesOf(state, fid).reduce((s, c) => s + c.troops, 0);
  const touches = S.touches = (state, a, b) => S.citiesOf(state, a).some((c) => S.neighbors(c.id).some((n) => state.cities[n].owner === b));
  // How likely a computer force is to accept an alliance.
  S.pactChance = function (state, from, to) {
    if (!state.forces[to].alive || S.allied(state, from, to) || S.pactCooldown(state, from, to)) return 0;
    const envoys = S.officersOf(state, from);
    const envoy = envoys.length ? S.best(envoys, "speech") : null;
    const mine = S.forcePower(state, from);
    const theirs = S.forcePower(state, to) || 1;
    let p = 15 + (envoy ? envoy.speech / 3 : 0);
    if (mine >= theirs) p += 15; // a strong friend is worth having
    if (state.forces[to].weariness > 30) p += 10;
    if (touches(state, from, to) && theirs > mine * 1.5) p -= 25; // they would rather conquer
    // A common threat: a third force on their border that outmatches them.
    const threat = Object.keys(state.forces).some((f) => f !== from && f !== to && state.forces[f].alive &&
      !S.allied(state, to, f) && touches(state, to, f) && S.forcePower(state, f) > theirs);
    if (threat) p += 15;
    return clamp(Math.round(p), 5, 85);
  };
  // The player sends an envoy with a gift from their richest city.
  S.proposePact = function (state, from, to) {
    state.pactTried = state.pactTried || {};
    if (state.pactTried[to] === S.monthsElapsed(state)) return fail("이번 달에는 이미 사신을 보냈습니다.");
    const cd = S.pactCooldown(state, from, to);
    if (cd) return fail(`동맹이 깨진 지 얼마 되지 않았습니다. ${cd}개월 뒤에 다시 제의할 수 있습니다.`);
    if (S.allied(state, from, to)) return fail("이미 동맹 중입니다.");
    const purse = S.citiesOf(state, from).reduce((a, b) => (b.gold > a.gold ? b : a));
    if (purse.gold < S.PACT_COST) return fail(`예물로 보낼 금 ${S.PACT_COST}이 있는 도시가 없습니다.`);
    const chance = S.pactChance(state, from, to);
    purse.gold -= S.PACT_COST;
    state.pactTried[to] = S.monthsElapsed(state);
    if (S.chance(state, chance)) {
      S.makePact(state, from, to);
      S.addLog(state, `${S.josa(S.forceName(state, from), "과", "와")} ${S.josa(S.forceName(state, to), "이", "가")} 동맹을 맺었습니다.`,
        from === state.playerForce ? "sys" : "info");
      return { ok: true, msg: `${S.josa(S.forceName(state, to), "이", "가")} 동맹을 받아들였습니다.` };
    }
    return { ok: true, msg: `${S.josa(S.forceName(state, to), "이", "가")} 동맹 제의를 거절했습니다. (예물 금 ${S.PACT_COST})` };
  };
  // A computer force drops an alliance once the ally is all that stands between
  // it and further conquest, and now and then turns on a far weaker ally.
  function runPacts(state) {
    for (const [key, p] of Object.entries(state.pacts)) {
      if (!p.active) continue;
      const [a, b] = key.split("|");
      if (!state.forces[a].alive || !state.forces[b].alive) { p.active = false; continue; }
      for (const [me, other] of [[a, b], [b, a]]) {
        if (me === state.playerForce || !S.allied(state, me, other) || !touches(state, me, other)) continue;
        const otherFront = S.citiesOf(state, me).some((c) => S.neighbors(c.id).some((n) => {
          const o = state.cities[n].owner;
          return o !== me && !S.allied(state, me, o);
        }));
        const weak = S.citiesOf(state, me).length >= 3 * S.citiesOf(state, other).length &&
          S.forcePower(state, me) > 3 * S.forcePower(state, other);
        if ((!otherFront && S.chance(state, 10)) || (weak && S.chance(state, 2))) S.breakPact(state, me, other);
      }
    }
  }

  // ---------- lifespans ----------
  function runDeaths(state) {
    for (const o of Object.values(state.officers)) {
      if (o.status === "dead" || !o.death || o.death.year !== state.year || o.death.month !== state.month) continue;
      const wasRuler = S.isRuler(state, o) && o.status === "serving";
      const fid = o.force;
      const prev = o.status;
      o.status = "dead";
      o.hidden = true;
      if (prev === "young") continue;
      const mine = fid && fid === state.playerForce;
      const where = prev === "serving" ? `${S.forceName(state, fid)}의 ` : prev === "captive" ? "포로 " : "재야의 ";
      if (!wasRuler) S.addLog(state, `${where}${S.josa(o.name, "이", "가")} ${S.age(state, o)}세로 세상을 떠났습니다.`, mine ? "warn" : "info");
      if (wasRuler) checkForce(state, fid, null);
    }
  }

  function runComingOfAge(state) {
    for (const o of Object.values(state.officers)) {
      if (o.status !== "young" || S.age(state, o) < S.ADULT_AGE) continue;
      const f = o.joins && state.forces[o.joins];
      if (f && f.alive) {
        // Join the family force: at home if it holds the city, else beside the ruler.
        const home = state.cities[o.city];
        if (!home || home.owner !== f.id) o.city = state.officers[f.ruler].city;
        o.status = "serving";
        o.force = f.id;
        o.hidden = false;
        o.loyalty = 90;
        S.addLog(state, `${S.josa(o.name, "이", "가")} 장성하여 ${S.forceName(state, f.id)}에 합류했습니다.`, f.id === state.playerForce ? "sys" : "info");
      } else {
        o.status = "free";
        o.force = null;
        o.hidden = true;
      }
      o.joins = null;
    }
  }

  // A weary realm loses public order, and unrest can break out.
  function wearinessEffects(state, c) {
    const w = state.forces[c.owner].weariness;
    if (w <= 30) return;
    c.order = Math.max(0, c.order - Math.round((w - 30) / 25));
    if (w > 60 && c.order < 25 && S.chance(state, w / 10)) {
      const lost = loseTroops(c, Math.ceil(c.troops * 0.15));
      c.pop = Math.round(c.pop * 0.98);
      c.order = Math.max(0, c.order - 5);
      S.addLog(state, `전쟁에 지친 ${c.name} 백성들이 들고일어났습니다. 병사 ${lost}명이 흩어졌습니다.`, c.owner === state.playerForce ? "warn" : "info");
    }
  }

  // Bring saves from older versions up to date.
  S.migrate = function (state) {
    S.useMap(state.map);
    for (const c of Object.values(state.cities)) {
      if (!c.posts) c.posts = S.emptyPosts();
      if (c.manpower == null) c.manpower = Math.round(S.manpowerMax(c) * 0.6);
      if (c.gentry == null) {
        c.gentry = c.gentryBase = S.MAP.cities[c.id][6];
        c.consent = 50;
        c.retainers = 0;
      }
      if (!("tuntian" in c.posts)) c.posts.tuntian = null;
    }
    for (const f of Object.values(state.forces)) if (f.weariness == null) f.weariness = 0;
    if (!state.pacts) state.pacts = {};
    // Older saves used 통솔/무력/지력/정치.
    for (const o of Object.values(state.officers)) {
      if (o.cmd != null || !S.ABILITIES[o.name]) continue;
      Object.assign(o, S.ABILITIES[o.name]);
      delete o.lead;
      delete o.int;
    }
    // Older saves: lifespan mode "natural" used d6/d12 and "history" fixed years.
    if (state.lifespan !== "real" && state.lifespan !== "virtual") {
      state.lifespan = "real";
      for (const o of Object.values(state.officers)) {
        const life = S.PEOPLE[o.name];
        if (!life) continue;
        if (o.status !== "dead" && o.death && o.death.year > state.year) o.death = null;
        lifeDice(state, o, life);
      }
    }
    if (!state.start) state.start = { year: state.year, month: state.month };
    const sc = state.scenario === S.SCENARIO_191.id ? S.SCENARIO_191 : {};
    if (state.emperor === undefined) state.emperor = sc.emperor || null;
    if (!state.han) S.courtInit(state, state.emperor && state.emperor === sc.emperor ? sc.hanFavor : undefined);
    return state;
  };

  S.checkOver = function (state) {
    if (state.over) return state.over;
    const alive = Object.values(state.forces).filter((f) => S.citiesOf(state, f.id).length > 0);
    for (const f of Object.values(state.forces)) if (!alive.includes(f)) f.alive = false;
    if (state.playerForce && !state.forces[state.playerForce].alive) state.over = { result: "lose" };
    else {
      const owners = new Set(Object.values(state.cities).map((c) => c.owner));
      if (owners.size === 1 && !owners.has(null)) state.over = { result: "win", force: [...owners][0] };
    }
    return state.over;
  };

  S.totals = function (state, fid) {
    const cs = S.citiesOf(state, fid);
    return {
      cities: cs.length,
      officers: S.officersOf(state, fid).length,
      troops: cs.reduce((s, c) => s + c.troops, 0),
      gold: cs.reduce((s, c) => s + c.gold, 0),
      food: cs.reduce((s, c) => s + c.food, 0),
      manpower: cs.reduce((s, c) => s + c.manpower, 0),
    };
  };
})(globalThis.SAM = globalThis.SAM || {});
