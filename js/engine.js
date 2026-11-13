// Game rules. No DOM access here so the engine can also run headless in node.
(function (S) {
  S.STAT_NAMES = S.ABILITY_NAMES;

  S.COST = { reward: 100, woo: 100, draftPerTroop: 0.1 };
  // Food a garrison eats in a month: one for every 25 soldiers. A middling
  // city's harvest then feeds about ten thousand men, so a great army has to
  // be fed from several cities.
  S.foodUse = (troops) => Math.ceil(troops / 25);
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
  // Numbers are read by their last digit (영 일 이 삼 사 오 육 칠 팔 구).
  const DIGIT_FINAL = [1, 8, 0, 1, 0, 0, 1, 8, 8, 0]; // 0 none, 1 a final, 8 a final ㄹ
  function finalOf(word) {
    word = String(word);
    const last = word[word.length - 1];
    if (last >= "0" && last <= "9") return DIGIT_FINAL[+last];
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    if (code < 0 || code > 11171) return 0;
    const f = code % 28;
    return f === 0 ? 0 : f === 8 ? 8 : 1;
  }
  S.josa = (word, withFinal, withoutFinal) => String(word) + (finalOf(word) ? withFinal : withoutFinal);
  // 으로/로: words ending in ㄹ take 로 as well.
  S.ro = (word) => String(word) + (finalOf(word) === 1 ? "으로" : "로");
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
      fiction: opts.fiction !== false, // figures of the novel take part
      women: opts.women !== false, // women take part
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
      marches: [],
    };
    S.useMap(scenario.map);
    S.GAME = state; // the game in play, for rules that only know a city
    for (const [id, [name, prov, seat, lat, lon, size, gentry]] of Object.entries(S.MAP.cities)) {
      const [x, y] = S.placeXY(id, lat, lon);
      state.cities[id] = {
        id, name: S.cityName(id, scenario.year), prov: S.cityProv(id, scenario.year),
        jun: S.cityJun(id, scenario.year), seat: S.citySeat(id, scenario.year), x, y, size,
        owner: null,
        gold: 200 + size * 100,
        food: 4000 + size * 2000,
        pop: 40000 + size * 40000,
        troops: 1200 + size * 700,
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
      S.initRes(state.cities[id]);
      state.cities[id].unit = S.startMix(state.cities[id]);
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
    // The roster (data/roster.js): those the scenario gives to a force, then
    // the rest as free talent at home. Figures of the novel and women can be
    // left out; those dead before the scenario starts are.
    const placed = new Set(Object.values(state.officers).map((o) => o.name));
    const wanted = (name) => {
      const p = S.PEOPLE[name];
      if (!p) throw new Error("unknown person " + name);
      if (placed.has(name) || p.died < state.year) return false;
      return !(p.fiction && opts.fiction === false) && !(p.female && opts.women === false);
    };
    for (const [fid, names] of Object.entries(scenario.join || {})) {
      const f = state.forces[fid];
      for (const name of names.split(/\s+/).filter(wanted)) {
        const home = S.PEOPLE[name].home;
        const city = state.cities[home] && state.cities[home].owner === fid ? home : state.officers[f.ruler].city;
        addOfficer(`${name} @${city}`, fid, 80 + Math.floor(n % 5) * 4);
        placed.add(name);
      }
    }
    if (scenario.freeRest) {
      for (const [name, p] of Object.entries(S.PEOPLE)) if (p.home && wanted(name)) addOfficer(`${name} @${p.home}`, null, 0);
    }
    for (const [a, b] of scenario.alliances || []) S.makePact(state, a, b);
    for (const [cid, over] of Object.entries(scenario.cityState || {})) {
      const c = state.cities[cid];
      Object.assign(c, over);
      c.manpower = Math.round(S.manpowerMax(c) * 0.6);
    }
    S.courtInit(state, scenario.hanFavor);
    S.initForts(state);
    S.initCapitals(state);
    S.addLog(state, `${state.year}년 ${state.month}월, ${scenario.title} 시나리오가 시작되었습니다.`, "sys");
    return state;
  };

  // ---------- queries ----------
  // The first year is a truce: the AI only expands into vacant cities.
  S.TRUCE_MONTHS = 12;
  S.monthsElapsed = (state) => (state.year - state.start.year) * 12 + state.month - state.start.month;
  S.inTruce = (state) => S.monthsElapsed(state) < S.TRUCE_MONTHS;

  S.addLog = function (state, text, kind) {
    state.logN = (state.logN || 0) + 1;
    state.log.push({ y: state.year, m: state.month, d: state.day || 1, n: state.logN, text, kind: kind || "info" });
    if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
  };

  // Each scenario has its own map (the set of commanderies changes over time).
  // useMap makes one active; the engine works on a single game at a time.
  let ADJ = {};
  S.useMap = function (id) {
    S.MAP = S.MAPS[id];
    if (!S.MAP) throw new Error("unknown map " + id);
    S.MAP_SIZE = S.MAP.terrain ? { w: S.MAP.terrain.w, h: S.MAP.terrain.h } : { w: 2060, h: 1840 };
    ADJ = {};
    // Neighbouring commanderies. A road that ends at a stronghold makes its
    // city a neighbour of the cities the stronghold's own road joins.
    const sites = (S.FORT_SITES && S.FORT_SITES[id]) || {};
    const ends = (x) => (S.MAP.cities[x] ? [x] : sites[x] ? S.siteRoad(sites[x]) : []);
    const join = (a, b) => {
      if (a === b) return;
      if (!(ADJ[a] = ADJ[a] || []).includes(b)) ADJ[a].push(b);
      if (!(ADJ[b] = ADJ[b] || []).includes(a)) ADJ[b].push(a);
    };
    for (const [a, b] of S.MAP.roads) for (const x of ends(a)) for (const y of ends(b)) join(x, y);
  };
  S.neighbors = (cid) => ADJ[cid] || [];

  // Provinces: which commanderies make up each, and who holds how many.
  S.provinceCities = (state, prov) => S.cityList(state).filter((c) => c.prov === prov);
  S.provinceHold = function (state, prov, fid) {
    const cs = S.provinceCities(state, prov);
    return { held: cs.filter((c) => c.owner === fid).length, total: cs.length };
  };
  // Provinces a force holds in full.
  S.fullProvinces = (state, fid) =>
    Object.keys(S.PROVINCES).filter((p) => { const h = S.provinceHold(state, p, fid); return h.total && h.held === h.total; });

  // Officers by city. Looking them up was the busiest work of a turn, so
  // the lookup is indexed; whatever moves an officer to another city calls
  // S.officersMoved to have the index rebuilt.
  const byCity = new WeakMap();
  S.officersMoved = (state) => byCity.delete(state);
  function cityIndex(state) {
    let ix = byCity.get(state);
    if (!ix) {
      ix = new Map();
      for (const o of Object.values(state.officers)) {
        let list = ix.get(o.city);
        if (!list) ix.set(o.city, (list = []));
        list.push(o);
      }
      byCity.set(state, ix);
    }
    return ix;
  }
  S.officersIn = function (state, cid, filter) {
    const list = cityIndex(state).get(cid) || [];
    if (S.CHECK_INDEX) {
      const scan = Object.values(state.officers).filter((o) => o.city === cid);
      if (scan.length !== list.length || scan.some((o, i) => o !== list[i])) throw new Error("officer index stale at " + cid);
    }
    return filter ? list.filter(filter) : list.slice();
  };
  S.serving = (state, cid) => S.officersIn(state, cid, (o) => o.status === "serving" && !o.transit);
  S.idle = (state, cid) => S.serving(state, cid).filter((o) => !o.done && !S.postOf(state, o));
  S.visibleFree = (state, cid) => S.officersIn(state, cid, (o) => o.status === "free" && !o.hidden);
  S.captivesIn = (state, cid, force) =>
    S.officersIn(state, cid, (o) => o.status === "captive" && o.captor === force);
  // The cities as a list. A game's set of cities never changes, so the list
  // is made once (this lookup runs many thousands of times a month).
  const cityLists = new WeakMap();
  S.cityList = function (state) {
    let list = cityLists.get(state.cities);
    if (!list) cityLists.set(state.cities, (list = Object.values(state.cities)));
    return list;
  };
  S.citiesOf = function (state, fid) {
    const out = [];
    for (const c of S.cityList(state)) if (c.owner === fid) out.push(c);
    return out;
  };
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
  S.postGain = (kind, ability) => (kind === "order" ? 1 + Math.round(ability / 25) : 1 + Math.round(ability / 16));
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

  // A date as one number (year, month, day), to tell when a post was filled.
  S.dayStamp = (state) => state.year * 10000 + state.month * 100 + (state.day || 1);
  // Can an officer leave a post now, and is he then free to act this month?
  // On the day he was appointed nothing has been done yet, so he leaves
  // free. Later in the month he was appointed he must stay. On the 1st of a
  // later month last month's work is finished, so he leaves free; on other
  // days the handover takes the rest of the month.
  S.postRelease = function (state, post) {
    if (!post || post.type !== "officer") return { ok: true, free: true };
    const now = S.dayStamp(state), since = post.since || 0;
    if (since === now) return { ok: true, free: true };
    if (Math.floor(since / 100) === Math.floor(now / 100)) {
      const o = state.officers[post.id];
      return { ok: false, msg: `${o ? S.josa(o.name, "은", "는") : "이 무장은"} 이번 달에 임명되어 다음 달 1일부터 담당에서 뺄 수 있습니다.` };
    }
    return { ok: true, free: (state.day || 1) === 1 };
  };

  // spec: {type:"officer", id} | {type:"clerk", tier} | null (leave empty)
  S.assignPost = function (state, cid, kind, spec) {
    const c = state.cities[cid];
    if (!c || !S.POSTS[kind]) return fail("잘못된 담당입니다.");
    const label = S.POSTS[kind].label;
    const old = c.posts[kind];
    const replacing = old && old.type === "officer" && !(spec && spec.type === "officer" && spec.id === old.id);
    const out = replacing ? S.postRelease(state, old) : { ok: true, free: true };
    if (!out.ok) return fail(out.msg);
    if (spec && spec.type === "officer") {
      const o = state.officers[spec.id];
      if (!o || o.status !== "serving" || o.city !== cid || o.force !== c.owner) return fail("이 도시의 무장이 아닙니다.");
      if (o.done) return fail(`${S.josa(o.name, "은", "는")} 이번 달 이미 행동해 임명할 수 없습니다.`);
      const prev = S.postOf(state, o);
      if (prev === kind) return fail("이미 이 담당입니다.");
      if (prev) {
        const move = S.postRelease(state, c.posts[prev]);
        if (!move.ok) return fail(move.msg);
        c.posts[prev] = null;
      }
      c.posts[kind] = { type: "officer", id: o.id, since: S.dayStamp(state) };
    } else if (spec && spec.type === "clerk") {
      if (!S.CLERKS[spec.tier]) return fail("잘못된 관리 등급입니다.");
      c.posts[kind] = { type: "clerk", tier: spec.tier };
    } else {
      c.posts[kind] = null;
    }
    // An officer taken off a post mid-month spends the month handing over the work.
    if (replacing && !out.free) {
      const o = state.officers[old.id];
      if (o) o.done = true;
    }
    const who = !spec ? "공석" : spec.type === "clerk" ? S.CLERKS[spec.tier].name : state.officers[spec.id].name;
    return { ok: true, msg: `${c.name}의 ${label} 담당을 ${S.ro(who)} 정했습니다.` };
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
    return clamp(25 + c.order * 0.45 - w * 0.4 - tuntian + S.houseConsent(c), 0, 100);
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
    const c = S.place(state, cid);
    if (!o || !c) return [null, null, "잘못된 대상입니다."];
    if (o.status !== "serving" || o.city !== cid || o.force !== c.owner) return [null, null, "이 도시의 무장이 아닙니다."];
    if (o.done) return [null, null, `${S.josa(o.name, "은", "는")} 이번 달 이미 행동했습니다.`];
    if (S.postOf(state, o)) return [null, null, `${S.josa(o.name, "은", "는")} 담당 업무 중입니다.`];
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

  // Draft soldiers of one type. Each is armed from the city's stores.
  S.draft = function (state, oid, cid, unit) {
    const [o, c, err] = act(state, oid, cid);
    if (err) return fail(err);
    unit = unit || S.DEFAULT_UNIT;
    if (!S.canRaiseAt(state, c, unit)) return fail(`${c.name}에서는 ${S.unitName(unit)}을 징병할 수 없습니다.`);
    const men = S.preview.draft(state, c, o);
    if (men < 100) return fail("동원할 수 있는 장정이 없습니다. 병역 인구가 회복되기를 기다려야 합니다.");
    const amount = Math.min(men, S.armable(c, unit));
    if (amount < 100) return fail(`${S.unitName(unit)}을 무장시킬 자원이 부족합니다. (100명에 ${S.costText(unit, 100)})`);
    const cost = Math.ceil(amount * S.COST.draftPerTroop);
    if (c.gold < cost) return fail(`금이 부족합니다. (필요 ${cost})`);
    c.gold -= cost;
    S.payCost(c, unit, amount);
    c.train = Math.round((c.train * c.troops + 10 * amount) / (c.troops + amount));
    S.addTroops(c, unit, amount);
    c.retainers += Math.round(amount * S.retainerShare(c));
    c.pop -= amount;
    c.manpower -= amount;
    c.order = Math.max(0, c.order - 4);
    S.addWeariness(state, c.owner, (amount / forcePop(state, c.owner)) * 400);
    o.done = true;
    return { ok: true, msg: `${S.josa(o.name, "이", "가")} ${c.name}에서 ${S.unitName(unit)} ${amount}명을 모았습니다. (${S.costText(unit, amount)})` };
  };

  S.drill = function (state, oid, cid) {
    const [o, c, err] = act(state, oid, cid);
    if (err) return fail(err);
    if (c.troops <= 0) return fail("훈련할 병사가 없습니다.");
    if (c.train >= 100) return fail("훈련도가 이미 최대입니다.");
    const gain = Math.min(100 - c.train, S.preview.train(o));
    c.train += gain;
    o.done = true;
    return { ok: true, msg: `${S.josa(o.name, "이", "가")} ${c.name}의 병사를 훈련해 훈련도가 ${gain} 올랐습니다.` };
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
    return { ok: true, msg: `${S.josa(o.name, "이", "가")} ${c.name}의 호족들을 찾아가 협력이 ${gain} 올랐습니다.` };
  };

  S.search = function (state, oid, cid) {
    const [o, c, err] = act(state, oid, cid);
    if (err) return fail(err);
    o.done = true;
    const hidden = S.officersIn(state, cid, (x) => x.status === "free" && x.hidden);
    for (const h of hidden) {
      if (S.chance(state, S.searchChance(o))) {
        h.hidden = false;
        return { ok: true, found: h.id, msg: `${S.josa(o.name, "이", "가")} 재야의 인재 ${S.josa(h.name, "을", "를")} 찾아냈습니다!` };
      }
    }
    if (S.chance(state, 40)) {
      const g = 30 + Math.floor(rand(state) * 120);
      c.gold += g;
      return { ok: true, msg: `${S.josa(o.name, "이", "가")} 탐색 중 금 ${S.josa(g, "을", "를")} 얻었습니다.` };
    }
    return { ok: true, msg: `${S.josa(o.name, "이", "가")} ${S.josa(c.name, "을", "를")} 탐색했지만 아무것도 찾지 못했습니다.` };
  };

  S.searchChance = (o) => Math.min(100, Math.round(25 + o.wit / 2));

  S.recruitChance = function (state, recruiter, target) {
    const court = S.courtRecruitBonus(state, recruiter, target);
    if (target.status === "free") return clamp(Math.round(35 + recruiter.speech / 2 + court), 5, 95);
    if (target.status === "captive") {
      // A ruler taken captive serves no one: he is freed or put to death.
      if (target.lord || (target.force && state.forces[target.force] && state.forces[target.force].ruler === target.id)) return 0;
      const trait = S.hasTrait(target, "의리") ? -25 : S.hasTrait(target, "변심") ? 15 : 0;
      return clamp(Math.round(30 + recruiter.speech / 3 - (target.loyalty - 50) * 0.6 + court + trait), 3, 90);
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
    if (pct <= 0) return fail(`${S.josa(t.name, "은", "는")} 등용할 수 없습니다.`);
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
      return { ok: true, joined: true, msg: `${o.name}의 설득으로 ${S.josa(t.name, "이", "가")} ${S.forceName(state, c.owner)}에 합류했습니다!${from}` };
    }
    return { ok: true, joined: false, msg: `${S.josa(o.name, "이", "가")} ${S.josa(t.name, "을", "를")} 설득했지만 거절당했습니다.` };
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
    return { ok: true, msg: `${t.name}에게 금 ${S.josa(S.COST.reward, "을", "를")} 하사해 충성이 ${gain} 올랐습니다.` };
  };

  // ---------- captives (포로) ----------
  // A captive's fate is settled by whoever holds him. On the day he is taken
  // the captor may try three times to win him over (등용), each a fresh throw,
  // without spending any officer's command; then keep him (포로), let him go
  // (해방) or put him to death (참수). A captive who is kept can be recruited
  // later like anyone else, by an officer's monthly command, and freed or
  // killed from the city's 포로 menu.
  // A ruler taken captive (t.lord) is another matter: he will not serve and
  // is not kept. He is freed, and leads his force again if it still stands,
  // or he is put to death.
  S.CAPTIVE_TRIES = 3;
  S.captiveTries = (state, t) => (t.caught === S.today(state) ? Math.max(0, S.CAPTIVE_TRIES - (t.tries || 0)) : 0);
  const heldBy = (state, t, fid) => !!t && t.status === "captive" && (!fid || t.captor === fid);
  // Who speaks to the captive: the captor's best talker in that place.
  S.persuader = function (state, t) {
    const there = S.serving(state, t.city).filter((o) => o.force === t.captor);
    return there.length ? S.best(there, "speech") : null;
  };
  // The same odds as any recruiting of a captive, by the persuader's speech.
  S.persuadeChance = function (state, t) {
    const who = S.persuader(state, t);
    return who ? S.recruitChance(state, who, t) : 0;
  };
  S.persuade = function (state, targetId) {
    const t = state.officers[targetId];
    if (!heldBy(state, t)) return fail("포로가 아닙니다.");
    if (S.captiveTries(state, t) <= 0) return fail(`${S.josa(t.name, "은", "는")} 지금은 더 설득할 수 없습니다. 「등용」 명령으로 설득하십시오.`);
    const who = S.persuader(state, t);
    if (!who) return fail("그곳에 설득할 무장이 없습니다.");
    const pct = S.recruitChance(state, who, t);
    if (pct <= 0) return fail(`${S.josa(t.name, "은", "는")} 등용할 수 없습니다.`);
    t.tries = (t.tries || 0) + 1;
    if (S.chance(state, pct)) {
      const old = t.force;
      t.loyalty = 65;
      t.force = t.captor;
      t.status = "serving";
      t.hidden = false;
      t.captor = null;
      t.tries = 0;
      t.lord = false;
      t.done = true;
      const from = old && old !== t.force ? ` (${S.forceName(state, old)} 출신)` : "";
      return { ok: true, joined: true, msg: `${who.name}의 설득으로 포로 ${S.josa(t.name, "이", "가")} ${S.forceName(state, t.force)}에 합류했습니다!${from}` };
    }
    const left = S.captiveTries(state, t);
    return { ok: true, joined: false, msg: `${S.josa(who.name, "이", "가")} 포로 ${S.josa(t.name, "을", "를")} 설득했지만 거절당했습니다. (${left ? `${left}번 남음` : "더 설득할 수 없음"})` };
  };
  // Let a captive go: to his own force's nearest city, or out of office if
  // that force is no more.
  S.release = function (state, cid, targetId) {
    const t = state.officers[targetId];
    const c = S.place(state, cid);
    if (!c || !heldBy(state, t, c.owner) || t.city !== cid) return fail("해방할 수 없는 대상입니다.");
    freeCaptive(state, t);
    const where = t.status !== "serving" ? "재야로 돌아갔습니다"
      : S.isRuler(state, t) ? `${S.ro(S.placeName(state, t.city))} 돌아가 다시 세력을 이끕니다`
      : `${S.forceName(state, t.force)}의 ${S.ro(S.placeName(state, t.city))} 돌아갔습니다`;
    return { ok: true, msg: `포로 ${S.josa(t.name, "을", "를")} 해방했습니다. ${S.josa(t.name, "은", "는")} ${where}.` };
  };
  S.behead = function (state, cid, targetId) {
    const t = state.officers[targetId];
    const c = S.place(state, cid);
    if (!c || !heldBy(state, t, c.owner) || t.city !== cid) return fail("참수할 수 없는 대상입니다.");
    const from = t.force && state.forces[t.force] ? `${S.forceName(state, t.force)}의 ` : "";
    t.status = "dead";
    t.hidden = true;
    t.captor = null;
    t.lord = false;
    const msg = `${S.forceName(state, c.owner)}이 포로 ${from}${S.josa(t.name, "을", "를")} 참수했습니다.`;
    if (c.owner !== state.playerForce) S.addLog(state, msg, "info");
    return { ok: true, msg };
  };

  // Send a released or escaped captive back to the nearest city of his own
  // force, if it still stands.
  function freeCaptive(state, t) {
    t.captor = null;
    t.tries = 0;
    const lord = t.lord;
    t.lord = false;
    const home = t.force && state.forces[t.force] && state.forces[t.force].alive ? S.citiesOf(state, t.force) : [];
    if (home.length) {
      t.status = "serving";
      t.city = home.reduce((a, b) => (S.nodeKm(state, t.city, b.id) < S.nodeKm(state, t.city, a.id) ? b : a)).id;
      S.officersMoved(state);
      // A ruler set free takes his place again.
      const f = state.forces[t.force];
      if (lord && f.ruler !== t.id) {
        f.ruler = t.id;
        f.name = t.name;
        t.loyalty = 100;
        S.addLog(state, `풀려난 ${S.josa(t.name, "이", "가")} 돌아와 다시 세력을 이끕니다.`, t.force === state.playerForce ? "sys" : "info");
      }
    } else {
      t.status = "free";
      t.force = null;
      t.hidden = false;
      t.city = S.homeCity(state, t.city);
      S.officersMoved(state);
    }
  }

  // Send officers with troops, gold and food to another own city along roads
  // through own territory. The convoy travels at cargo speed.
  S.move = function (state, cid, targetCid, oids, troops, gold, food, res) {
    const c = S.place(state, cid);
    const t = S.place(state, targetCid);
    const claim = t && S.isFort(state, targetCid) && t.built && !t.owner && t.troops <= 0;
    if (!c || !t || (t.owner !== c.owner && !claim) || t === c) return fail("자기 세력의 다른 도시나 거점, 비어 있는 거점으로만 수송할 수 있습니다.");
    const route = S.route(state, cid, targetCid, "cargo");
    if (!route) return fail("아군 영토로 이어진 도시로만 수송할 수 있습니다.");
    if (!oids.length) return fail("수송을 이끌 무장을 골라 주세요.");
    for (const id of oids) {
      const [, , err] = act(state, id, cid);
      if (err) return fail(err);
    }
    troops = Math.floor(troops || 0);
    if (troops > S.marchable(c)) return fail(`호족 사병은 고향을 떠나지 않습니다. 보낼 수 있는 병력은 ${S.marchable(c)}명입니다.`);
    troops = clamp(troops, 0, c.troops);
    gold = clamp(Math.floor(gold || 0), 0, c.gold);
    food = clamp(Math.floor(food || 0), 0, c.food);
    const hasRes = res && S.RES_KEYS.some((k) => res[k] > 0);
    if (hasRes && (!c.res || !t.res)) return fail("자원은 도시에서 도시로만 옮길 수 있습니다.");
    c.troops -= troops; // a slice of every type alike
    c.gold -= gold;
    c.food -= food;
    const goods = hasRes ? S.takeRes(c, res) : null;
    const speed = troops || gold || food || goods ? "cargo" : "officer";
    // The escort eats on the way (from the city's stores, else from the load),
    // and the carriers eat part of the food they carry.
    const days = S.travelDays(route.km, speed);
    const cost = S.convoyFood(troops, food, days, S.pathRough(state, route.path));
    const fromCity = Math.min(c.food, cost.eaten);
    c.food -= fromCity;
    const sent = food;
    food = Math.max(0, food - cost.lost - (cost.eaten - fromCity));
    const m = S.launch(state, { kind: "move", force: c.owner, path: route.path, km: route.km, speed,
      officers: oids, troops, unit: troops ? S.garrisonUnit(c) : undefined, train: c.train, gold, food, res: goods, origin: cid, target: targetCid });
    const names = oids.map((id) => state.officers[id].name).join(", ");
    const cargo = [troops && `병사 ${troops}`, gold && `금 ${gold}`, sent && `군량 ${sent}`, goods && S.resText(goods)].filter(Boolean).join(", ");
    const used = cost.eaten + (sent - food) - (cost.eaten - fromCity);
    return { ok: true, march: m, msg: `${S.josa(names, "이", "가")} ${S.ro(t.name)} 떠났습니다. ${m.arrive - m.start}일 뒤 도착합니다.${cargo ? " (" + cargo + ")" : ""}` +
      (used > 0 ? ` 가는 길에 군량 ${used}을 먹습니다.` : "") };
  };

  // Officers alone travel faster, to any own city reachable through own territory.
  S.relocate = function (state, cid, targetCid, oids) {
    const t = S.place(state, targetCid);
    const claim = t && S.isFort(state, targetCid) && t.built && !t.owner && t.troops <= 0;
    const route = t && S.place(state, cid) && (t.owner === S.place(state, cid).owner || claim) && targetCid !== cid ? S.route(state, cid, targetCid, "officer") : null;
    if (!route) return fail("아군 영토로 이어진 도시로만 이동할 수 있습니다.");
    if (!oids.length) return fail("이동할 무장을 골라 주세요.");
    for (const id of oids) {
      const [, , err] = act(state, id, cid);
      if (err) return fail(err);
    }
    const m = S.launch(state, { kind: "move", force: t.owner, path: route.path, km: route.km, speed: "officer",
      officers: oids, origin: cid, target: targetCid });
    const names = oids.map((id) => state.officers[id].name).join(", ");
    return { ok: true, march: m, msg: `${S.josa(names, "이", "가")} ${S.ro(t.name)} 떠났습니다. ${route.days}일 뒤 도착합니다.` };
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
    const trait = { 의리: -20, 변심: 15, 야심: 10, 무욕: -5 };
    const mod = S.traitsOf(t).reduce((s, k) => s + (trait[k] || 0), 0);
    return clamp(Math.round(20 + o.plot * 0.7 - wit * 0.5 - (t.loyalty - 50) * 0.4 + mod), 3, 85);
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
    if (seen && t.owner === state.playerForce) S.addLog(state, `${S.josa(g.name, "이", "가")} ${S.forceName(state, o.force)} ${o.name}의 ${S.josa(what, "을", "를")} 간파했습니다.`, "info");
    return { ok: true, success: false, msg: seen
      ? `${S.josa(g.name, "이", "가")} ${o.name}의 ${S.josa(what, "을", "를")} 간파했습니다.`
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
  S.estimate = function (state, fromCid, targetCid, oids, troops, unit) {
    const from = S.place(state, fromCid);
    const t = S.place(state, targetCid);
    const att = sideStats(oids.map((id) => state.officers[id]), 30);
    const def = sideStats(S.serving(state, targetCid).filter((o) => o.force === t.owner), t.owner ? 40 : 35);
    const gu = S.garrisonUnit(t);
    const a = power(troops, att, from.train, 1) * S.unitMul(unit, gu, "siegeA", 1);
    const d = power(t.troops, def, t.train, wallBonus(t) * gentryDefense(t)) * S.unitMul(gu, unit, "siegeD", 1) * S.houseDefense(t, state);
    return { att: Math.round(a), def: Math.round(d), ratio: d > 0 ? a / d : 99 };
  };

  // What marches out: whole counts by type ({id: n}), all of one type (an
  // id), or a slice of every type alike (nothing given).
  S.sortieCounts = function (place, troops, unit) {
    if (unit && typeof unit === "object") {
      const out = {};
      for (const [k, v] of Object.entries(unit)) if (S.UNITS[k] && v >= 1) out[k] = Math.floor(v);
      return out;
    }
    if (typeof unit === "string") return { [unit]: Math.floor(troops) };
    return S.mixCounts(S.garrisonUnit(place), Math.min(Math.floor(troops), S.marchable(place)));
  };
  S.hasTroops = (place, counts) => {
    const have = S.available(place);
    return Object.entries(counts).every(([k, v]) => (have[k] || 0) >= v);
  };

  S.attack = function (state, cid, targetCid, oids, troops, unit) {
    const c = S.place(state, cid);
    const t = S.place(state, targetCid);
    const way = c && S.attackTargets(state, cid).find((x) => x.id === targetCid);
    if (!t || !way) return fail("길로 이어진 가장 가까운 적 도시나 거점만 공격할 수 있습니다.");
    if (S.besieged(state, cid)) return fail("포위당한 곳에서는 출진할 수 없습니다. 다른 도시에서 원군을 보내야 합니다.");
    if (t.owner === c.owner) return fail("자기 세력은 공격할 수 없습니다.");
    if (S.allied(state, c.owner, t.owner)) return fail(`${S.josa(S.forceName(state, t.owner), "과", "와")}는 동맹 중입니다. 먼저 동맹을 파기해야 합니다.`);
    if (!oids.length || oids.length > S.MAX_SORTIE_OFFICERS) return fail(`무장을 1~${S.MAX_SORTIE_OFFICERS}명 골라 주세요.`);
    for (const id of oids) {
      const [, , err] = act(state, id, cid);
      if (err) return fail(err);
    }
    const counts = S.sortieCounts(c, troops, unit);
    troops = S.countsTotal(counts);
    if (troops < S.MIN_SORTIE_TROOPS || troops > S.marchable(c)) {
      return fail(`출진 병력은 ${S.MIN_SORTIE_TROOPS}~${S.marchable(c)}명이어야 합니다. 호족 사병 ${c.retainers}명은 출진하지 않습니다.`);
    }
    if (!S.hasTroops(c, counts)) return fail("그만큼의 병사가 없습니다.");
    const speed = S.unitSpeed(counts);
    const days = S.travelDays(way.km, speed);
    const foodNeed = S.marchFood(troops, days, S.pathRough(state, way.path));
    if (c.food < foodNeed) return fail(`군량이 부족합니다. (필요 ${foodNeed})`);
    unit = S.takeTroops(c, counts);
    c.food -= foodNeed;
    const m = S.launch(state, { kind: "army", force: c.owner, path: way.path, km: way.km, speed,
      officers: oids, troops, unit, train: c.train, origin: cid, target: targetCid });
    const names = oids.map((id) => state.officers[id].name).join(", ");
    if (t.owner === state.playerForce && c.owner !== state.playerForce) {
      S.addLog(state, `${S.forceName(state, c.owner)} ${S.unitName(unit)} ${troops}명이 ${c.name}에서 ${S.ro(t.name)} 진군하고 있습니다. (${days}일 뒤 도착)`, "threat");
    }
    S.planDefense(state, m);
    return { ok: true, march: m, msg: `${names}의 ${S.unitName(unit)} ${troops}명이 ${S.ro(t.name)} 출진했습니다. ${days}일 뒤 도착합니다. (군량 ${foodNeed})` };
  };

  // An army in the field eats twice what a garrison does: one food a day for
  // every 400 men. Over mountain roads carts give way to porters, and it
  // costs more again by the road's roughness.
  S.FIELD_FOOD = 400;
  S.fieldFood = (troops, days, rough) => (troops * days * (rough || 1)) / S.FIELD_FOOD;
  // Rations for the march: a tenth of the men up front (the siege depot),
  // plus the days on the road.
  S.marchFood = (troops, days, rough) => Math.ceil(troops / 10 + S.fieldFood(troops, days, rough));
  // What a convoy costs in food: its escort eats on the way, and of the food
  // it carries one part in a hundred is eaten by its carriers each day (more
  // on rough roads, and never more than six parts in ten).
  S.convoyFood = function (troops, food, days, rough) {
    return { eaten: Math.ceil(S.fieldFood(troops, days, rough)), lost: Math.round(food * Math.min(0.6, 0.01 * days * (rough || 1))) };
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
        if (o.status === "serving") { o.status = "free"; o.force = null; o.hidden = false; o.city = S.homeCity(state, o.city); S.officersMoved(state); }
      }
      S.dropForts(state, fid);
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
    S.capitalOf(state, fid);
  }

  // ---------- turn ----------
  // Monthly gold income and troop upkeep (1 gold per 100 soldiers).
  S.income = (c) => Math.round((c.trade / 3 + c.pop / 5000) * (0.5 + c.order / 200) * S.regionMul(c, "gold") * S.houseGold(c));
  S.upkeep = (c) => Math.ceil(c.troops / 100);

  // Traits: who walks away, and how fast loyalty wears down.
  S.leaveThreshold = (o) => (S.hasTrait(o, "의리") ? 25 : S.hasTrait(o, "변심") ? 50 : S.hasTrait(o, "야심") ? 45 : 40);
  S.loyaltyDrift = (o) => S.traitsOf(o).reduce((m, k) => m * ({ 야심: 2, 무욕: 0.5, 의리: 0.5, 변심: 1.5 }[k] || 1), 1);

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
        if (harvest) c.food += Math.round((c.farm * 9 + c.pop / 50) * eff * S.regionMul(c, "food"));
        c.food -= S.foodUse(c.troops);
        if (c.food < 0) {
          c.food = 0;
          const lost = loseTroops(c, Math.ceil(c.troops * 0.1));
          c.order = Math.max(0, c.order - 10);
          if (c.owner === state.playerForce) S.addLog(state, `${c.name}의 군량이 바닥나 병사 ${lost}명이 달아났습니다.`, "warn");
        }
        if (state.month % 3 === 0 && c.order > 30) c.pop = Math.round(c.pop * (1 + ((c.order - 30) / 8000) * S.regionMul(c, "pop")));
        wearinessEffects(state, c);
        S.houseMonth(state, c);
        runGentry(state, c);
      } else {
        // Vacant cities slowly rebuild local militia.
        const cap = 1200 + c.size * 700;
        if (c.troops < cap) c.troops = Math.min(cap, c.troops + 60);
      }
    }
    for (const c of Object.values(state.cities)) {
      returnManpower(c, S.manpowerRegen(c));
      S.produceRes(c);
    }
    // Loyalty and defection.
    for (const o of Object.values(state.officers)) {
      o.done = false;
      o.rewarded = false;
      if (o.status !== "serving" || S.isRuler(state, o)) continue;
      const leaveAt = S.leaveThreshold(o);
      if (o.loyalty < leaveAt && S.chance(state, (leaveAt - o.loyalty) / 2)) {
        const f = o.force;
        o.status = "free";
        o.force = null;
        o.hidden = false;
        o.city = S.homeCity(state, o.city);
        S.officersMoved(state);
        S.addLog(state, `${S.josa(o.name, "이", "가")} ${S.josa(S.forceName(state, f), "을", "를")} 떠나 재야로 돌아갔습니다.`, f === state.playerForce ? "warn" : "info");
      } else if (S.chance(state, (10 + Math.max(0, state.forces[o.force].weariness - 50) / 2) * S.loyaltyDrift(o))) {
        o.loyalty = Math.max(0, o.loyalty - 1);
      }
    }
    // Captives occasionally escape.
    for (const o of Object.values(state.officers)) {
      if (o.status === "captive" && S.chance(state, 3)) {
        freeCaptive(state, o);
        S.addLog(state, `포로 ${S.josa(o.name, "이", "가")} 탈출했습니다.`, "info");
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
    S.runForts(state);
    S.runCourt(state);
    if (harvest) S.addLog(state, "가을 수확으로 각 도시에 군량이 들어왔습니다.", "sys");
    S.checkOver(state);
  };

  // ---------- merchants (상인) ----------
  // Merchants buy and sell food, wood, iron and horses for gold in any city
  // that is not under siege. It takes no officer. A city's commerce sets how
  // much they deal in a month. They pay half of what they charge.
  // why: horses come from the northern and western herds, so their price
  // climbs with the distance from the nearest horse country. That lets the
  // south field some cavalry, at a price.
  S.TRADE = { food: 0.04, wood: 0.2, iron: 0.3, horse: 0.8, horseKm: 350, sell: 0.5, volume: 2 };
  S.TRADE_GOODS = ["food", "wood", "iron", "horse"];
  S.goodName = (k) => (k === "food" ? "군량" : S.RESOURCES[k]);
  const herdKm = new WeakMap();
  // Straight-line distance from a city to the nearest horse country.
  function horseDistance(state, c) {
    let map = herdKm.get(state.cities);
    if (!map) herdKm.set(state.cities, (map = {}));
    if (!(c.id in map)) {
      let best = Infinity;
      for (const h of S.cityList(state)) if (S.horseCountry(h)) best = Math.min(best, S.nodeKm(state, c.id, h.id) / S.ROAD_FACTOR);
      map[c.id] = best === Infinity ? 2000 : Math.round(best);
    }
    return map[c.id];
  }
  // Gold for one unit, buying.
  S.tradePrice = function (state, c, k) {
    if (k === "food") return S.TRADE.food;
    if (k === "horse") return S.TRADE.horse * (1 + horseDistance(state, c) / S.TRADE.horseKm);
    return S.TRADE[k] / Math.max(1, S.regionMul(c, k));
  };
  S.goodStock = (c, k) => (k === "food" ? c.food : c.res[k]);
  // Gold's worth of goods the merchants will still deal in this month.
  S.tradeRoom = function (state, c) {
    const stamp = state.year * 100 + state.month;
    const used = c.traded && c.traded.stamp === stamp ? c.traded.gold : 0;
    return Math.max(0, Math.round(c.trade * S.TRADE.volume * S.houseTrade(c) - used));
  };
  // The most that can be bought or sold now.
  S.tradeMax = function (state, c, k, sell) {
    const price = S.tradePrice(state, c, k) * (sell ? S.TRADE.sell : 1);
    const room = Math.floor(S.tradeRoom(state, c) / price);
    if (sell) return Math.max(0, Math.min(room, S.goodStock(c, k)));
    const space = k === "food" ? Infinity : S.resCap(c, k) - c.res[k];
    return Math.max(0, Math.min(room, Math.floor(c.gold / price), space));
  };
  S.trade = function (state, cid, k, amount, sell) {
    const c = state.cities[cid];
    if (!c || !c.owner) return fail("교역할 수 있는 도시가 아닙니다.");
    if (!S.TRADE_GOODS.includes(k)) return fail("상인이 다루지 않는 물건입니다.");
    if (S.besieged(state, cid)) return fail("포위당한 도시에는 상인이 들어오지 못합니다.");
    amount = Math.floor(amount || 0);
    if (amount < 1) return fail("수량을 정해 주세요.");
    if (amount > S.tradeMax(state, c, k, sell)) return fail(sell ? "그만큼은 팔 수 없습니다." : "그만큼은 살 수 없습니다.");
    const price = S.tradePrice(state, c, k) * (sell ? S.TRADE.sell : 1);
    const gold = sell ? Math.floor(amount * price) : Math.ceil(amount * price);
    c.gold += sell ? gold : -gold;
    if (k === "food") c.food += sell ? -amount : amount;
    else c.res[k] += sell ? -amount : amount;
    const stamp = state.year * 100 + state.month;
    if (!c.traded || c.traded.stamp !== stamp) c.traded = { stamp, gold: 0 };
    c.traded.gold += amount * price;
    return { ok: true, gold, msg: `${c.name}에서 상인에게 ${S.goodName(k)} ${amount}${k === "horse" ? "필" : ""}을 금 ${gold}에 ${sell ? "팔았습니다" : "샀습니다"}.` };
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
    const toRuler = state.officers[state.forces[to].ruler];
    if (S.hasTrait(toRuler, "야심")) p -= 10;
    if (S.hasTrait(toRuler, "무욕")) p += 10;
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
        // Join the family force: at home if it holds the city, else where the
        // ruler is based. The ruler may be on the road and that city lost
        // meanwhile; then any city the force holds.
        const owned = (id) => state.cities[id] && state.cities[id].owner === f.id;
        if (!owned(o.city)) {
          const rc = state.officers[f.ruler].city;
          o.city = owned(rc) ? rc : (S.citiesOf(state, f.id)[0] || {}).id || o.city;
          S.officersMoved(state);
        }
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
    if (w <= 30 || S.houseCalm(c)) return;
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
    S.GAME = state;
    for (const c of Object.values(state.cities)) {
      if (!c.posts) c.posts = S.emptyPosts();
      if (c.manpower == null) c.manpower = Math.round(S.manpowerMax(c) * 0.6);
      if (c.gentry == null) {
        c.gentry = c.gentryBase = S.MAP.cities[c.id][6];
        c.consent = 50;
        c.retainers = 0;
      }
      if (!("tuntian" in c.posts)) c.posts.tuntian = null;
      if (!c.res) S.initRes(c);
      // Older saves kept one garrison type; give them a mixed garrison.
      if (!c.unit || typeof c.unit === "string") c.unit = S.startMix(c);
    }
    for (const f of Object.values(state.forces)) if (f.weariness == null) f.weariness = 0;
    if (!state.pacts) state.pacts = {};
    if (!state.marches) state.marches = [];
    if (!state.forts) S.initForts(state);
    S.addMissingForts(state);
    // Where places are drawn follows the map, not the save.
    for (const c of Object.values(state.cities)) {
      const m = S.MAP.cities[c.id];
      [c.x, c.y] = S.placeXY(c.id, m[3], m[4]);
      // Names and provinces follow the map and the year the game began in.
      const y0 = (state.start && state.start.year) || state.year;
      c.name = S.cityName(c.id, y0);
      c.prov = S.cityProv(c.id, y0);
      c.jun = S.cityJun(c.id, y0);
      c.seat = S.citySeat(c.id, y0);
    }
    for (const f of Object.values(state.forts)) [f.x, f.y] = S.placeXY(f.id, f.lat, f.lon);
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
    S.initCapitals(state);
    return state;
  };

  // Battle arithmetic shared with js/battle.js.
  Object.assign(S, { power, sideStats, wallBonus, gentryDefense, loseTroops, returnManpower, forcePop, checkForce, freeCaptive });

  S.checkOver = function (state) {
    if (state.over) return state.over;
    const owners = new Set();
    for (const c of S.cityList(state)) owners.add(c.owner);
    for (const f of Object.values(state.forces)) if (!owners.has(f.id)) f.alive = false;
    if (state.playerForce && !state.forces[state.playerForce].alive) state.over = { result: "lose" };
    else {
      if (owners.size === 1 && !owners.has(null)) state.over = { result: "win", force: [...owners][0] };
    }
    return state.over;
  };

  S.totals = function (state, fid) {
    const cs = S.citiesOf(state, fid);
    return {
      cities: cs.length,
      officers: S.officersOf(state, fid).length,
      troops: cs.reduce((s, c) => s + c.troops, 0) + S.marchesOf(state, fid).reduce((s, m) => s + m.troops, 0) +
        S.fortsOf(state, fid).reduce((s, f) => s + f.troops, 0) +
        (state.battles || []).reduce((s, b) => s + (b.att.force === fid ? b.att.troops : 0) + (b.kind !== "siege" && b.def.force === fid ? b.def.troops : 0) +
          (b.relief && b.relief.force === fid ? b.relief.troops : 0), 0),
      gold: cs.reduce((s, c) => s + c.gold, 0),
      food: cs.reduce((s, c) => s + c.food, 0),
      manpower: cs.reduce((s, c) => s + c.manpower, 0),
    };
  };
})(globalThis.SAM = globalThis.SAM || {});
