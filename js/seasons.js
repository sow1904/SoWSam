// Seasons (계절) and the calamities and harvests they bring.
//
//   봄 1-3월 · 여름 4-6월 · 가을 7-9월 · 겨울 10-12월
//
// On the first day of each season everything that season holds is settled
// at once and shown to the player (js/ui/seasons.js): weekly hazards are
// thrown for each of the season's twelve weeks, so the news says where and
// in which week they strike; each strikes when its week comes.
//
//   역병 (겨울): city by city, weekly. Kills a large share of the people.
//     의술 lowers both the chance and the toll. Some winters are plague
//     years, when it is far likelier everywhere.
//   가뭄 (여름): province by province. That autumn's harvest fails in part.
//   홍수 (여름): the cities of 사례 (하남), 연주 and 예주 (중원), weekly.
//     Men of fighting age are lost and none return until summer ends.
//   태풍 (여름): province by province, mostly on the southern and eastern
//     coasts. Timber yields fall for half a year.
//   작황 (가을): each province throws once a year: 흉작, 평작 or 풍작.
//   황충 (가을): 옹주, 사례, 형북, 연주, 예주, 청주, 서주, 기주, weekly.
//     After a swarm a province is clear; the chance then climbs back over
//     five years. It eats the harvest and much of what is stored.
// The harvest (9월) is multiplied by the crop, drought and locusts.
// why: the user's design (season events on each season's first month,
// shown on the small map of the land).
(function (S) {
  const clamp = S.clamp;
  const SE = S.SEASON = {
    names: ["봄", "여름", "가을", "겨울"],
    weeks: 12, // four to a month
    plague: { week: 0.004, size: 0.15, year: 10, yearMul: 4, toll: [0.12, 0.2], medicine: { chance: 0.25, toll: 0.2 } },
    drought: { prov: { liang: 0.15, bing: 0.12, yong: 0.12, sili: 0.1, ji: 0.1, you: 0.1, yan: 0.08, yu: 0.08, qing: 0.08, xu: 0.06 }, other: 0.04, harvest: 0.6 },
    flood: { provs: ["sili", "yan", "yu"], week: 0.012, manpower: 0.25 },
    typhoon: { prov: { jiao: 0.35, yang: 0.3, jingnan: 0.15, xu: 0.15, qing: 0.15, liaodong: 0.1, ji: 0.08, jingbei: 0.05, yu: 0.03, yan: 0.03 }, wood: 0.5, months: 6 },
    crop: { odds: [0.25, 0.5, 0.25], mul: [0.65, 1, 1.35], names: ["흉작", "평작", "풍작"] },
    locust: { provs: ["yong", "sili", "jingbei", "yan", "yu", "qing", "xu", "ji"], years: 5, season: 0.3, harvest: 0.4, store: 0.3 },
  };
  SE.KINDS = { plague: "역병", drought: "가뭄", flood: "홍수", typhoon: "태풍", locust: "황충", crop: "작황" };
  // The season of a month: 0 봄 .. 3 겨울.
  S.seasonOf = (month) => Math.floor((month - 1) / 3);
  S.seasonName = (state) => SE.names[S.seasonOf(state.month)];
  const provCities = (state, prov) => Object.values(state.cities).filter((c) => c.prov === prov);
  const provName = (p) => S.PROVINCES[p] || p;
  const weekly = (p, weeks) => 1 - Math.pow(1 - p, weeks); // over the whole season
  const cal = (state) => (state.cal = state.cal || { locust: {}, crop: null, drought: null });
  // One weekly throw per week; the week it first comes up, or -1.
  function strikeWeek(state, p) {
    for (let w = 0; w < SE.weeks; w++) if (S.rand(state) < p) return w;
    return -1;
  }
  const dayOfWeek = (start, w) => start + Math.floor(w / 4) * S.DAYS_PER_MONTH + (w % 4) * 7;
  const weekLabel = (state, w) => `${state.month + Math.floor(w / 4)}월 ${(w % 4) + 1}주`;

  // ---------- the season's roll ----------
  // Settle the season that begins today. Returns the news {key, season, items}.
  S.rollSeason = function (state) {
    const C = cal(state);
    const season = S.seasonOf(state.month);
    const start = S.today(state);
    const items = [];
    const add = (kind, w, place, extra) => items.push(Object.assign({ kind, week: w, at: dayOfWeek(start, w), when: weekLabel(state, w), done: false }, place, extra || {}));
    if (season === 3) {
      // 역병: a plague year now and then.
      const P = SE.plague;
      const bad = S.chance(state, P.year);
      for (const c of Object.values(state.cities)) {
        const med = c.owner ? S.techBonus(state, c.owner, "medicine") : 0;
        const p = P.week * (0.6 + c.size * P.size) * (bad ? P.yearMul : 1) * (1 - P.medicine.chance * med);
        const w = strikeWeek(state, p);
        if (w >= 0) add("plague", w, { city: c.id });
      }
      if (bad) items.plagueYear = true;
    } else if (season === 1) {
      // 가뭄 for the year's harvest, then 홍수 and 태풍.
      C.drought = { year: state.year, provs: [] };
      for (const p of Object.keys(S.PROVINCES)) {
        if (!S.chance(state, Math.round(100 * (SE.drought.prov[p] != null ? SE.drought.prov[p] : SE.drought.other)))) continue;
        C.drought.provs.push(p);
        add("drought", 0, { prov: p }, { quiet: true });
      }
      if (C.drought.provs.length) S.addLog(state, `${C.drought.provs.map(provName).join(", ")}에 가뭄이 들었습니다. 올가을 수확이 줄어듭니다.`, "sys");
      for (const p of SE.flood.provs) for (const c of provCities(state, p)) {
        if (C.drought.provs.includes(p)) continue; // a dry year floods no river
        const w = strikeWeek(state, SE.flood.week);
        if (w >= 0) add("flood", w, { city: c.id });
      }
      for (const [p, pr] of Object.entries(SE.typhoon.prov)) {
        if (S.rand(state) >= pr) continue;
        add("typhoon", 4 + Math.floor(S.rand(state) * 8), { prov: p }); // late summer
      }
    } else if (season === 2) {
      // 황충: the longer since the last swarm, the likelier.
      const L = SE.locust;
      const swarm = [];
      for (const p of L.provs) {
        if (C.locust[p] == null) C.locust[p] = state.year - Math.floor(S.rand(state) * (L.years + 1)); // the land as the game finds it
        const ripe = clamp((state.year - C.locust[p]) / L.years, 0, 1);
        const pw = 1 - Math.pow(1 - L.season * ripe, 1 / SE.weeks);
        const w = ripe > 0 ? strikeWeek(state, pw) : -1;
        if (w >= 0) { add("locust", w, { prov: p }); C.locust[p] = state.year; swarm.push(p); }
      }
      // 작황, by province; no rich harvest where it is dry or the locusts come.
      C.crop = { year: state.year, prov: {} };
      const dry = C.drought && C.drought.year === state.year ? C.drought.provs : [];
      const by = [[], [], []];
      for (const p of Object.keys(S.PROVINCES)) {
        const r = S.rand(state);
        let k = r < SE.crop.odds[0] ? 0 : r < SE.crop.odds[0] + SE.crop.odds[1] ? 1 : 2;
        if (k === 2 && (dry.includes(p) || swarm.includes(p))) k = 1;
        C.crop.prov[p] = k;
        by[k].push(p);
        if (k !== 1) add("crop", 0, { prov: p }, { crop: k, quiet: true });
      }
      S.addLog(state, `올해 작황 — 풍작: ${by[2].map(provName).join(", ") || "없음"} / 흉작: ${by[0].map(provName).join(", ") || "없음"}. 나머지는 평작입니다.`, "sys");
    }
    const news = { key: `${state.year}-${season}`, year: state.year, season, items, plagueYear: !!items.plagueYear };
    state.seasonNews = news;
    return news;
  };
  // The chance (%) of a hazard this season, for the help and the city panel.
  S.locustRipe = (state, p) => {
    const C = cal(state);
    return C.locust[p] == null ? null : clamp((state.year - C.locust[p]) / SE.locust.years, 0, 1);
  };

  // ---------- striking ----------
  function strike(state, it) {
    it.done = true;
    const M = S.monthsElapsed(state);
    const mine = (c) => !!state.playerForce && c.owner === state.playerForce;
    const say = (text, cs) => S.addLog(state, text, cs.some(mine) ? "warn" : "info");
    if (it.kind === "plague") {
      const c = state.cities[it.city];
      const P = SE.plague;
      const med = c.owner ? S.techBonus(state, c.owner, "medicine") : 0;
      const toll = (P.toll[0] + S.rand(state) * (P.toll[1] - P.toll[0])) * (1 - P.medicine.toll * med);
      const dead = Math.round(c.pop * toll);
      c.pop -= dead;
      c.manpower = Math.max(0, Math.round(c.manpower * (1 - toll)));
      woe(c).plague = M + 2;
      it.dead = dead;
      say(`${c.name}에 역병이 돌아 백성 ${UIfmt(dead)}명이 죽었습니다.${med ? " (의술로 피해를 줄였습니다)" : ""}`, [c]);
    } else if (it.kind === "flood") {
      const c = state.cities[it.city];
      const lost = Math.round(c.manpower * SE.flood.manpower);
      c.manpower -= lost;
      woe(c).flood = M + (6 - state.month) + 1; // until summer ends
      it.lost = lost;
      say(`${c.name}에 홍수가 나 장정 ${UIfmt(lost)}명을 잃었습니다. 여름이 끝날 때까지 병역 인구가 돌아오지 않습니다.`, [c]);
    } else if (it.kind === "typhoon") {
      const cs = provCities(state, it.prov);
      for (const c of cs) woe(c).typhoon = M + SE.typhoon.months;
      say(`${provName(it.prov)}에 태풍이 덮쳐 ${SE.typhoon.months}달 동안 목재 생산이 줄어듭니다.`, cs);
    } else if (it.kind === "locust") {
      const cs = provCities(state, it.prov);
      for (const c of cs) {
        c.food = Math.round(c.food * (1 - SE.locust.store));
        woe(c).locust = state.year;
      }
      say(`${provName(it.prov)}에 메뚜기 떼(황충)가 일어 쌓아 둔 군량을 갉아먹고 올해 수확을 망칩니다.`, cs);
    }
  }
  const UIfmt = (n) => (n >= 10000 ? `${Math.round(n / 1000) / 10}만` : String(n));
  const woe = (c) => (c.woe = c.woe || {});

  // Each day: a new season is settled on its first day; hazards strike in their week.
  S.runSeasons = function (state) {
    const day = state.day || 1;
    if (day === 1 && (state.month - 1) % 3 === 0) {
      const key = `${state.year}-${S.seasonOf(state.month)}`;
      if (!state.seasonNews || state.seasonNews.key !== key) S.rollSeason(state);
    }
    const news = state.seasonNews;
    if (!news) return;
    const now = S.today(state);
    for (const it of news.items) if (!it.done && it.at <= now) strike(state, it);
  };

  // ---------- what it does to a city ----------
  // The harvest this year: crop, drought, locusts.
  S.harvestMul = function (state, c) {
    const C = cal(state);
    let m = 1;
    if (C.crop && C.crop.year === state.year && C.crop.prov[c.prov] != null) m *= SE.crop.mul[C.crop.prov[c.prov]];
    if (C.drought && C.drought.year === state.year && C.drought.provs.includes(c.prov)) m *= SE.drought.harvest;
    if (c.woe && c.woe.locust === state.year) m *= SE.locust.harvest;
    return m;
  };
  // What weighs on a city now: [{kind, label}].
  S.woesOf = function (state, c) {
    const out = [];
    const M = S.monthsElapsed(state), w = c.woe || {}, C = cal(state);
    if (w.plague > M) out.push({ kind: "plague", label: "역병" });
    if (w.flood > M) out.push({ kind: "flood", label: "홍수 (병역 인구 회복 없음)" });
    if (w.typhoon > M) out.push({ kind: "typhoon", label: `태풍 (목재 생산 ${Math.round(SE.typhoon.wood * 100)}%)` });
    if (w.locust === state.year && state.month <= 9) out.push({ kind: "locust", label: `황충 (수확 ${Math.round(SE.locust.harvest * 100)}%)` });
    if (C.drought && C.drought.year === state.year && C.drought.provs.includes(c.prov) && state.month <= 9) out.push({ kind: "drought", label: `가뭄 (수확 ${Math.round(SE.drought.harvest * 100)}%)` });
    if (C.crop && C.crop.year === state.year && state.month <= 9 && C.crop.prov[c.prov] !== 1 && C.crop.prov[c.prov] != null) {
      const k = C.crop.prov[c.prov];
      out.push({ kind: k ? "rich" : "crop", label: `${SE.crop.names[k]} (수확 ${Math.round(SE.crop.mul[k] * 100)}%)` });
    }
    return out;
  };
  // A flooded city's men do not come back; a storm-felled forest yields less.
  const regen = S.manpowerRegen;
  S.manpowerRegen = function (c) {
    const st = S.GAME;
    if (st && c.woe && c.woe.flood > S.monthsElapsed(st)) return 0;
    return regen.apply(this, arguments);
  };
  const resYield = S.resYield;
  S.resYield = function (c, k) {
    const v = resYield.apply(this, arguments);
    const st = S.GAME;
    if (k === "wood" && st && c.woe && c.woe.typhoon > S.monthsElapsed(st)) return Math.round(v * SE.typhoon.wood);
    return v;
  };
})(globalThis.SAM = globalThis.SAM || {});
